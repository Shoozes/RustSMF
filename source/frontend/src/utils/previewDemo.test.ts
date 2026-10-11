import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPreviewDemo } from './previewDemo';

test('preview sample is a self-contained authored rig with normalized raw influences', () => {
  const { scene, clips, mesh } = createPreviewDemo();
  assert.equal(scene.name, 'RustSMFSignalRobot');
  assert.deepEqual(mesh.skeleton.bones.map(bone => bone.name), ['Base', 'Shoulder', 'Elbow', 'Wrist', 'Head']);
  assert.deepEqual(clips.map(clip => [clip.name, clip.duration]), [['Wave', 2], ['Turn', 2]]);
  assert.equal(mesh.geometry.getAttribute('position').count, 240);
  const weights = mesh.geometry.getAttribute('skinWeight');
  for (let i = 0; i < weights.count; i++) assert.equal(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i), 1);
  assert.ok(mesh.material.every(material => !material.map));
});

test('preview Wave produces actual joint movement and returns to its authored pose', () => {
  const { scene, clips, mesh } = createPreviewDemo();
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(clips[0]).play();
  const wrist = mesh.skeleton.bones[3];
  const initial = wrist.getWorldPosition(new THREE.Vector3());
  mixer.setTime(0.5); scene.updateMatrixWorld(true);
  assert.ok(wrist.getWorldPosition(new THREE.Vector3()).distanceTo(initial) > 0.05);
  mixer.setTime(2); scene.updateMatrixWorld(true);
  assert.ok(wrist.getWorldPosition(new THREE.Vector3()).distanceTo(initial) < 1e-6);
  mixer.stopAllAction(); mixer.uncacheRoot(scene);
});
