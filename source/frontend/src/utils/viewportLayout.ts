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

export function refreshOrthoCameras(
  orthoCameras: THREE.OrthographicCamera[],
  modelBounds: ModelBounds,
): void {
  const [front, side, top] = orthoCameras;
  if (!front || !side || !top) return;

  const halfDim = Math.max(modelBounds.maxDim * 1.0, 1);
  const center = modelBounds.center;

  front.position.copy(center).add(new THREE.Vector3(0, 0, halfDim * 2));
  front.up.set(0, 1, 0);
  front.lookAt(center);

  side.position.copy(center).add(new THREE.Vector3(halfDim * 2, 0, 0));
  side.up.set(0, 1, 0);
  side.lookAt(center);

  top.position.copy(center).add(new THREE.Vector3(0, halfDim * 2, 0));
  top.up.set(0, 0, -1);
  top.lookAt(center);
}

export function refreshViewportSpecs(
  width: number,
  height: number,
  layout: ViewportLayout,
  modelBounds: ModelBounds,
  perspectiveCamera: THREE.PerspectiveCamera,
  orthoCameras: THREE.OrthographicCamera[],
): ViewportSpec[] {
  if (layout === 'single') {
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

  const aspect0 = quarterSpec[0].width / quarterSpec[0].height;
  const aspect1 = quarterSpec[1].width / quarterSpec[1].height;
  const aspect2 = quarterSpec[2].width / quarterSpec[2].height;
  const halfDim = Math.max(modelBounds.maxDim * 1.0, 1);
  const [front, side, top] = orthoCameras;

  front.left = -halfDim * aspect0;
  front.right = halfDim * aspect0;
  front.top = halfDim;
  front.bottom = -halfDim;
  front.updateProjectionMatrix();

  side.left = -halfDim * aspect1;
  side.right = halfDim * aspect1;
  side.top = halfDim;
  side.bottom = -halfDim;
  side.updateProjectionMatrix();

  top.left = -halfDim * aspect2;
  top.right = halfDim * aspect2;
  top.top = halfDim;
  top.bottom = -halfDim;
  top.updateProjectionMatrix();

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
  const match = viewports.find((v) => {
    return localX >= v.x && localX <= v.x + v.width && localYFromBottom >= v.y && localYFromBottom <= v.y + v.height;
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
