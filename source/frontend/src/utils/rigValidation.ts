import * as THREE from 'three';

export type RigValidationSeverity = 'error' | 'warning';

export interface RigValidationIssue {
  severity: RigValidationSeverity;
  code:
    | 'RIG_NO_SKELETON'
    | 'RIG_DUPLICATE_BONE_NAME'
    | 'RIG_ORPHAN_PARENT'
    | 'RIG_SELF_PARENT'
    | 'RIG_CYCLE'
    | 'RIG_SKIN_INDEX_OUT_OF_RANGE'
    | 'RIG_SKIN_ATTRIBUTE_MISMATCH'
    | 'RIG_SKIN_MISSING_ATTRIBUTES';
  message: string;
  boneName?: string;
  meshName?: string;
  vertexIndex?: number;
}

export interface RigValidationReport {
  status: 'pass' | 'warning' | 'error';
  issues: RigValidationIssue[];
  boneCount: number;
  skinnedMeshCount: number;
}

function isSkinnedMesh(obj: THREE.Object3D): obj is THREE.SkinnedMesh {
  return obj.type === 'SkinnedMesh';
}

export function collectSkinnedMeshesForRig(root: THREE.Object3D | null): THREE.SkinnedMesh[] {
  if (!root) return [];
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((obj) => {
    if (isSkinnedMesh(obj)) {
      meshes.push(obj);
    }
  });
  return meshes;
}

function getIssueStatus(issues: RigValidationIssue[]): RigValidationReport['status'] {
  if (issues.some((issue) => issue.severity === 'error')) return 'error';
  if (issues.length > 0) return 'warning';
  return 'pass';
}

function getBoneLabel(bone: THREE.Bone, index: number): string {
  return bone.name || `bone_${index}`;
}

function validateBoneGraph(skeleton: THREE.Skeleton | null | undefined): RigValidationIssue[] {
  if (!skeleton || skeleton.bones.length === 0) {
    return [{
      severity: 'warning',
      code: 'RIG_NO_SKELETON',
      message: 'No editable skeleton is loaded.',
    }];
  }

  const issues: RigValidationIssue[] = [];
  const boneSet = new Set(skeleton.bones);
  const names = new Map<string, number>();

  skeleton.bones.forEach((bone, index) => {
    const name = getBoneLabel(bone, index);
    if (bone.name) {
      names.set(bone.name, (names.get(bone.name) ?? 0) + 1);
    }

    if (bone.parent === bone) {
      issues.push({
        severity: 'error',
        code: 'RIG_SELF_PARENT',
        message: `${name} cannot be parented to itself.`,
        boneName: name,
      });
    } else if (bone.parent instanceof THREE.Bone && !boneSet.has(bone.parent)) {
      issues.push({
        severity: 'error',
        code: 'RIG_ORPHAN_PARENT',
        message: `${name} is parented to a bone that is not in the skeleton.`,
        boneName: name,
      });
    }
  });

  for (const [name, count] of names) {
    if (count > 1) {
      issues.push({
        severity: 'warning',
        code: 'RIG_DUPLICATE_BONE_NAME',
        message: `${name} appears ${count} times in the skeleton; animation and selection tracks may be ambiguous.`,
        boneName: name,
      });
    }
  }

  const visiting = new Set<THREE.Bone>();
  const visited = new Set<THREE.Bone>();
  const visit = (bone: THREE.Bone, path: THREE.Bone[]): void => {
    if (visited.has(bone)) return;
    if (visiting.has(bone)) {
      const cycleStart = path.findIndex((candidate) => candidate === bone);
      const cyclePath = [...path.slice(Math.max(0, cycleStart)), bone]
        .map((candidate) => getBoneLabel(candidate, skeleton.bones.indexOf(candidate)))
        .join(' -> ');
      issues.push({
        severity: 'error',
        code: 'RIG_CYCLE',
        message: `Bone hierarchy cycle detected: ${cyclePath}.`,
        boneName: getBoneLabel(bone, skeleton.bones.indexOf(bone)),
      });
      return;
    }

    visiting.add(bone);
    const parent = bone.parent instanceof THREE.Bone && boneSet.has(bone.parent)
      ? bone.parent
      : null;
    if (parent) {
      visit(parent, [...path, bone]);
    }
    visiting.delete(bone);
    visited.add(bone);
  };

  skeleton.bones.forEach((bone) => visit(bone, []));
  return issues;
}

function validateSkinReferences(
  skeleton: THREE.Skeleton | null | undefined,
  meshes: THREE.SkinnedMesh[],
): RigValidationIssue[] {
  if (!skeleton || skeleton.bones.length === 0) return [];
  const issues: RigValidationIssue[] = [];
  const boneCount = skeleton.bones.length;

  meshes.forEach((mesh) => {
    const meshName = mesh.name || mesh.uuid;
    const skinIndex = mesh.geometry.getAttribute('skinIndex');
    const skinWeight = mesh.geometry.getAttribute('skinWeight');
    if (!skinIndex && !skinWeight) return;
    if (!skinIndex || !skinWeight || skinIndex.itemSize < 4 || skinWeight.itemSize < 4) {
      issues.push({
        severity: 'error',
        code: 'RIG_SKIN_MISSING_ATTRIBUTES',
        message: `${meshName} has incomplete skinIndex/skinWeight attributes.`,
        meshName,
      });
      return;
    }
    if (skinIndex.count !== skinWeight.count) {
      issues.push({
        severity: 'error',
        code: 'RIG_SKIN_ATTRIBUTE_MISMATCH',
        message: `${meshName} skinIndex and skinWeight vertex counts differ.`,
        meshName,
      });
    }

    const vertexCount = Math.min(skinIndex.count, skinWeight.count);
    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
      const indices = [
        skinIndex.getX(vertexIndex),
        skinIndex.getY(vertexIndex),
        skinIndex.getZ(vertexIndex),
        skinIndex.getW(vertexIndex),
      ];
      const weights = [
        skinWeight.getX(vertexIndex),
        skinWeight.getY(vertexIndex),
        skinWeight.getZ(vertexIndex),
        skinWeight.getW(vertexIndex),
      ];
      for (let slot = 0; slot < 4; slot += 1) {
        const weight = weights[slot];
        const index = Math.round(indices[slot]);
        if (Number.isFinite(weight) && weight > 0 && (!Number.isInteger(index) || index < 0 || index >= boneCount)) {
          issues.push({
            severity: 'error',
            code: 'RIG_SKIN_INDEX_OUT_OF_RANGE',
            message: `${meshName} vertex ${vertexIndex} references missing bone index ${index}.`,
            meshName,
            vertexIndex,
          });
          return;
        }
      }
    }
  });

  return issues;
}

export function validateRig(
  skeleton: THREE.Skeleton | null | undefined,
  root: THREE.Object3D | null,
): RigValidationReport {
  const meshes = collectSkinnedMeshesForRig(root);
  const issues = [
    ...validateBoneGraph(skeleton),
    ...validateSkinReferences(skeleton, meshes),
  ];

  return {
    status: getIssueStatus(issues),
    issues,
    boneCount: skeleton?.bones.length ?? 0,
    skinnedMeshCount: meshes.length,
  };
}
