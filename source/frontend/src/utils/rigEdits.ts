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

const BONE_NAME_PATTERN = /^[A-Za-z0-9_.:-]+$/;

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
