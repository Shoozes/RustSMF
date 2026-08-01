import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { applyWeightPreviewForBone, restoreWeightPreview } from './weightPreview';

function makeFixture(withColor: boolean, vertexColors: boolean) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    1, 0, 0,
    2, 0, 0,
  ], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([
    0, 1, 2, 3,
    0, 1, 2, 3,
    0, 1, 2, 3,
  ], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([
    1, 0, 0, 0,
    0.25, 0.75, 0, 0,
    0, 1, 0, 0,
  ], 4));

  const originalColor = withColor
    ? new THREE.Float32BufferAttribute([
      0.1, 0.2, 0.3,
      0.4, 0.5, 0.6,
      0.7, 0.8, 0.9,
    ], 3)
    : undefined;
  if (originalColor) {
    geometry.setAttribute('color', originalColor);
  }

  const material = new THREE.MeshBasicMaterial({ vertexColors });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  const rootBone = new THREE.Bone();
  rootBone.name = 'Root';
  const armBone = new THREE.Bone();
  armBone.name = 'Arm';
  const skeleton = new THREE.Skeleton([rootBone, armBone]);
  mesh.bind(skeleton);

  const root = new THREE.Group();
  root.add(mesh);
  return { root, mesh, material, skeleton, originalColor };
}

describe('weight preview', () => {
  it('renders selected-bone weights and restores an existing color/material state', () => {
    const fixture = makeFixture(true, true);
    const originalColor = fixture.originalColor;

    applyWeightPreviewForBone(fixture.root, 'Root', fixture.skeleton);

    const previewColor = fixture.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    assert.notEqual(previewColor, originalColor);
    assert.deepEqual([...previewColor.array], [1, 0, 0, 0.25, 0, 0.75, 0, 0, 1]);
    assert.equal(fixture.material.vertexColors, true);

    restoreWeightPreview(fixture.root);

    assert.equal(fixture.mesh.geometry.getAttribute('color'), originalColor);
    assert.equal(fixture.material.vertexColors, true);
    assert.equal(Reflect.has(fixture.mesh.userData, '_weightPreviewBackup'), false);
  });

  it('removes only preview state when the source has no color attribute', () => {
    const fixture = makeFixture(false, false);

    applyWeightPreviewForBone(fixture.root, 'Arm', fixture.skeleton);
    assert.ok(fixture.mesh.geometry.getAttribute('color'));
    assert.equal(fixture.material.vertexColors, true);

    restoreWeightPreview(fixture.root);

    assert.equal(fixture.mesh.geometry.getAttribute('color'), undefined);
    assert.equal(fixture.material.vertexColors, false);
  });

  it('restores an active preview when the selected bone becomes invalid', () => {
    const fixture = makeFixture(true, false);
    const originalColor = fixture.originalColor;

    applyWeightPreviewForBone(fixture.root, 'Root', fixture.skeleton);
    applyWeightPreviewForBone(fixture.root, 'missing', fixture.skeleton);

    assert.equal(fixture.mesh.geometry.getAttribute('color'), originalColor);
    assert.equal(fixture.material.vertexColors, false);
  });
});
