import * as THREE from 'three';

export type RigRenameFailureReason =
  | 'no-selected-bone'
  | 'empty-name'
  | 'duplicate-name'
  | 'same-name'
  | 'invalid-name';

export type RigRenameValidationResult =
  | { ok: true; name: string }
  | { ok: false; reason: RigRenameFailureReason; message: string };

export type RigReparentFailureReason =
  | 'no-selected-bone'
  | 'no-parent-bone'
  | 'missing-bone'
  | 'missing-parent'
  | 'self-parent'
  | 'cycle';

export type RigReparentValidationResult =
  | { ok: true; bone: THREE.Bone; parent: THREE.Bone }
  | { ok: false; reason: RigReparentFailureReason; message: string };

export type RigCreateChildFailureReason =
  | 'no-parent-bone'
  | 'missing-parent'
  | 'empty-name'
  | 'duplicate-name'
  | 'invalid-name';

export type RigCreateChildValidationResult =
  | { ok: true; name: string; parent: THREE.Bone }
  | { ok: false; reason: RigCreateChildFailureReason; message: string };

export type RigCreateChildResult =
  | { ok: true; bone: THREE.Bone; parent: THREE.Bone }
  | { ok: false; reason: RigCreateChildFailureReason; message: string };

export type RigDeleteFailureReason =
  | 'no-selected-bone'
  | 'missing-bone'
  | 'root-bone'
  | 'skin-references';

export type RigDeleteResult =
  | { ok: true; deletedNames: string[]; indexMap: Map<number, number> }
  | { ok: false; reason: RigDeleteFailureReason; message: string };

const BONE_NAME_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const SKIN_WEIGHT_EPSILON = 1e-6;

export function validateBoneRename(
  skeleton: THREE.Skeleton | null | undefined,
  oldName: string,
  requestedName: string,
): RigRenameValidationResult {
  if (!skeleton || !oldName || oldName === 'Scene') {
    return { ok: false, reason: 'no-selected-bone', message: 'Select a bone before renaming.' };
  }

  const nextName = requestedName.trim();
  if (!nextName) {
    return { ok: false, reason: 'empty-name', message: 'Bone name cannot be empty.' };
  }
  if (nextName === oldName) {
    return { ok: false, reason: 'same-name', message: 'Bone already has that name.' };
  }
  if (!BONE_NAME_PATTERN.test(nextName)) {
    return {
      ok: false,
      reason: 'invalid-name',
      message: 'Bone names may contain letters, numbers, underscore, dash, dot, and colon.',
    };
  }
  if (skeleton.bones.some((bone) => bone.name === nextName)) {
    return { ok: false, reason: 'duplicate-name', message: `A bone named ${nextName} already exists.` };
  }
  return { ok: true, name: nextName };
}

function retargetTrackName(trackName: string, oldBoneName: string, newBoneName: string): string {
  if (trackName === oldBoneName) return newBoneName;
  if (trackName.startsWith(`${oldBoneName}.`)) {
    return `${newBoneName}${trackName.slice(oldBoneName.length)}`;
  }
  if (trackName.includes(`[${oldBoneName}]`)) {
    return trackName.replace(`[${oldBoneName}]`, `[${newBoneName}]`);
  }
  if (trackName.includes(`.${oldBoneName}.`)) {
    return trackName.replace(`.${oldBoneName}.`, `.${newBoneName}.`);
  }
  return trackName;
}

function cloneTrackWithName(track: THREE.KeyframeTrack, name: string): THREE.KeyframeTrack {
  const cloned = track.clone();
  cloned.name = name;
  return cloned;
}

function isTrackForBoneName(trackName: string, boneName: string): boolean {
  return trackName === boneName
    || trackName.startsWith(`${boneName}.`)
    || trackName.includes(`[${boneName}]`)
    || trackName.includes(`.${boneName}.`);
}

export function retargetAnimationClipBoneName(
  clip: THREE.AnimationClip,
  oldBoneName: string,
  newBoneName: string,
): THREE.AnimationClip {
  if (!oldBoneName || !newBoneName || oldBoneName === newBoneName) return clip;
  let changed = false;
  const tracks = clip.tracks.map((track) => {
    const nextName = retargetTrackName(track.name, oldBoneName, newBoneName);
    if (nextName === track.name) return track;
    changed = true;
    return cloneTrackWithName(track, nextName);
  });
  return changed ? new THREE.AnimationClip(clip.name, clip.duration, tracks) : clip;
}

export function removeAnimationClipBoneNames(
  clips: THREE.AnimationClip[],
  boneNames: Iterable<string>,
): THREE.AnimationClip[] {
  const names = new Set([...boneNames].filter(Boolean));
  if (names.size === 0) return clips;

  return clips.map((clip) => {
    const tracks = clip.tracks.filter((track) => (
      ![...names].some((name) => isTrackForBoneName(track.name, name))
    ));
    return tracks.length === clip.tracks.length ? clip : new THREE.AnimationClip(clip.name, clip.duration, tracks);
  });
}

export function retargetAnimationClipBoneNames(
  clips: THREE.AnimationClip[],
  oldBoneName: string,
  newBoneName: string,
): THREE.AnimationClip[] {
  return clips.map((clip) => retargetAnimationClipBoneName(clip, oldBoneName, newBoneName));
}

function findBone(skeleton: THREE.Skeleton | null | undefined, name: string): THREE.Bone | null {
  if (!skeleton || !name || name === 'Scene') return null;
  return skeleton.bones.find((bone) => bone.name === name) ?? null;
}

function validateNewBoneName(
  skeleton: THREE.Skeleton,
  requestedName: string,
): Exclude<RigCreateChildValidationResult, { ok: true }> | { ok: true; name: string } {
  const nextName = requestedName.trim();
  if (!nextName) {
    return { ok: false, reason: 'empty-name', message: 'Bone name cannot be empty.' };
  }
  if (!BONE_NAME_PATTERN.test(nextName)) {
    return {
      ok: false,
      reason: 'invalid-name',
      message: 'Bone names may contain letters, numbers, underscore, dash, dot, and colon.',
    };
  }
  if (skeleton.bones.some((bone) => bone.name === nextName)) {
    return { ok: false, reason: 'duplicate-name', message: `A bone named ${nextName} already exists.` };
  }
  return { ok: true, name: nextName };
}

function isDescendantOf(candidate: THREE.Bone, ancestor: THREE.Bone): boolean {
  let parent = candidate.parent;
  while (parent) {
    if (parent === ancestor) return true;
    parent = parent.parent;
  }
  return false;
}

function collectBoneBranch(root: THREE.Bone): THREE.Bone[] {
  const branch: THREE.Bone[] = [root];
  root.traverse((object) => {
    if (object !== root && (object as THREE.Bone).isBone === true) {
      branch.push(object as THREE.Bone);
    }
  });
  return branch;
}

function getSkinAttributes(mesh: THREE.SkinnedMesh): {
  skinIndex: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  skinWeight: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
} | null {
  const skinIndex = mesh.geometry.getAttribute('skinIndex');
  const skinWeight = mesh.geometry.getAttribute('skinWeight');
  if (!skinIndex || !skinWeight || skinIndex.itemSize < 4 || skinWeight.itemSize < 4) return null;
  return { skinIndex, skinWeight };
}

function skinAttributeValues(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  vertexIndex: number,
): [number, number, number, number] {
  return [
    attribute.getX(vertexIndex),
    attribute.getY(vertexIndex),
    attribute.getZ(vertexIndex),
    attribute.getW(vertexIndex),
  ];
}

function hasWeightedSkinReference(
  meshes: readonly THREE.SkinnedMesh[],
  deletedIndices: Set<number>,
): boolean {
  for (const mesh of meshes) {
    const attributes = getSkinAttributes(mesh);
    if (!attributes) continue;
    const vertexCount = Math.min(attributes.skinIndex.count, attributes.skinWeight.count);
    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
      const indices = skinAttributeValues(attributes.skinIndex, vertexIndex).map((value) => Math.max(0, Math.trunc(value)));
      const weights = skinAttributeValues(attributes.skinWeight, vertexIndex);
      if (indices.some((index, slot) => deletedIndices.has(index) && Math.abs(weights[slot]) > SKIN_WEIGHT_EPSILON)) {
        return true;
      }
    }
  }
  return false;
}

function remapSkinnedMeshBoneIndices(
  meshes: readonly THREE.SkinnedMesh[],
  indexMap: Map<number, number>,
  deletedIndices: Set<number>,
): void {
  for (const mesh of meshes) {
    const attributes = getSkinAttributes(mesh);
    if (!attributes) continue;
    const vertexCount = Math.min(attributes.skinIndex.count, attributes.skinWeight.count);
    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
      const indices = skinAttributeValues(attributes.skinIndex, vertexIndex).map((value) => Math.max(0, Math.trunc(value)));
      const weights = skinAttributeValues(attributes.skinWeight, vertexIndex);
      const next = indices.map((index, slot) => {
        if (deletedIndices.has(index)) {
          return Math.abs(weights[slot]) <= SKIN_WEIGHT_EPSILON ? 0 : index;
        }
        return indexMap.get(index) ?? index;
      });
      attributes.skinIndex.setX(vertexIndex, next[0]);
      attributes.skinIndex.setY(vertexIndex, next[1]);
      attributes.skinIndex.setZ(vertexIndex, next[2]);
      attributes.skinIndex.setW(vertexIndex, next[3]);
    }
    attributes.skinIndex.needsUpdate = true;
  }
}

export function validateBoneReparent(
  skeleton: THREE.Skeleton | null | undefined,
  boneName: string,
  parentName: string,
): RigReparentValidationResult {
  if (!skeleton || !boneName || boneName === 'Scene') {
    return { ok: false, reason: 'no-selected-bone', message: 'Select a bone before reparenting.' };
  }
  if (!parentName || parentName === 'Scene') {
    return { ok: false, reason: 'no-parent-bone', message: 'Choose a parent bone before reparenting.' };
  }

  const bone = findBone(skeleton, boneName);
  if (!bone) {
    return { ok: false, reason: 'missing-bone', message: `Bone ${boneName} is not in the current skeleton.` };
  }
  const parent = findBone(skeleton, parentName);
  if (!parent) {
    return { ok: false, reason: 'missing-parent', message: `Parent bone ${parentName} is not in the current skeleton.` };
  }
  if (bone === parent) {
    return { ok: false, reason: 'self-parent', message: 'A bone cannot be parented to itself.' };
  }
  if (isDescendantOf(parent, bone)) {
    return { ok: false, reason: 'cycle', message: 'Cannot reparent a bone under one of its descendants.' };
  }

  return { ok: true, bone, parent };
}

export function reparentBonePreserveWorldTransform(
  skeleton: THREE.Skeleton,
  boneName: string,
  parentName: string,
): RigReparentValidationResult {
  const validation = validateBoneReparent(skeleton, boneName, parentName);
  if (!validation.ok) return validation;

  const { bone, parent } = validation;
  const worldMatrix = bone.matrixWorld.clone();
  parent.add(bone);
  parent.updateMatrixWorld(true);

  const localMatrix = parent.matrixWorld.clone().invert().multiply(worldMatrix);
  localMatrix.decompose(bone.position, bone.quaternion, bone.scale);
  bone.updateMatrix();
  bone.updateMatrixWorld(true);
  skeleton.update();

  return validation;
}

export function validateCreateChildBone(
  skeleton: THREE.Skeleton | null | undefined,
  parentName: string,
  requestedName: string,
): RigCreateChildValidationResult {
  if (!skeleton || !parentName || parentName === 'Scene') {
    return { ok: false, reason: 'no-parent-bone', message: 'Select a parent bone before creating a child.' };
  }

  const parent = findBone(skeleton, parentName);
  if (!parent) {
    return { ok: false, reason: 'missing-parent', message: `Parent bone ${parentName} is not in the current skeleton.` };
  }

  const nameValidation = validateNewBoneName(skeleton, requestedName);
  if (!nameValidation.ok) return nameValidation;

  return { ok: true, name: nameValidation.name, parent };
}

export function createChildBone(
  skeleton: THREE.Skeleton,
  parentName: string,
  requestedName: string,
): RigCreateChildResult {
  const validation = validateCreateChildBone(skeleton, parentName, requestedName);
  if (!validation.ok) return validation;

  const { name, parent } = validation;
  const bone = new THREE.Bone();
  bone.name = name;
  bone.position.set(0, 0.25, 0);
  parent.add(bone);
  parent.updateMatrixWorld(true);
  bone.updateMatrixWorld(true);

  skeleton.bones.push(bone);
  skeleton.boneInverses.push(bone.matrixWorld.clone().invert());
  skeleton.init();
  skeleton.update();

  return { ok: true, bone, parent };
}

export function deleteBoneBranch(
  skeleton: THREE.Skeleton,
  boneName: string,
  skinnedMeshes: readonly THREE.SkinnedMesh[] = [],
): RigDeleteResult {
  if (!skeleton || !boneName || boneName === 'Scene') {
    return { ok: false, reason: 'no-selected-bone', message: 'Select a bone before deleting.' };
  }

  const bone = findBone(skeleton, boneName);
  if (!bone) {
    return { ok: false, reason: 'missing-bone', message: `Bone ${boneName} is not in the current skeleton.` };
  }

  if (!bone.parent || (bone.parent as THREE.Bone).isBone !== true || !skeleton.bones.includes(bone.parent as THREE.Bone)) {
    return { ok: false, reason: 'root-bone', message: 'Root bones cannot be deleted from the Rig workspace.' };
  }

  const deletedBones = collectBoneBranch(bone);
  const deletedSet = new Set(deletedBones);
  const deletedIndices = new Set<number>();
  skeleton.bones.forEach((candidate, index) => {
    if (deletedSet.has(candidate)) {
      deletedIndices.add(index);
    }
  });

  if (hasWeightedSkinReference(skinnedMeshes, deletedIndices)) {
    return {
      ok: false,
      reason: 'skin-references',
      message: `Cannot delete ${boneName}: one or more skinned vertices still use this bone.`,
    };
  }

  const keptBones = skeleton.bones.filter((candidate) => !deletedSet.has(candidate));
  const indexMap = new Map<number, number>();
  skeleton.bones.forEach((candidate, oldIndex) => {
    if (!deletedSet.has(candidate)) {
      indexMap.set(oldIndex, keptBones.indexOf(candidate));
    }
  });

  remapSkinnedMeshBoneIndices(skinnedMeshes, indexMap, deletedIndices);
  bone.parent.remove(bone);
  skeleton.bones = keptBones;
  skeleton.boneInverses = skeleton.boneInverses.filter((_, index) => !deletedIndices.has(index));
  skeleton.init();
  skeleton.update();

  return { ok: true, deletedNames: deletedBones.map((deleted) => deleted.name), indexMap };
}
