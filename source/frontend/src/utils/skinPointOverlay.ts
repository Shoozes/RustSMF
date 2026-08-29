import * as THREE from 'three';
import { getSkinnedVertexWorldPosition } from './skinnedVertexPosition';
import { isThreeSkinnedMesh } from './threeTypeGuards';

export interface SkinPointOverlayOptions {
  selectedBoneName?: string;
  maxPoints?: number;
  pointSize?: number;
}

const DEFAULT_MAX_POINTS = 8000;
const DEFAULT_POINT_SIZE = 4;
const sourceMeshByOverlay = new WeakMap<THREE.Points, THREE.SkinnedMesh>();
const poseStateByOverlay = new WeakMap<THREE.Points, number[]>();
const tempPositionByOverlay = new WeakMap<THREE.Points, THREE.Vector3>();

interface SkinPointOverlayUpdateData {
  mesh: THREE.SkinnedMesh;
  sourcePosition: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  overlayPosition: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  stride: number;
}

export interface SkinPointSourceVertex {
  vertexIndex: number;
  worldPosition: THREE.Vector3;
}

export function resolveSkinPointSourceVertex(
  mesh: THREE.SkinnedMesh,
  pointIndex: unknown,
  sourceVertexStride: unknown,
): SkinPointSourceVertex | null {
  const stride = Number(sourceVertexStride);
  if (typeof pointIndex !== 'number' || !Number.isInteger(pointIndex) || pointIndex < 0) return null;
  if (!Number.isInteger(stride) || stride < 1) return null;

  const vertexIndex = pointIndex * stride;
  const position = mesh.geometry.getAttribute('position');
  if (!position || vertexIndex >= position.count) return null;

  const worldPosition = new THREE.Vector3();
  const failure = getSkinnedVertexWorldPosition(mesh, vertexIndex, worldPosition);
  return failure ? null : { vertexIndex, worldPosition };
}

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

function getUpdateData(points: THREE.Points, mesh: THREE.SkinnedMesh): SkinPointOverlayUpdateData | null {
  const sourcePosition = mesh.geometry.getAttribute('position');
  const overlayPosition = points.geometry.getAttribute('position');
  const stride = Number(points.userData.sourceVertexStride);
  if (!sourcePosition || !overlayPosition || !Number.isInteger(stride) || stride < 1) return null;
  return { mesh, sourcePosition, overlayPosition, stride };
}

function attributeVersion(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
): number {
  if (!attribute) return -1;
  return 'version' in attribute ? attribute.version : attribute.data.version;
}

function poseChanged(points: THREE.Points, mesh: THREE.SkinnedMesh): boolean {
  const boneMatrices = mesh.skeleton?.bones ?? [];
  const componentCount = 3 + (boneMatrices.length + 1) * 16;
  let state = poseStateByOverlay.get(points);
  if (!state || state.length !== componentCount) {
    state = new Array<number>(componentCount).fill(Number.NaN);
    poseStateByOverlay.set(points, state);
  }

  let index = 0;
  const changed = (value: number): boolean => {
    const previous = state![index];
    state![index] = value;
    index += 1;
    return previous !== value;
  };

  let hasChanged = changed(attributeVersion(mesh.geometry.getAttribute('position')));
  hasChanged = changed(attributeVersion(mesh.geometry.getAttribute('skinIndex'))) || hasChanged;
  hasChanged = changed(attributeVersion(mesh.geometry.getAttribute('skinWeight'))) || hasChanged;
  for (const matrix of [mesh.matrixWorld, ...boneMatrices.map((bone) => bone.matrixWorld)]) {
    for (const value of matrix.elements) {
      hasChanged = changed(value) || hasChanged;
    }
  }
  return hasChanged;
}

function updateOverlayPositions(
  points: THREE.Points,
  data: SkinPointOverlayUpdateData,
  updateSkeleton = true,
): void {
  if (updateSkeleton) data.mesh.skeleton?.update();
  const target = tempPositionByOverlay.get(points) ?? new THREE.Vector3();
  tempPositionByOverlay.set(points, target);
  for (let pointIndex = 0; pointIndex < data.overlayPosition.count; pointIndex += 1) {
    const vertexIndex = pointIndex * data.stride;
    if (vertexIndex >= data.sourcePosition.count) break;
    data.mesh.getVertexPosition(vertexIndex, target);
    data.overlayPosition.setXYZ(pointIndex, target.x, target.y, target.z);
  }
  data.overlayPosition.needsUpdate = true;
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
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthTest: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = `${mesh.name || 'skinned mesh'} skin point overlay`;
  points.frustumCulled = false;
  points.renderOrder = 20;
  points.userData = {
    skinPointOverlay: true,
    interactionTarget: true,
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

  const data = getUpdateData(points, mesh);
  if (!data) return false;
  if (!poseChanged(points, mesh)) return true;
  updateOverlayPositions(points, data);
  return true;
}

export function updateSkinPointOverlays(overlays: readonly THREE.Points[]): void {
  const pending: Array<{ points: THREE.Points; data: SkinPointOverlayUpdateData }> = [];
  const changedMeshes = new Set<THREE.SkinnedMesh>();
  for (const points of overlays) {
    const mesh = sourceMeshByOverlay.get(points);
    if (!mesh) continue;
    const data = getUpdateData(points, mesh);
    if (!data || !poseChanged(points, mesh)) continue;
    pending.push({ points, data });
    changedMeshes.add(mesh);
  }

  changedMeshes.forEach((mesh) => mesh.skeleton?.update());
  for (const { points, data } of pending) {
    updateOverlayPositions(points, data, false);
  }
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
