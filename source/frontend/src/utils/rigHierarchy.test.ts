import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { setBoneDetached } from './rigEdits';
import { collectRigDeformBoneNames, collectRigHierarchyBones, getRigRootBones, isRigBoneDetached } from './rigHierarchy';

test('rig hierarchy display collection keeps detached bones visible outside the deform skeleton', () => {
  const root = new THREE.Bone();
  root.name = 'Root';
  const middle = new THREE.Bone();
  middle.name = 'Middle';
  const tip = new THREE.Bone();
  tip.name = 'Tip';
  root.add(middle);
  middle.add(tip);

  const scene = new THREE.Group();
  scene.add(root);
  const skeleton = new THREE.Skeleton([root, middle, tip]);

  const detached = setBoneDetached(skeleton, 'Middle', true);
  assert.equal(detached.ok, true);
  assert.deepEqual(skeleton.bones.map((bone) => bone.name), ['Root', 'Tip']);

  const displayBones = collectRigHierarchyBones(scene, skeleton);
  assert.deepEqual(displayBones.map((bone) => bone.name), ['Root', 'Middle', 'Tip']);
  assert.deepEqual(collectRigDeformBoneNames(skeleton), ['Root', 'Tip']);
  assert.deepEqual(getRigRootBones(displayBones).map((bone) => bone.name), ['Root']);
  assert.equal(isRigBoneDetached(middle, skeleton), true);
  assert.equal(isRigBoneDetached(tip, skeleton), false);
});

test('rig hierarchy display collection includes skeleton bones when no root is available', () => {
  const root = new THREE.Bone();
  root.name = 'Root';
  const tip = new THREE.Bone();
  tip.name = 'Tip';
  root.add(tip);
  const skeleton = new THREE.Skeleton([root, tip]);

  assert.deepEqual(collectRigHierarchyBones(null, skeleton).map((bone) => bone.name), ['Root', 'Tip']);
});
