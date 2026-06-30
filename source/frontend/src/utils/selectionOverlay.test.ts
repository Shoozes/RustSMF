import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  createSelectionOverlays,
  disposeSelectionOverlays,
  updateSelectionOverlays,
} from './selectionOverlay';

test('selection overlays are viewport-only helpers for selected visible objects', () => {
  const root = new THREE.Group();
  const selected = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  selected.name = 'SelectedMesh';
  selected.position.set(1, 2, 3);
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  hidden.visible = false;
  root.add(selected, hidden);
  root.updateMatrixWorld(true);

  const overlays = createSelectionOverlays(root, [selected.uuid, hidden.uuid, selected.uuid, 'missing']);

  assert.equal(overlays.length, 1);
  assert.equal(overlays[0].userData.targetId, selected.uuid);
  assert.equal(overlays[0].userData.targetName, 'SelectedMesh');
  assert.equal(overlays[0].renderOrder, 1000);

  const scene = new THREE.Scene();
  scene.add(overlays[0]);
  selected.position.x = 4;
  root.updateMatrixWorld(true);
  updateSelectionOverlays(overlays);
  disposeSelectionOverlays(overlays);

  assert.equal(scene.children.includes(overlays[0]), false);
});
