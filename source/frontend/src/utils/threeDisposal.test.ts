import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { disposeThreeObject } from './threeDisposal';

test('Three subtree disposal releases shared geometry, materials, textures, and skeletons once', () => {
  const root = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  const texture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const bone = new THREE.Bone();
  const skeleton = new THREE.Skeleton([bone]);
  const first = new THREE.SkinnedMesh(geometry, material);
  const second = new THREE.SkinnedMesh(geometry, [material, material]);
  first.add(bone);
  first.bind(skeleton);
  second.bind(skeleton);
  root.add(first, second);

  const calls = { geometry: 0, material: 0, texture: 0, skeleton: 0 };
  geometry.dispose = () => { calls.geometry += 1; };
  material.dispose = () => { calls.material += 1; };
  texture.dispose = () => { calls.texture += 1; };
  skeleton.dispose = () => { calls.skeleton += 1; };

  disposeThreeObject(root);

  assert.deepEqual(calls, { geometry: 1, material: 1, texture: 1, skeleton: 1 });
});

test('Three subtree disposal accepts empty roots and nodes without render resources', () => {
  assert.doesNotThrow(() => disposeThreeObject(null));
  assert.doesNotThrow(() => disposeThreeObject(new THREE.Group()));
});
