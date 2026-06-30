import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  buildSkinBrushIndex,
  buildSkinnedWorldBrushIndex,
  querySkinBrushIndex,
  querySkinBrushWorldIndex,
} from './skinBrushIndex';

test('skin brush index queries only nearby local vertices', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    0.1, 0, 0,
    3, 0, 0,
    3.2, 0, 0,
  ], 3));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());

  const index = buildSkinBrushIndex(mesh, 0.25);
  const near = querySkinBrushIndex(index, new THREE.Vector3(0, 0, 0), 0.25);
  const far = querySkinBrushIndex(index, new THREE.Vector3(3, 0, 0), 0.25);

  assert.equal(index.vertexCount, 4);
  assert.deepEqual(near.map((candidate) => candidate.vertexIndex).sort(), [0, 1]);
  assert.deepEqual(far.map((candidate) => candidate.vertexIndex).sort(), [2, 3]);
  assert.ok(near.length < index.vertexCount);
});

test('skinned world brush index finds vertices moved away from bind position', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    5, 0, 0,
    6, 0, 0,
  ], 3));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  (mesh as unknown as { boneTransform: (index: number, target: THREE.Vector3) => THREE.Vector3 }).boneTransform = (
    vertexIndex,
    target,
  ) => {
    if (vertexIndex === 0) {
      target.set(0.05, 0, 0);
      return target;
    }
    target.set(6, 0, 0);
    return target;
  };

  const staticIndex = buildSkinBrushIndex(mesh, 0.25);
  const worldIndex = buildSkinnedWorldBrushIndex(mesh, 0.25);
  const staticNear = querySkinBrushIndex(staticIndex, new THREE.Vector3(0, 0, 0), 0.25);
  const skinnedNear = querySkinBrushWorldIndex(worldIndex, new THREE.Vector3(0, 0, 0), 0.25);

  assert.deepEqual(staticNear.map((candidate) => candidate.vertexIndex), []);
  assert.deepEqual(skinnedNear.map((candidate) => candidate.vertexIndex), [0]);
  assert.deepEqual(skinnedNear[0].localPosition, [5, 0, 0]);
  assert.deepEqual(skinnedNear[0].skinnedWorldPosition, [0.05, 0, 0]);
});
