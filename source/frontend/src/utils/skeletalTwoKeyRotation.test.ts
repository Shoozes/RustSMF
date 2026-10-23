import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { LoadedModel } from '../loaders/glb';
import { exportGLB } from '../loaders/glb';
import { installNodeThreeRuntime } from '../../scripts/node-three-runtime';
import { chordRotationTrack, CONDITIONING_NLERP_MODE, validateChordRotation } from './skeletalChordRotation';
import { createTrackInterpolant } from './animationTrackInterpolation';
import { bakeTwoKeyRotations, parseTwoKeyRotationBake, type TwoKeyRotationBakeRecipe } from './skeletalTwoKeyRotation';
import { conditionSkeletalModel, measureConditioningDifferences, CONDITIONING_MODE } from './skeletalConditioning';
import { parseSkeletalExportJobDocument, SKELETAL_EXPORT_JOB_V3_SCHEMA } from './skeletalExportJob';
import { disposeThreeObject } from './threeDisposal';

const quat = (angle: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle).toArray();
const spec: TwoKeyRotationBakeRecipe = { clipId: 'gait', startTick: 2, maxRotationDegrees: 13,
  rotations: ['Leg', 'Knee', 'Foot'].map((joint, i) => ({ joint, values: [quat(.1 + i * .01), quat(.12 + i * .01)] })) };

function fixture(): LoadedModel {
  const root = new THREE.Group(), bones = ['Base', 'Leg', 'Knee', 'Foot', 'Toe'].map(name => { const b = new THREE.Bone(); b.name = name; return b; });
  root.add(bones[0]); bones.slice(1).forEach((b, i) => { bones[i].add(b); b.position.y = 1; });
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, .1, 1, 0, -.1, 2, 0], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  geometry.setIndex([0, 1, 2]);
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial()); root.add(mesh); mesh.bind(skeleton);
  const times = Array.from({ length: 7 }, (_, t) => Math.fround(t / 60));
  const tracks: THREE.KeyframeTrack[] = ['Leg', 'Knee', 'Foot'].map(name => chordRotationTrack(`${name}.quaternion`, times, times.flatMap((_, i) => quat(.01 * i))));
  tracks.push(new THREE.VectorKeyframeTrack('Base.position', times, times.flatMap((_, i) => [i * .01, 0, 0])));
  const clips = [new THREE.AnimationClip('idle', times[6], [new THREE.VectorKeyframeTrack('Base.position', [0, times[6]], [.02, 0, 0, .02, 0, 0])]), new THREE.AnimationClip('gait', times[6], tracks)];
  return { root, skeleton, skinnedMeshes: [mesh], clips, mixer: new THREE.AnimationMixer(root) };
}

test('two-key authoring preserves all unselected values, intervals and input bytes', () => {
  const model = fixture(), original = model.clips[1], snapshot = original.tracks.map(t => Array.from(t.values));
  try {
    const result = bakeTwoKeyRotations(original, spec, model.skeleton!.bones, ['Base']);
    assert.equal(result.clip.duration, original.duration); assert.equal(result.clip.tracks[3], original.tracks[3]);
    assert.deepEqual(original.tracks.map(t => Array.from(t.values)), snapshot);
    for (let i = 0; i < 3; i++) {
      const before = original.tracks[i], after = result.clip.tracks[i]; validateChordRotation(after, 6);
      assert.deepEqual(after.times, before.times);
      for (let tick = 0; tick <= 6; tick++) if (tick !== 2 && tick !== 3) assert.deepEqual(after.values.slice(tick * 12 + 4, tick * 12 + 8), before.values.slice(tick * 12 + 4, tick * 12 + 8));
      for (const phase of [0, .25, 1, 4, 4.25, 5.5, 6]) assert.deepEqual(Array.from(createTrackInterpolant(after).evaluate(Math.fround(phase / 60))), Array.from(createTrackInterpolant(before).evaluate(Math.fround(phase / 60))));
    }
    assert.equal(result.report.corrections.length, 3);
    assert.ok(result.report.corrections.every(r => r.values.every(v => v.storedCorrectionDegrees <= 13)));
  } finally { disposeThreeObject(model.root); }
});

test('two-key parser rejects malformed selection and returns owned quaternion arrays', () => {
  const parse = (value: unknown) => parseTwoKeyRotationBake(value, ['gait'], ['idle', 'gait'], ['Base', 'LocomotionRoot']);
  const parsed = parse(spec); assert.deepEqual(parsed, spec); assert.notEqual(parsed.rotations[0].values[0], spec.rotations[0].values[0]);
  const withRotations = (rotations: unknown[]) => ({ ...spec, rotations });
  for (const value of [null, {}, { ...spec, extra: true }, { ...spec, clipId: 'idle' }, { ...spec, clipId: 'absent' }, { ...spec, startTick: 0 }, { ...spec, startTick: 1.5 }, { ...spec, startTick: 3599 }, { ...spec, maxRotationDegrees: NaN }, { ...spec, maxRotationDegrees: 0 }, { ...spec, maxRotationDegrees: 181 },
    withRotations([]), withRotations([spec.rotations[0], spec.rotations[0], spec.rotations[2]]),
    withRotations([{ ...spec.rotations[0], joint: 'Base' }, ...spec.rotations.slice(1)]),
    ...[null, { ...spec.rotations[0], extra: true }, { ...spec.rotations[0], values: [[0, 0, 0, 0], quat(0)] }, { ...spec.rotations[0], values: [[0, 0, NaN, 1], quat(0)] }].map(r => withRotations([r, ...spec.rotations.slice(1)]))]) assert.throws(() => parse(value), /twoKeyRotationBake/);
});

test('two-key refuses missing or disconnected joints, noncanonical channels, stored bounds and cancellation atomically', () => {
  const model = fixture(), clip = model.clips[1], before = clip.tracks.map(t => Array.from(t.values));
  const bake = (s: TwoKeyRotationBakeRecipe, c = clip, signal?: AbortSignal) => bakeTwoKeyRotations(c, s, model.skeleton!.bones, ['Base'], signal);
  try {
    const degrees = Math.max(...bake(spec).report.corrections.flatMap(r => r.values.map(v => v.storedCorrectionDegrees)));
    assert.doesNotThrow(() => bake({ ...spec, maxRotationDegrees: degrees }));
    assert.throws(() => bake({ ...spec, maxRotationDegrees: degrees - 1e-8 }), /bound/);
    for (const invalid of [{ ...spec, startTick: 5 }, { ...spec, rotations: spec.rotations.map((r, i) => ({ ...r, joint: i === 0 ? 'Absent' : r.joint })) }, { ...spec, rotations: [...spec.rotations].reverse() }]) assert.throws(() => bake(invalid), /twoKeyRotationBake/);
    const duplicate = clip.clone(); duplicate.tracks.push(duplicate.tracks[0]); assert.throws(() => bake(spec, duplicate), /one quaternion/);
    const missing = clip.clone(); missing.tracks.splice(0, 1); assert.throws(() => bake(spec, missing), /one quaternion/);
    const malformed = clip.clone(); malformed.tracks[0].values[8] += 1; assert.throws(() => bake(spec, malformed), /canonical/);
    const constant = clip.clone(); constant.tracks[0] = chordRotationTrack('Leg.quaternion', [0, Math.fround(.1)], [...quat(0), ...quat(0)]); assert.throws(() => bake(spec, constant), /complete stored/);
    const controller = new AbortController(); controller.abort(new Error('cancel two-key'));
    assert.throws(() => bake(spec, clip, controller.signal), /cancel two-key/);
    let observations = 0;
    const signal = { throwIfAborted() { if (++observations === 3) throw new Error('cancel during two-key'); } } as AbortSignal;
    assert.throws(() => bake(spec, clip, signal), /cancel during/);
    assert.deepEqual(clip.tracks.map(t => Array.from(t.values)), before);
  } finally { disposeThreeObject(model.root); }
});

test('two-key source fidelity permits only requested rotations and rejects changes on selected descendants', () => {
  const original = fixture(), derived = fixture();
  const reset = () => { derived.clips[1] = bakeTwoKeyRotations(original.clips[1], spec, derived.skeleton!.bones, ['Base']).clip; };
  const measure = () => measureConditioningDifferences(original, derived, ['idle', 'gait'], undefined, undefined, spec);
  try {
    reset(); assert.throws(() => measureConditioningDifferences(original, derived, ['gait']), /tick-pose/);
    const report = measure()[1]; assert.ok(report.maximumTickJointMatrix > .01); assert.ok(report.maximumPreservedTickJointMatrix < 1e-6);
    assert.throws(() => measureConditioningDifferences(original, derived, ['gait'], 'gait', undefined, spec), /idle source-fidelity/);
    for (const property of ['position', 'scale', 'quaternion']) {
      reset(); const values = property === 'quaternion' ? quat(.2) : property === 'scale' ? [1.1, 1, 1] : [0, 1.1, 0];
      const Track = property === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
      derived.clips[1].tracks.push(new Track(`Toe.${property}`, [0, Math.fround(.1)], [...values, ...values]));
      assert.throws(measure, /tick-pose/);
    }
    reset(); derived.clips[1].tracks[0].values[2 * 12 + 4] += .05; assert.throws(measure, /two-key source-fidelity/);
    reset(); derived.clips[1].tracks[0].values[4 * 12 + 4] += .05; assert.throws(measure, /tick-pose/);
    reset(); derived.clips[1].tracks[3] = derived.clips[1].tracks[3].clone(); derived.clips[1].tracks[3].values[2 * 3] += .1; assert.throws(measure, /tick-pose/);
    reset(); assert.throws(() => measureConditioningDifferences(original, derived, ['gait'], undefined, undefined, { ...spec, maxRotationDegrees: .01 }), /two-key source-fidelity/);
  } finally { disposeThreeObject(original.root); disposeThreeObject(derived.root); }
});

function job(root: string) {
  return { $schema: SKELETAL_EXPORT_JOB_V3_SCHEMA, input: { skinnedModel: path.join(root, 'source.glb') },
    export: { rootJoint: 'LocomotionRoot', units: 'meters', upAxis: '+Y', forwardAxis: '+Z', handedness: 'right', ticksPerSecond: 60, rootMotion: 'separate-track', clipIds: ['gait'] },
    conditioning: { mode: CONDITIONING_NLERP_MODE as string, sourceRootJoint: 'Base', locomotionRootJoint: 'LocomotionRoot', clipIds: ['idle', 'gait'], transitions: [{ idle: 'idle', gait: 'gait', phases: [0], durationTicks: 6 }], twoKeyRotationBake: spec },
    output: { generationRoot: path.join(root, 'generations'), conditioningRoot: path.join(root, 'conditioned') } };
}

test('v3 two-key authoring is explicit, NLERP-only and cannot select another role or a root', async () => {
  const document = job(path.join(os.tmpdir(), 'rustsmf-two-key-parser'));
  const parsed = parseSkeletalExportJobDocument(document);
  assert.equal(parsed.$schema, SKELETAL_EXPORT_JOB_V3_SCHEMA);
  if (parsed.$schema === SKELETAL_EXPORT_JOB_V3_SCHEMA) assert.deepEqual(parsed.conditioning.twoKeyRotationBake, spec);
  assert.throws(() => parseSkeletalExportJobDocument({ ...document, conditioning: { ...document.conditioning, mode: CONDITIONING_MODE } }), /NLERP/);
  const model = fixture();
  try {
    await assert.rejects(conditionSkeletalModel(model, { ...document.conditioning, mode: CONDITIONING_MODE, twoKeyRotationBake: spec } as Parameters<typeof conditionSkeletalModel>[1]), /NLERP/);
  } finally { disposeThreeObject(model.root); }
});

test('ordinary CLI serializes the opt-in bake reproducibly, binds it, refuses bad jobs and cleans owned output', async () => {
  installNodeThreeRuntime();
  const root = await mkdtemp(path.join(os.tmpdir(), 'rustsmf-two-key-cli-'));
  const model = fixture();
  try {
    // The input remains a supported LINEAR source; chord storage belongs to conditioning.
    model.clips[1].tracks = model.clips[1].tracks.map(t => t.ValueTypeName === 'quaternion'
      ? new THREE.QuaternionKeyframeTrack(t.name, t.times, Array.from({ length: 7 }, (_, i) => Array.from(t.values.slice(i * 12 + 4, i * 12 + 8))).flat()) : t);
    await writeFile(path.join(root, 'source.glb'), await exportGLB(model.root, model.clips));
    const document = job(root), jobPath = path.join(root, 'job.json');
    await writeFile(jobPath, JSON.stringify(document));
    const cli = fileURLToPath(new URL('../../scripts/skeletal-export-cli.ts', import.meta.url));
    const invoke = () => spawnSync(process.execPath, ['--import', 'tsx', cli, '--job', jobPath], { cwd: fileURLToPath(new URL('../..', import.meta.url)), encoding: 'utf8', windowsHide: true, timeout: 30000 });
    const a = invoke(), b = invoke(); assert.equal(a.status, 0, a.stderr); assert.equal(b.status, 0, b.stderr);
    const first = JSON.parse(a.stdout) as { id: string; conditioning: { report: string; recipe: string } };
    assert.equal((JSON.parse(b.stdout) as { id: string }).id, first.id);
    const recipe = JSON.parse(await readFile(first.conditioning.recipe, 'utf8')) as { twoKeyRotationBake: TwoKeyRotationBakeRecipe };
    assert.deepEqual(recipe.twoKeyRotationBake, spec);
    const report = JSON.parse(await readFile(first.conditioning.report, 'utf8')) as { twoKeyRotationBake: { corrections: Array<{ values: Array<{ storedCorrectionDegrees: number }> }> }; differences: Array<{ maximumPreservedTickJointMatrix: number }> };
    assert.equal(report.twoKeyRotationBake.corrections.length, 3); assert.ok(report.differences.every(d => d.maximumPreservedTickJointMatrix <= 1e-4));
    await writeFile(jobPath, JSON.stringify({ ...document, conditioning: { ...document.conditioning, twoKeyRotationBake: { ...spec, maxRotationDegrees: .0001 } } }));
    const refused = invoke(); assert.notEqual(refused.status, 0); assert.match(refused.stderr, /bound/);
    assert.deepEqual(await readdir(document.output.generationRoot), [first.id]);
  } finally { disposeThreeObject(model.root); assert.equal(path.dirname(root), os.tmpdir()); assert.ok(path.basename(root).startsWith('rustsmf-two-key-cli-')); await rm(root, { recursive: true, force: true }); }
});
