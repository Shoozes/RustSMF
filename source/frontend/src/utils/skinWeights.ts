import * as THREE from 'three';
import type { ModelSourceFormat } from './modelFormat';

export type SkinWeightEditMode = 'set' | 'add' | 'subtract' | 'auto';

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

export function getSkinVertexSnapshotKey(meshId: string, vertexIndex: number): string {
  return `${meshId}:${vertexIndex}`;
}

export function indexSkinVertexSnapshots(
  snapshots: readonly SkinVertexSnapshot[],
): Map<string, SkinVertexSnapshot> {
  return new Map(
    snapshots.map((snapshot) => [
      getSkinVertexSnapshotKey(snapshot.meshId, snapshot.vertexIndex),
      snapshot,
    ]),
  );
}

export interface SkinEditHistoryEntry {
  beforeState: SkinEditState;
  afterState: SkinEditState;
  before: SkinVertexSnapshot[];
  after: SkinVertexSnapshot[];
  order?: number;
  redoOrder?: number;
}

export const SKIN_AUTO_WEIGHT_ALGORITHMS = [
  'segment-inverse-distance',
  'segment-distance-normal',
  'nearest-segment',
  'nearest-bone-origin',
  'closest-two-segments',
  'selected-branch',
] as const;

export type SkinAutoWeightAlgorithm = typeof SKIN_AUTO_WEIGHT_ALGORITHMS[number];

export type LegacySkinAutoWeightAlgorithm =
  | 'inverse-segment-distance'
  | 'distance-power'
  | 'distance-normal'
  | 'nearest-bone'
  | 'closest-two';

export const SKIN_AUTO_WEIGHT_ALGORITHM_LABELS: Record<SkinAutoWeightAlgorithm, string> = {
  'segment-inverse-distance': 'Segment inverse distance',
  'segment-distance-normal': 'Segment distance + normals',
  'nearest-segment': 'Nearest segment',
  'nearest-bone-origin': 'Nearest bone origin',
  'closest-two-segments': 'Closest two segments',
  'selected-branch': 'Selected branch',
};

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
  algorithm?: SkinAutoWeightAlgorithm | LegacySkinAutoWeightAlgorithm;
  power?: number;
  normalWeighting?: number;
  maxInfluences?: number;
  blendAmount?: number;
  restrictToBoneIndices?: Set<number>;
}

export interface ResolvedSkinAutoWeightOptions {
  algorithm: SkinAutoWeightAlgorithm;
  power: number;
  normalWeighting: number;
  maxInfluences: number;
  blendAmount: number;
  restrictToBoneIndices?: Set<number>;
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

function clampIntegerRange(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function isSkinAutoWeightAlgorithm(value: unknown): value is SkinAutoWeightAlgorithm {
  return SKIN_AUTO_WEIGHT_ALGORITHMS.some((algorithm) => algorithm === value);
}

export function normalizeSkinAutoWeightAlgorithm(
  value: SkinAutoWeightOptions['algorithm'],
): SkinAutoWeightAlgorithm {
  if (isSkinAutoWeightAlgorithm(value)) return value;
  if (value === 'inverse-segment-distance' || value === 'distance-power') return 'segment-inverse-distance';
  if (value === 'distance-normal') return 'segment-distance-normal';
  if (value === 'nearest-bone') return 'nearest-segment';
  if (value === 'closest-two') return 'closest-two-segments';
  return 'segment-inverse-distance';
}

export function resolveSkinAutoWeightOptions(
  options: SkinAutoWeightOptions = {},
): ResolvedSkinAutoWeightOptions {
  const restrictToBoneIndices = options.restrictToBoneIndices && options.restrictToBoneIndices.size > 0
    ? new Set([...options.restrictToBoneIndices].filter((index) => Number.isInteger(index) && index >= 0))
    : undefined;

  return {
    algorithm: normalizeSkinAutoWeightAlgorithm(options.algorithm),
    power: Math.min(8, Math.max(1, clampPositive(options.power ?? 2, 2))),
    normalWeighting: clamp01(options.normalWeighting ?? 0),
    maxInfluences: clampIntegerRange(options.maxInfluences ?? 4, 1, 4, 4),
    blendAmount: clamp01(options.blendAmount ?? 1),
    restrictToBoneIndices,
  };
}

function cloneVertex(vertex: VertexSkinWeights): VertexSkinWeights {
  return {
    indices: [vertex.indices[0], vertex.indices[1], vertex.indices[2], vertex.indices[3]],
    weights: [vertex.weights[0], vertex.weights[1], vertex.weights[2], vertex.weights[3]],
  };
}

function mapWeightTuple(
  values: VertexSkinWeights['weights'],
  mapValue: (value: number) => number,
): VertexSkinWeights['weights'] {
  return [
    mapValue(values[0]),
    mapValue(values[1]),
    mapValue(values[2]),
    mapValue(values[3]),
  ];
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
    indices: mapWeightTuple([
      attributes.skinIndex.getX(vertexIndex),
      attributes.skinIndex.getY(vertexIndex),
      attributes.skinIndex.getZ(vertexIndex),
      attributes.skinIndex.getW(vertexIndex),
    ], (value) => Math.max(0, Math.trunc(value))),
    weights: mapWeightTuple([
      attributes.skinWeight.getX(vertexIndex),
      attributes.skinWeight.getY(vertexIndex),
      attributes.skinWeight.getZ(vertexIndex),
      attributes.skinWeight.getW(vertexIndex),
    ], clamp01),
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
  normalized.weights = mapWeightTuple(normalized.weights, clamp01);
  const total = normalized.weights.reduce((sum, value) => sum + value, 0);

  if (total <= 0) {
    normalized.weights = [1, 0, 0, 0];
    return normalized;
  }

  normalized.weights = mapWeightTuple(normalized.weights, (value) => value / total);
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

function makeWeightedVertex(
  entries: Array<{ boneIndex: number; weight: number }>,
  maxInfluences = 4,
): VertexSkinWeights | null {
  const influenceCount = clampIntegerRange(maxInfluences, 1, 4, 4);
  const strongest = entries
    .filter((entry) => Number.isInteger(entry.boneIndex) && entry.boneIndex >= 0 && Number.isFinite(entry.weight) && entry.weight > 0)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, influenceCount);

  if (strongest.length === 0) return null;

  const indices: VertexSkinWeights['indices'] = [0, 0, 0, 0];
  const weights: VertexSkinWeights['weights'] = [0, 0, 0, 0];
  strongest.forEach((entry, slot) => {
    indices[slot] = entry.boneIndex;
    weights[slot] = entry.weight;
  });

  return normalizeVertexSkinWeights({ indices, weights });
}

interface AutoWeightSegment {
  boneIndex: number;
  origin: THREE.Vector3;
  start: THREE.Vector3;
  end: THREE.Vector3;
}

interface WeightedCandidate {
  boneIndex: number;
  segmentDistance: number;
  originDistance: number;
  normalFactor: number;
}

interface SkinAutoWeightContext {
  mesh: THREE.SkinnedMesh;
  attributes: SkinAttributePair;
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  normal: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  normalMatrix: THREE.Matrix3;
  modelSize: number;
  segments: AutoWeightSegment[];
  resolved: ResolvedSkinAutoWeightOptions;
}

export function makeAutoWeightEntries(
  candidates: WeightedCandidate[],
  options: ResolvedSkinAutoWeightOptions,
): Array<{ boneIndex: number; weight: number }> {
  const sorted = candidates
    .filter((candidate) => (
      Number.isInteger(candidate.boneIndex)
      && candidate.boneIndex >= 0
      && Number.isFinite(candidate.segmentDistance)
      && candidate.segmentDistance >= 0
      && Number.isFinite(candidate.originDistance)
      && candidate.originDistance >= 0
    ))
    .sort((left, right) => left.segmentDistance - right.segmentDistance);

  if (sorted.length === 0) return [];

  if (options.algorithm === 'nearest-segment') {
    return [{ boneIndex: sorted[0].boneIndex, weight: 1 }];
  }

  if (options.algorithm === 'nearest-bone-origin') {
    const nearestOrigin = [...sorted].sort((left, right) => left.originDistance - right.originDistance)[0];
    return [{ boneIndex: nearestOrigin.boneIndex, weight: 1 }];
  }

  if (options.algorithm === 'closest-two-segments') {
    return sorted.slice(0, 2).map((candidate) => ({
      boneIndex: candidate.boneIndex,
      weight: 1 / Math.max(candidate.segmentDistance, 1e-6),
    }));
  }

  return sorted.slice(0, options.maxInfluences).map((candidate) => {
    const normalFactor = options.algorithm === 'segment-distance-normal'
      ? THREE.MathUtils.lerp(1, candidate.normalFactor, options.normalWeighting)
      : 1;
    const modifiedDistance = Math.max(candidate.segmentDistance * normalFactor, 1e-6);
    return {
      boneIndex: candidate.boneIndex,
      weight: 1 / Math.pow(modifiedDistance, options.power),
    };
  });
}

function createSkinAutoWeightContext(
  mesh: THREE.SkinnedMesh,
  skeleton: THREE.Skeleton,
  options: SkinAutoWeightOptions = {},
): SkinAutoWeightContext | null {
  const attributes = getSkinAttributes(mesh.geometry);
  const position = mesh.geometry.getAttribute('position');
  if (!attributes || !position || position.itemSize < 3 || skeleton.bones.length === 0) {
    return null;
  }

  mesh.updateMatrixWorld(true);
  skeleton.bones.forEach((bone) => bone.updateMatrixWorld(true));

  const resolved = resolveSkinAutoWeightOptions(options);
  const normal = mesh.geometry.getAttribute('normal') ?? undefined;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const modelBox = new THREE.Box3().setFromObject(mesh);
  const modelSize = Math.max(
    modelBox.max.x - modelBox.min.x,
    modelBox.max.y - modelBox.min.y,
    modelBox.max.z - modelBox.min.z,
    1e-6,
  );
  const segments = skeleton.bones.flatMap((bone, boneIndex) => {
    if (resolved.restrictToBoneIndices && !resolved.restrictToBoneIndices.has(boneIndex)) {
      return [];
    }
    return [{ boneIndex, origin: getBoneWorldPosition(bone), ...getBoneSegment(bone, skeleton) }];
  });

  if (segments.length === 0) return null;

  return {
    mesh,
    attributes,
    position,
    normal,
    normalMatrix,
    modelSize,
    segments,
    resolved,
  };
}

function computeAutoSkinVertexWeights(
  context: SkinAutoWeightContext,
  vertexIndex: number,
): VertexSkinWeights | null {
  if (vertexIndex < 0 || vertexIndex >= context.position.count) return null;

  const local = new THREE.Vector3().fromBufferAttribute(context.position, vertexIndex);
  const worldPosition = local.applyMatrix4(context.mesh.matrixWorld);

  const vertexNormal = new THREE.Vector3();
  if (context.normal && context.normal.itemSize >= 3 && vertexIndex < context.normal.count) {
    vertexNormal.fromBufferAttribute(context.normal, vertexIndex).applyMatrix3(context.normalMatrix).normalize();
  }

  const candidates = context.segments.map((segment) => {
    const closest = segmentClosestPoint(worldPosition, segment.start, segment.end);
    const distance = Math.max(1 + (64 * distanceToSegment(worldPosition, segment.start, segment.end) / context.modelSize), 1e-6);
    const awayVector = worldPosition.clone().sub(closest);
    const awayFromBone = vertexNormal.lengthSq() > 0 && awayVector.lengthSq() > 1e-12
      ? 2 - awayVector.normalize().dot(vertexNormal)
      : 1;
    return {
      boneIndex: segment.boneIndex,
      segmentDistance: distance,
      originDistance: Math.max(1 + (64 * worldPosition.distanceTo(segment.origin) / context.modelSize), 1e-6),
      normalFactor: awayFromBone,
    };
  });

  return makeWeightedVertex(makeAutoWeightEntries(candidates, context.resolved), context.resolved.maxInfluences);
}

function blendVertexWeights(
  current: VertexSkinWeights,
  target: VertexSkinWeights,
  blendAmount: number,
  maxInfluences: number,
): VertexSkinWeights | null {
  const blend = clamp01(blendAmount);
  if (blend >= 1) return target;

  const weightsByBone = new Map<number, number>();
  current.indices.forEach((boneIndex, slot) => {
    const weight = current.weights[slot] * (1 - blend);
    if (weight > 0) weightsByBone.set(boneIndex, (weightsByBone.get(boneIndex) ?? 0) + weight);
  });
  target.indices.forEach((boneIndex, slot) => {
    const weight = target.weights[slot] * blend;
    if (weight > 0) weightsByBone.set(boneIndex, (weightsByBone.get(boneIndex) ?? 0) + weight);
  });

  return makeWeightedVertex(
    [...weightsByBone.entries()].map(([boneIndex, weight]) => ({ boneIndex, weight })),
    maxInfluences,
  );
}

export function autoSkinSkinnedMeshWeights(
  mesh: THREE.SkinnedMesh,
  skeleton: THREE.Skeleton,
  options: SkinAutoWeightOptions = {},
): SkinMeshWeightEditSummary {
  const context = createSkinAutoWeightContext(mesh, skeleton, options);
  if (!context) {
    return { touchedVertices: 0, changedVertices: 0 };
  }

  let touchedVertices = 0;
  let changedVertices = 0;

  for (let vertexIndex = 0; vertexIndex < context.position.count; vertexIndex += 1) {
    const current = readVertexSkinWeights(context.attributes, vertexIndex);
    if (!current) continue;

    const target = computeAutoSkinVertexWeights(context, vertexIndex);
    const next = target
      ? blendVertexWeights(current, target, context.resolved.blendAmount, context.resolved.maxInfluences)
      : null;
    if (!next) continue;

    touchedVertices += 1;
    if (!sameVertexSkinWeights(current, next, 1e-5)) {
      writeVertexSkinWeights(context.attributes, vertexIndex, next);
      changedVertices += 1;
    }
  }

  return { touchedVertices, changedVertices };
}

export function autoSkinSkinnedMeshVertexWeights(
  mesh: THREE.SkinnedMesh,
  skeleton: THREE.Skeleton,
  vertexIndex: number,
  options: SkinAutoWeightOptions = {},
): SkinWeightEditResult {
  const context = createSkinAutoWeightContext(mesh, skeleton, options);
  if (!context) {
    return { ok: false, reason: 'missing-skin-attributes' };
  }

  const current = readVertexSkinWeights(context.attributes, vertexIndex);
  if (!current) {
    return { ok: false, reason: 'invalid-vertex' };
  }

  const target = computeAutoSkinVertexWeights(context, vertexIndex);
  const next = target
    ? blendVertexWeights(current, target, context.resolved.blendAmount, context.resolved.maxInfluences)
    : null;
  if (!next) {
    return { ok: false, reason: 'invalid-bone' };
  }

  const changed = !sameVertexSkinWeights(current, next, 1e-5);
  if (changed) {
    writeVertexSkinWeights(context.attributes, vertexIndex, next);
  }

  return {
    ok: true,
    vertex: next,
    slot: 0,
    changed,
  };
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
