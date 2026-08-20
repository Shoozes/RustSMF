import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import {
  DEFAULT_VIEWPORT_BOUNDS,
  getModelOrbitDistance,
  getMouseForViewport,
  getOrthographicPanDelta,
  getViewportAt,
  refreshOrthoCameras,
  refreshViewportSpecs,
  type ViewportSpec,
} from './viewportLayout';
import { SimpleOrbit } from './SimpleOrbit';

const assertVectorNear = (
  actual: THREE.Vector3,
  expected: THREE.Vector3,
  epsilon = 0.000001,
): void => {
  assert.ok(actual.distanceTo(expected) <= epsilon, `${actual.toArray()} != ${expected.toArray()}`);
};

const makeOrthoCameras = (): THREE.OrthographicCamera[] => [
  new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100),
  new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100),
  new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100),
];

describe('viewportLayout', () => {
  it('builds stable single and quad viewport specs', () => {
    const perspective = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    const cameras = makeOrthoCameras();
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
    const cameras = makeOrthoCameras();
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

    assert.equal(getViewportAt(viewports, rect, 60, 70, true)?.role, 'front');
    assert.equal(getViewportAt(viewports, rect, 160, 70, false)?.role, 'side');
    assert.equal(getViewportAt(viewports, rect, 160, 70, true), null);

    const mouse = getMouseForViewport(60, 70, viewports[0], rect);
    assert.ok(Math.abs(mouse.x) < 0.0001);
    assert.ok(Math.abs(mouse.y) < 0.0001);
  });

  it('uses deterministic half-open internal pane boundaries with inclusive outer edges', () => {
    const perspective = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    const cameras = makeOrthoCameras();
    const panes = refreshViewportSpecs(801, 601, 'quad', DEFAULT_VIEWPORT_BOUNDS, perspective, cameras, true);
    const rect = { left: 10, top: 20, width: 801, height: 601 } as DOMRect;

    assert.equal(getViewportAt(panes, rect, 10, 621)?.role, 'front');
    assert.equal(getViewportAt(panes, rect, 410, 621)?.role, 'side');
    assert.equal(getViewportAt(panes, rect, 10, 321)?.role, 'top');
    assert.equal(getViewportAt(panes, rect, 410, 321)?.role, 'perspective');

    assert.equal(getViewportAt(panes, rect, 811, 621)?.role, 'side');
    assert.equal(getViewportAt(panes, rect, 811, 20)?.role, 'perspective');
    assert.equal(getViewportAt(panes, rect, 812, 20), null);
    assert.equal(getViewportAt(panes, rect, 811, 19), null);
  });

  it('keeps fractional CSS coordinates independent from backing pixel ratio', () => {
    const camera = new THREE.PerspectiveCamera();
    const viewport: ViewportSpec = {
      camera,
      x: 50,
      y: 25,
      width: 200,
      height: 150,
      isPickingCamera: true,
      role: 'perspective',
    };
    const rect = { left: 10.5, top: 20.25, width: 500.5, height: 300.5 } as DOMRect;

    const centerX = rect.left + viewport.x + viewport.width / 2;
    const centerY = rect.top + rect.height - viewport.y - viewport.height / 2;
    assert.equal(getViewportAt([viewport], rect, centerX, centerY, true)?.role, 'perspective');

    const mouse = getMouseForViewport(centerX, centerY, viewport, rect);
    assert.ok(Math.abs(mouse.x) < 0.0001);
    assert.ok(Math.abs(mouse.y) < 0.0001);

    const nearTopRight = getMouseForViewport(
      rect.left + viewport.x + viewport.width - 0.25,
      rect.top + rect.height - viewport.y - viewport.height + 0.25,
      viewport,
      rect,
    );
    assert.ok(nearTopRight.x > 0.99 && nearTopRight.x < 1);
    assert.ok(nearTopRight.y > 0.99 && nearTopRight.y < 1);
  });

  it('keeps every fixed view on one shared focus target', () => {
    const cameras = makeOrthoCameras();
    const focus = new THREE.Vector3(4, 5, 6);
    refreshOrthoCameras(cameras, {
      center: new THREE.Vector3(1, 2, 3),
      maxDim: 3,
    }, focus);

    assertVectorNear(cameras[0].position, new THREE.Vector3(4, 5, 12));
    assertVectorNear(cameras[1].position, new THREE.Vector3(10, 5, 6));
    assertVectorNear(cameras[2].position, new THREE.Vector3(4, 11, 6));
    cameras.forEach((camera) => {
      const expectedDirection = focus.clone().sub(camera.position).normalize();
      assertVectorNear(camera.getWorldDirection(new THREE.Vector3()), expectedDirection);
    });
  });

  it('maps orthographic screen drag into the active view plane', () => {
    const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 100);
    camera.zoom = 2;
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const delta = getOrthographicPanDelta(camera, 10, 5, 100);
    assertVectorNear(delta, new THREE.Vector3(0.4, -0.2, 0));
    assert.ok(
      Math.abs(delta.dot(camera.getWorldDirection(new THREE.Vector3()))) <= 0.000001,
      'pan must not move along the camera depth axis',
    );
  });

  it('derives a finite model-fit orbit distance', () => {
    assert.equal(getModelOrbitDistance({ center: new THREE.Vector3(), maxDim: 4 }), 5.4);
    assert.equal(getModelOrbitDistance({ center: new THREE.Vector3(), maxDim: Number.NaN }), 2.85);
  });

  it('resets orbit around a copied model focus and model-fit distance', () => {
    const orbit = new SimpleOrbit();
    const focus = new THREE.Vector3(12, -3, 7);
    orbit.yaw = 2;
    orbit.pitch = -1;
    orbit.reset(focus, 9);

    assert.deepEqual(orbit.target.toArray(), focus.toArray());
    assert.equal(orbit.distance, 9);
    focus.set(0, 0, 0);
    assert.deepEqual(orbit.target.toArray(), [12, -3, 7]);
    assert.equal(orbit.yaw, 0.6);
    assert.equal(orbit.pitch, 0.4);
  });
});
