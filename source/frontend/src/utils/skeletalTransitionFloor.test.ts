import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { exportGLB, loadGLB, type LoadedModel } from '../loaders/glb';
import { bytesToArrayBuffer } from '../loaders/smfBinary';
import { installNodeThreeRuntime } from '../../scripts/node-three-runtime';
import { bakeTransitionFloor, parseTransitionFloor } from './skeletalTransitionFloor';
import { disposeThreeObject } from './threeDisposal';

const id = 'start-gait-p25', spec = { clipIds: [id], floorY: 0, maxLiftMeters: .5 };
function fixture(): { model: LoadedModel; root: THREE.Bone; clip: THREE.AnimationClip } {
  const group = new THREE.Group(), root = new THREE.Bone(), hip = new THREE.Bone();
  root.name = 'LocomotionRoot'; hip.name = 'Hip'; hip.position.y = 1; root.add(hip); group.add(root);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial()); group.add(mesh); group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton([root, hip]); mesh.bind(skeleton);
  const times = Array.from({ length: 7 }, (_, i) => i / 60);
  const clip = new THREE.AnimationClip(id, Math.fround(.1), [new THREE.VectorKeyframeTrack('LocomotionRoot.position', times, [0, -.2, -.2, -.3, -.2, -.2, 0].flatMap(y => [0, y, 0]))]);
  return { model: { root: group, skeleton, skinnedMeshes: [mesh], clips: [clip], mixer: new THREE.AnimationMixer(group) }, root, clip };
}

test('floor bake lifts only interior root Y and preserves source keys, endpoints and bind pose', () => {
  const { model, root, clip } = fixture();
  try {
    const before = Array.from(clip.tracks[0].values), binds = model.skeleton!.bones.map(b => [...b.matrixWorld.elements]);
    const baked = bakeTransitionFloor(model, clip, root, spec, 1);
    assert.equal(baked.report.minimumYBefore.length, 25); assert.equal(baked.report.minimumYAfter.length, 25);
    assert.ok(Math.min(...baked.report.minimumYBefore) < -.29);
    assert.ok(Math.min(...baked.report.minimumYAfter) >= -1e-6);
    assert.deepEqual(Array.from(clip.tracks[0].values), before);
    const track = baked.clip.tracks[0];
    assert.deepEqual(Array.from(track.values.slice(0, 3)), before.slice(0, 3));
    assert.deepEqual(Array.from(track.values.slice(-3)), before.slice(-3));
    assert.ok(Array.from(track.values).every((v, i) => i % 3 === 1 || v === before[i]));
    assert.equal(baked.report.rootYLiftByTick[0], 0); assert.equal(baked.report.rootYLiftByTick[6], 0);
    assert.deepEqual(model.skeleton!.bones.map(b => [...b.matrixWorld.elements]), binds);
  } finally { disposeThreeObject(model.root); }
});

test('floor bake survives GLB roundtrip as ordinary linear locomotion-root keys', async () => {
  installNodeThreeRuntime(); const { model, root, clip } = fixture(); let derived: LoadedModel | undefined;
  try {
    const baked = bakeTransitionFloor(model, clip, root, spec, 1);
    derived = await loadGLB(bytesToArrayBuffer(await exportGLB(model.root, [baked.clip])));
    const track = derived.clips[0].tracks.find(t => t.name === 'LocomotionRoot.position')!;
    assert.equal(track.getInterpolation(), THREE.InterpolateLinear);
    assert.equal(track.times.length, 7);
    assert.equal(track.values[1], 0); assert.equal(track.values[19], 0);
    const mixer = new THREE.AnimationMixer(derived.root), action = mixer.clipAction(derived.clips[0]);
    action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
    try { mixer.setTime(.05); derived.root.updateMatrixWorld(true); assert.ok(derived.root.getObjectByName('LocomotionRoot')!.position.y > 0); }
    finally { action.stop(); mixer.uncacheRoot(derived.root); }
  } finally { disposeThreeObject(model.root); if (derived) disposeThreeObject(derived.root); }
});

test('a clear floor reuses the original clip without correction', () => {
  const { model, root, clip } = fixture();
  try { const baked = bakeTransitionFloor(model, clip, root, { ...spec, floorY: -1 }, 1); assert.equal(baked.clip, clip); assert.ok(baked.report.rootYLiftByTick.every(v => v === 0)); }
  finally { disposeThreeObject(model.root); }
});

test('unsafe endpoints and lift-bound overflow refuse without changing source or bind state', () => {
  const { model, root, clip } = fixture();
  try {
    const before = Array.from(clip.tracks[0].values);
    assert.throws(() => bakeTransitionFloor(model, clip, root, { ...spec, floorY: 1 }, 1), /unsafe endpoints/);
    assert.throws(() => bakeTransitionFloor(model, clip, root, { ...spec, maxLiftMeters: .01 }, 1), /maxLiftMeters/);
    assert.deepEqual(Array.from(clip.tracks[0].values), before); assert.equal(root.position.y, 0);
    assert.throws(() => bakeTransitionFloor(model, new THREE.AnimationClip(id, 1, clip.tracks), root, spec, 1), /six-tick/);
  } finally { disposeThreeObject(model.root); }
});

test('stored float32 lift must fit the declared bound after key rounding', () => {
  const { model, root, clip } = fixture();
  try {
    const before = Array.from(clip.tracks[0].values), floorY = .002;
    const probe = bakeTransitionFloor(model, clip, root, { ...spec, floorY }, 1);
    const times = Array.from({ length: 7 }, (_, tick) => Math.fround(tick / 60));
    const exactLift = Math.max(0, ...probe.report.minimumYBefore.slice(1, 24).map((y, index) => {
      const seconds = (index + 1) / 240;
      return (floorY + probe.report.clearanceMeters - y)
        / Math.min(1, seconds / times[1], (times[6] - seconds) / (times[6] - times[5]));
    }));
    const storedLift = Math.max(...probe.report.rootYLiftByTick);
    assert.ok(storedLift > exactLift);
    assert.throws(() => bakeTransitionFloor(model, clip, root, { ...spec, floorY, maxLiftMeters: exactLift }, 1), /maxLiftMeters/);
    const accepted = bakeTransitionFloor(model, clip, root, { ...spec, floorY, maxLiftMeters: storedLift }, 1);
    assert.ok(accepted.report.rootYLiftByTick.every(lift => lift <= storedLift));
    assert.deepEqual(Array.from(clip.tracks[0].values), before);
    assert.equal(root.position.y, 0); assert.equal(model.skeleton!.bones[1].position.y, 1);
  } finally { disposeThreeObject(model.root); }
});

test('cancellation during skin measurement restores every bone', () => {
  const { model, root, clip } = fixture(), abort = new AbortController();
  const positions = model.skinnedMeshes[0].geometry.getAttribute('position');
  const getY = positions.getY.bind(positions);
  positions.getY = (i: number): number => { abort.abort(new Error('cancel floor bake')); return getY(i); };
  try { assert.throws(() => bakeTransitionFloor(model, clip, root, spec, 1, abort.signal), /cancel floor bake/); assert.equal(root.position.y, 0); assert.equal(model.skeleton!.bones[1].position.y, 1); }
  finally { positions.getY = getY; disposeThreeObject(model.root); }
});

test('floor recipe rejects unknown fields, unselected clips and non-finite or unbounded values', () => {
  assert.deepEqual(parseTransitionFloor(spec, [id]), spec);
  for (const invalid of [null, {}, { ...spec, extra: true }, { ...spec, clipIds: [] }, { ...spec, clipIds: [id, id] },
    { ...spec, clipIds: ['idle'] }, { ...spec, clipIds: [1] }, { ...spec, floorY: NaN }, { ...spec, floorY: Infinity },
    { ...spec, maxLiftMeters: 0 }, { ...spec, maxLiftMeters: -1 }, { ...spec, maxLiftMeters: 100001 }]) {
    assert.throws(() => parseTransitionFloor(invalid, [id]), /transitionFloor/);
  }
});
