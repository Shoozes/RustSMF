import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  applyAnimationEditsToClips,
  applyAnimationEditsToImportedSmf,
  applyAnimationMetadataToImportedSmf,
  animationInterpolationToSmf,
  cloneAnimationEditState,
  copyAnimationKeyframes,
  deleteAnimationEditClip,
  deleteAnimationKeyframes,
  deleteAnimationEditBones,
  deleteAnimationKeyframe,
  duplicateAnimationEditClip,
  getAnimationClipMetadata,
  getAnimationClipTimelineDuration,
  getAnimationClipLockedBoneNames,
  getCurrentClipKey,
  hasDirtyAnimationEdits,
  isAnimationInterpolation,
  makeAnimationEditState,
  makeKeyframeFromBone,
  makeUniqueAnimationClipName,
  moveAnimationClip,
  moveAnimationKeyframe,
  moveAnimationKeyframes,
  normalizeAnimationSnapStep,
  renameAnimationEditBone,
  renameAnimationEditClip,
  retimeAnimationClip,
  retimeAnimationEditState,
  sampleClipBoneKeyframe,
  sameAnimationEditState,
  setAnimationClipLockedBones,
  setAnimationClipLoop,
  setAnimationClipDuration,
  setAnimationClipSampleFrameMultiplier,
  setAnimationInterpolation,
  smfInterpolationToAnimation,
  snapAnimationTime,
  trimAnimationClip,
  trimAnimationEditState,
  upsertAnimationKeyframe,
  upsertAnimationKeyframes,
} from './animationEdits';
import type { ImportedSmf } from '../loaders/smf';
import { loadGLB } from '../loaders/glb';
import { disposeThreeObject } from './threeDisposal';
import { createTrackInterpolant, restoreTrackInterpolation, trackInterpolation } from './animationTrackInterpolation';
import { createCubicRetargetFixtureInput } from '../../tests/helpers/cubic-retarget-fixture';

const closeSamples = (actual: ArrayLike<number>, expected: number[]): void => {
  assert.equal(actual.length, expected.length);
  expected.forEach((value, i) => assert.ok(Math.abs(actual[i] - value) < 2e-6, `${actual[i]} != ${value}`));
};

const positionX = (time: number): number => time + .5*time*time - .25*time*time*time;
const scaleX = (time: number): number => 1 + time/4 + time*time/8 - time*time*time/16;

test('raw cubic vector and scale trimming subdivides curves without altering source buffers', async () => {
  const fixture = await createCubicRetargetFixtureInput({ linearRotation: true });
  const model = await loadGLB(fixture.buffer.buffer.slice(fixture.buffer.byteOffset, fixture.buffer.byteOffset + fixture.buffer.byteLength) as ArrayBuffer);
  try {
    const clip = model.clips[0], original = clip.tracks.map(track => Array.from(track.values));
    clip.blendMode = THREE.AdditiveAnimationBlendMode;
    const result = trimAnimationClip(clip, .5, 1.5);
    assert.ok(result.ok);
    assert.equal(result.clip.blendMode, THREE.AdditiveAnimationBlendMode);
    for (const time of [0, .125, .25, .5, .75, 1]) {
      closeSamples(createTrackInterpolant(result.clip.tracks.find(t => t.name.endsWith('.position'))!).evaluate(time), [positionX(time + .5), 0, 0]);
      closeSamples(createTrackInterpolant(result.clip.tracks.find(t => t.name.endsWith('.scale'))!).evaluate(time), [scaleX(time + .5), 1, 1]);
    }
    const track = result.clip.tracks.find(t => t.name.endsWith('.position'))!;
    assert.equal(trackInterpolation(track), 'gltf-cubic-spline');
    assert.deepEqual(Array.from(track.times), [0, 1]);
    closeSamples(track.values, [1.3125,0,0, .59375,0,0, 1.3125,0,0, .8125,0,0, 1.78125,0,0, .8125,0,0]);
    assert.deepEqual(clip.tracks.map(t => Array.from(t.values)), original);
    assert.deepEqual(trimAnimationClip(clip, .5, 1.5, ['FixtureRoot']), { ok: false, reason: 'locked-bone-range', boneName: 'FixtureRoot' });
  } finally { disposeThreeObject(model.root); }
});

test('raw cubic retiming rescales derivatives for vectors, rotations and scale in both directions', async () => {
  const fixture = await createCubicRetargetFixtureInput();
  const model = await loadGLB(fixture.buffer.buffer.slice(fixture.buffer.byteOffset, fixture.buffer.byteOffset + fixture.buffer.byteLength) as ArrayBuffer);
  try {
    const source = model.clips[0], original = source.tracks.map(track => Array.from(track.values));
    for (const duration of [4, .5]) {
      const retimed = retimeAnimationClip(source, 2, duration), factor = duration / 2;
      for (const time of [0, .5, 1, 1.5, 2]) {
        closeSamples(createTrackInterpolant(retimed.tracks.find(t => t.name.endsWith('.position'))!).evaluate(time * factor), [positionX(time),0,0]);
        closeSamples(createTrackInterpolant(retimed.tracks.find(t => t.name.endsWith('.scale'))!).evaluate(time * factor), [scaleX(time),1,1]);
      }
      const rotation = new THREE.Quaternion(0,0,Math.SQRT1_2/2 + .15,(1 + Math.SQRT1_2)/2).normalize().toArray();
      closeSamples(createTrackInterpolant(retimed.tracks.find(t => t.name.endsWith('.quaternion'))!).evaluate(duration/2), rotation);
      assert.equal(retimed.tracks[0].values[6], source.tracks[0].values[6] / factor);
    }
    assert.deepEqual(source.tracks.map(t => Array.from(t.values)), original);
  } finally { disposeThreeObject(model.root); }
});

test('cubic rotations reject inserted trim boundaries but preserve cuts at existing keys', () => {
  const track = new THREE.QuaternionKeyframeTrack('Root.quaternion', [0,1,2], [
    0,0,0,0, 0,0,0,1, 0,0,.3,0,
    0,0,.2,0, 0,0,Math.SQRT1_2,Math.SQRT1_2, 0,0,.1,0,
    0,0,0,0, 0,0,1,0, 0,0,0,0,
  ]);
  restoreTrackInterpolation(track, 'gltf-cubic-spline');
  const clip = new THREE.AnimationClip('Turn', 2, [track]), values = Array.from(track.values);
  assert.deepEqual(trimAnimationClip(clip,.5,1.5), {ok:false,reason:'cubic-rotation-boundary',trackName:track.name});
  const result = trimAnimationClip(clip,1,2);
  assert.ok(result.ok);
  closeSamples(createTrackInterpolant(result.clip.tracks[0]).evaluate(.5), new THREE.Quaternion(0,0,(Math.SQRT1_2 + 1)/2 + .0125,Math.SQRT1_2/2).normalize().toArray());
  assert.deepEqual(Array.from(track.values), values);
});

test('cubic trimming preserves held endpoints and distinct tangents across retained keys', () => {
  const track = new THREE.NumberKeyframeTrack('Mesh.morphTargetInfluences[0]', [.5,1,1.5], [9,1,1, 2,2,3, 0,3,9]);
  restoreTrackInterpolation(track, 'gltf-cubic-spline');
  const clip = new THREE.AnimationClip('Weight', 2, [track]);
  const result = trimAnimationClip(clip,0,2);
  assert.ok(result.ok);
  const trimmed = result.clip.tracks[0];
  for (const [time, value] of [[0,1],[.25,1],[.5,1],[.75,1.4375],[1,2],[1.25,2.6875],[1.5,3],[1.75,3],[2,3]]) {
    closeSamples(createTrackInterpolant(trimmed).evaluate(time), [value]);
  }
  const cut = trimAnimationClip(clip,.75,1.25);
  assert.ok(cut.ok);
  for (const time of [0,.1,.25,.4,.5]) closeSamples(createTrackInterpolant(cut.clip.tracks[0]).evaluate(time), Array.from(createTrackInterpolant(track).evaluate(time + .75) as ArrayLike<number>));
});

test('raw retime retains imported sub-frame timing precision', () => {
  const track = new THREE.VectorKeyframeTrack('Root.position', [0,.123456,2], [0,0,0,1,0,0,2,0,0]);
  const retimed = retimeAnimationClip(new THREE.AnimationClip('Fine',2,[track]),2,4);
  assert.equal(retimed.tracks[0].times[1], Math.fround(track.times[1]*2));
});

test('cubic trim recognizes decimal rotation-key bounds at stored Float32 precision', () => {
  const values = [0,0,0,0, 0,0,0,1, 0,0,.1,0];
  const track = new THREE.QuaternionKeyframeTrack('Root.quaternion',[.1,.2,.3],[...values,...values,...values]);
  restoreTrackInterpolation(track,'gltf-cubic-spline');
  const result = trimAnimationClip(new THREE.AnimationClip('Decimal',.3,[track]),.1,.2);
  assert.ok(result.ok);
  assert.equal(result.clip.tracks[0].times[0],0);
  closeSamples(createTrackInterpolant(result.clip.tracks[0]).evaluate(0),[0,0,0,1]);
});

test('shared key sampling respects cubic triplets, discrete rotations and unedited channels', async () => {
  const fixture = await createCubicRetargetFixtureInput();
  const model = await loadGLB(fixture.buffer.buffer.slice(fixture.buffer.byteOffset, fixture.buffer.byteOffset + fixture.buffer.byteLength) as ArrayBuffer);
  try {
    const clip = model.clips[0], key = sampleClipBoneKeyframe(clip,'FixtureRoot',.5)!;
    closeSamples(key.position, [.59375,0,0]);
    const tip = sampleClipBoneKeyframe(clip,'FixtureTip',1)!;
    closeSamples(tip.quaternion, new THREE.Quaternion(0,0,Math.SQRT1_2/2+.15,(1+Math.SQRT1_2)/2).normalize().toArray());
    const state = upsertAnimationKeyframe(makeAnimationEditState(),clip.name,'FixtureTip',tip);
    const edited = applyAnimationEditsToClips([clip],state)[0];
    for (const name of ['FixtureRoot.position','FixtureTip.scale']) {
      const before = clip.tracks.find(t => t.name === name)!, after = edited.tracks.find(t => t.name === name)!;
      assert.equal(trackInterpolation(after),'gltf-cubic-spline');
      assert.deepEqual(Array.from(after.values), Array.from(before.values));
    }
    const discrete = new THREE.AnimationClip('Step',1,[
      new THREE.VectorKeyframeTrack('Root.position',[0,1],[0,0,0,2,0,0],THREE.InterpolateDiscrete),
      new THREE.QuaternionKeyframeTrack('Root.quaternion',[0,1],[0,0,0,1,0,0,1,0],THREE.InterpolateDiscrete),
    ]);
    closeSamples(sampleClipBoneKeyframe(discrete,'Root',.5)!.position,[0,0,0]);
    closeSamples(sampleClipBoneKeyframe(discrete,'Root',.5)!.quaternion,[0,0,0,1]);
  } finally { disposeThreeObject(model.root); }
});

test('animation interpolation guard rejects untrusted values', () => {
  assert.equal(isAnimationInterpolation('linear'), true);
  assert.equal(isAnimationInterpolation('cubic'), false);
  assert.equal(isAnimationInterpolation(null), false);
});

test('animation edit helpers insert, replace, sort, and delete selected-bone keys', () => {
  const clipName = 'Walk';
  const boneName = 'SMF_Node_1';
  const initial = makeAnimationEditState();

  const withLater = upsertAnimationKeyframe(initial, clipName, boneName, {
    time: 1,
    position: [1, 0, 0],
    quaternion: [0, 0, 0, 1],
    interpolation: 'linear',
  });
  const withEarlier = upsertAnimationKeyframe(withLater, clipName, boneName, {
    time: 0.5,
    position: [0.5, 0, 0],
    quaternion: [0, 0, 0, 1],
    interpolation: 'linear',
  });
  const replaced = upsertAnimationKeyframe(withEarlier, clipName, boneName, {
    time: 1,
    position: [2, 0, 0],
    quaternion: [0, 0, 0, 1],
    interpolation: 'step',
  });

  assert.equal(hasDirtyAnimationEdits(replaced), true);
  assert.deepEqual(
    replaced.editsByClip[clipName][boneName].map((key) => [key.time, key.position[0], key.interpolation]),
    [
      [0.5, 0.5, 'linear'],
      [1, 2, 'step'],
    ],
  );

  const deleted = deleteAnimationKeyframe(replaced, clipName, boneName, 0.5);
  assert.deepEqual(
    deleted.editsByClip[clipName][boneName].map((key) => key.time),
    [1],
  );
});

test('moveAnimationKeyframe retimes authored keys and replaces destination collisions', () => {
  const clipName = 'Walk';
  const boneName = 'Root';
  let state = upsertAnimationKeyframe(makeAnimationEditState(), clipName, boneName, {
    time: 0.25,
    position: [1, 0, 0],
    quaternion: [0, 0, 0, 1],
    interpolation: 'linear',
  });
  state = upsertAnimationKeyframe(state, clipName, boneName, {
    time: 0.75,
    position: [2, 0, 0],
    quaternion: [0, 0, 0, 1],
    interpolation: 'step',
  });

  const moved = moveAnimationKeyframe(state, clipName, boneName, 0.25, 0.5);
  assert.deepEqual(
    moved.editsByClip[clipName][boneName].map((key) => [key.time, key.position[0], key.interpolation]),
    [
      [0.5, 1, 'linear'],
      [0.75, 2, 'step'],
    ],
  );
  assert.equal(moved.selectedKeyTime, 0.5);
  assert.equal(moved.dirtyClipNames.includes(clipName), true);

  const replaced = moveAnimationKeyframe(moved, clipName, boneName, 0.5, 0.75);
  assert.deepEqual(
    replaced.editsByClip[clipName][boneName].map((key) => [key.time, key.position[0], key.interpolation]),
    [[0.75, 1, 'linear']],
  );
});

test('bulk scoped key helpers preserve all tracks and tolerate hostile names', () => {
  const key = (time: number, x: number) => ({
    time,
    position: [x, 0, 0] as [number, number, number],
    quaternion: [0, 0, 0, 1] as [number, number, number, number],
    interpolation: 'linear' as const,
  });
  const keyframes: Record<string, ReturnType<typeof key>> = Object.create(null) as Record<string, ReturnType<typeof key>>;
  keyframes.Root = key(0.25, 1);
  keyframes.__proto__ = key(0.25, 2);

  let state = upsertAnimationKeyframes(makeAnimationEditState(), '__proto__', keyframes);
  assert.deepEqual(Object.keys(state.editsByClip), ['__proto__']);
  assert.equal(state.editsByClip.__proto__.__proto__[0].position[0], 2);

  state = moveAnimationKeyframes(state, '__proto__', ['Root', '__proto__'], 0.25, 0.5);
  assert.deepEqual(state.editsByClip.__proto__.Root.map((entry) => entry.time), [0.5]);
  assert.deepEqual(state.editsByClip.__proto__.__proto__.map((entry) => entry.time), [0.5]);

  const copied = copyAnimationKeyframes(state, '__proto__', 'fingerprint', 'branch', keyframes);
  assert.equal(copied.clipboard?.sourceScope, 'branch');
  assert.equal(Object.prototype.hasOwnProperty.call(copied.clipboard?.entries, '__proto__'), true);

  const deleted = deleteAnimationKeyframes(copied, '__proto__', ['Root', '__proto__'], 0.5);
  assert.equal(deleted.editsByClip['__proto__'], undefined);
});

test('applyAnimationEditsToClips creates position/quaternion tracks and preserves duration', () => {
  const boneName = 'SMF_Node_1';
  const base = new THREE.AnimationClip('Walk', 1, [
    new THREE.VectorKeyframeTrack(`${boneName}.position`, [0, 1], [0, 0, 0, 1, 0, 0]),
    new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
  ]);

  const state = upsertAnimationKeyframe(makeAnimationEditState(), 'Walk', boneName, {
    time: 0.5,
    position: [0.5, 1, 0],
    quaternion: [0, 0, 0, 1],
    interpolation: 'quadratic',
  });

  const [edited] = applyAnimationEditsToClips([base], state);
  const posTrack = edited.tracks.find((track) => track.name === `${boneName}.position`);

  assert.ok(posTrack, 'edited position track exists');
  assert.deepEqual(Array.from(posTrack!.times), [0, 0.5, 1]);
  assert.equal(posTrack!.getInterpolation(), THREE.InterpolateLinear);
  assert.equal(edited.duration, 1);
});

test('animation duration edits extend a clip without changing its source tracks', () => {
  const base = new THREE.AnimationClip('Walk', 1, [
    new THREE.VectorKeyframeTrack('Root.position', [0, 1], [0, 0, 0, 1, 0, 0]),
  ]);
  const state = setAnimationClipDuration(makeAnimationEditState(), 'Walk', 2);
  const [edited] = applyAnimationEditsToClips([base], state);

  assert.equal(edited.duration, 2);
  assert.deepEqual(Array.from(edited.tracks[0].times), [0, 1]);
  assert.notEqual(edited, base);
  assert.notEqual(edited.tracks[0], base.tracks[0]);
});

test('animation retime scales source tracks and authored keys together', () => {
  const base = new THREE.AnimationClip('Walk', 1, [
    new THREE.VectorKeyframeTrack('Root.position', [0, 0.5, 1], [0, 0, 0, 0.5, 0, 0, 1, 0, 0]),
  ]);
  let state = upsertAnimationKeyframe(makeAnimationEditState(), 'Walk', 'Root', {
    time: 0.25,
    position: [0.25, 0, 0],
    quaternion: [0, 0, 0, 1],
    interpolation: 'linear',
  });

  assert.equal(getAnimationClipTimelineDuration(base), 1);
  const retimedClip = retimeAnimationClip(base, 1, 2);
  state = retimeAnimationEditState(state, 'Walk', 1, 2);

  assert.deepEqual(Array.from(retimedClip.tracks[0].times), [0, 1, 2]);
  assert.equal(retimedClip.duration, 2);
  assert.deepEqual(state.editsByClip.Walk.Root.map((key) => key.time), [0.5]);
  assert.equal(state.durationByClip.Walk, 2);
  assert.equal(state.dirtyClipNames.includes('Walk'), true);
  assert.notEqual(retimedClip, base);
  assert.notEqual(retimedClip.tracks[0], base.tracks[0]);
  assert.deepEqual(Array.from(base.tracks[0].times), [0, 0.5, 1]);
});

test('animation trim samples finite boundaries, shifts retained keys, and preserves authored edits', () => {
  const base = new THREE.AnimationClip('Walk', 2, [
    new THREE.VectorKeyframeTrack('Root.position', [0, 1, 2], [0, 0, 0, 1, 0, 0, 2, 0, 0]),
  ]);
  const result = trimAnimationClip(base, 0.5, 1.5);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.clip.duration, 1);
  assert.deepEqual(Array.from(result.clip.tracks[0].times), [0, 0.5, 1]);
  assert.deepEqual(Array.from(result.clip.tracks[0].values), [0.5, 0, 0, 1, 0, 0, 1.5, 0, 0]);

  const authored = upsertAnimationKeyframe(makeAnimationEditState(), 'Walk', 'Root', {
    time: 1,
    position: [4, 0, 0],
    quaternion: [0, 0, 0, 1],
    interpolation: 'linear',
  });
  const trimmed = trimAnimationEditState(authored, 'Walk', 0.5, 1.5);
  assert.deepEqual(trimmed.editsByClip.Walk.Root.map((key) => key.time), [0.5]);
  assert.equal(trimmed.durationByClip.Walk, 1);
});

test('locked animation channels reject trim and remain unchanged by export overrides', () => {
  const base = new THREE.AnimationClip('Walk', 2, [
    new THREE.VectorKeyframeTrack('Root.position', [0, 1, 2], [0, 0, 0, 1, 0, 0, 2, 0, 0]),
  ]);
  const blocked = trimAnimationClip(base, 0.5, 1.5, ['Root']);
  assert.deepEqual(blocked, { ok: false, reason: 'locked-bone-range', boneName: 'Root' });

  const state = setAnimationClipLockedBones(makeAnimationEditState(), 'Walk', ['SMF_Node_0']);
  assert.deepEqual(getAnimationClipLockedBoneNames(state, 'Walk'), ['SMF_Node_0']);
  const source: ImportedSmf = {
    meshes: [],
    textures: [],
    bones: [{ index: 0, parent: 0, isBone: 1, dq: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0]), axis: [0, 1, 0] }],
    animations: [{
      name: 'Walk', duration: 2, times: [0, 2], frames: [
        [new Float32Array([0, 0, 0, 1, 0, 0, 0, 0])],
        [new Float32Array([0, 0, 0, 1, 0, 0, 0, 0])],
      ], nodeCount: 1, loop: 1, interpolation: 1, sampleFrameMultiplier: 1, lockedBones: [],
    }],
  };
  const exportClip = new THREE.AnimationClip('Walk', 2, [
    new THREE.VectorKeyframeTrack('SMF_Node_0.position', [0, 1, 2], [0, 0, 0, 1, 0, 0, 2, 0, 0]),
  ]);
  const exported = applyAnimationEditsToImportedSmf(source, [exportClip], state);
  assert.deepEqual(exported.animations[0].lockedBones, [0]);
});

test('animation retime preserves an explicit shorter duration through SMF export', () => {
  const dq = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0]);
  const source: ImportedSmf = {
    meshes: [],
    textures: [],
    bones: [{ index: 0, parent: 0, isBone: 1, dq, axis: [0, 1, 0] }],
    animations: [{
      name: 'Walk',
      duration: 1,
      times: [0, 1],
      frames: [[dq], [dq]],
      nodeCount: 1,
      loop: 1,
      interpolation: 1,
      sampleFrameMultiplier: 1,
      lockedBones: [],
    }],
  };
  const boneName = 'SMF_Node_0';
  const base = new THREE.AnimationClip('Walk', 1, [
    new THREE.VectorKeyframeTrack(`${boneName}.position`, [0, 1], [0, 0, 0, 1, 0, 0]),
    new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
  ]);
  const state = retimeAnimationEditState(makeAnimationEditState(), 'Walk', 1, 0.5);
  const editedClips = [retimeAnimationClip(base, 1, 0.5)];
  const result = applyAnimationEditsToImportedSmf(source, editedClips, state);

  assert.equal(result.animations[0].duration, 0.5);
  assert.deepEqual(result.animations[0].times, [0, 0.5]);
  assert.equal(result.animations[0].frames.length, 2);
});

test('applyAnimationEditsToImportedSmf carries dirty clip key times into SMF source exports', () => {
  const dq = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0]);
  const source: ImportedSmf = {
    meshes: [],
    textures: [],
    bones: [{ index: 0, parent: 0, isBone: 1, dq, axis: [0, 1, 0] }],
    animations: [{
      name: 'Walk',
      duration: 1,
      times: [0, 1],
      frames: [[dq], [dq]],
      nodeCount: 1,
      loop: 1,
      interpolation: 1,
      sampleFrameMultiplier: 1,
      lockedBones: [],
    }],
  };
  const boneName = 'SMF_Node_0';
  const base = new THREE.AnimationClip('Walk', 1, [
    new THREE.VectorKeyframeTrack(`${boneName}.position`, [0, 1], [0, 0, 0, 1, 0, 0]),
    new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
  ]);
  const state = upsertAnimationKeyframe(makeAnimationEditState(), 'Walk', boneName, {
    time: 0.5,
    position: [0.5, 0, 0],
    quaternion: [0, 0, 0, 1],
    interpolation: 'quadratic',
  });
  const editedClips = applyAnimationEditsToClips([base], state);
  const result = applyAnimationEditsToImportedSmf(source, editedClips, state);

  assert.deepEqual(result.animations[0].times, [0, 0.5, 1]);
  assert.equal(result.animations[0].frames.length, 3);
  assert.equal(result.animations[0].frames[1].length, 1);
  assert.equal(result.animations[0].interpolation, 2);
  assert.notEqual(result, source);
});

test('applyAnimationEditsToImportedSmf rebuilds renamed and duplicated clip lists', () => {
  const dq = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0]);
  const source: ImportedSmf = {
    meshes: [],
    textures: [],
    bones: [{ index: 0, parent: 0, isBone: 1, dq, axis: [0, 1, 0] }],
    animations: [{
      name: 'Walk',
      duration: 1,
      times: [0, 1],
      frames: [[dq], [dq]],
      nodeCount: 1,
      loop: 1,
      interpolation: 1,
      sampleFrameMultiplier: 1,
      lockedBones: [],
    }],
  };
  const boneName = 'SMF_Node_0';
  const renamed = new THREE.AnimationClip('Walk Copy', 1, [
    new THREE.VectorKeyframeTrack(`${boneName}.position`, [0, 1], [0, 0, 0, 1, 0, 0]),
    new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
  ]);
  const duplicated = renamed.clone();
  duplicated.name = 'Walk Copy 2';
  const state = duplicateAnimationEditClip(makeAnimationEditState(), 'Walk Copy', 'Walk Copy 2');

  const result = applyAnimationEditsToImportedSmf(source, [renamed, duplicated], state);

  assert.deepEqual(result.animations.map((animation) => animation.name), ['Walk Copy', 'Walk Copy 2']);
  assert.equal(result.animations.length, 2);
  assert.equal(result.animations[1].frames.length, 2);
});

test('makeKeyframeFromBone and interpolation helpers preserve supported metadata', () => {
  const bone = new THREE.Bone();
  bone.position.set(1, 2, 3);
  bone.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);

  const key = makeKeyframeFromBone(bone, 0.33333333, 'step');
  assert.equal(key.time, 0.3333);
  assert.deepEqual(key.position, [1, 2, 3]);
  assert.equal(key.interpolation, 'step');
  assert.equal(animationInterpolationToSmf('step'), 0);
  assert.equal(animationInterpolationToSmf('linear'), 1);
  assert.equal(animationInterpolationToSmf('quadratic'), 2);
  assert.equal(smfInterpolationToAnimation(2), 'quadratic');

  const state = upsertAnimationKeyframe(makeAnimationEditState(), 'Walk', 'Bone', key);
  const next = setAnimationInterpolation(state, 'quadratic', 'Walk', 'Bone');
  assert.equal(next.editsByClip.Walk.Bone[0].interpolation, 'quadratic');
});

test('renameAnimationEditBone moves authored keys to the new bone name', () => {
  const state = upsertAnimationKeyframe(makeAnimationEditState(), 'Walk', 'Root', {
    time: 0,
    position: [1, 2, 3],
    quaternion: [0, 0, 0, 1],
    interpolation: 'linear',
  });

  const renamed = renameAnimationEditBone(state, 'Root', 'Spine');

  assert.equal(renamed.editsByClip.Walk.Root, undefined);
  assert.equal(renamed.editsByClip.Walk.Spine.length, 1);
  assert.deepEqual(renamed.editsByClip.Walk.Spine[0].position, [1, 2, 3]);
  assert.equal(state.editsByClip.Walk.Root.length, 1);
});

test('clip edit helpers rename, duplicate, delete, and allocate unique names', () => {
  let state = upsertAnimationKeyframe(makeAnimationEditState(), 'Walk', 'Root', {
    time: 0,
    position: [1, 2, 3],
    quaternion: [0, 0, 0, 1],
    interpolation: 'linear',
  });
  state = renameAnimationEditClip(state, 'Walk', 'Run');

  assert.equal(state.editsByClip.Walk, undefined);
  assert.equal(state.editsByClip.Run.Root.length, 1);
  assert.equal(state.dirtyClipNames.includes('Run'), true);

  const duplicated = duplicateAnimationEditClip(state, 'Run', 'Run Copy');
  assert.equal(duplicated.editsByClip['Run Copy'].Root.length, 1);
  assert.notEqual(duplicated.editsByClip['Run Copy'].Root, duplicated.editsByClip.Run.Root);
  assert.equal(duplicated.dirtyClipNames.includes('Run Copy'), true);

  const deleted = deleteAnimationEditClip(duplicated, 'Run');
  assert.equal(deleted.editsByClip.Run, undefined);
  assert.equal(deleted.editsByClip['Run Copy'].Root.length, 1);
  assert.equal(deleted.selectedKeyTime, null);

  const clips = [
    new THREE.AnimationClip('Run', 1, []),
    new THREE.AnimationClip('Run 2', 1, []),
  ];
  assert.equal(makeUniqueAnimationClipName(clips, 'Run'), 'Run 3');
  assert.equal(makeUniqueAnimationClipName(clips, 'Run', 'Run'), 'Run');
});

test('clip metadata helpers preserve loop and sample multiplier through clip edits', () => {
  let state = setAnimationClipLoop(makeAnimationEditState(), 'Walk', false, {
    loop: true,
    sampleFrameMultiplier: 2,
  });
  state = setAnimationClipSampleFrameMultiplier(state, 'Walk', 7.7);

  assert.deepEqual(getAnimationClipMetadata(state, 'Walk'), {
    loop: false,
    sampleFrameMultiplier: 8,
  });
  assert.equal(state.dirtyClipNames.includes('Walk'), true);

  const renamed = renameAnimationEditClip(state, 'Walk', 'Run');
  assert.equal(renamed.metadataByClip.Walk, undefined);
  assert.deepEqual(getAnimationClipMetadata(renamed, 'Run'), {
    loop: false,
    sampleFrameMultiplier: 8,
  });

  const duplicated = duplicateAnimationEditClip(renamed, 'Run', 'Run Copy');
  assert.deepEqual(getAnimationClipMetadata(duplicated, 'Run Copy'), {
    loop: false,
    sampleFrameMultiplier: 8,
  });
  assert.notEqual(duplicated.metadataByClip.Run, duplicated.metadataByClip['Run Copy']);

  const deleted = deleteAnimationEditClip(duplicated, 'Run');
  assert.equal(deleted.metadataByClip.Run, undefined);
  assert.deepEqual(getAnimationClipMetadata(deleted, 'Run Copy'), {
    loop: false,
    sampleFrameMultiplier: 8,
  });
});

test('applyAnimationMetadataToImportedSmf applies metadata without rebuilding keyframes', () => {
  const dq = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0]);
  const source: ImportedSmf = {
    meshes: [],
    textures: [],
    bones: [{ index: 0, parent: 0, isBone: 1, dq, axis: [0, 1, 0] }],
    animations: [{
      name: 'Walk',
      duration: 1,
      times: [0, 1],
      frames: [[dq], [dq]],
      nodeCount: 1,
      loop: 1,
      interpolation: 1,
      sampleFrameMultiplier: 1,
      lockedBones: [],
    }],
  };
  const loopState = setAnimationClipLoop(makeAnimationEditState(), 'Walk', false);
  const state = setAnimationClipSampleFrameMultiplier(loopState, 'Walk', 3);
  const result = applyAnimationMetadataToImportedSmf(source, state);

  assert.notEqual(result, source);
  assert.equal(result.animations[0].loop, 0);
  assert.equal(result.animations[0].sampleFrameMultiplier, 3);
  assert.deepEqual(result.animations[0].times, [0, 1]);
});

test('moveAnimationClip reorders cloned clips and keeps out-of-range moves stable', () => {
  const clips = [
    new THREE.AnimationClip('Idle', 1, []),
    new THREE.AnimationClip('Walk', 1, []),
    new THREE.AnimationClip('Run', 1, []),
  ];

  const movedUp = moveAnimationClip(clips, 'Run', -1);
  assert.deepEqual(movedUp.map((clip) => clip.name), ['Idle', 'Run', 'Walk']);
  assert.notEqual(movedUp[1], clips[2]);

  const movedDown = moveAnimationClip(movedUp, 'Idle', 1);
  assert.deepEqual(movedDown.map((clip) => clip.name), ['Run', 'Idle', 'Walk']);

  const unchanged = moveAnimationClip(clips, 'Idle', -1);
  assert.deepEqual(unchanged.map((clip) => clip.name), ['Idle', 'Walk', 'Run']);
  assert.notEqual(unchanged[0], clips[0]);
});

test('animation snap helpers normalize supported steps and clamp snapped times', () => {
  assert.equal(normalizeAnimationSnapStep(0.1), 0.1);
  assert.equal(normalizeAnimationSnapStep(0.2), 0);
  assert.equal(snapAnimationTime(0.37, 0, 1), 0.37);
  assert.equal(snapAnimationTime(0.37, 0.1, 1), 0.4);
  assert.equal(snapAnimationTime(0.62, 0.25, 1), 0.5);
  assert.equal(snapAnimationTime(1.9, 0.5, 1), 1);
  assert.equal(snapAnimationTime(-0.2, 0.1, 1), 0);
});

test('deleteAnimationEditBones removes authored keys and marks affected clips dirty', () => {
  let state = upsertAnimationKeyframe(makeAnimationEditState(), 'Walk', 'Root', {
    time: 0,
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    interpolation: 'linear',
  });
  state = upsertAnimationKeyframe(state, 'Walk', 'Tip', {
    time: 0,
    position: [1, 0, 0],
    quaternion: [0, 0, 0, 1],
    interpolation: 'linear',
  });

  const next = deleteAnimationEditBones(state, ['Tip']);

  assert.equal(next.editsByClip.Walk.Tip, undefined);
  assert.equal(next.editsByClip.Walk.Root.length, 1);
  assert.equal(next.dirtyClipNames.includes('Walk'), true);
  assert.equal(next.selectedKeyTime, null);
});

test('getCurrentClipKey falls back safely for missing clips and zero-duration clips', () => {
  const zero = new THREE.AnimationClip('Zero', 0, []);
  assert.equal(getCurrentClipKey([zero], 'Missing'), 'Zero');
  assert.equal(getCurrentClipKey([], 'Missing'), '');
});

test('animation edit snapshots clone deeply and compare by value for history', () => {
  const original = upsertAnimationKeyframe(makeAnimationEditState(), 'Walk', 'Root', {
    time: 0.25,
    position: [1, 2, 3],
    quaternion: [0, 0, 0, 1],
    interpolation: 'linear',
  });
  const snapshot = cloneAnimationEditState(original);

  assert.equal(sameAnimationEditState(original, snapshot), true);

  snapshot.editsByClip.Walk.Root[0].position[0] = 9;

  assert.equal(original.editsByClip.Walk.Root[0].position[0], 1);
  assert.equal(sameAnimationEditState(original, snapshot), false);
});
