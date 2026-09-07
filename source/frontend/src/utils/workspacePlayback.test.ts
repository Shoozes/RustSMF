import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { activateWorkspacePlayback, workspaceUsesRestPose } from './workspacePlayback';

function makeFixture() {
  const root = new THREE.Group();
  const bone = new THREE.Bone();
  bone.name = 'Hips';
  root.add(bone);
  const clip = new THREE.AnimationClip('Wave', 1, [
    new THREE.NumberKeyframeTrack('Hips.rotation[z]', [0, 1], [0, Math.PI / 2]),
  ]);
  const mixer = new THREE.AnimationMixer(root);
  const intent = {
    clips: [clip],
    currentClipName: 'Wave',
    isPlaying: false,
    currentTime: 0.5,
    playbackSpeed: 1,
  };
  return { bone, mixer, intent };
}

test('Rig and Skin are rest-pose workspaces', () => {
  assert.equal(workspaceUsesRestPose('view'), false);
  assert.equal(workspaceUsesRestPose('rig'), true);
  assert.equal(workspaceUsesRestPose('skin'), true);
  assert.equal(workspaceUsesRestPose('animate'), false);
  assert.equal(workspaceUsesRestPose('export'), false);
});

test('setup workspaces stop animation and restore the underlying rest pose', () => {
  const { bone, mixer, intent } = makeFixture();
  const animated = activateWorkspacePlayback(mixer, intent, 'animate');
  assert.ok(animated);
  assert.ok(Math.abs(bone.rotation.z - Math.PI / 4) < 1e-6);

  assert.equal(activateWorkspacePlayback(mixer, intent, 'rig'), null);
  assert.ok(Math.abs(bone.rotation.z) < 1e-6, 'Rig restores the pose that existed before animation');

  const resumed = activateWorkspacePlayback(mixer, intent, 'animate');
  assert.ok(resumed);
  assert.ok(Math.abs(bone.rotation.z - Math.PI / 4) < 1e-6);

  assert.equal(activateWorkspacePlayback(mixer, intent, 'skin'), null);
  assert.ok(Math.abs(bone.rotation.z) < 1e-6, 'Skin restores the pose that existed before animation');
});

test('explicit Skin frozen/live modes sample animation and returning to Rest restores the bind pose', () => {
  const { bone, mixer, intent } = makeFixture();
  const playing = { ...intent, isPlaying: true };
  assert.equal(workspaceUsesRestPose('skin', 'frozen'), false);
  assert.equal(workspaceUsesRestPose('skin', 'live'), false);
  assert.equal(workspaceUsesRestPose('rig', 'live'), true);

  const frozen = activateWorkspacePlayback(mixer, playing, 'skin', 'frozen');
  assert.ok(frozen);
  assert.equal(frozen.paused, true);
  assert.ok(Math.abs(bone.rotation.z - Math.PI / 4) < 1e-6);
  mixer.update(0.2);
  assert.equal(frozen.time, 0.5);
  assert.ok(Math.abs(bone.rotation.z - Math.PI / 4) < 1e-6);

  const live = activateWorkspacePlayback(mixer, playing, 'skin', 'live');
  assert.ok(live);
  mixer.update(0.2);
  assert.ok(live.time > 0.5);
  assert.ok(bone.rotation.z > Math.PI / 4);

  assert.equal(activateWorkspacePlayback(mixer, playing, 'skin', 'rest'), null);
  assert.ok(Math.abs(bone.rotation.z) < 1e-6);
  assert.equal(activateWorkspacePlayback(mixer, playing, 'rig', 'live'), null);
});
