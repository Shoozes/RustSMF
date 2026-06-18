import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import {
  DEFAULT_VIEWPORT_BOUNDS,
  getMouseForViewport,
  getViewportAt,
  refreshOrthoCameras,
  refreshViewportSpecs,
  type ViewportSpec,
} from './viewportLayout';

function orthoCameras(): THREE.OrthographicCamera[] {
  return [
    new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100),
    new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100),
    new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100),
  ];
}

describe('viewportLayout', () => {
  it('builds stable single and quad viewport specs', () => {
    const perspective = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    const cameras = orthoCameras();
    const bounds = { center: new THREE.Vector3(1, 2, 3), maxDim: 4 };

    const single = refreshViewportSpecs(801, 601, 'single', bounds, perspective, cameras);
    assert.equal(single.length, 1);
    assert.equal(single[0].role, 'perspective');
    assert.equal(single[0].width, 801);
    assert.equal(single[0].height, 601);

    refreshOrthoCameras(cameras, bounds);
    const quad = refreshViewportSpecs(801, 601, 'quad', bounds, perspective, cameras);
    assert.deepEqual(quad.map((spec) => spec.role), ['front', 'side', 'top', 'perspective']);
    assert.deepEqual(quad.map((spec) => [spec.width, spec.height]), [
      [400, 300],
      [401, 300],
      [400, 301],
      [401, 301],
    ]);
    assert.notEqual(cameras[0].position.z, 0);
    assert.notEqual(cameras[2].position.y, 0);
  });

  it('falls back to perspective panes when ortho cameras are unavailable', () => {
    const perspective = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    const panes = refreshViewportSpecs(640, 480, 'quad', DEFAULT_VIEWPORT_BOUNDS, perspective, []);
    assert.equal(panes.length, 4);
    assert.ok(panes.every((spec) => spec.camera === perspective));
    assert.ok(panes.every((spec) => spec.role === 'perspective'));
  });

  it('resolves viewport hit tests and normalized mouse coordinates', () => {
    const camera = new THREE.PerspectiveCamera();
    const viewports: ViewportSpec[] = [
      { camera, x: 0, y: 0, width: 100, height: 100, isPickingCamera: true, role: 'front' },
      { camera, x: 100, y: 0, width: 100, height: 100, isPickingCamera: false, role: 'side' },
    ];
    const rect = { left: 10, top: 20, width: 200, height: 100 } as DOMRect;

    const front = getViewportAt(viewports, rect, 60, 70, true);
    assert.equal(front?.role, 'front');

    const side = getViewportAt(viewports, rect, 160, 70, false);
    assert.equal(side?.role, 'side');
    assert.equal(getViewportAt(viewports, rect, 160, 70, true), null);

    const mouse = getMouseForViewport(60, 70, viewports[0], rect);
    assert.ok(Math.abs(mouse.x - 0) < 0.0001);
    assert.ok(Math.abs(mouse.y - 0) < 0.0001);
  });
});
