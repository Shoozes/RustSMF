import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import {
  getSourceMaterials,
  getSourceMaterialViews,
  registerMaterialPreviewRoot,
  unregisterMaterialPreviewRoot,
  updateMaterialPreview,
  withSourceMaterialState,
  withSourceMaterialStateSync,
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
  it('defers display changes until the last export reader exits and restores the latest preview', async () => {
    const { root, material, texture } = makeFixture(); registerMaterialPreviewRoot(root);
    let finishFirst!: () => void, finishLast!: () => void;
    const first = withSourceMaterialState(root, () => new Promise<void>(resolve => { finishFirst = resolve; }));
    const last = withSourceMaterialState(root, () => new Promise<void>(resolve => { finishLast = resolve; }));
    try {
      updateMaterialPreview(root, { textureEnabled: false, modelOpacity: 0.25, repeatTextures: true, textureFilter: 'linear' });
      assert.equal(material.map, texture); assert.equal(material.opacity, 0.8);
      assert.equal(texture.wrapS, THREE.ClampToEdgeWrapping); assert.equal(texture.magFilter, THREE.NearestFilter);
      finishFirst(); await first;
      updateMaterialPreview(root, { modelOpacity: 0.5 });
      assert.equal(material.map, texture); assert.equal(material.opacity, 0.8);
    } finally { finishFirst(); finishLast(); await Promise.all([first, last]); }
    assert.equal(material.map, null); assert.equal(material.opacity, 0.4);
    assert.equal(texture.wrapS, THREE.RepeatWrapping); assert.equal(texture.magFilter, THREE.LinearFilter);
    unregisterMaterialPreviewRoot(root);
  });

  it('keeps source materials exposed when a queue capture nests inside an async save', async () => {
    const { root, material, texture } = makeFixture(); registerMaterialPreviewRoot(root);
    updateMaterialPreview(root, { textureEnabled: false, modelOpacity: 0.2 });
    await withSourceMaterialState(root, async () => {
      assert.equal(material.opacity, 0.8); assert.equal(material.map, texture);
      assert.equal(withSourceMaterialStateSync(root, () => material.map), texture);
      assert.equal(material.opacity, 0.8); assert.equal(material.map, texture);
      assert.throws(() => withSourceMaterialStateSync(root, () => { throw new Error('capture refused'); }), /refused/);
      assert.equal(material.map, texture);
    });
    assert.equal(material.opacity, 0.8 * 0.2); assert.equal(material.map, null);
  });

  it('restores preview only after overlapping source readers finish in either order', async () => {
    const { root, material, texture } = makeFixture(); registerMaterialPreviewRoot(root);
    updateMaterialPreview(root, { textureEnabled: false });
    let finishFirst!: () => void, finishLast!: () => void;
    const first = withSourceMaterialState(root, () => new Promise<void>(resolve => { finishFirst = resolve; }));
    const last = withSourceMaterialState(root, () => new Promise<void>(resolve => { finishLast = resolve; }));
    finishFirst(); await first; assert.equal(material.map, texture);
    finishLast(); await last; assert.equal(material.map, null);
  });

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
    assert.equal(getSourceMaterialViews(mesh)[0]?.sourceMaps.get('map'), texture);
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

  it('keeps a replaced material registration independent of old readers', async () => {
    const { root, mesh, texture } = makeFixture(); registerMaterialPreviewRoot(root);
    let finish!: () => void;
    const oldSave = withSourceMaterialState(root, () => new Promise<void>(resolve => { finish = resolve; }));
    unregisterMaterialPreviewRoot(root);
    const replacement = new THREE.MeshStandardMaterial({ map: texture, opacity: 0.6 }); mesh.material = replacement;
    registerMaterialPreviewRoot(root); updateMaterialPreview(root, { textureEnabled: false, modelOpacity: 0.2 });
    assert.equal(withSourceMaterialStateSync(root, () => replacement.opacity), 0.6);
    assert.equal(replacement.opacity, 0.6 * 0.2); assert.equal(replacement.map, null);
    finish(); await oldSave; assert.equal(replacement.opacity, 0.6 * 0.2); assert.equal(replacement.map, null);
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
