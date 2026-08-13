import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { ensureGeometryAttributes } from './geometryAttributes';

function makeTriangleGeometry(indexed: boolean): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
    0, 0,
    1, 0,
    0, 1,
  ]), 2));
  if (indexed) geometry.setIndex([0, 1, 2]);
  return geometry;
}

describe('ensureGeometryAttributes', () => {
  it('does not ask Three to compute tangents for non-indexed triangle soup', () => {
    const geometry = makeTriangleGeometry(false);
    const result = ensureGeometryAttributes(geometry);

    assert.equal(result.computedNormals, true);
    assert.equal(result.computedTangents, false);
    assert.ok(geometry.getAttribute('normal'));
    assert.equal(geometry.getAttribute('tangent'), undefined);
  });

  it('computes tangents for compatible indexed geometry', () => {
    const geometry = makeTriangleGeometry(true);
    const result = ensureGeometryAttributes(geometry);

    assert.equal(result.computedTangents, true);
    const tangent = geometry.getAttribute('tangent');
    assert.ok(tangent);
    assert.equal(tangent.count, 3);
    for (const value of tangent.array) assert.ok(Number.isFinite(value));
  });

  it('synthesizes UVs without deriving meaningless tangents from zero coordinates', () => {
    const geometry = makeTriangleGeometry(true);
    geometry.deleteAttribute('uv');
    const result = ensureGeometryAttributes(geometry);

    assert.equal(result.synthesizedUv, true);
    assert.equal(result.computedTangents, false);
    assert.equal(geometry.getAttribute('uv').count, 3);
    assert.equal(geometry.getAttribute('tangent'), undefined);
  });

  it('rejects malformed triangle indexes before tangent generation', () => {
    const geometry = makeTriangleGeometry(true);
    geometry.setIndex([0, 1, 7]);
    const result = ensureGeometryAttributes(geometry);

    assert.equal(result.computedTangents, false);
    assert.equal(geometry.getAttribute('tangent'), undefined);
  });
});
