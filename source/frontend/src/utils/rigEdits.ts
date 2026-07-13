import * as THREE from 'three';
import { isThreeBone } from './threeTypeGuards';

export type RigToolMode = 'select' | 'endpoint' | 'add-child' | 'move' | 'rotate' | 'ik';

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

export type RigMoveFailureReason =
  | 'no-selected-bone'
  | 'missing-bone'
  | 'invalid-position';

export type RigMoveResult =
  | { ok: true; bone: THREE.Bone }
  | { ok: false; reason: RigMoveFailureReason; message: string };

export type RigDetachFailureReason =
  | 'no-selected-bone'
  | 'missing-bone'
  | 'root-bone'
  | 'already-detached'
  | 'already-attached';

export type RigDetachResult =
  | { ok: true; bone: THREE.Bone; detached: boolean; indexMap: Map<number, number> }
  | { ok: false; reason: RigDetachFailureReason; message: string };

export type RigSpinAxis = 'x' | 'y' | 'z';

export type RigSpinFailureReason =
  | 'missing-skeleton'
  | 'empty-skeleton'
  | 'invalid-axis'
  | 'invalid-angle';

export type RigSpinResult =
  | { ok: true; axis: RigSpinAxis; angleRadians: number; boneCount: number }
  | { ok: false; reason: RigSpinFailureReason; message: string };

export type RigRotateFailureReason =
  | 'no-selected-bone'
  | 'missing-bone'
  | 'invalid-axis'
  | 'invalid-angle';

export type RigRotateResult =
  | { ok: true; bone: THREE.Bone; angleRadians: number }
  | { ok: false; reason: RigRotateFailureReason; message: string };

export type RigResetFailureReason =
  | 'no-selected-bone'
  | 'missing-bone'
  | 'missing-bind-transform'
  | 'invalid-bind-transform';

export type RigResetResult =
  | { ok: true; bone: THREE.Bone }
  | { ok: false; reason: RigResetFailureReason; message: string };

const BONE_NAME_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const SKIN_WEIGHT_EPSILON = 1e-6;
export const RIG_SNAP_STEPS = [0, 0.05, 0.1, 0.25, 0.5, 1] as const;

export function normalizeRigSnapStep(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return RIG_SNAP_STEPS.find((step) => Math.abs(step - value) <= 1e-6) ?? 0;
}

export function snapRigWorldPosition(worldPosition: THREE.Vector3, snapStep: number): THREE.Vector3 {
  const normalizedStep = normalizeRigSnapStep(snapStep);
  if (normalizedStep <= 0) return worldPosition.clone();

  return new THREE.Vector3(
    Math.round(worldPosition.x / normalizedStep) * normalizedStep,
    Math.round(worldPosition.y / normalizedStep) * normalizedStep,
    Math.round(worldPosition.z / normalizedStep) * normalizedStep,
  );
}

export function resetBoneToBindPose(
  skeleton: THREE.Skeleton | null | undefined,
  boneName: string,
): RigResetResult {
  if (!skeleton || !boneName || boneName === 'Scene') {
    return { ok: false, reason: 'no-selected-bone', message: 'Select a deform bone before resetting its bind pose.' };
  }

  const boneIndex = skeleton.bones.findIndex((bone) => bone.name === boneName);
  if (boneIndex < 0) {
    return { ok: false, reason: 'missing-bone', message: `Bone ${boneName} is not in the current deform skeleton.` };
  }

  const boneInverse = skeleton.boneInverses[boneIndex];
  if (!boneInverse) {
    return { ok: false, reason: 'missing-bind-transform', message: `Bone ${boneName} has no inverse bind transform.` };
  }

  const bone = skeleton.bones[boneIndex];
  const bindWorld = boneInverse.clone().invert();
  let parentBindWorld: THREE.Matrix4 | null = null;
  const parent = bone.parent;
  if (isThreeBone(parent)) {
    const parentIndex = skeleton.bones.indexOf(parent);
    const parentInverse = parentIndex >= 0 ? skeleton.boneInverses[parentIndex] : null;
    if (!parentInverse) {
      return {
        ok: false,
        reason: 'missing-bind-transform',
        message: `Parent of ${boneName} has no inverse bind transform.`,
      };
    }
    parentBindWorld = parentInverse.clone().invert();
  } else if (parent) {
    parent.updateWorldMatrix(true, false);
    parentBindWorld = parent.matrixWorld.clone();
  }

  const bindLocal = parentBindWorld
    ? parentBindWorld.clone().invert().multiply(bindWorld)
    : bindWorld;
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  bindLocal.decompose(position, quaternion, scale);
  const finite = [...position.toArray(), ...quaternion.toArray(), ...scale.toArray()].every(Number.isFinite);
  if (!finite || quaternion.lengthSq() <= 1e-12 || Math.abs(scale.x * scale.y * scale.z) <= 1e-12) {
    return { ok: false, reason: 'invalid-bind-transform', message: `Bone ${boneName} has an invalid inverse bind transform.` };
  }

  bone.position.copy(position);
  bone.quaternion.copy(quaternion).normalize();
  bone.scale.copy(scale);
  bone.updateMatrix();
  bone.updateWorldMatrix(true, false);
  skeleton.update();
  return { ok: true, bone };
}

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
  if (collectSkeletonHierarchyBones(skeleton).some((bone) => bone.name === nextName)) {
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

function collectSkeletonHierarchyBones(skeleton: THREE.Skeleton | null | undefined): THREE.Bone[] {
  if (!skeleton) return [];
  const roots: THREE.Bone[] = [];
  for (const bone of skeleton.bones) {
    let root = bone;
    while (isThreeBone(root.parent)) {
      root = root.parent;
    }
    if (!roots.includes(root)) {
      roots.push(root);
    }
  }

  const bones: THREE.Bone[] = [];
  for (const root of roots) {
    root.traverse((object) => {
      if (isThreeBone(object) && !bones.includes(object)) {
        bones.push(object);
      }
    });
  }
  return bones;
}

function findHierarchyBone(skeleton: THREE.Skeleton | null | undefined, name: string): THREE.Bone | null {
  if (!skeleton || !name || name === 'Scene') return null;
  return collectSkeletonHierarchyBones(skeleton).find((bone) => bone.name === name) ?? null;
}

function hasHierarchyBoneName(skeleton: THREE.Skeleton, name: string): boolean {
  return collectSkeletonHierarchyBones(skeleton).some((bone) => bone.name === name);
}

function rigSpinAxisVector(axis: RigSpinAxis): THREE.Vector3 {
  if (axis === 'x') return new THREE.Vector3(1, 0, 0);
  if (axis === 'y') return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
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
  if (hasHierarchyBoneName(skeleton, nextName)) {
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
    if (object !== root && isThreeBone(object)) {
      branch.push(object);
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

function rewriteSkinnedMeshBoneIndices(
  meshes: readonly THREE.SkinnedMesh[],
  rewrite: (index: number, slotWeight: number) => number,
): void {
  for (const mesh of meshes) {
    const attributes = getSkinAttributes(mesh);
    if (!attributes) continue;
    const vertexCount = Math.min(attributes.skinIndex.count, attributes.skinWeight.count);
    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
      const indices = skinAttributeValues(attributes.skinIndex, vertexIndex).map((value) => Math.max(0, Math.trunc(value)));
      const weights = skinAttributeValues(attributes.skinWeight, vertexIndex);
      const next = indices.map((index, slot) => rewrite(index, weights[slot]));
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
  options: { worldPosition?: THREE.Vector3 } = {},
): RigCreateChildResult {
  const validation = validateCreateChildBone(skeleton, parentName, requestedName);
  if (!validation.ok) return validation;

  const { name, parent } = validation;
  const bone = new THREE.Bone();
  bone.name = name;
  parent.add(bone);
  parent.updateMatrixWorld(true);

  if (options.worldPosition) {
    bone.position.copy(parent.worldToLocal(options.worldPosition.clone()));
  } else {
    bone.position.set(0, 0.25, 0);
  }

  bone.updateMatrix();
  bone.updateMatrixWorld(true);

  skeleton.bones.push(bone);
  skeleton.boneInverses.push(bone.matrixWorld.clone().invert());
  skeleton.init();
  skeleton.update();

  return { ok: true, bone, parent };
}

export function moveBoneToWorldPosition(
  skeleton: THREE.Skeleton | null | undefined,
  boneName: string,
  worldPosition: THREE.Vector3,
): RigMoveResult {
  if (!skeleton || !boneName || boneName === 'Scene') {
    return { ok: false, reason: 'no-selected-bone', message: 'Select a bone before moving.' };
  }
  if (!Number.isFinite(worldPosition.x) || !Number.isFinite(worldPosition.y) || !Number.isFinite(worldPosition.z)) {
    return { ok: false, reason: 'invalid-position', message: 'Cannot move bone to a non-finite position.' };
  }

  const bone = findBone(skeleton, boneName);
  if (!bone) {
    return { ok: false, reason: 'missing-bone', message: `Bone ${boneName} is not in the current skeleton.` };
  }

  const parent = bone.parent;
  if (parent) {
    parent.updateMatrixWorld(true);
    bone.position.copy(parent.worldToLocal(worldPosition.clone()));
  } else {
    bone.position.copy(worldPosition);
  }
  bone.updateMatrix();
  bone.updateMatrixWorld(true);

  skeleton.calculateInverses();
  skeleton.init();
  skeleton.update();

  return { ok: true, bone };
}

export function rotateBoneAroundWorldAxis(
  skeleton: THREE.Skeleton | null | undefined,
  boneName: string,
  worldAxis: THREE.Vector3,
  angleRadians: number,
): RigRotateResult {
  if (!skeleton || !boneName || boneName === 'Scene') {
    return { ok: false, reason: 'no-selected-bone', message: 'Select a bone before rotating.' };
  }
  if (
    !Number.isFinite(worldAxis.x)
    || !Number.isFinite(worldAxis.y)
    || !Number.isFinite(worldAxis.z)
    || worldAxis.lengthSq() <= 1e-12
  ) {
    return { ok: false, reason: 'invalid-axis', message: 'Rig rotate axis must be finite and non-zero.' };
  }
  if (!Number.isFinite(angleRadians)) {
    return { ok: false, reason: 'invalid-angle', message: 'Rig rotate angle must be finite.' };
  }

  const bone = findBone(skeleton, boneName);
  if (!bone) {
    return { ok: false, reason: 'missing-bone', message: `Bone ${boneName} is not in the current skeleton.` };
  }

  bone.updateMatrixWorld(true);
  const boneWorld = bone.matrixWorld.clone();
  const boneOrigin = bone.getWorldPosition(new THREE.Vector3());
  const rotation = new THREE.Matrix4()
    .makeTranslation(boneOrigin.x, boneOrigin.y, boneOrigin.z)
    .multiply(new THREE.Matrix4().makeRotationAxis(worldAxis.clone().normalize(), angleRadians))
    .multiply(new THREE.Matrix4().makeTranslation(-boneOrigin.x, -boneOrigin.y, -boneOrigin.z));
  const nextWorld = rotation.multiply(boneWorld);
  const parentWorld = bone.parent?.matrixWorld ?? new THREE.Matrix4();
  const localMatrix = parentWorld.clone().invert().multiply(nextWorld);
  localMatrix.decompose(bone.position, bone.quaternion, bone.scale);
  bone.updateMatrix();
  bone.updateMatrixWorld(true);

  skeleton.calculateInverses();
  skeleton.init();
  skeleton.update();

  return { ok: true, bone, angleRadians };
}

export function setBoneDetached(
  skeleton: THREE.Skeleton | null | undefined,
  boneName: string,
  detached: boolean,
  skinnedMeshes: readonly THREE.SkinnedMesh[] = [],
): RigDetachResult {
  if (!skeleton || !boneName || boneName === 'Scene') {
    return { ok: false, reason: 'no-selected-bone', message: 'Select a bone before changing detach state.' };
  }

  const bone = findHierarchyBone(skeleton, boneName);
  if (!bone) {
    return { ok: false, reason: 'missing-bone', message: `Bone ${boneName} is not in the current skeleton hierarchy.` };
  }

  const currentIndex = skeleton.bones.indexOf(bone);
  const isCurrentlyAttached = currentIndex >= 0;
  if (detached && !isCurrentlyAttached) {
    return { ok: false, reason: 'already-detached', message: `Bone ${boneName} is already detached.` };
  }
  if (!detached && isCurrentlyAttached) {
    return { ok: false, reason: 'already-attached', message: `Bone ${boneName} is already attached.` };
  }

  if (detached) {
    if (currentIndex <= 0 || !isThreeBone(bone.parent)) {
      return { ok: false, reason: 'root-bone', message: 'Root bones cannot be detached from the deform skeleton.' };
    }

    const attachedChild = bone.children.find((child): child is THREE.Bone => (
      isThreeBone(child) && skeleton.bones.includes(child)
    ));
    const parentBone = bone.parent;
    const parentIndex = skeleton.bones.indexOf(parentBone);
    const replacementIndex = attachedChild
      ? Math.max(0, skeleton.bones.indexOf(attachedChild) - 1)
      : Math.max(0, parentIndex);
    const indexMap = new Map<number, number>();
    skeleton.bones.forEach((candidate, oldIndex) => {
      if (candidate !== bone) {
        indexMap.set(oldIndex, oldIndex > currentIndex ? oldIndex - 1 : oldIndex);
      }
    });

    rewriteSkinnedMeshBoneIndices(skinnedMeshes, (index, weight) => {
      if (index === currentIndex) return Math.abs(weight) > SKIN_WEIGHT_EPSILON ? replacementIndex : 0;
      return indexMap.get(index) ?? index;
    });

    skeleton.bones.splice(currentIndex, 1);
    skeleton.boneInverses.splice(currentIndex, 1);
    bone.userData.rustsmfDetached = true;
    skeleton.init();
    skeleton.update();
    return { ok: true, bone, detached: true, indexMap };
  }

  const hierarchyBones = collectSkeletonHierarchyBones(skeleton);
  const hierarchyIndex = hierarchyBones.indexOf(bone);
  const insertIndex = Math.max(
    0,
    hierarchyBones.slice(0, hierarchyIndex).filter((candidate) => skeleton.bones.includes(candidate)).length,
  );
  const indexMap = new Map<number, number>();
  skeleton.bones.forEach((_, oldIndex) => {
    indexMap.set(oldIndex, oldIndex >= insertIndex ? oldIndex + 1 : oldIndex);
  });

  rewriteSkinnedMeshBoneIndices(skinnedMeshes, (index) => indexMap.get(index) ?? index);
  bone.updateMatrixWorld(true);
  skeleton.bones.splice(insertIndex, 0, bone);
  skeleton.boneInverses.splice(insertIndex, 0, bone.matrixWorld.clone().invert());
  bone.userData.rustsmfDetached = false;
  skeleton.init();
  skeleton.update();
  return { ok: true, bone, detached: false, indexMap };
}

export function spinRig(
  skeleton: THREE.Skeleton | null | undefined,
  axis: RigSpinAxis,
  angleRadians = -Math.PI / 2,
): RigSpinResult {
  if (!skeleton) {
    return { ok: false, reason: 'missing-skeleton', message: 'Load a rig before spinning.' };
  }
  if (axis !== 'x' && axis !== 'y' && axis !== 'z') {
    return { ok: false, reason: 'invalid-axis', message: 'Rig spin axis must be x, y, or z.' };
  }

  const bones = collectSkeletonHierarchyBones(skeleton);
  if (bones.length === 0) {
    return { ok: false, reason: 'empty-skeleton', message: 'Cannot spin an empty rig.' };
  }
  if (!Number.isFinite(angleRadians)) {
    return { ok: false, reason: 'invalid-angle', message: 'Rig spin angle must be finite.' };
  }

  const rotation = new THREE.Matrix4().makeRotationAxis(rigSpinAxisVector(axis), angleRadians);
  bones.forEach((bone) => bone.updateMatrixWorld(true));

  const nextWorld = new Map<THREE.Bone, THREE.Matrix4>();
  for (const bone of bones) {
    nextWorld.set(bone, rotation.clone().multiply(bone.matrixWorld));
  }

  for (const bone of bones) {
    const parent = bone.parent;
    const parentWorld = isThreeBone(parent) && nextWorld.has(parent)
      ? nextWorld.get(parent)!
      : parent?.matrixWorld ?? new THREE.Matrix4();
    const localMatrix = parentWorld.clone().invert().multiply(nextWorld.get(bone)!);
    localMatrix.decompose(bone.position, bone.quaternion, bone.scale);
    bone.updateMatrix();
  }

  bones.forEach((bone) => bone.updateMatrixWorld(true));
  skeleton.calculateInverses();
  skeleton.init();
  skeleton.update();

  return { ok: true, axis, angleRadians, boneCount: bones.length };
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

  if (!isThreeBone(bone.parent) || !skeleton.bones.includes(bone.parent)) {
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
