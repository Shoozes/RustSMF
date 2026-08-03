import * as THREE from 'three';
import { isThreeSkinnedMesh } from './threeTypeGuards';

export interface SkinPointOverlayOptions {
  selectedBoneName?: string;
  maxPoints?: number;
  pointSize?: number;
}

const DEFAULT_MAX_POINTS = 8000;
const DEFAULT_POINT_SIZE = 0.035;
const sourceMeshByOverlay = new WeakMap<THREE.Points, THREE.SkinnedMesh>();

function selectedBoneIndex(mesh: THREE.SkinnedMesh, selectedBoneName?: string): number {
  if (!selectedBoneName) return -1;
  return mesh.skeleton?.bones.findIndex((bone) => bone.name === selectedBoneName) ?? -1;
}

function selectedWeight(
  skinIndex: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  skinWeight: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  vertexIndex: number,
  boneIndex: number,
): number {
  if (boneIndex < 0) return 0;
  const itemSize = Math.min(skinIndex.itemSize, skinWeight.itemSize, 4);
  for (let slot = 0; slot < itemSize; slot++) {
    if (Math.round(skinIndex.getComponent(vertexIndex, slot)) === boneIndex) {
      return Math.max(0, Math.min(1, skinWeight.getComponent(vertexIndex, slot)));
    }
  }
  return 0;
}

export function createSkinPointOverlay(
  mesh: THREE.SkinnedMesh,
  options: SkinPointOverlayOptions = {},
): THREE.Points | null {
  const position = mesh.geometry.getAttribute('position');
  const skinIndex = mesh.geometry.getAttribute('skinIndex');
  const skinWeight = mesh.geometry.getAttribute('skinWeight');
  if (!position || !skinIndex || !skinWeight || position.count === 0) return null;

  const maxPoints = Math.max(1, Math.floor(options.maxPoints ?? DEFAULT_MAX_POINTS));
  const stride = Math.max(1, Math.ceil(position.count / maxPoints));
  const pointCount = Math.ceil(position.count / stride);
  const positions = new Float32Array(pointCount * 3);
  const colors = new Float32Array(pointCount * 3);
  const selectedIndex = selectedBoneIndex(mesh, options.selectedBoneName);

  let out = 0;
  for (let i = 0; i < position.count; i += stride) {
    const weight = selectedWeight(skinIndex, skinWeight, i, selectedIndex);
    const base = out * 3;
    positions[base] = position.getX(i);
    positions[base + 1] = position.getY(i);
    positions[base + 2] = position.getZ(i);
    colors[base] = 0.2 + weight * 0.8;
    colors[base + 1] = 0.75 + weight * 0.2;
    colors[base + 2] = 1 - weight * 0.85;
    out += 1;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: Math.max(0.001, options.pointSize ?? DEFAULT_POINT_SIZE),
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = `${mesh.name || 'skinned mesh'} skin point overlay`;
  points.frustumCulled = false;
  points.renderOrder = 20;
  points.raycast = (): void => {};
  points.userData = {
    skinPointOverlay: true,
    displayOnly: true,
    interactionTarget: false,
    sourceMeshUuid: mesh.uuid,
    sourceVertexStride: stride,
    selectedBoneName: options.selectedBoneName ?? '',
    sourceVertexCount: position.count,
    pointCount,
  };
  sourceMeshByOverlay.set(points, mesh);
  updateSkinPointOverlay(points);
  return points;
}

export function updateSkinPointOverlay(points: THREE.Points): boolean {
  const mesh = sourceMeshByOverlay.get(points);
  if (!mesh) return false;

  const sourcePosition = mesh.geometry.getAttribute('position');
  const overlayPosition = points.geometry.getAttribute('position');
  const stride = Number(points.userData.sourceVertexStride);
  if (!sourcePosition || !overlayPosition || !Number.isInteger(stride) || stride < 1) return false;

  mesh.skeleton?.update();
  const target = new THREE.Vector3();
  for (let pointIndex = 0; pointIndex < overlayPosition.count; pointIndex += 1) {
    const vertexIndex = pointIndex * stride;
    if (vertexIndex >= sourcePosition.count) break;
    mesh.getVertexPosition(vertexIndex, target);
    overlayPosition.setXYZ(pointIndex, target.x, target.y, target.z);
  }
  overlayPosition.needsUpdate = true;
  return true;
}

export function updateSkinPointOverlays(overlays: readonly THREE.Points[]): void {
  overlays.forEach(updateSkinPointOverlay);
}

export function createSkinPointOverlays(
  root: THREE.Object3D | null,
  options: SkinPointOverlayOptions = {},
): THREE.Points[] {
  if (!root) return [];
  const overlays: THREE.Points[] = [];
  root.traverse((object) => {
    if (!isThreeSkinnedMesh(object)) return;
    const overlay = createSkinPointOverlay(object, options);
    if (overlay) {
      object.add(overlay);
      overlays.push(overlay);
    }
  });
  return overlays;
}

export function disposeSkinPointOverlays(overlays: THREE.Points[]): void {
  for (const overlay of overlays) {
    overlay.removeFromParent();
    overlay.geometry.dispose();
    const material = overlay.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else {
      material.dispose();
    }
  }
}
