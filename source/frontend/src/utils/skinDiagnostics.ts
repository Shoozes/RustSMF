import * as THREE from 'three';

export type SkinPaintPoseMode = 'rest' | 'frozen' | 'live';

export const SKIN_PAINT_POSE_MODES: readonly SkinPaintPoseMode[] = ['rest', 'frozen', 'live'];

export const SKIN_PAINT_POSE_LABELS: Record<SkinPaintPoseMode, string> = {
  rest: 'Rest / Bind',
  frozen: 'Frozen Current',
  live: 'Live Animation',
};

export type SkinDiagnosticIssue =
  | 'missing-position'
  | 'missing-skin-attributes'
  | 'non-finite-index'
  | 'invalid-bone-index'
  | 'non-finite-weight'
  | 'out-of-range-weight';

export interface SkinInfluenceDiagnostic {
  slot: number;
  boneIndex: number | null;
  boneName: string | null;
  weight: number | null;
  issue: SkinDiagnosticIssue | null;
}

export interface SkinVertexDiagnostic {
  meshId: string;
  meshName: string;
  vertexIndex: number;
  slots: [SkinInfluenceDiagnostic, SkinInfluenceDiagnostic, SkinInfluenceDiagnostic, SkinInfluenceDiagnostic];
  weightSum: number;
  unweighted: boolean;
  invalidReferenceCount: number;
  invalidWeightCount: number;
  issueCodes: SkinDiagnosticIssue[];
}

export interface SkinDiagnosticsSummary {
  meshCount: number;
  vertexCount: number;
  inspectedVertexCount: number;
  invalidReferenceCount: number;
  invalidWeightCount: number;
  unweightedVertexCount: number;
  issueVertexCount: number;
  issueCounts: Record<SkinDiagnosticIssue, number>;
}

const ISSUE_CODES: readonly SkinDiagnosticIssue[] = [
  'missing-position',
  'missing-skin-attributes',
  'non-finite-index',
  'invalid-bone-index',
  'non-finite-weight',
  'out-of-range-weight',
];

function emptyIssueCounts(): Record<SkinDiagnosticIssue, number> {
  return ISSUE_CODES.reduce((counts, issue) => {
    counts[issue] = 0;
    return counts;
  }, {} as Record<SkinDiagnosticIssue, number>);
}

function makeEmptySlot(slot: number, issue: SkinDiagnosticIssue | null): SkinInfluenceDiagnostic {
  return { slot, boneIndex: null, boneName: null, weight: null, issue };
}

function getAttributeComponent(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
  vertexIndex: number,
  slot: number,
): number | null {
  if (!attribute || slot >= attribute.itemSize) return null;
  return attribute.getComponent(vertexIndex, slot);
}

export function diagnoseSkinVertex(
  mesh: THREE.SkinnedMesh,
  vertexIndex: number,
): SkinVertexDiagnostic {
  const position = mesh.geometry.getAttribute('position');
  const skinIndex = mesh.geometry.getAttribute('skinIndex');
  const skinWeight = mesh.geometry.getAttribute('skinWeight');
  const bones = mesh.skeleton?.bones ?? [];
  const meshName = mesh.name || mesh.uuid;
  const slots = [] as SkinInfluenceDiagnostic[];
  const issueCodes = new Set<SkinDiagnosticIssue>();

  if (!position || position.itemSize < 3) {
    for (let slot = 0; slot < 4; slot += 1) slots.push(makeEmptySlot(slot, 'missing-position'));
    return {
      meshId: mesh.uuid,
      meshName,
      vertexIndex,
      slots: slots as SkinVertexDiagnostic['slots'],
      weightSum: 0,
      unweighted: true,
      invalidReferenceCount: 0,
      invalidWeightCount: 0,
      issueCodes: ['missing-position'],
    };
  }

  const safeVertexIndex = Number.isInteger(vertexIndex) && vertexIndex >= 0 && vertexIndex < position.count
    ? vertexIndex
    : -1;
  const attributesMissing = !skinIndex || !skinWeight || skinIndex.itemSize < 4 || skinWeight.itemSize < 4;
  let weightSum = 0;
  let invalidReferenceCount = 0;
  let invalidWeightCount = 0;

  for (let slot = 0; slot < 4; slot += 1) {
    if (safeVertexIndex < 0) {
      slots.push(makeEmptySlot(slot, 'invalid-bone-index'));
      invalidReferenceCount += 1;
      issueCodes.add('invalid-bone-index');
      continue;
    }
    if (attributesMissing) {
      slots.push(makeEmptySlot(slot, 'missing-skin-attributes'));
      issueCodes.add('missing-skin-attributes');
      continue;
    }

    const rawIndex = getAttributeComponent(skinIndex, safeVertexIndex, slot)!;
    const rawWeight = getAttributeComponent(skinWeight, safeVertexIndex, slot)!;
    const indexFinite = Number.isFinite(rawIndex);
    const weightFinite = Number.isFinite(rawWeight);
    const boneIndex = indexFinite && Number.isInteger(rawIndex) ? rawIndex : null;
    const boneName = boneIndex !== null && boneIndex >= 0 && boneIndex < bones.length
      ? bones[boneIndex]?.name || `Bone ${boneIndex}`
      : null;
    let issue: SkinDiagnosticIssue | null = null;

    if (!indexFinite) {
      issue = 'non-finite-index';
      invalidReferenceCount += 1;
    } else if (boneIndex === null) {
      issue = 'invalid-bone-index';
      invalidReferenceCount += 1;
    } else if (boneIndex < 0 || boneIndex >= bones.length) {
      issue = 'invalid-bone-index';
      invalidReferenceCount += 1;
    }
    if (!weightFinite) {
      issueCodes.add('non-finite-weight');
      issue = issue ?? 'non-finite-weight';
      invalidWeightCount += 1;
    } else {
      weightSum += rawWeight;
      if (rawWeight < 0 || rawWeight > 1) {
        issueCodes.add('out-of-range-weight');
        issue = issue ?? 'out-of-range-weight';
        invalidWeightCount += 1;
      }
    }
    if (issue) issueCodes.add(issue);
    slots.push({ slot, boneIndex, boneName, weight: rawWeight, issue });
  }

  return {
    meshId: mesh.uuid,
    meshName,
    vertexIndex,
    slots: slots as SkinVertexDiagnostic['slots'],
    weightSum,
    unweighted: Number.isFinite(weightSum) && weightSum <= 1e-6,
    invalidReferenceCount,
    invalidWeightCount,
    issueCodes: [...issueCodes],
  };
}

export function diagnoseSkinnedMeshes(
  meshes: readonly THREE.SkinnedMesh[],
): SkinDiagnosticsSummary {
  const issueCounts = emptyIssueCounts();
  let vertexCount = 0;
  let invalidReferenceCount = 0;
  let invalidWeightCount = 0;
  let unweightedVertexCount = 0;
  let issueVertexCount = 0;
  let inspectedVertexCount = 0;

  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute('position');
    const count = position?.itemSize && position.itemSize >= 3 ? position.count : 0;
    vertexCount += count;
    for (let vertexIndex = 0; vertexIndex < count; vertexIndex += 1) {
      const diagnostic = diagnoseSkinVertex(mesh, vertexIndex);
      inspectedVertexCount += 1;
      invalidReferenceCount += diagnostic.invalidReferenceCount;
      invalidWeightCount += diagnostic.invalidWeightCount;
      if (diagnostic.unweighted) unweightedVertexCount += 1;
      if (diagnostic.issueCodes.length > 0) {
        issueVertexCount += 1;
        for (const issue of diagnostic.issueCodes) issueCounts[issue] += 1;
      }
    }
  }

  return {
    meshCount: meshes.length,
    vertexCount,
    inspectedVertexCount,
    invalidReferenceCount,
    invalidWeightCount,
    unweightedVertexCount,
    issueVertexCount,
    issueCounts,
  };
}

export function getSkinPaintPoseWarning(mode: SkinPaintPoseMode): string | null {
  if (mode !== 'live') return null;
  return 'Live Animation uses the moving viewport pose; switch to Frozen Current for repeatable brush sampling.';
}
