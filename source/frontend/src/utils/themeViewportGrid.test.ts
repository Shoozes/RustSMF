import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import {
  createThemeViewportGrids,
  disposeThemeViewportGrids,
  updateThemeViewportGridVisibility,
} from './themeViewportGrid';

describe('theme viewport grids', () => {
  it('creates the three camera-aligned grid planes', () => {
    const grids = createThemeViewportGrids('original');

    assert.equal(grids.floor.position.y, 0.001);
    assert.equal(grids.front.rotation.x, Math.PI / 2);
    assert.equal(grids.front.position.z, -0.001);
    assert.equal(grids.side.rotation.z, Math.PI / 2);
    assert.equal(grids.side.position.x, 0.001);
  });

  it('shows only the plane owned by each Original quad role', () => {
    const grids = createThemeViewportGrids('original');

    updateThemeViewportGridVisibility(grids, true, 'camera-planes', 'front');
    assert.deepEqual(
      [grids.floor.visible, grids.front.visible, grids.side.visible],
      [false, true, false],
    );

    updateThemeViewportGridVisibility(grids, true, 'camera-planes', 'side');
    assert.deepEqual(
      [grids.floor.visible, grids.front.visible, grids.side.visible],
      [false, false, true],
    );

    updateThemeViewportGridVisibility(grids, true, 'camera-planes', 'top');
    assert.deepEqual(
      [grids.floor.visible, grids.front.visible, grids.side.visible],
      [true, false, false],
    );

    updateThemeViewportGridVisibility(grids, false, 'camera-planes', 'perspective');
    assert.deepEqual(
      [grids.floor.visible, grids.front.visible, grids.side.visible],
      [false, false, false],
    );
  });

  it('removes and disposes all owned grids', () => {
    const scene = new THREE.Scene();
    const grids = createThemeViewportGrids('modern');
    let geometryDisposals = 0;
    Object.values(grids).forEach((grid) => {
      grid.geometry.addEventListener('dispose', () => {
        geometryDisposals += 1;
      });
    });
    scene.add(grids.floor, grids.front, grids.side);

    disposeThemeViewportGrids(scene, grids);

    assert.equal(scene.children.length, 0);
    assert.equal(geometryDisposals, 3);
  });
});
