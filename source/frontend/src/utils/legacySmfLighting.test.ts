import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { createLegacySmfMaterial } from './legacySmfLighting';

describe('legacySmfLighting', () => {
  it('creates a viewport-only SMF display material without mutating the source', () => {
    const texture = new THREE.Texture();
    const source = new THREE.MeshStandardMaterial({
      name: 'Source',
      color: new THREE.Color(0.2, 0.4, 0.6),
      map: texture,
      opacity: 0.8,
      transparent: true,
      side: THREE.DoubleSide,
      vertexColors: true,
    });

    const legacy = createLegacySmfMaterial(source, { mapEnabled: true, opacity: 0.35 });

    assert.ok(legacy instanceof THREE.MeshPhongMaterial);
    assert.notEqual(legacy, source);
    assert.equal(legacy.userData.legacySmfDisplayMaterial, true);
    assert.equal(legacy.userData.sourceMaterialUuid, source.uuid);
    assert.equal(legacy.map, texture);
    assert.equal(source.map, texture);
    assert.equal(legacy.side, THREE.DoubleSide);
    assert.equal(legacy.vertexColors, true);
    assert.equal(legacy.transparent, true);
    assert.equal(legacy.opacity, 0.35);
    assert.ok(legacy.color.equals(source.color));
    assert.equal(legacy.customProgramCacheKey(), 'rustsmf-legacy-smf-lighting-v1');
  });

  it('honors texture disable and clamps invalid opacity', () => {
    const texture = new THREE.Texture();
    const source = new THREE.MeshBasicMaterial({ map: texture });

    const legacy = createLegacySmfMaterial(source, { mapEnabled: false, opacity: Number.NaN });

    assert.equal(legacy.map, null);
    assert.equal(source.map, texture);
    assert.equal(legacy.opacity, 1);
  });
});
