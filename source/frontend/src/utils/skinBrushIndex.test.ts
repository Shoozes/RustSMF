import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { buildSkinBrushIndex, querySkinBrushIndex } from './skinBrushIndex';

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
