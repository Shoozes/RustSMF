import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { isThreeBone, isThreeMesh, isThreeSkinnedMesh } from './threeTypeGuards';

test('Three object guards distinguish bones, meshes, and groups', () => {
  const group = new THREE.Group();
  const bone = new THREE.Bone();
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());

  assert.equal(isThreeBone(bone), true);
  assert.equal(isThreeBone(group), false);
  assert.equal(isThreeMesh(mesh), true);
  assert.equal(isThreeMesh(group), false);
});

test('skinned meshes satisfy both mesh and skinned-mesh guards', () => {
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());

  assert.equal(isThreeMesh(mesh), true);
  assert.equal(isThreeSkinnedMesh(mesh), true);
  assert.equal(isThreeSkinnedMesh(new THREE.Mesh()), false);
});
