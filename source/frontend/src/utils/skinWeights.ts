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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
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
