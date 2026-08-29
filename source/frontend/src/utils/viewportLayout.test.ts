import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import {
  DEFAULT_VIEWPORT_BOUNDS,
  deriveModelBounds,
  getModelClipPlanes,
  getModelOrbitDistance,
  getModelOrbitDistanceLimits,
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
    assert.equal(cameras[0].left, -5.2);
    assert.equal(cameras[0].right, 5.2);
    assert.equal(cameras[0].top, 2.6);
    assert.equal(cameras[0].bottom, -2.6);

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
    assert.equal(getModelOrbitDistance({ center: new THREE.Vector3(), maxDim: Number.NaN }), 1.35);
    assert.equal(getModelOrbitDistance({ center: new THREE.Vector3(), maxDim: 4 }, 0.5), 10.8);
  });

  it('keeps camera fit, clipping, and navigation proportional across extreme model scales', () => {
    for (const maxDim of [1e-6, 1e6]) {
      const bounds = { center: new THREE.Vector3(), maxDim };
      const distance = getModelOrbitDistance(bounds);
      const limits = getModelOrbitDistanceLimits(bounds);
      const clip = getModelClipPlanes(bounds);

      assert.ok(Math.abs(distance / maxDim - 1.35) < 1e-12);
      assert.equal(limits.minDistance / maxDim, 0.05);
      assert.equal(limits.maxDistance / maxDim, 50);
      assert.equal(clip.near / maxDim, 0.001);
      assert.equal(clip.far / maxDim, 100);
      assert.ok(clip.near < distance - maxDim / 2);
      assert.ok(clip.far > limits.maxDistance + maxDim / 2);

      const perspective = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
      const cameras = makeOrthoCameras();
      const orbit = new SimpleOrbit();
      orbit.setDistanceLimits(limits.minDistance, limits.maxDistance);
      orbit.reset(bounds.center, distance);
      perspective.position.copy(orbit.getPosition());
      perspective.lookAt(orbit.target);
      perspective.updateMatrixWorld();
      refreshOrthoCameras(cameras, bounds);
      refreshViewportSpecs(800, 800, 'single', bounds, perspective, cameras, true);

      assert.equal(perspective.near / maxDim, 0.001);
      assert.equal(perspective.far / maxDim, 100);
      assert.ok(cameras.every((camera) => camera.near / maxDim === 0.001));
      assert.ok(cameras.every((camera) => camera.far / maxDim === 100));

      const projectedCenter = bounds.center.clone().project(perspective);
      assert.ok(projectedCenter.toArray().every(Number.isFinite));
      assert.ok(Math.abs(projectedCenter.x) < 1e-9);
      assert.ok(Math.abs(projectedCenter.y) < 1e-9);
      assert.ok(Math.abs(projectedCenter.z) < 1);
    }
  });

  it('derives authored world bounds without normalizing root scale', () => {
    for (const scale of [1e-6, 1e6]) {
      const root = new THREE.Group();
      root.scale.setScalar(scale);
      root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.5)));
      const bounds = deriveModelBounds(root);
      assert.ok(Math.abs(bounds.maxDim / scale - 2) < 1e-9);
      assert.equal(root.scale.x, scale);
      assert.equal(root.scale.y, scale);
      assert.equal(root.scale.z, scale);
    }

    const emptyBounds = deriveModelBounds(new THREE.Group());
    assert.deepEqual(emptyBounds.center.toArray(), DEFAULT_VIEWPORT_BOUNDS.center.toArray());
    assert.equal(emptyBounds.maxDim, DEFAULT_VIEWPORT_BOUNDS.maxDim);
  });

  it('uses transformed geometry bounds instead of posed per-vertex skinned bounds', () => {
    const root = new THREE.Group();
    const mesh = new THREE.SkinnedMesh(
      new THREE.BoxGeometry(2, 4, 6),
      new THREE.MeshBasicMaterial(),
    );
    mesh.position.set(10, 20, 30);
    mesh.computeBoundingBox = () => {
      throw new Error('deriveModelBounds must not evaluate every skinned vertex');
    };
    root.add(mesh);

    const bounds = deriveModelBounds(root);

    assert.deepEqual(bounds.center.toArray(), [10, 20, 30]);
    assert.equal(bounds.maxDim, 6);
  });

  it('conservatively includes skinned bone transforms without scanning vertices', () => {
    const root = new THREE.Group();
    const rootBone = new THREE.Bone();
    const tipBone = new THREE.Bone();
    tipBone.position.y = 1;
    rootBone.add(tipBone);
    root.add(rootBone);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Float32Array(100_001 * 3), 3),
    );
    geometry.boundingBox = new THREE.Box3(
      new THREE.Vector3(-0.35, 0, 0),
      new THREE.Vector3(0.35, 1, 0),
    );
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    mesh.bind(new THREE.Skeleton([rootBone, tipBone]));
    mesh.computeBoundingBox = () => {
      throw new Error('deriveModelBounds must not evaluate every skinned vertex');
    };
    root.add(mesh);

    const bounds = deriveModelBounds(root);

    assert.deepEqual(bounds.center.toArray(), [0, 1, 0]);
    assert.equal(bounds.maxDim, 2);
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

  it('clamps proportional orbit zoom to model-relative limits', () => {
    const orbit = new SimpleOrbit();
    orbit.setDistanceLimits(1e-8, 1e-3);
    orbit.reset(new THREE.Vector3(), 1e-5);
    assert.equal(orbit.distance, 1e-5);

    orbit.reset(undefined, 1);
    assert.equal(orbit.distance, 1e-3);
    orbit.reset(undefined, 1e-12);
    assert.equal(orbit.distance, 1e-8);
  });

  it('zooms by ratio instead of fixed world-unit steps', () => {
    const orbit = new SimpleOrbit();
    orbit.setDistanceLimits(1e-8, 1e-3);
    orbit.reset(new THREE.Vector3(), 1e-5);
    const canvas = new EventTarget() as HTMLCanvasElement;
    const previousWindow = globalThis.window;
    const windowTarget = new EventTarget() as Window;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: windowTarget });
    try {
      const changes: number[] = [];
      const detach = orbit.attach(canvas, () => changes.push(orbit.distance));
      const wheelOut = new Event('wheel', { cancelable: true });
      Object.defineProperties(wheelOut, {
        clientX: { value: 10 },
        clientY: { value: 10 },
        deltaY: { value: 100 },
      });
      canvas.dispatchEvent(wheelOut);
      assert.ok(orbit.distance > 1e-5);
      assert.ok(orbit.distance < 1.2e-5);
      assert.equal(changes.length, 1);

      const wheelToMinimum = new Event('wheel', { cancelable: true });
      Object.defineProperties(wheelToMinimum, {
        clientX: { value: 10 },
        clientY: { value: 10 },
        deltaY: { value: -100000 },
      });
      for (let index = 0; index < 5; index += 1) {
        canvas.dispatchEvent(wheelToMinimum);
      }
      assert.equal(orbit.distance, orbit.minDistance);
      detach();
    } finally {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
    }
  });

  it('does not keep a touch orbit active after cancellation or window blur', () => {
    const orbit = new SimpleOrbit();
    const canvas = new EventTarget() as HTMLCanvasElement;
    const previousWindow = globalThis.window;
    const windowTarget = new EventTarget() as Window;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: windowTarget });
    try {
      const changes: number[] = [];
      const detach = orbit.attach(canvas, () => changes.push(orbit.yaw), () => true);
      const touch = { clientX: 10, clientY: 10 };
      const touchStart = new Event('touchstart');
      Object.defineProperty(touchStart, 'touches', { value: [touch] });
      canvas.dispatchEvent(touchStart);

      const touchCancel = new Event('touchcancel');
      canvas.dispatchEvent(touchCancel);
      const cancelledMove = new Event('touchmove');
      Object.defineProperty(cancelledMove, 'touches', { value: [{ clientX: 40, clientY: 10 }] });
      canvas.dispatchEvent(cancelledMove);
      assert.deepEqual(changes, []);

      canvas.dispatchEvent(touchStart);
      windowTarget.dispatchEvent(new Event('blur'));
      const blurredMove = new Event('touchmove');
      Object.defineProperty(blurredMove, 'touches', { value: [{ clientX: 70, clientY: 10 }] });
      canvas.dispatchEvent(blurredMove);
      assert.deepEqual(changes, []);

      detach();
    } finally {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
    }
  });
});
