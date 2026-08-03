import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  getAnimationSkeletonFingerprint,
  resolveAnimationScope,
} from './animationScope';

function makeSkeleton(): THREE.Skeleton {
  const root = new THREE.Bone();
  root.name = 'Root';
  const branch = new THREE.Bone();
  branch.name = 'Branch';
  const leaf = new THREE.Bone();
  leaf.name = 'Leaf';
  const other = new THREE.Bone();
  other.name = 'Other';
  root.add(branch, other);
  branch.add(leaf);
  return new THREE.Skeleton([root, branch, leaf, other]);
}

test('animation scope resolves bone, branch, and full-rig names from the selected hierarchy', () => {
  const skeleton = makeSkeleton();

  assert.deepEqual(resolveAnimationScope(skeleton, 'Branch', 'bone').names, ['Branch']);
  assert.deepEqual(resolveAnimationScope(skeleton, 'Branch', 'branch').names, ['Branch', 'Leaf']);
  assert.deepEqual(resolveAnimationScope(skeleton, 'Branch', 'rig').names, ['Root', 'Branch', 'Leaf', 'Other']);
});

test('animation scope fails closed for missing or ambiguous selections', () => {
  const skeleton = makeSkeleton();
  assert.equal(resolveAnimationScope(skeleton, '', 'bone').reason, 'missing-selection');

  const duplicate = new THREE.Bone();
  duplicate.name = 'Branch';
  skeleton.bones[0].add(duplicate);
  skeleton.bones.push(duplicate);
  assert.equal(resolveAnimationScope(skeleton, 'Branch', 'bone').reason, 'ambiguous-selection');
  assert.equal(resolveAnimationScope(skeleton, 'Root', 'rig').reason, 'ambiguous-bone-name');
});

test('animation skeleton fingerprints change when names or hierarchy change', () => {
  const skeleton = makeSkeleton();
  const original = getAnimationSkeletonFingerprint(skeleton);
  skeleton.bones[3].name = 'Renamed';
  const renamed = getAnimationSkeletonFingerprint(skeleton);
  assert.notEqual(renamed, original);

  skeleton.bones[3].name = 'Other';
  skeleton.bones[3].removeFromParent();
  const reparented = getAnimationSkeletonFingerprint(skeleton);
  assert.notEqual(reparented, original);
});
