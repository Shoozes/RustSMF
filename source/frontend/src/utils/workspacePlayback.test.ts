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
