import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { retargetWithWorkerProof as retargetAnimationClip } from '../workers/retargetParity';
import { buildRigMap } from './rigMapping';
import { parseClipScaleTransfer } from './retargetScale';

const transfer = {
  sourceBone: 'sourceForearm', targetBone: 'targetHand',
  axes: ['y', 'x', 'z'], strength: [0.5, 0.5, 0],
};

function fixture() {
  const sourceRoot = new THREE.Bone(); sourceRoot.name = 'sourceRoot';
  const sourceForearm = new THREE.Bone(); sourceForearm.name = 'sourceForearm';
  sourceRoot.add(sourceForearm);
  const targetRoot = new THREE.Bone(); targetRoot.name = 'targetRoot';
  const targetForearm = new THREE.Bone(); targetForearm.name = 'targetForearm';
  const targetHand = new THREE.Bone(); targetHand.name = 'targetHand';
  targetHand.scale.set(1.2, 1, 1);
  targetRoot.add(targetForearm); targetForearm.add(targetHand);
  sourceRoot.updateWorldMatrix(true, true); targetRoot.updateWorldMatrix(true, true);
  const source = new THREE.Skeleton([sourceRoot, sourceForearm]);
  const target = new THREE.Skeleton([targetRoot, targetForearm, targetHand]);
  const map = buildRigMap(source, target, {manualMap: {sourceRoot: 'targetRoot', sourceForearm: 'targetForearm'}, allowFuzzy: false});
  const clip = new THREE.AnimationClip('punch', 3 / 60, [
    new THREE.QuaternionKeyframeTrack('sourceForearm.quaternion', [0, 3 / 60], [0, 0, 0, 1, 0, 0, 0, 1], THREE.InterpolateDiscrete),
    new THREE.VectorKeyframeTrack('sourceForearm.scale', [0, 1 / 60, 2 / 60, 3 / 60], [1, 1, 1, 2.5, 1.95, 1.95, 1, 1, 1, 1, 1, 1], THREE.InterpolateDiscrete),
  ]);
  return {source, target, map, clip};
}

test('scale transfer is opt-in, axis-aware, neutral-relative, and returns to rest', () => {
  const {source, target, map, clip} = fixture();
  const options = {sampleRateHz: 60, interpolation: 'step' as const, nextDownRationalTimes: true,
    applyUpCorrection: false, alignMappedBoneDirections: false};
  const baseline = retargetAnimationClip(clip, source, target, map, options);
  assert.equal(baseline.report.scaleTrackCount, 0);
  assert.ok(baseline.report.discardedTracks.includes('sourceForearm.scale'));
  const result = retargetAnimationClip(clip, source, target, map, {...options,
    scaleTransfer: parseClipScaleTransfer({punch: [transfer]}).punch});
  const track = result.clip.tracks.find(item => item.name === 'targetHand.scale');
  assert.ok(track);
  assert.equal(track.getInterpolation(), THREE.InterpolateDiscrete);
  assert.ok(Array.from(track.times).every((time, frame) => time <= frame / 60));
  assert.equal(result.report.scaleTrackCount, 1);
  assert.ok(!result.report.discardedTracks.includes('sourceForearm.scale'));
  const values = track.values;
  assert.ok(Math.abs(values[0] - 1.2) < 1e-5);
  assert.deepEqual(Array.from(values.slice(1, 3)), [1, 1]);
  assert.ok(Math.abs(values[3] - 1.77) < 1e-5);
  assert.ok(Math.abs(values[4] - 1.75) < 1e-5);
  assert.equal(values[5], 1);
  assert.ok(Math.abs(values[6] - 1.2) < 1e-5);
  assert.deepEqual(Array.from(values.slice(7, 9)), [1, 1]);
  assert.deepEqual(target.bones[2].scale.toArray(), [1.2, 1, 1], 'target rest pose stays unchanged');
  const mixer = new THREE.AnimationMixer(target.bones[0]);
  mixer.clipAction(result.clip).play();
  mixer.setTime(1 / 60 + 1e-7);
  assert.ok(target.bones[2].scale.x > 1.7);
  mixer.stopAllAction();
  mixer.clipAction(new THREE.AnimationClip('idle', 1, [
    new THREE.QuaternionKeyframeTrack('targetForearm.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
  ])).play();
  mixer.setTime(0.1);
  assert.ok(Math.abs(target.bones[2].scale.x - 1.2) < 1e-5, 'switching to a clip without scale restores neutral hand');
});

test('scale transfer rejects unbound bones, missing tracks, and unsafe ratios', () => {
  const {source, target, map, clip} = fixture();
  const options = {sampleRateHz: 60, interpolation: 'step' as const, applyUpCorrection: false, alignMappedBoneDirections: false};
  for (const spec of [
    {...transfer, sourceBone: 'missing'}, {...transfer, targetBone: 'missing'},
  ]) assert.throws(() => retargetAnimationClip(clip, source, target, map, {...options, scaleTransfer: parseClipScaleTransfer({punch: [spec]}).punch}), /Scale transfer/);
  const tooLarge = clip.clone();
  const scale = tooLarge.tracks.find(track => track.name === 'sourceForearm.scale')!;
  scale.values[3] = 5;
  assert.throws(() => retargetAnimationClip(tooLarge, source, target, map, {...options, scaleTransfer: parseClipScaleTransfer({punch: [transfer]}).punch}), /safe source ratio/);
});

test('target reference clip scale is the transferred neutral, not skeleton rest scale', () => {
  const {source, target, map, clip} = fixture();
  const targetReferenceClip = new THREE.AnimationClip('target-idle', 1, [
    new THREE.QuaternionKeyframeTrack('targetForearm.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    new THREE.VectorKeyframeTrack('targetHand.scale', [0, 1], [1.5, 1.1, 1, 1.5, 1.1, 1]),
  ]);
  const result = retargetAnimationClip(clip, source, target, map, {
    sampleRateHz: 60, interpolation: 'step', applyUpCorrection: false, alignMappedBoneDirections: false,
    targetReferenceClip, scaleTransfer: parseClipScaleTransfer({punch: [transfer]}).punch,
  });
  const values = result.clip.tracks.find(track => track.name === 'targetHand.scale')?.values;
  assert.ok(values);
  assert.ok(Math.abs(values[0] - 1.5) < 1e-5);
  assert.ok(Math.abs(values[1] - 1.1) < 1e-5);
  assert.ok(Math.abs(values[3] - 2.2125) < 1e-5);
  assert.ok(Math.abs(values[4] - 1.925) < 1e-5);
  assert.deepEqual(target.bones[2].scale.toArray(), [1.2, 1, 1], 'reference sampling restores skeleton rest');
});

test('scale transfer follows an explicit map on a differently named target rig', () => {
  const {source, target, clip} = fixture();
  target.bones[1].name = 'gauntletForearm';
  target.bones[2].name = 'gauntlet';
  target.bones[2].scale.set(0.8, 0.9, 1);
  const map = buildRigMap(source, target, {manualMap: {
    sourceRoot: 'targetRoot', sourceForearm: 'gauntletForearm',
  }, allowFuzzy: false});
  const result = retargetAnimationClip(clip, source, target, map, {
    sampleRateHz: 60, interpolation: 'step', applyUpCorrection: false,
    alignMappedBoneDirections: false,
    scaleTransfer: parseClipScaleTransfer({punch: [{
      sourceBone: 'sourceForearm', targetBone: 'gauntlet',
      axes: ['x', 'x', 'x'], strength: [0.4, 0.4, 0.4],
    }]}).punch,
  });
  const values = result.clip.tracks.find(track => track.name === 'gauntlet.scale')?.values;
  assert.ok(values);
  assert.ok(Math.abs(values[3] - 1.28) < 1e-5);
  assert.ok(Math.abs(values[4] - 1.44) < 1e-5);
  assert.equal(result.report.scaleTrackCount, 1);
});

test('scale transfer profile rejects malformed and conflicting entries', () => {
  for (const value of [
    {punch: [{...transfer, strength: [2, 0, 0]}]},
    {punch: [{...transfer, axes: ['x', 'q', 'z']}]},
    {punch: [transfer, transfer]},
    {punch: [{...transfer, ignored: true}]},
    {punch: []},
    JSON.parse('{"__proto__":[{"sourceBone":"sourceForearm","targetBone":"targetHand","axes":["x","x","x"],"strength":[0.4,0.4,0.4]}]}'),
  ]) assert.throws(() => parseClipScaleTransfer(value), /clipScaleTransfer/);
});
