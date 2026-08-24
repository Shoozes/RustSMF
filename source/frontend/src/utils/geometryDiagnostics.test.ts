import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { diagnoseGeometry } from './geometryDiagnostics';

describe('geometry diagnostics', () => {
  it('reports read-only mesh attributes, materials, identifiers, and handedness', () => {
    const root = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
    const material = new THREE.MeshBasicMaterial();
    material.name = 'mat';
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'triangle';
    mesh.userData.submodelId = 'submodel-1';
    root.add(mesh);
    const uuid = geometry.uuid;
    const report = diagnoseGeometry(root);

    assert.equal(report.meshes.length, 1);
    assert.equal(report.meshes[0].submodelId, 'submodel-1');
    assert.deepEqual(report.meshes[0].materialNames, ['mat']);
    assert.equal(report.meshes[0].normalStatus, 'present');
    assert.equal(report.meshes[0].tangentStatus, 'missing');
    assert.equal(report.meshes[0].uvStatus, 'present');
    assert.equal(report.meshes[0].handedness, 'right-handed');
    assert.equal(report.missingTangents, 1);
    assert.equal(geometry.uuid, uuid);
    assert.equal(geometry.getAttribute('tangent'), undefined);
  });
});
