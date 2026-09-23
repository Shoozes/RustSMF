import * as THREE from 'three';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectMaterialTextures,
  hasUsableTextureImage,
  removeUnavailableMaterialTextures,
  waitForTextureImages,
} from './textureImageReadiness';

type FakeImage = {
  complete: boolean;
  naturalWidth: number;
  naturalHeight: number;
  listeners: Map<string, Set<() => void>>;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
  emit: (type: string) => void;
};

function makeFakeImage(): FakeImage {
  const listeners = new Map<string, Set<() => void>>();
  return {
    complete: false,
    naturalWidth: 0,
    naturalHeight: 0,
    listeners,
    addEventListener(type, listener) {
      const registered = listeners.get(type) ?? new Set<() => void>();
      registered.add(listener);
      listeners.set(type, registered);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    emit(type) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener();
    },
  };
}

function makeTexture(image: FakeImage): THREE.Texture {
  return new THREE.Texture(image as unknown as HTMLImageElement);
}

describe('model texture image readiness', () => {
  it('deduplicates textures collected from supported material slots', () => {
    const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
    root.add(new THREE.Mesh(new THREE.BufferGeometry(), material));

    assert.deepEqual(collectMaterialTextures(root, ['map']), [texture]);
    assert.deepEqual(collectMaterialTextures(root, ['normalMap']), []);
    texture.dispose();
    material.dispose();
    root.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
  });

  it('waits for an image load and removes its listeners after settlement', async () => {
    const image = makeFakeImage();
    const texture = makeTexture(image);
    const wait = waitForTextureImages([texture], 100);

    image.naturalWidth = 4;
    image.naturalHeight = 2;
    image.complete = true;
    image.emit('load');
    await wait;

    assert.equal(hasUsableTextureImage(texture), true);
    assert.equal(image.listeners.get('load')?.size ?? 0, 0);
    assert.equal(image.listeners.get('error')?.size ?? 0, 0);
    texture.dispose();
  });

  it('settles failed and timed-out images so unavailable maps can be removed', async () => {
    const failedImage = makeFakeImage();
    const failedTexture = makeTexture(failedImage);
    const timedOutTexture = makeTexture(makeFakeImage());
    const failedWait = waitForTextureImages([failedTexture], 100);
    failedImage.complete = true;
    failedImage.emit('error');
    await failedWait;
    await waitForTextureImages([timedOutTexture], 1);

    const material = new THREE.MeshBasicMaterial({ map: failedTexture });
    const initialMaterialVersion = material.version;
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    root.add(mesh);
    assert.equal(hasUsableTextureImage(failedTexture), false);

    const result = removeUnavailableMaterialTextures(root, ['map']);
    assert.equal(result.removed, 1);
    assert.deepEqual(result.changedMaterials, [material]);
    assert.equal(material.map, null);
    assert.equal(material.version, initialMaterialVersion + 1);

    failedTexture.dispose();
    timedOutTexture.dispose();
    mesh.geometry.dispose();
    material.dispose();
  });
});
