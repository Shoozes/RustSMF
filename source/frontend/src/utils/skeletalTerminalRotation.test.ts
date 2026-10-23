import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import path from 'node:path';
import os from 'node:os';
import type { LoadedModel } from '../loaders/glb';
import { chordRotationTrack, validateChordRotation, CONDITIONING_NLERP_MODE } from './skeletalChordRotation';
import { createTrackInterpolant } from './animationTrackInterpolation';
import { closeTerminalRotations, parseTerminalRotationClosure, type TerminalRotationClosureRecipe } from './skeletalTerminalRotation';
import { measureConditioningDifferences } from './skeletalConditioning';
import { parseSkeletalExportJobDocument, SKELETAL_EXPORT_JOB_V3_SCHEMA } from './skeletalExportJob';

const spec: TerminalRotationClosureRecipe = { clipId: 'walk', startTick: 2, joints: ['Leg'], maxRotationDegrees: 45 };
function fixture(): LoadedModel {
  const root = new THREE.Group(), base = new THREE.Bone(), leg = new THREE.Bone(), foot = new THREE.Bone();
  base.name = 'Base'; leg.name = 'Leg'; foot.name = 'Foot'; base.add(leg); leg.add(foot); root.add(base); leg.position.y = 1; foot.position.y = 1;
  const times = [0, 1, 2, 3].map(t => Math.fround(t / 60));
  const clip = new THREE.AnimationClip('walk', times[3], [chordRotationTrack('Leg.quaternion', times, [0, .01, .02, .5].flatMap(a => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a).toArray())), new THREE.VectorKeyframeTrack('Base.position', times, times.flatMap(t => [t, 0, 0]))]);
  return { root, skeleton: new THREE.Skeleton([base, leg, foot]), skinnedMeshes: [], clips: [clip], mixer: new THREE.AnimationMixer(root) };
}

test('terminal closure preserves every preceding value/interval and unselected channel', () => {
  const model = fixture(), original = model.clips[0], track = original.tracks[0], snapshot = Array.from(track.values);
  const result = closeTerminalRotations(original, spec), updated = result.clip.tracks[0];
  assert.equal(result.clip.duration, original.duration); assert.equal(result.clip.tracks[1], original.tracks[1]);
  assert.deepEqual(Array.from(track.values), snapshot);
  assert.deepEqual(Array.from(updated.times), Array.from(track.times));
  assert.deepEqual(Array.from(updated.values.slice(0, 32)), snapshot.slice(0, 32));
  assert.deepEqual(Array.from(updated.values.slice(40, 44)), Array.from(updated.values.slice(4, 8)));
  for (const tick of [0, .25, 1, 1.75, 2]) assert.deepEqual(Array.from(createTrackInterpolant(updated).evaluate(Math.fround(tick / 60))), Array.from(createTrackInterpolant(track).evaluate(Math.fround(tick / 60))));
  validateChordRotation(updated, 3);
  assert.ok(result.report.corrections[0].storedCorrectionDegrees > 28);
});

test('terminal refusal, stored bound and cancellation preserve all original bytes', () => {
  const clip = fixture().clips[0], before = clip.tracks.map(t => Array.from(t.values));
  const degrees = closeTerminalRotations(clip, spec).report.corrections[0].storedCorrectionDegrees;
  for (const invalid of [{ ...spec, startTick: 1 }, { ...spec, joints: ['Missing'] }, { ...spec, maxRotationDegrees: degrees - 1e-8 }]) assert.throws(() => closeTerminalRotations(clip, invalid), /terminal|Terminal/);
  assert.doesNotThrow(() => closeTerminalRotations(clip, { ...spec, maxRotationDegrees: degrees }));
  const abort = new AbortController(); abort.abort(new Error('cancel closure'));
  assert.throws(() => closeTerminalRotations(clip, spec, abort.signal), /cancel closure/);
  const malformed = clip.clone(); malformed.tracks[0].values[8] += 1;
  assert.throws(() => closeTerminalRotations(malformed, spec), /canonical/);
  assert.deepEqual(clip.tracks.map(t => Array.from(t.values)), before);
});

test('terminal parser rejects unknown fields, roots, duplicate targets and invalid bounds', () => {
  const parse = (v: unknown) => parseTerminalRotationClosure(v, ['walk'], ['idle', 'walk'], ['Base', 'LocomotionRoot']);
  assert.deepEqual(parse(spec), spec);
  for (const v of [null, {}, { ...spec, extra: true }, { ...spec, clipId: 'idle' }, { ...spec, joints: ['Base'] }, { ...spec, joints: ['Leg', 'Leg'] }, { ...spec, joints: [] }, { ...spec, startTick: 1.5 }, { ...spec, maxRotationDegrees: NaN }, { ...spec, maxRotationDegrees: 181 }]) assert.throws(() => parse(v), /terminalRotationClosure/);
});

test('terminal fidelity authorizes only selected end rotations and retains all other guards', () => {
  const original = fixture(), derived = fixture();
  derived.clips[0] = closeTerminalRotations(derived.clips[0], spec).clip;
  assert.throws(() => measureConditioningDifferences(original, derived, ['walk']), /tick-pose/);
  const report = measureConditioningDifferences(original, derived, ['walk'], undefined, spec)[0];
  assert.ok(report.maximumTickJointMatrix > .1); assert.ok(report.maximumPreservedTickJointMatrix < 1e-6);
  const rotations = derived.clips[0].tracks[0];
  rotations.values[16] += .05;
  assert.throws(() => measureConditioningDifferences(original, derived, ['walk'], undefined, spec), /tick-pose/);
  derived.clips[0] = closeTerminalRotations(fixture().clips[0], spec).clip;
  derived.clips[0].tracks[1].values[9] += .1;
  assert.throws(() => measureConditioningDifferences(original, derived, ['walk'], undefined, spec), /tick-pose/);
  derived.clips[0] = closeTerminalRotations(fixture().clips[0], spec).clip;
  derived.clips[0].tracks[0].values[40] = .1;
  assert.throws(() => measureConditioningDifferences(original, derived, ['walk'], undefined, spec), /entry rotation/);
  derived.clips[0] = closeTerminalRotations(fixture().clips[0], spec).clip;
  assert.throws(() => measureConditioningDifferences(original, derived, ['walk'], undefined, { ...spec, clipId: 'other' }), /tick-pose/);
  derived.clips[0].tracks.push(new THREE.QuaternionKeyframeTrack('Foot.quaternion', [0, Math.fround(3 / 60)], [0, 0, 0, 1, 0, 0, Math.sin(.15), Math.cos(.15)]));
  assert.throws(() => measureConditioningDifferences(original, derived, ['walk'], undefined, spec), /tick-pose/);
});

test('v3 terminal authoring is explicit, NLERP-only and bound to a declared gait', () => {
  const out = path.join(os.tmpdir(), 'rustsmf-terminal-job');
  const job = { $schema: SKELETAL_EXPORT_JOB_V3_SCHEMA, input: { skinnedModel: path.join(out, 'source.glb') }, export: { rootJoint: 'LocomotionRoot', units: 'meters', upAxis: '+Y', forwardAxis: '+Z', handedness: 'right', ticksPerSecond: 60, rootMotion: 'separate-track', clipIds: ['walk'] }, conditioning: { mode: CONDITIONING_NLERP_MODE as string, sourceRootJoint: 'Base', locomotionRootJoint: 'LocomotionRoot', clipIds: ['idle', 'walk'], transitions: [{ idle: 'idle', gait: 'walk', phases: [.25], durationTicks: 6 }], terminalRotationClosure: spec }, output: { generationRoot: path.join(out, 'generations'), conditioningRoot: path.join(out, 'conditioned') } };
  const parsed = parseSkeletalExportJobDocument(job);
  assert.equal(parsed.$schema, SKELETAL_EXPORT_JOB_V3_SCHEMA);
  if (parsed.$schema === SKELETAL_EXPORT_JOB_V3_SCHEMA) assert.deepEqual(parsed.conditioning.terminalRotationClosure, spec);
  assert.throws(() => parseSkeletalExportJobDocument({ ...job, conditioning: { ...job.conditioning, mode: 'continuous-60hz-locomotion-root' } }), /NLERP/);
  assert.throws(() => parseSkeletalExportJobDocument({ ...job, conditioning: { ...job.conditioning, terminalRotationClosure: { ...spec, clipId: 'idle' } } }), /terminalRotationClosure/);
});
