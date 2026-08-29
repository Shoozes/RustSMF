import * as THREE from 'three';
import type { ViewportLayout } from '../store';

export type ViewportRole = 'perspective' | 'front' | 'top' | 'side';

export type ViewportSpec = {
  camera: THREE.Camera;
  x: number;
  y: number;
  width: number;
  height: number;
  isPickingCamera: boolean;
  role: ViewportRole;
};

export type ModelBounds = {
  center: THREE.Vector3;
  maxDim: number;
};

export const DEFAULT_VIEWPORT_BOUNDS: ModelBounds = {
  center: new THREE.Vector3(0, 0, 0),
  maxDim: 1,
};

const MIN_MODEL_DIMENSION = 1e-9;
const DEFAULT_VERTICAL_FOV_DEGREES = 55;
const MAX_EXACT_SKINNED_BOUND_VERTICES = 100_000;

function getSafeModelDimension(modelBounds: ModelBounds): number {
  return Number.isFinite(modelBounds.maxDim) && modelBounds.maxDim > 0
    ? Math.max(modelBounds.maxDim, MIN_MODEL_DIMENSION)
    : DEFAULT_VIEWPORT_BOUNDS.maxDim;
}

export function deriveModelBounds(root: THREE.Object3D): ModelBounds {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const worldBounds = new THREE.Box3();
  const skinMatrix = new THREE.Matrix4();
  const worldMatrix = new THREE.Matrix4();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return;

    if (
      object instanceof THREE.SkinnedMesh
      && object.skeleton
      && object.skeleton.bones.length > 0
      && object.skeleton.boneInverses.length === object.skeleton.bones.length
    ) {
      const position = geometry.getAttribute('position');
      if (position && position.count <= MAX_EXACT_SKINNED_BOUND_VERTICES) {
        object.computeBoundingBox();
        if (object.boundingBox && !object.boundingBox.isEmpty()) {
          worldBounds.copy(object.boundingBox).applyMatrix4(object.matrixWorld);
          box.union(worldBounds);
        }
        return;
      }

      for (let index = 0; index < object.skeleton.bones.length; index += 1) {
        skinMatrix
          .multiplyMatrices(object.skeleton.bones[index].matrixWorld, object.skeleton.boneInverses[index])
          .premultiply(object.bindMatrixInverse)
          .multiply(object.bindMatrix);
        worldMatrix.multiplyMatrices(object.matrixWorld, skinMatrix);
        worldBounds.copy(geometry.boundingBox).applyMatrix4(worldMatrix);
        box.union(worldBounds);
      }
      return;
    }

    worldBounds.copy(geometry.boundingBox).applyMatrix4(object.matrixWorld);
    box.union(worldBounds);
  });
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (
    box.isEmpty()
    || !center.toArray().every(Number.isFinite)
    || !Number.isFinite(maxDim)
    || maxDim <= 0
  ) {
    return {
      center: DEFAULT_VIEWPORT_BOUNDS.center.clone(),
      maxDim: DEFAULT_VIEWPORT_BOUNDS.maxDim,
    };
  }
  return { center, maxDim };
}

export function getModelOrbitDistance(
  modelBounds: ModelBounds,
  aspect = 1,
  verticalFovDegrees = DEFAULT_VERTICAL_FOV_DEGREES,
): number {
  const maxDim = getSafeModelDimension(modelBounds);
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? Math.max(0.01, aspect) : 1;
  const safeFov = Number.isFinite(verticalFovDegrees)
    ? Math.max(10, Math.min(120, verticalFovDegrees))
    : DEFAULT_VERTICAL_FOV_DEGREES;
  const fovScale = Math.tan(THREE.MathUtils.degToRad(DEFAULT_VERTICAL_FOV_DEGREES / 2))
    / Math.tan(THREE.MathUtils.degToRad(safeFov / 2));
  return maxDim * 1.35 * fovScale * Math.max(1, 1 / safeAspect);
}

export function getModelOrbitDistanceLimits(modelBounds: ModelBounds): {
  minDistance: number;
  maxDistance: number;
} {
  const maxDim = getSafeModelDimension(modelBounds);
  return {
    minDistance: maxDim * 0.05,
    maxDistance: maxDim * 50,
  };
}

export function getModelClipPlanes(modelBounds: ModelBounds): { near: number; far: number } {
  const maxDim = getSafeModelDimension(modelBounds);
  return {
    near: maxDim * 0.001,
    far: maxDim * 100,
  };
}

function refreshPerspectiveCamera(
  camera: THREE.PerspectiveCamera,
  modelBounds: ModelBounds,
  width: number,
  height: number,
): void {
  const clip = getModelClipPlanes(modelBounds);
  camera.aspect = Math.max(1, width) / Math.max(1, height);
  camera.near = clip.near;
  camera.far = clip.far;
  camera.updateProjectionMatrix();
}

function refreshOrthoFrustum(
  camera: THREE.OrthographicCamera,
  modelBounds: ModelBounds,
  width: number,
  height: number,
): void {
  const aspect = Math.max(1, width) / Math.max(1, height);
  const halfDim = getSafeModelDimension(modelBounds)
    * 0.65
    * Math.max(1, 1 / aspect)
    * Math.max(camera.zoom, 0.000001);
  camera.left = -halfDim * aspect;
  camera.right = halfDim * aspect;
  camera.top = halfDim;
  camera.bottom = -halfDim;
  camera.updateProjectionMatrix();
}

export function refreshOrthoCameras(
  orthoCameras: THREE.OrthographicCamera[],
  modelBounds: ModelBounds,
  focusTarget: THREE.Vector3 = modelBounds.center,
): void {
  const [front, side, top] = orthoCameras;
  if (!front || !side || !top) return;

  const maxDim = getSafeModelDimension(modelBounds);
  const cameraDistance = maxDim * 2;
  const clip = getModelClipPlanes(modelBounds);
  orthoCameras.forEach((camera) => {
    camera.near = clip.near;
    camera.far = clip.far;
    camera.updateProjectionMatrix();
  });

  front.position.copy(focusTarget).add(new THREE.Vector3(0, 0, cameraDistance));
  front.up.set(0, 1, 0);
  front.lookAt(focusTarget);
  front.updateMatrixWorld();

  side.position.copy(focusTarget).add(new THREE.Vector3(cameraDistance, 0, 0));
  side.up.set(0, 1, 0);
  side.lookAt(focusTarget);
  side.updateMatrixWorld();

  top.position.copy(focusTarget).add(new THREE.Vector3(0, cameraDistance, 0));
  top.up.set(0, 0, -1);
  top.lookAt(focusTarget);
  top.updateMatrixWorld();
}

export function getOrthographicPanDelta(
  camera: THREE.OrthographicCamera,
  deltaX: number,
  deltaY: number,
  viewportHeight: number,
): THREE.Vector3 {
  const visibleHeight = Math.abs(camera.top - camera.bottom)
    / Math.max(Math.abs(camera.zoom), 0.000001);
  const worldUnitsPerPixel = visibleHeight / Math.max(1, viewportHeight);
  const right = new THREE.Vector3(1, 0, 0)
    .applyQuaternion(camera.quaternion)
    .multiplyScalar(deltaX * worldUnitsPerPixel);
  const up = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(camera.quaternion)
    .multiplyScalar(-deltaY * worldUnitsPerPixel);
  return right.add(up);
}

export function refreshViewportSpecs(
  width: number,
  height: number,
  layout: ViewportLayout,
  modelBounds: ModelBounds,
  perspectiveCamera: THREE.PerspectiveCamera,
  orthoCameras: THREE.OrthographicCamera[],
  perspectiveEnabled: boolean,
): ViewportSpec[] {
  const perspectiveWidth = layout === 'quad' ? width - Math.max(1, Math.floor(width / 2)) : width;
  const perspectiveHeight = layout === 'quad' ? height - Math.max(1, Math.floor(height / 2)) : height;
  refreshPerspectiveCamera(
    perspectiveCamera,
    modelBounds,
    perspectiveWidth,
    perspectiveHeight,
  );

  if (layout === 'single') {
    if (!perspectiveEnabled && orthoCameras.length > 0) {
      refreshOrthoFrustum(orthoCameras[0], modelBounds, width, height);
      return [{
        camera: orthoCameras[0],
        x: 0,
        y: 0,
        width,
        height,
        isPickingCamera: true,
        role: 'front',
      }];
    }

    return [{
      camera: perspectiveCamera,
      x: 0,
      y: 0,
      width,
      height,
      isPickingCamera: true,
      role: 'perspective',
    }];
  }

  const halfW = Math.max(1, Math.floor(width / 2));
  const halfH = Math.max(1, Math.floor(height / 2));
  const quarterSpec = [
    { x: 0, y: 0, width: halfW, height: halfH },
    { x: halfW, y: 0, width: width - halfW, height: halfH },
    { x: 0, y: halfH, width: halfW, height: height - halfH },
    { x: halfW, y: halfH, width: width - halfW, height: height - halfH },
  ];

  if (orthoCameras.length < 3) {
    return quarterSpec.map((spec) => ({
      camera: perspectiveCamera,
      ...spec,
      isPickingCamera: true,
      role: 'perspective',
    }));
  }

  const [front, side, top] = orthoCameras;

  refreshOrthoFrustum(front, modelBounds, quarterSpec[0].width, quarterSpec[0].height);
  refreshOrthoFrustum(side, modelBounds, quarterSpec[1].width, quarterSpec[1].height);
  refreshOrthoFrustum(top, modelBounds, quarterSpec[2].width, quarterSpec[2].height);

  return [
    { camera: front, ...quarterSpec[0], isPickingCamera: true, role: 'front' },
    { camera: side, ...quarterSpec[1], isPickingCamera: true, role: 'side' },
    { camera: top, ...quarterSpec[2], isPickingCamera: true, role: 'top' },
    { camera: perspectiveCamera, ...quarterSpec[3], isPickingCamera: true, role: 'perspective' },
  ];
}

export function getViewportAt(
  viewports: ViewportSpec[],
  rect: DOMRect | null | undefined,
  x: number,
  y: number,
  requirePicking = false,
): ViewportSpec | null {
  if (!rect || !viewports.length) return null;

  const localX = x - rect.left;
  const localYFromBottom = rect.height - (y - rect.top);
  const maxX = Math.max(...viewports.map((v) => v.x + v.width));
  const maxY = Math.max(...viewports.map((v) => v.y + v.height));
  const match = viewports.find((v) => {
    const right = v.x + v.width;
    const top = v.y + v.height;
    const withinX = localX >= v.x && (localX < right || (right === maxX && localX <= right));
    const withinY = localYFromBottom >= v.y && (localYFromBottom < top || (top === maxY && localYFromBottom <= top));
    return withinX && withinY;
  });
  if (!match) return null;
  if (requirePicking && !match.isPickingCamera) return null;
  return match;
}

export function getMouseForViewport(
  x: number,
  y: number,
  viewport: ViewportSpec,
  rect: DOMRect,
): THREE.Vector2 {
  const localX = x - rect.left;
  const localYFromBottom = rect.height - (y - rect.top);
  const nx = ((localX - viewport.x) / viewport.width) * 2 - 1;
  const ny = ((localYFromBottom - viewport.y) / viewport.height) * 2 - 1;
  return new THREE.Vector2(nx, ny);
}
