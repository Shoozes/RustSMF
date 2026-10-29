import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { chordRotationTrack } from './skeletalChordRotation';
import { bakeStanceTrajectory, parseStanceTrajectory, STANCE_JOINTS, STANCE_TRAJECTORY_POLICY, type StanceTrajectoryRecipe } from './skeletalStanceTrajectory';
import { TWO_KEY_EXPORT_BOUNDARY_POLICY, twoKeyExportBaseline } from './skeletalTwoKeyExportBoundary';
import { prepareSkeletalExport } from './skeletalExport';
import { disposeThreeObject } from './threeDisposal';
import { parseSkeletalExportJobDocument } from './skeletalExportJob';
import type { LoadedModel } from '../loaders/glb';
import os from 'node:os';
import path from 'node:path';

const q = (radians: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), radians).toArray();
const recipe = (): StanceTrajectoryRecipe => ({ policy: STANCE_TRAJECTORY_POLICY, clipId: 'walkSlow', anchorTick: 0,
  startTick: 2, maxRotationDegrees: 65, rotations: STANCE_JOINTS.map(joint => ({ joint,
    values: Array.from({ length: 23 }, (_, i) => q(.001 * (i + 2) + .1)) })) });
function fixture(): LoadedModel {
  const root = new THREE.Group(), bones = ['LocomotionRoot', 'mixamorigHips', ...STANCE_JOINTS].map(name => {
    const bone = new THREE.Bone(); bone.name = name; return bone;
  });
  root.add(bones[0]); bones.slice(1).forEach((bone, i) => { bones[i].add(bone); bone.position.y = 1; });
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, .1, 1, 0, -.1, 2, 0], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([2, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  geometry.setIndex([0, 1, 2]);
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial()); root.add(mesh); mesh.bind(skeleton);
  const times = Array.from({ length: 91 }, (_, tick) => Math.fround(tick / 60));
  const tracks = STANCE_JOINTS.map(joint => chordRotationTrack(joint + '.quaternion', times,
    times.flatMap((_, tick) => q(.001 * tick))));
  tracks.push(new THREE.VectorKeyframeTrack('LocomotionRoot.position', times, times.flatMap((_, tick) => [tick * .01, 0, 0])));
  const clips = [new THREE.AnimationClip('walkSlow', 1.5, tracks)];
  return { root, skeleton, skinnedMeshes: [mesh], clips, mixer: new THREE.AnimationMixer(root) };
}

test('versioned left-stance admission fixes the anchor, keys, joints and cap', () => {
  const good = recipe(), parse = (value: unknown) => parseStanceTrajectory(value, ['walkSlow'], ['walkSlow']);
  assert.deepEqual(parse(good), good);
  assert.notEqual(parse(good).rotations[0].values[0], good.rotations[0].values[0]);
  for (const bad of [null, { ...good, policy: 'other' }, { ...good, anchorTick: 1 },
    { ...good, startTick: 3 }, { ...good, maxRotationDegrees: 65.01 },
    { ...good, rotations: good.rotations.slice(0, 2) },
    { ...good, rotations: [...good.rotations].reverse() },
    { ...good, rotations: good.rotations.map(r => ({ ...r, values: r.values.slice(1) })) },
    { ...good, rotations: good.rotations.map(r => ({ ...r, values: r.values.map(() => [0, 0, 0, 2]) })) },
    { ...good, extra: true }]) assert.throws(() => parse(bad), /stanceTrajectoryBake/);
  assert.throws(() => parseStanceTrajectory(good, ['idle'], ['walkSlow']), /stanceTrajectoryBake/);
});

test('v3 job admits only explicit p25 floor and export-boundary composition', () => {
  const root = path.join(os.tmpdir(), 'rustsmf-stance-admission');
  const job = { $schema: 'rustsmf.skeletal-export-job.v3', input: { skinnedModel: path.join(root, 'source.glb') },
    export: { rootJoint: 'LocomotionRoot', units: 'meters', upAxis: '+Y', forwardAxis: '+Z', handedness: 'right',
      ticksPerSecond: 60, rootMotion: 'separate-track', clipIds: ['walkSlow'], twoKeyExportBoundary: TWO_KEY_EXPORT_BOUNDARY_POLICY },
    conditioning: { mode: 'continuous-60hz-locomotion-root-nlerp', sourceRootJoint: 'mixamorigHips',
      locomotionRootJoint: 'LocomotionRoot', clipIds: ['idle', 'walkSlow'],
      transitions: [{ gait: 'walkSlow', idle: 'idle', phases: [.25], durationTicks: 6 }],
      transitionFloor: { clipIds: ['start-walkSlow-p25', 'stop-walkSlow-p25'], floorY: 0, maxLiftMeters: .1 },
      stanceTrajectoryBake: recipe() },
    output: { generationRoot: path.join(root, 'generations'), conditioningRoot: path.join(root, 'conditioned') } };
  const parsed = parseSkeletalExportJobDocument(job);
  assert.equal(parsed.$schema, job.$schema);
  const noBoundary = structuredClone(job); delete (noBoundary.export as Partial<typeof noBoundary.export>).twoKeyExportBoundary;
  assert.throws(() => parseSkeletalExportJobDocument(noBoundary), /preservation/);
  const noFloor = structuredClone(job); noFloor.conditioning.transitionFloor.clipIds = ['start-walkSlow-p25'];
  assert.throws(() => parseSkeletalExportJobDocument(noFloor), /p25 floor/);
  const raisedFloor = structuredClone(job); raisedFloor.conditioning.transitionFloor.maxLiftMeters = .101;
  assert.throws(() => parseSkeletalExportJobDocument(raisedFloor), /p25 floor/);
  const noPhase = structuredClone(job); noPhase.conditioning.transitions[0].phases = [0];
  assert.throws(() => parseSkeletalExportJobDocument(noPhase), /transitionFloor/);
  const overlap = structuredClone(job);
  (overlap.conditioning as typeof overlap.conditioning & { twoKeyRotationBakes: unknown }).twoKeyRotationBakes = [{
    clipId: 'walkSlow', startTick: 23, maxRotationDegrees: 65,
    rotations: STANCE_JOINTS.map(joint => ({ joint, values: [q(0), q(0)] })) }];
  assert.throws(() => parseSkeletalExportJobDocument(overlap), /overlaps/);
  const omitted = structuredClone(job); delete (omitted.conditioning as Partial<typeof omitted.conditioning>).stanceTrajectoryBake;
  delete (omitted.export as Partial<typeof omitted.export>).twoKeyExportBoundary;
  assert.equal(parseSkeletalExportJobDocument(omitted).$schema, job.$schema);
});

test('stance bake preserves original, boundaries and every unselected track while enforcing stored bound', async () => {
  const model = fixture(), original = model.clips[0], before = original.tracks.map(t => Array.from(t.values));
  try {
    const baked = bakeStanceTrajectory(original, recipe(), model.skeleton!.bones);
    assert.equal(baked.report.ticks.length, 23);
    assert.ok(baked.report.corrections.every(r => r.values.every(v => v.storedCorrectionDegrees < 65)));
    assert.deepEqual(original.tracks.map(t => Array.from(t.values)), before);
    assert.equal(baked.clip.tracks[3], original.tracks[3]);
    for (let joint = 0; joint < 3; joint++) for (const tick of [0, 1, 25, 26, 90])
      assert.deepEqual(baked.clip.tracks[joint].values.slice(tick * 12 + 4, tick * 12 + 8),
        original.tracks[joint].values.slice(tick * 12 + 4, tick * 12 + 8));
    assert.throws(() => bakeStanceTrajectory(original, { ...recipe(), maxRotationDegrees: 1 }, model.skeleton!.bones), /bound/);
    const aborted = new AbortController(); aborted.abort(new Error('cancel stance'));
    assert.throws(() => bakeStanceTrajectory(original, recipe(), model.skeleton!.bones, aborted.signal), /cancel stance/);
    const context = { policy: TWO_KEY_EXPORT_BOUNDARY_POLICY, stanceReport: baked.report };
    assert.deepEqual(twoKeyExportBaseline(baked.clip, context, model.skeleton!.bones, ['LocomotionRoot']).tracks.map(t => Array.from(t.values)), before);
    model.clips = [original];
    const options = { sourceIdentitySha256: 'a'.repeat(64), rootJoint: 'LocomotionRoot', conditionedRotationMode: 'continuous-60hz-locomotion-root-nlerp' as const };
    const baseline = await prepareSkeletalExport(model, options);
    model.clips = [baked.clip];
    const raw = await prepareSkeletalExport(model, options);
    const selected = await prepareSkeletalExport(model, { ...options, twoKeyExportBoundary: context });
    assert.deepEqual(selected.referenceBytes, raw.referenceBytes);
    assert.deepEqual(selected.asset.clips[0].root, baseline.asset.clips[0].root);
    for (const track of selected.asset.clips[0].tracks) for (const key of track.keys) {
      const old = baseline.asset.clips[0].tracks.find(t => t.joint === track.joint)!.keys.find(k => k.tick === key.tick)!;
      const authored = raw.asset.clips[0].tracks.find(t => t.joint === track.joint)!.keys.find(k => k.tick === key.tick)!;
      if (STANCE_JOINTS.includes(selected.asset.joints[track.joint].id as typeof STANCE_JOINTS[number]) && key.tick >= 2 && key.tick <= 24) {
        assert.deepEqual(key.transform.rotation, authored.transform.rotation);
        assert.deepEqual(key.transform.translation, old.transform.translation);
        assert.deepEqual(key.transform.scale, old.transform.scale);
      } else assert.deepEqual(key, old);
    }
    const forged = structuredClone(context); forged.stanceReport.corrections[0].values[0].before[0] += .1;
    await assert.rejects(prepareSkeletalExport(model, { ...options, twoKeyExportBoundary: forged }), /provenance/);
  } finally { disposeThreeObject(model.root); }
});
