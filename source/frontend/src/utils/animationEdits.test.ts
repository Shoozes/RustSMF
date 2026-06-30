import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  applyAnimationEditsToClips,
  applyAnimationEditsToImportedSmf,
  cloneAnimationEditState,
  deleteAnimationEditClip,
  deleteAnimationEditBones,
  deleteAnimationKeyframe,
  duplicateAnimationEditClip,
  getCurrentClipKey,
  hasDirtyAnimationEdits,
  makeAnimationEditState,
  makeKeyframeFromBone,
  makeUniqueAnimationClipName,
  moveAnimationClip,
  moveAnimationKeyframe,
  normalizeAnimationSnapStep,
  renameAnimationEditBone,
  renameAnimationEditClip,
  sameAnimationEditState,
  setAnimationInterpolation,
  snapAnimationTime,
  upsertAnimationKeyframe,
} from './animationEdits';
import type { ImportedSmf } from '../loaders/smf';

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
    interpolation: 'linear',
  });

  const [edited] = applyAnimationEditsToClips([base], state);
  const posTrack = edited.tracks.find((track) => track.name === `${boneName}.position`);

  assert.ok(posTrack, 'edited position track exists');
  assert.deepEqual(Array.from(posTrack!.times), [0, 0.5, 1]);
  assert.equal(edited.duration, 1);
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
    interpolation: 'linear',
  });
  const editedClips = applyAnimationEditsToClips([base], state);
  const result = applyAnimationEditsToImportedSmf(source, editedClips, state);

  assert.deepEqual(result.animations[0].times, [0, 0.5, 1]);
  assert.equal(result.animations[0].frames.length, 3);
  assert.equal(result.animations[0].frames[1].length, 1);
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

  const state = upsertAnimationKeyframe(makeAnimationEditState(), 'Walk', 'Bone', key);
  const next = setAnimationInterpolation(state, 'linear', 'Walk', 'Bone');
  assert.equal(next.editsByClip.Walk.Bone[0].interpolation, 'linear');
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
