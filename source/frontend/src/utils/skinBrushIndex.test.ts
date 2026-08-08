import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  buildSkinBrushIndex,
  buildSkinnedWorldBrushIndex,
  querySkinBrushIndex,
  querySkinBrushWorldIndex,
} from './skinBrushIndex';
import { getSkinnedVertexWorldPosition } from './skinnedVertexPosition';
import { captureSkinPaintPose, getSkinPaintVertexWorldPosition } from './skinnedVertexPosition';

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
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([
    0, 0, 0, 0,
    0, 0, 0, 0,
  ], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([
    1, 0, 0, 0,
    1, 0, 0, 0,
  ], 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  const root = new THREE.Bone();
  mesh.add(root);
  mesh.bind(new THREE.Skeleton([root]));
  root.position.set(-4.95, 0, 0);
  mesh.updateMatrixWorld(true);
  mesh.skeleton.update();

  const staticIndex = buildSkinBrushIndex(mesh, 0.25);
  const worldIndex = buildSkinnedWorldBrushIndex(mesh, 0.25);
  const staticNear = querySkinBrushIndex(staticIndex, new THREE.Vector3(0, 0, 0), 0.25);
  const skinnedNear = querySkinBrushWorldIndex(worldIndex, new THREE.Vector3(0, 0, 0), 0.25);

  assert.deepEqual(staticNear.map((candidate) => candidate.vertexIndex), []);
  assert.deepEqual(skinnedNear.map((candidate) => candidate.vertexIndex), [0]);
  assert.deepEqual(skinnedNear[0].localPosition, [5, 0, 0]);
  assert.ok(skinnedNear[0].skinnedWorldPosition);
  assert.ok(Math.abs(skinnedNear[0].skinnedWorldPosition[0] - 0.05) < 1e-6);
  assert.deepEqual(skinnedNear[0].skinnedWorldPosition.slice(1), [0, 0]);
  assert.equal(worldIndex.valid, true);
});

test('skinned world position rejects an unbound mesh instead of using bind coordinates', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([1, 2, 3], 3));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());

  assert.equal(getSkinnedVertexWorldPosition(mesh, 0, new THREE.Vector3()), 'missing-skin-attributes');
  assert.equal(buildSkinnedWorldBrushIndex(mesh, 0.25).valid, false);
});

test('skin brush pose modes separate bind, frozen, and live sampling coordinates', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([5, 0, 0], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  const root = new THREE.Bone();
  mesh.add(root);
  mesh.bind(new THREE.Skeleton([root]));
  root.position.x = 3;
  mesh.updateMatrixWorld(true);

  const frozen = captureSkinPaintPose(mesh);
  assert.ok(frozen?.boneMatrices);
  const rest = buildSkinnedWorldBrushIndex(mesh, 0.25, { mode: 'rest' });
  const frozenIndex = buildSkinnedWorldBrushIndex(mesh, 0.25, frozen!);
  const restNear = querySkinBrushWorldIndex(rest, new THREE.Vector3(5, 0, 0), 0.25);
  const frozenNear = querySkinBrushWorldIndex(frozenIndex, new THREE.Vector3(8, 0, 0), 0.25);

  assert.deepEqual(restNear.map((candidate) => candidate.vertexIndex), [0]);
  assert.deepEqual(frozenNear.map((candidate) => candidate.vertexIndex), [0]);
  const target = new THREE.Vector3();
  assert.equal(getSkinPaintVertexWorldPosition(mesh, 0, target, { mode: 'rest' }), null);
  assert.equal(target.x, 5);
  assert.equal(getSkinPaintVertexWorldPosition(mesh, 0, target, frozen!), null);
  assert.ok(Math.abs(target.x - 8) < 1e-6);
});
