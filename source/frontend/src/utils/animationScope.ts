import * as THREE from 'three';

export type AnimationEditScope = 'bone' | 'branch' | 'rig';

export const ANIMATION_EDIT_SCOPES: readonly AnimationEditScope[] = ['bone', 'branch', 'rig'];

export const ANIMATION_EDIT_SCOPE_LABELS: Record<AnimationEditScope, string> = {
  bone: 'Bone',
  branch: 'Branch',
  rig: 'Full Rig',
};

export type AnimationScopeResolutionReason =
  | 'missing-skeleton'
  | 'missing-selection'
  | 'ambiguous-selection'
  | 'ambiguous-bone-name';

export interface AnimationScopeResolution {
  ok: boolean;
  bones: THREE.Bone[];
  names: string[];
  reason?: AnimationScopeResolutionReason;
  boneName?: string;
}

export function getAnimationSkeletonFingerprint(
  skeleton: THREE.Skeleton | null | undefined,
): string {
  if (!skeleton) return '';
  const indexByBone = new Map<THREE.Bone, number>();
  skeleton.bones.forEach((bone, index) => indexByBone.set(bone, index));
  return JSON.stringify(skeleton.bones.map((bone, index) => ({
    index,
    name: bone.name,
    parentIndex: bone.parent instanceof THREE.Bone
      ? indexByBone.get(bone.parent) ?? -1
      : -1,
  })));
}

function collectBranchBones(
  selectedBone: THREE.Bone,
  skeleton: THREE.Skeleton,
): THREE.Bone[] {
  const skeletonBones = new Set(skeleton.bones);
  const branch: THREE.Bone[] = [];
  selectedBone.traverse((object) => {
    if (object instanceof THREE.Bone && skeletonBones.has(object)) {
      branch.push(object);
    }
  });
  return branch;
}

export function resolveAnimationScope(
  skeleton: THREE.Skeleton | null | undefined,
  selectedBoneName: string,
  scope: AnimationEditScope,
): AnimationScopeResolution {
  if (!skeleton || skeleton.bones.length === 0) {
    return { ok: false, bones: [], names: [], reason: 'missing-skeleton' };
  }

  const matchingBones = skeleton.bones.filter((bone) => bone.name === selectedBoneName);
  if (matchingBones.length === 0 || !selectedBoneName || selectedBoneName === 'Scene') {
    return { ok: false, bones: [], names: [], reason: 'missing-selection' };
  }
  if (matchingBones.length > 1) {
    return {
      ok: false,
      bones: [],
      names: [],
      reason: 'ambiguous-selection',
      boneName: selectedBoneName,
    };
  }

  const selectedBone = matchingBones[0];
  const bones = scope === 'bone'
    ? [selectedBone]
    : scope === 'branch'
      ? collectBranchBones(selectedBone, skeleton)
      : [...skeleton.bones];
  const names = bones.map((bone) => bone.name);
  const uniqueNames = new Set(names);
  if (uniqueNames.size !== names.length || names.some((name) => !name.trim())) {
    const duplicateName = names.find((name, index) => names.indexOf(name) !== index) || names.find((name) => !name.trim());
    return {
      ok: false,
      bones: [],
      names: [],
      reason: 'ambiguous-bone-name',
      boneName: duplicateName,
    };
  }

  return { ok: true, bones, names };
}
