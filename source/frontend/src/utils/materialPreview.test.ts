import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import {
  getSourceMaterials,
  registerMaterialPreviewRoot,
  unregisterMaterialPreviewRoot,
  updateMaterialPreview,
  withSourceMaterialState,
} from './materialPreview';

function makeFixture() {
  const texture = new THREE.Texture();
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  const material = new THREE.MeshStandardMaterial({ map: texture, opacity: 0.8, transparent: false });
  const mesh: THREE.Mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  const root = new THREE.Group();
  root.add(mesh);
  return { root, mesh, material, texture };
}

describe('material preview isolation', () => {
  it('restores source material, sampler, and assignment during async export', async () => {
    const { root, mesh, material, texture } = makeFixture();
    registerMaterialPreviewRoot(root);
    updateMaterialPreview(root, {
      textureEnabled: false,
      modelOpacity: 0.5,
      repeatTextures: true,
      textureFilter: 'linear',
    });
    const legacyPreview = new THREE.MeshBasicMaterial({ color: 0xff00ff });
    const previewColors = new THREE.BufferAttribute(new Float32Array(mesh.geometry.attributes.position.count * 3), 3);
    mesh.geometry.setAttribute('color', previewColors);
    material.vertexColors = true;
    mesh.material = legacyPreview;

    assert.equal(material.map, null);
    assert.equal(material.opacity, 0.4);
    assert.equal(texture.wrapS, THREE.RepeatWrapping);
    assert.equal(texture.magFilter, THREE.LinearFilter);

    await withSourceMaterialState(root, async () => {
      assert.equal(mesh.material, material);
      assert.equal(material.map, texture);
      assert.equal(material.opacity, 0.8);
      assert.equal(material.transparent, false);
      assert.equal(texture.wrapS, THREE.ClampToEdgeWrapping);
      assert.equal(texture.wrapT, THREE.MirroredRepeatWrapping);
      assert.equal(texture.magFilter, THREE.NearestFilter);
      assert.equal(texture.minFilter, THREE.NearestMipmapNearestFilter);
      assert.equal(mesh.geometry.getAttribute('color'), undefined);
      assert.equal(material.vertexColors, false);
      await Promise.resolve();
      assert.equal(mesh.material, material);
    });

    assert.equal(mesh.material, legacyPreview);
    assert.equal(material.map, null);
    assert.equal(material.opacity, 0.4);
    assert.equal(texture.wrapS, THREE.RepeatWrapping);
    assert.equal(texture.magFilter, THREE.LinearFilter);
    assert.equal(mesh.geometry.getAttribute('color'), previewColors);
    assert.equal(material.vertexColors, true);

    unregisterMaterialPreviewRoot(root);
    assert.equal(mesh.material, material);
    assert.equal(material.map, texture);
    assert.equal(material.opacity, 0.8);
    assert.equal(texture.wrapS, THREE.ClampToEdgeWrapping);
    assert.equal(mesh.geometry.getAttribute('color'), undefined);
    assert.equal(material.vertexColors, false);
  });

  it('reports registered source materials while a preview material is mounted', () => {
    const { root, mesh, material } = makeFixture();
    registerMaterialPreviewRoot(root);
    mesh.material = new THREE.MeshBasicMaterial();
    assert.deepEqual(getSourceMaterials(mesh), [material]);
    unregisterMaterialPreviewRoot(root);
  });

  it('does not reapply preview state when the root is unregistered during export', async () => {
    const { root, material, texture } = makeFixture();
    registerMaterialPreviewRoot(root);
    updateMaterialPreview(root, { textureEnabled: false });

    const result = await withSourceMaterialState(root, async () => {
      unregisterMaterialPreviewRoot(root);
      return 42;
    });

    assert.equal(result, 42);
    assert.equal(material.map, texture);
    assert.equal(material.opacity, 0.8);
  });
});
