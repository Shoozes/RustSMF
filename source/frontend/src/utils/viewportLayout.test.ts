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

    const single = refreshViewportSpecs(801, 601, 'single', bounds, perspective, cameras, true);
    assert.equal(single.length, 1);
    assert.equal(single[0].role, 'perspective');
    assert.equal(single[0].width, 801);
    assert.equal(single[0].height, 601);

    const singleOrtho = refreshViewportSpecs(800, 400, 'single', bounds, perspective, cameras, false);
    assert.equal(singleOrtho.length, 1);
    assert.equal(singleOrtho[0].role, 'front');
    assert.equal(singleOrtho[0].camera, cameras[0]);
    assert.equal(cameras[0].left, -8);
    assert.equal(cameras[0].right, 8);
    assert.equal(cameras[0].top, 4);
    assert.equal(cameras[0].bottom, -4);

    refreshOrthoCameras(cameras, bounds);
    const quad = refreshViewportSpecs(801, 601, 'quad', bounds, perspective, cameras, true);
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
    const panes = refreshViewportSpecs(640, 480, 'quad', DEFAULT_VIEWPORT_BOUNDS, perspective, [], true);
    assert.equal(panes.length, 4);
    assert.ok(panes.every((spec) => spec.camera === perspective));
    assert.ok(panes.every((spec) => spec.role === 'perspective'));
  });

  it('keeps tiny ortho viewports finite and pickable', () => {
    const perspective = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    const cameras = orthoCameras();
    const bounds = { center: new THREE.Vector3(0, 0, 0), maxDim: 0.25 };

    refreshOrthoCameras(cameras, bounds);
    const panes = refreshViewportSpecs(3, 2, 'quad', bounds, perspective, cameras, true);
    assert.equal(panes.length, 4);
    assert.ok(panes.every((spec) => spec.width >= 1));
    assert.ok(panes.every((spec) => spec.height >= 1));
    assert.ok(cameras.every((camera) => Number.isFinite(camera.left)));
    assert.ok(cameras.every((camera) => Number.isFinite(camera.right)));
    assert.ok(cameras.every((camera) => Number.isFinite(camera.top)));
    assert.ok(cameras.every((camera) => Number.isFinite(camera.bottom)));
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
