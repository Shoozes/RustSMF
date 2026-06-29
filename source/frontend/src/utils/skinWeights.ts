import * as THREE from 'three';
import type { ModelSourceFormat } from './modelFormat';

export type SkinWeightEditMode = 'set' | 'add' | 'subtract';

export interface VertexSkinWeights {
  indices: [number, number, number, number];
  weights: [number, number, number, number];
}

export interface SkinEditState {
  selectedBoneName: string;
  sourceFormat: ModelSourceFormat | '';
  dirtyMeshIds: Set<string>;
  editedVertices: Map<string, Set<number>>;
}

export interface SkinVertexSnapshot {
  meshId: string;
  vertexIndex: number;
  vertex: VertexSkinWeights;
}

export interface SkinEditHistoryEntry {
  beforeState: SkinEditState;
  afterState: SkinEditState;
  before: SkinVertexSnapshot[];
  after: SkinVertexSnapshot[];
}

export type SkinWeightEditFailureReason =
  | 'missing-skin-attributes'
  | 'invalid-vertex'
  | 'invalid-bone'
  | 'no-selected-bone';

export type SkinWeightEditResult =
  | {
      ok: true;
      vertex: VertexSkinWeights;
      slot: number;
      changed: boolean;
    }
  | {
      ok: false;
      reason: SkinWeightEditFailureReason;
    };

export interface SkinAttributePair {
  skinIndex: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  skinWeight: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
}

export interface SkinAutoWeightOptions {
  power?: number;
  normalWeighting?: number;
}

export interface SkinMeshWeightEditSummary {
  touchedVertices: number;
  changedVertices: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clampPositive(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function cloneVertex(vertex: VertexSkinWeights): VertexSkinWeights {
  return {
    indices: [...vertex.indices] as VertexSkinWeights['indices'],
    weights: [...vertex.weights] as VertexSkinWeights['weights'],
  };
}

function findWritableSlot(vertex: VertexSkinWeights, boneIndex: number): number {
  const existing = vertex.indices.findIndex((index) => index === boneIndex);
  if (existing >= 0) return existing;

  const empty = vertex.weights.findIndex((weight) => weight <= 0);
  if (empty >= 0) return empty;

  let weakest = 0;
  for (let slot = 1; slot < 4; slot++) {
    if (vertex.weights[slot] < vertex.weights[weakest]) {
      weakest = slot;
    }
  }
  return weakest;
}

export function makeSkinEditState(
  selectedBoneName = '',
  sourceFormat: ModelSourceFormat | '' = '',
): SkinEditState {
  return {
    selectedBoneName,
    sourceFormat,
    dirtyMeshIds: new Set<string>(),
    editedVertices: new Map<string, Set<number>>(),
  };
}

export function cloneSkinEditState(state: SkinEditState): SkinEditState {
  const editedVertices = new Map<string, Set<number>>();
  for (const [meshId, vertices] of state.editedVertices) {
    editedVertices.set(meshId, new Set(vertices));
  }

  return {
    selectedBoneName: state.selectedBoneName,
    sourceFormat: state.sourceFormat,
    dirtyMeshIds: new Set(state.dirtyMeshIds),
    editedVertices,
  };
}

export function getSkinAttributes(geometry: THREE.BufferGeometry): SkinAttributePair | null {
  const skinIndex = geometry.getAttribute('skinIndex');
  const skinWeight = geometry.getAttribute('skinWeight');
  if (!skinIndex || !skinWeight || skinIndex.itemSize < 4 || skinWeight.itemSize < 4) {
    return null;
  }
  return { skinIndex, skinWeight };
}

export function readVertexSkinWeights(
  attributes: SkinAttributePair,
  vertexIndex: number,
): VertexSkinWeights | null {
  if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= attributes.skinIndex.count) {
    return null;
  }
  if (vertexIndex >= attributes.skinWeight.count) {
    return null;
  }

  return {
    indices: [
      attributes.skinIndex.getX(vertexIndex),
      attributes.skinIndex.getY(vertexIndex),
      attributes.skinIndex.getZ(vertexIndex),
      attributes.skinIndex.getW(vertexIndex),
    ].map((value) => Math.max(0, Math.trunc(value))) as VertexSkinWeights['indices'],
    weights: [
      attributes.skinWeight.getX(vertexIndex),
      attributes.skinWeight.getY(vertexIndex),
      attributes.skinWeight.getZ(vertexIndex),
      attributes.skinWeight.getW(vertexIndex),
    ].map(clamp01) as VertexSkinWeights['weights'],
  };
}

export function sameVertexSkinWeights(
  left: VertexSkinWeights,
  right: VertexSkinWeights,
  tolerance = 1e-6,
): boolean {
  return left.indices.every((index, slot) => index === right.indices[slot])
    && left.weights.every((weight, slot) => Math.abs(weight - right.weights[slot]) <= tolerance);
}

export function normalizeVertexSkinWeights(vertex: VertexSkinWeights): VertexSkinWeights {
  const normalized = cloneVertex(vertex);
  normalized.weights = normalized.weights.map(clamp01) as VertexSkinWeights['weights'];
  const total = normalized.weights.reduce((sum, value) => sum + value, 0);

  if (total <= 0) {
    normalized.weights = [1, 0, 0, 0];
    return normalized;
  }

  normalized.weights = normalized.weights.map((value) => value / total) as VertexSkinWeights['weights'];
  return normalized;
}

export function setVertexBoneWeight(
  vertex: VertexSkinWeights,
  boneIndex: number,
  targetWeight: number,
): { vertex: VertexSkinWeights; slot: number } | null {
  if (!Number.isInteger(boneIndex) || boneIndex < 0) {
    return null;
  }

  const next = cloneVertex(vertex);
  const slot = findWritableSlot(next, boneIndex);
  next.indices[slot] = boneIndex;
  next.weights[slot] = clamp01(targetWeight);

  return {
    vertex: normalizeVertexSkinWeights(next),
    slot,
  };
}

export function captureSkinVertexSnapshot(
  mesh: THREE.SkinnedMesh,
  vertexIndex: number,
): SkinVertexSnapshot | null {
  const attributes = getSkinAttributes(mesh.geometry);
  if (!attributes) return null;
  const vertex = readVertexSkinWeights(attributes, vertexIndex);
  if (!vertex) return null;
  return {
    meshId: mesh.uuid,
    vertexIndex,
    vertex: cloneVertex(vertex),
  };
}

export function writeSkinnedMeshVertexWeights(
  mesh: THREE.SkinnedMesh,
  vertexIndex: number,
  vertex: VertexSkinWeights,
): boolean {
  const attributes = getSkinAttributes(mesh.geometry);
  if (!attributes) return false;
  if (!readVertexSkinWeights(attributes, vertexIndex)) return false;
  writeVertexSkinWeights(attributes, vertexIndex, cloneVertex(vertex));
  return true;
}

export function normalizeSkinnedMeshWeights(mesh: THREE.SkinnedMesh): SkinMeshWeightEditSummary {
  const attributes = getSkinAttributes(mesh.geometry);
  if (!attributes) {
    return { touchedVertices: 0, changedVertices: 0 };
  }

  let touchedVertices = 0;
  let changedVertices = 0;
  for (let vertexIndex = 0; vertexIndex < attributes.skinIndex.count; vertexIndex += 1) {
    const current = readVertexSkinWeights(attributes, vertexIndex);
    if (!current) continue;
    touchedVertices += 1;
    const normalized = normalizeVertexSkinWeights(current);
    if (!sameVertexSkinWeights(current, normalized)) {
      writeVertexSkinWeights(attributes, vertexIndex, normalized);
      changedVertices += 1;
    }
  }

  return { touchedVertices, changedVertices };
}

function distanceToSegment(point: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3): number {
  const segment = end.clone().sub(start);
  const lengthSq = segment.lengthSq();
  if (lengthSq <= 1e-12) {
    return point.distanceTo(start);
  }
  const t = Math.min(1, Math.max(0, point.clone().sub(start).dot(segment) / lengthSq));
  return point.distanceTo(start.clone().addScaledVector(segment, t));
}

function segmentClosestPoint(point: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3): THREE.Vector3 {
  const segment = end.clone().sub(start);
  const lengthSq = segment.lengthSq();
  if (lengthSq <= 1e-12) {
    return start.clone();
  }
  const t = Math.min(1, Math.max(0, point.clone().sub(start).dot(segment) / lengthSq));
  return start.clone().addScaledVector(segment, t);
}

function getBoneWorldPosition(bone: THREE.Bone): THREE.Vector3 {
  return bone.getWorldPosition(new THREE.Vector3());
}

function getBoneSegment(bone: THREE.Bone, skeleton: THREE.Skeleton): { start: THREE.Vector3; end: THREE.Vector3 } {
  const bonePosition = getBoneWorldPosition(bone);
  const parent = bone.parent instanceof THREE.Bone && skeleton.bones.includes(bone.parent)
    ? getBoneWorldPosition(bone.parent)
    : null;
  if (parent) {
    return { start: parent, end: bonePosition };
  }

  return { start: bonePosition, end: bonePosition };
}

function makeWeightedVertex(entries: Array<{ boneIndex: number; weight: number }>): VertexSkinWeights | null {
  const strongest = entries
    .filter((entry) => Number.isInteger(entry.boneIndex) && entry.boneIndex >= 0 && Number.isFinite(entry.weight) && entry.weight > 0)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 4);

  if (strongest.length === 0) return null;

  const indices = [0, 0, 0, 0] as VertexSkinWeights['indices'];
  const weights = [0, 0, 0, 0] as VertexSkinWeights['weights'];
  strongest.forEach((entry, slot) => {
    indices[slot] = entry.boneIndex;
    weights[slot] = entry.weight;
  });

  return normalizeVertexSkinWeights({ indices, weights });
}

export function autoSkinSkinnedMeshWeights(
  mesh: THREE.SkinnedMesh,
  skeleton: THREE.Skeleton,
  options: SkinAutoWeightOptions = {},
): SkinMeshWeightEditSummary {
  const attributes = getSkinAttributes(mesh.geometry);
  const position = mesh.geometry.getAttribute('position');
  if (!attributes || !position || position.itemSize < 3 || skeleton.bones.length === 0) {
    return { touchedVertices: 0, changedVertices: 0 };
  }

  mesh.updateMatrixWorld(true);
  skeleton.bones.forEach((bone) => bone.updateMatrixWorld(true));

  const power = Math.max(1, clampPositive(options.power ?? 2, 2));
  const normalWeighting = clamp01(options.normalWeighting ?? 0);
  const normal = mesh.geometry.getAttribute('normal');
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const modelBox = new THREE.Box3().setFromObject(mesh);
  const modelSize = Math.max(
    modelBox.max.x - modelBox.min.x,
    modelBox.max.y - modelBox.min.y,
    modelBox.max.z - modelBox.min.z,
    1e-6,
  );

  const segments = skeleton.bones.map((bone, boneIndex) => ({
    boneIndex,
    ...getBoneSegment(bone, skeleton),
  }));

  const vertexPosition = new THREE.Vector3();
  const worldPosition = new THREE.Vector3();
  const vertexNormal = new THREE.Vector3();
  let touchedVertices = 0;
  let changedVertices = 0;

  for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
    const current = readVertexSkinWeights(attributes, vertexIndex);
    if (!current) continue;

    vertexPosition.fromBufferAttribute(position, vertexIndex);
    worldPosition.copy(vertexPosition).applyMatrix4(mesh.matrixWorld);
    if (normal && normal.itemSize >= 3 && vertexIndex < normal.count) {
      vertexNormal.fromBufferAttribute(normal, vertexIndex).applyMatrix3(normalMatrix).normalize();
    } else {
      vertexNormal.set(0, 0, 0);
    }

    const entries = segments.map((segment) => {
      const closest = segmentClosestPoint(worldPosition, segment.start, segment.end);
      const distance = Math.max(distanceToSegment(worldPosition, segment.start, segment.end), 1e-6);
      const awayFromBone = vertexNormal.lengthSq() > 0
        ? 2 - worldPosition.clone().sub(closest).normalize().dot(vertexNormal)
        : 1;
      const modifiedDistance = 1 + 64 * distance * THREE.MathUtils.lerp(1, awayFromBone, normalWeighting) / modelSize;
      return {
        boneIndex: segment.boneIndex,
        weight: 1 / Math.pow(Math.max(modifiedDistance, 1e-6), power),
      };
    });

    const next = makeWeightedVertex(entries);
    if (!next) continue;

    touchedVertices += 1;
    if (!sameVertexSkinWeights(current, next, 1e-5)) {
      writeVertexSkinWeights(attributes, vertexIndex, next);
      changedVertices += 1;
    }
  }

  return { touchedVertices, changedVertices };
}

function isSkinnedMesh(obj: THREE.Object3D): obj is THREE.SkinnedMesh {
  return obj.type === 'SkinnedMesh';
}

export function restoreSkinVertexSnapshots(
  root: THREE.Object3D | null,
  snapshots: SkinVertexSnapshot[],
): number {
  if (!root || snapshots.length === 0) return 0;
  const meshById = new Map<string, THREE.SkinnedMesh>();
  root.traverse((obj) => {
    if (isSkinnedMesh(obj)) {
      meshById.set(obj.uuid, obj);
    }
  });

  let restored = 0;
  for (const snapshot of snapshots) {
    const mesh = meshById.get(snapshot.meshId);
    if (!mesh) continue;
    if (writeSkinnedMeshVertexWeights(mesh, snapshot.vertexIndex, snapshot.vertex)) {
      restored += 1;
    }
  }
  return restored;
}

export function writeVertexSkinWeights(
  attributes: SkinAttributePair,
  vertexIndex: number,
  vertex: VertexSkinWeights,
): void {
  attributes.skinIndex.setX(vertexIndex, vertex.indices[0]);
  attributes.skinIndex.setY(vertexIndex, vertex.indices[1]);
  attributes.skinIndex.setZ(vertexIndex, vertex.indices[2]);
  attributes.skinIndex.setW(vertexIndex, vertex.indices[3]);
  attributes.skinWeight.setX(vertexIndex, vertex.weights[0]);
  attributes.skinWeight.setY(vertexIndex, vertex.weights[1]);
  attributes.skinWeight.setZ(vertexIndex, vertex.weights[2]);
  attributes.skinWeight.setW(vertexIndex, vertex.weights[3]);
  attributes.skinIndex.needsUpdate = true;
  attributes.skinWeight.needsUpdate = true;
}

export function editVertexBoneWeight(
  mesh: THREE.SkinnedMesh,
  vertexIndex: number,
  boneIndex: number,
  mode: SkinWeightEditMode,
  amount: number,
): SkinWeightEditResult {
  if (!Number.isInteger(boneIndex) || boneIndex < 0) {
    return { ok: false, reason: 'invalid-bone' };
  }

  const attributes = getSkinAttributes(mesh.geometry);
  if (!attributes) {
    return { ok: false, reason: 'missing-skin-attributes' };
  }

  const current = readVertexSkinWeights(attributes, vertexIndex);
  if (!current) {
    return { ok: false, reason: 'invalid-vertex' };
  }

  const slot = findWritableSlot(current, boneIndex);
  const previousWeight = current.indices[slot] === boneIndex ? current.weights[slot] : 0;
  const targetWeight = mode === 'set'
    ? amount
    : mode === 'add'
      ? previousWeight + amount
      : previousWeight - amount;
  const updated = setVertexBoneWeight(current, boneIndex, targetWeight);
  if (!updated) {
    return { ok: false, reason: 'invalid-bone' };
  }

  const changed = updated.vertex.indices.some((index, indexSlot) => index !== current.indices[indexSlot])
    || updated.vertex.weights.some((weight, weightSlot) => Math.abs(weight - current.weights[weightSlot]) > 1e-6);

  if (changed) {
    writeVertexSkinWeights(attributes, vertexIndex, updated.vertex);
  }

  return {
    ok: true,
    vertex: updated.vertex,
    slot: updated.slot,
    changed,
  };
}

export function markSkinEdit(
  state: SkinEditState,
  meshId: string,
  vertexIndex: number,
): SkinEditState {
  const editedVertices = new Map<string, Set<number>>();
  for (const [id, vertices] of state.editedVertices) {
    editedVertices.set(id, new Set(vertices));
  }

  const meshVertices = editedVertices.get(meshId) ?? new Set<number>();
  meshVertices.add(vertexIndex);
  editedVertices.set(meshId, meshVertices);

  const dirtyMeshIds = new Set(state.dirtyMeshIds);
  dirtyMeshIds.add(meshId);

  return {
    ...state,
    dirtyMeshIds,
    editedVertices,
  };
}

export function hasDirtySkinEdits(state: SkinEditState): boolean {
  return state.dirtyMeshIds.size > 0 || state.editedVertices.size > 0;
}

export function getDirtySkinExportBlockReason(state: SkinEditState): string | null {
  if (!hasDirtySkinEdits(state)) {
    return null;
  }
  return null;
}
