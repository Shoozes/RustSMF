import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { loadGLB } from '../loaders/glb';
import { disposeThreeObject } from '../utils/threeDisposal';
import { buildRigMap } from '../utils/rigMapping';
import { createCubicRetargetFixtureInput } from '../../tests/helpers/cubic-retarget-fixture';
import { snapshotClip, restoreClip, snapshotOptions, restoreOptions } from './retargetSnapshot';
import { retargetWithWorkerProof } from './retargetParity';
import type { AnimationRetargetOptions } from '../utils/animationRetarget';

const evaluate = (track: THREE.KeyframeTrack, time: number): number[] => Array.from(
  (track as THREE.KeyframeTrack & { createInterpolant(): THREE.Interpolant }).createInterpolant().evaluate(time),
);
function close(actual: number[], expected: number[]) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-6, `${value} vs ${expected[i]}`));
}
async function model() {
  const { buffer } = await createCubicRetargetFixtureInput();
  return loadGLB(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
}

test('real glTF cubic snapshot preserves tangent triplets, endpoints and normalized quaternion samples', async () => {
  const source = await model();
  try {
    const clip = source.clips[0], copied = snapshotClip(clip), restored = restoreClip(structuredClone(copied));
    const position = clip.tracks.find(track => track.name.endsWith('.position'))!;
    close(evaluate(position, 1), [1.25, 0, 0]);
    close(evaluate(clip.tracks.find(track => track.name.endsWith('.scale'))!, 1), [1.3125, 1, 1]);
    for (let i = 0; i < clip.tracks.length; i++) {
      assert.notEqual(copied.tracks[i].values, clip.tracks[i].values);
      assert.notEqual(copied.tracks[i].times.buffer, clip.tracks[i].times.buffer);
      assert.deepEqual(Array.from(restored.tracks[i].values), Array.from(clip.tracks[i].values));
      for (const time of [2.2, 0, .25, 1, 1.7, 2, -.2]) close(evaluate(restored.tracks[i], time), evaluate(clip.tracks[i], time));
      close(evaluate(restored.clone().tracks[i], 1), evaluate(clip.tracks[i], 1));
    }
    const quaternion = evaluate(restored.tracks.find(track => track.name.endsWith('.quaternion'))!, 1);
    assert.ok(Math.abs(Math.hypot(...quaternion) - 1) < 1e-6);
  } finally { disposeThreeObject(source.root); }
});

test('cubic source, scale and reference clips bake known motion through worker serialization', async () => {
  const source = await model(), target = await model();
  try {
    const clip = source.clips[0], mapping = buildRigMap(source.skeleton!, target.skeleton!, {
      manualMap: { FixtureRoot: 'FixtureRoot', FixtureTip: 'FixtureTip' }, allowFuzzy: false,
    });
    const options: AnimationRetargetOptions = { sampleRateHz: 4, applyUpCorrection: false, alignMappedBoneDirections: false, scaleRootMotion: false,
      sourceReferencePose: 'clip' as const, sourceReferenceClip: clip, targetReferenceClip: target.clips[0],
      scaleTransfer: [{ sourceBone: 'FixtureTip', targetBone: 'FixtureTip', axes: ['x','y','z'], strength: [1,1,1] }] };
    const result = retargetWithWorkerProof(clip, source.skeleton!, target.skeleton!, mapping, options);
    close(evaluate(result.clip.tracks.find(track => track.name === 'FixtureRoot.position')!, 1), [1.25,0,0]);
    close(evaluate(result.clip.tracks.find(track => track.name === 'FixtureTip.scale')!, 1), [1.3125,1,1]);
    const expected = new THREE.Quaternion(0,0,Math.SQRT1_2 / 2 + .15, (1 + Math.SQRT1_2) / 2).normalize().toArray();
    close(evaluate(result.clip.tracks.find(track => track.name === 'FixtureTip.quaternion')!, 1), expected);
    const references = restoreOptions(structuredClone(snapshotOptions({ ...options, endpointTargetClips: [clip] })));
    for (const reference of [references.sourceReferenceClip!, references.targetReferenceClip!, references.endpointTargetClips![0]]) {
      close(evaluate(reference.tracks[0], 1), evaluate(clip.tracks[0], 1));
    }
  } finally { disposeThreeObject(source.root); disposeThreeObject(target.root); }
});

test('unrecognized custom interpolation and malformed cubic payloads fail visibly instead of becoming linear', async () => {
  const clip = new THREE.AnimationClip('custom', 1, [new THREE.VectorKeyframeTrack('hips.position', [0,1], [0,0,0,1,0,0])]);
  const track = clip.tracks[0] as THREE.KeyframeTrack & { createInterpolant(): THREE.Interpolant };
  track.createInterpolant = () => track.InterpolantFactoryMethodLinear();
  assert.throws(() => snapshotClip(clip), /cannot serialize the custom interpolation/);
  const source = await model();
  try {
    const snapshot = snapshotClip(source.clips[0]);
    snapshot.tracks[0].values = new Float32Array(10);
    assert.throws(() => restoreClip(snapshot), /Invalid glTF cubic-spline values/);
  } finally { disposeThreeObject(source.root); }
});
