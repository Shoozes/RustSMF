import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { sampleTextureThumbnailPixels } from './textureThumbnail';

test('sampleTextureThumbnailPixels preserves raw SMF RGBA colors', () => {
  const pixels = new Uint8Array([
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
    255, 255, 255, 255,
  ]);
  const texture = new THREE.DataTexture(
    pixels,
    2,
    2,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.flipY = false;

  assert.deepEqual(
    [...(sampleTextureThumbnailPixels(texture, 2, 2) ?? [])],
    [...pixels],
  );
});

test('sampleTextureThumbnailPixels honors vertical texture flipping', () => {
  const texture = new THREE.DataTexture(
    new Uint8Array([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 255, 255,
    ]),
    2,
    2,
  );
  texture.flipY = true;

  assert.deepEqual(
    [...(sampleTextureThumbnailPixels(texture, 2, 2) ?? [])],
    [
      0, 0, 255, 255,
      255, 255, 255, 255,
      255, 0, 0, 255,
      0, 255, 0, 255,
    ],
  );
});

test('sampleTextureThumbnailPixels converts normalized float textures', () => {
  const texture = new THREE.DataTexture(
    new Float32Array([1, 0.5, 0, 1]),
    1,
    1,
    THREE.RGBAFormat,
    THREE.FloatType,
  );

  assert.deepEqual(
    [...(sampleTextureThumbnailPixels(texture, 1, 1) ?? [])],
    [255, 128, 0, 255],
  );
});
