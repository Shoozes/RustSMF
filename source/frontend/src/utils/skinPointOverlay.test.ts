import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import {
  createSkinPointOverlay,
  createSkinPointOverlays,
  disposeSkinPointOverlays,
  updateSkinPointOverlay,
} from './skinPointOverlay';

function makeSkinnedMesh(): THREE.SkinnedMesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
  ]), 3));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array([
    0, 1, 0, 0,
    1, 0, 0, 0,
    0, 1, 0, 0,
    1, 0, 0, 0,
  ]), 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array([
    1, 0, 0, 0,
    0.75, 0.25, 0, 0,
    0.4, 0.6, 0, 0,
    1, 0, 0, 0,
  ]), 4));
  const root = new THREE.Bone();
  root.name = 'Root';
  const hand = new THREE.Bone();
  hand.name = 'Hand';
  root.add(hand);
  const skeleton = new THREE.Skeleton([root, hand]);
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = 'Body';
  mesh.bind(skeleton);
  return mesh;
}

describe('skinPointOverlay', () => {
  it('builds a vertex-colored point overlay from selected-bone skin weights', () => {
    const mesh = makeSkinnedMesh();

    const overlay = createSkinPointOverlay(mesh, { selectedBoneName: 'Hand' });

    assert.ok(overlay);
    assert.equal(overlay.userData.skinPointOverlay, true);
    assert.equal(overlay.userData.displayOnly, true);
    assert.equal(overlay.userData.interactionTarget, false);
    assert.equal(overlay.userData.sourceMeshUuid, mesh.uuid);
    assert.equal(overlay.userData.sourceVertexCount, 4);
    assert.equal(overlay.userData.pointCount, 4);
    const colors = overlay.geometry.getAttribute('color');
    assert.equal(colors.count, 4);
    assert.ok(colors.getX(1) > colors.getX(0), 'selected-bone weight increases red channel');
    assert.ok(colors.getZ(1) < colors.getZ(0), 'selected-bone weight decreases blue channel');
  });

  it('is display-only and cannot be raycast-picked', () => {
    const mesh = makeSkinnedMesh();
    const overlay = createSkinPointOverlay(mesh);

    assert.ok(overlay);
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
    );

    assert.deepEqual(raycaster.intersectObject(overlay, true), []);
  });

  it('caps large overlays by sampling vertices', () => {
    const mesh = makeSkinnedMesh();

    const overlay = createSkinPointOverlay(mesh, { maxPoints: 2 });

    assert.ok(overlay);
    assert.equal(overlay.geometry.getAttribute('position').count, 2);
    assert.equal(overlay.userData.pointCount, 2);
  });

  it('updates sampled points from the posed skinned vertex positions', () => {
    const mesh = makeSkinnedMesh();
    const overlay = createSkinPointOverlay(mesh);
    assert.ok(overlay);

    mesh.skeleton.bones[0].position.x = 2;
    mesh.skeleton.bones[0].updateMatrixWorld(true);
    mesh.skeleton.update();
    mesh.updateMatrixWorld(true);

    assert.equal(updateSkinPointOverlay(overlay), true);
    const position = overlay.geometry.getAttribute('position');
    assert.ok(position.getX(0) > 1.9, 'overlay follows the posed root-weighted vertex');
  });

  it('attaches and disposes overlays without mutating mesh geometry', () => {
    const root = new THREE.Group();
    const mesh = makeSkinnedMesh();
    root.add(mesh);

    const overlays = createSkinPointOverlays(root, { selectedBoneName: 'Root' });

    assert.equal(overlays.length, 1);
    assert.equal(mesh.children.includes(overlays[0]), true);
    assert.equal(mesh.geometry.getAttribute('position').count, 4);
    disposeSkinPointOverlays(overlays);
    assert.equal(mesh.children.includes(overlays[0]), false);
  });
});
