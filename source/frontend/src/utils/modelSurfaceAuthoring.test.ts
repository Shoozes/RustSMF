import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import {
  assignStaticModelMaterial,
  flipStaticModelWinding,
  prepareStaticModelGeometry,
  transformStaticModelObject,
} from './modelSurfaceAuthoring';

function makeRoot(): { root: THREE.Group; mesh: THREE.Mesh; material: THREE.MeshBasicMaterial } {
  const root = new THREE.Group();
  const material = new THREE.MeshBasicMaterial();
  material.name = 'replacement';
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material.clone());
  mesh.name = 'Mesh';
  mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  root.add(mesh);
  root.userData.sourceMaterial = material;
  return { root, mesh, material };
}

describe('model surface authoring', () => {
  it('applies bounded static transforms and rejects source-owned mutation', () => {
    const { root, mesh } = makeRoot();
    const changed = transformStaticModelObject(root, mesh.uuid, { position: [1, 2, 3], scale: [2, 2, 2] }, [], 'obj');
    assert.equal(changed.ok, true);
    assert.deepEqual(mesh.position.toArray(), [1, 2, 3]);
    const rejected = transformStaticModelObject(root, mesh.uuid, { position: [9, 9, 9] }, [], 'smf');
    assert.equal(rejected.ok, false);
    assert.deepEqual(mesh.position.toArray(), [1, 2, 3]);
  });

  it('flips winding and prepares normals without mutating the original geometry reference', () => {
    const { root, mesh } = makeRoot();
    mesh.geometry.setIndex([0, 1, 2]);
    const before = mesh.geometry;
    const flipped = flipStaticModelWinding(root, mesh.uuid, [], 'glb');
    assert.equal(flipped.ok, true);
    assert.notEqual(mesh.geometry, before);
    assert.deepEqual(Array.from(mesh.geometry.index!.array), [2, 1, 0]);
    const prepared = prepareStaticModelGeometry(root, mesh.uuid, [], 'glb');
    assert.equal(prepared.ok, true);
    assert.ok(mesh.geometry.getAttribute('normal'));
  });

  it('assigns a named material and fails closed for missing names', () => {
    const { root, mesh, material } = makeRoot();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
    const assigned = assignStaticModelMaterial(root, mesh.uuid, 'replacement', [], 'obj');
    assert.equal(assigned.ok, true);
    assert.equal((mesh.material as THREE.Material).name, 'replacement');
    const rejected = assignStaticModelMaterial(root, mesh.uuid, 'missing', [], 'obj');
    assert.equal(rejected.ok, false);
  });
});
