import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { createViewportDisplayController } from './viewportDisplayController';

function makeFixture() {
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture, opacity: 0.8 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  const root = new THREE.Group();
  root.add(mesh);
  return { root, mesh, material, texture };
}

describe('viewport display controller', () => {
  it('keeps legacy shader substitutions reversible and source materials intact', () => {
    const { root, mesh, material, texture } = makeFixture();
    const controller = createViewportDisplayController();
    controller.captureRoot(root);

    controller.setShaderEnabled(true, false, 0.5);
    const legacy = mesh.material as THREE.Material & { map?: THREE.Texture | null };
    assert.notEqual(legacy, material);
    assert.equal(legacy.map, null);
    assert.equal(legacy.opacity, 0.4);
    assert.equal(material.map, null);
    assert.equal(material.opacity, 0.4);

    controller.setShaderEnabled(false, true, 1);
    assert.equal(mesh.material, material);
    assert.equal(material.map, texture);
    assert.equal(material.opacity, 0.8);
    controller.dispose();
  });

  it('restores the source assignment when a model is detached', () => {
    const { root, mesh, material } = makeFixture();
    const controller = createViewportDisplayController();
    controller.captureRoot(root);
    controller.setShaderEnabled(true, true, 1);
    controller.detachRoot(root);
    assert.equal(mesh.material, material);
  });
});
