import * as THREE from 'three';
import { collectSkinnedMeshes } from '../loaders';
import {
  cloneAnimationEditState,
  getClipKey,
  sameAnimationEditState,
  type AnimationEditState,
} from '../utils/animationEdits';
import type { SkinEditState } from '../utils/skinWeights';
import {
  emptyPoseEdit,
  type PoseEditMap,
} from './poseEdits';

export interface PoseBoneSnapshot {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
}

export interface PoseHistorySnapshot {
  selectedBoneName: string;
  poseEdits: PoseEditMap;
  bones: Record<string, PoseBoneSnapshot>;
}

export interface AnimationWorkspaceHistorySnapshot {
  baseClips: THREE.AnimationClip[];
  animationEditState: AnimationEditState;
  currentClipName: string;
  currentTime: number;
}

export interface RigBoneHistorySnapshot {
  bone: THREE.Bone;
  name: string;
  parent: THREE.Object3D | null;
  parentBone: THREE.Bone | null;
  rustsmfDetached: boolean;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
}

export interface RigSkinIndexHistorySnapshot {
  mesh: THREE.SkinnedMesh;
  count: number;
  itemSize: number;
  values: number[];
}

export interface RigHistorySnapshot {
  selectedBoneName: string;
  bones: RigBoneHistorySnapshot[];
  skeletonBones: THREE.Bone[];
  boneInverses: THREE.Matrix4[];
  baseClips: THREE.AnimationClip[];
  animationEditState: AnimationEditState;
  poseEdits: PoseEditMap;
  skinEditState: SkinEditState;
  skinIndices: RigSkinIndexHistorySnapshot[];
}

export type EditorHistorySnapshot =
  | { kind: 'pose'; value: PoseHistorySnapshot }
  | { kind: 'animation'; value: AnimationEditState }
  | { kind: 'animation-workspace'; value: AnimationWorkspaceHistorySnapshot }
  | { kind: 'rig'; value: RigHistorySnapshot };

const SNAPSHOT_EPSILON = 1e-6;

export function sameNumberArray(
  left: readonly number[],
  right: readonly number[],
  epsilon = SNAPSHOT_EPSILON,
): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => Math.abs(value - right[index]) <= epsilon);
}

export function samePoseEditMap(left: PoseEditMap, right: PoseEditMap): boolean {
  const names = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const name of names) {
    const leftEdit = left[name] ?? emptyPoseEdit();
    const rightEdit = right[name] ?? emptyPoseEdit();
    if (
      Math.abs(leftEdit.dx - rightEdit.dx) > SNAPSHOT_EPSILON
      || Math.abs(leftEdit.dy - rightEdit.dy) > SNAPSHOT_EPSILON
      || Math.abs(leftEdit.dRotZ - rightEdit.dRotZ) > SNAPSHOT_EPSILON
      || (leftEdit.dirty ?? false) !== (rightEdit.dirty ?? false)
      || (leftEdit.hasScale ?? false) !== (rightEdit.hasScale ?? false)
    ) {
      return false;
    }
  }
  return true;
}

export function samePoseSnapshot(
  left: PoseHistorySnapshot,
  right: PoseHistorySnapshot,
): boolean {
  if (left.selectedBoneName !== right.selectedBoneName) return false;
  if (!samePoseEditMap(left.poseEdits, right.poseEdits)) return false;

  const names = new Set([...Object.keys(left.bones), ...Object.keys(right.bones)]);
  for (const name of names) {
    const leftBone = left.bones[name];
    const rightBone = right.bones[name];
    if (!leftBone || !rightBone) return false;
    if (
      !sameNumberArray(leftBone.position, rightBone.position)
      || !sameNumberArray(leftBone.quaternion, rightBone.quaternion)
      || !sameNumberArray(leftBone.scale, rightBone.scale)
    ) {
      return false;
    }
  }
  return true;
}

export function samePoseBoneSnapshot(
  left: PoseBoneSnapshot | undefined,
  right: PoseBoneSnapshot | undefined,
): boolean {
  return !!left && !!right
    && sameNumberArray(left.position, right.position)
    && sameNumberArray(left.quaternion, right.quaternion)
    && sameNumberArray(left.scale, right.scale);
}

export function cloneAnimationClips(
  clips: THREE.AnimationClip[],
): THREE.AnimationClip[] {
  return clips.map((clip) => clip.clone());
}

function sameAnimationClip(
  left: THREE.AnimationClip,
  right: THREE.AnimationClip,
  index: number,
): boolean {
  if (getClipKey(left, index) !== getClipKey(right, index)) return false;
  if (Math.abs(left.duration - right.duration) > SNAPSHOT_EPSILON) return false;
  if (left.tracks.length !== right.tracks.length) return false;

  return left.tracks.every((track, trackIndex) => {
    const other = right.tracks[trackIndex];
    return !!other
      && track.name === other.name
      && sameNumberArray(Array.from(track.times), Array.from(other.times))
      && sameNumberArray(Array.from(track.values), Array.from(other.values));
  });
}

export function sameAnimationWorkspaceSnapshot(
  left: AnimationWorkspaceHistorySnapshot,
  right: AnimationWorkspaceHistorySnapshot,
): boolean {
  if (left.currentClipName !== right.currentClipName) return false;
  if (Math.abs(left.currentTime - right.currentTime) > SNAPSHOT_EPSILON) return false;
  if (!sameAnimationEditState(left.animationEditState, right.animationEditState)) return false;
  if (left.baseClips.length !== right.baseClips.length) return false;
  return left.baseClips.every((clip, index) => (
    sameAnimationClip(clip, right.baseClips[index], index)
  ));
}

export function cloneAnimationWorkspaceSnapshot(
  snapshot: AnimationWorkspaceHistorySnapshot,
): AnimationWorkspaceHistorySnapshot {
  return {
    baseClips: cloneAnimationClips(snapshot.baseClips),
    animationEditState: cloneAnimationEditState(snapshot.animationEditState),
    currentClipName: snapshot.currentClipName,
    currentTime: snapshot.currentTime,
  };
}

function getAttributeComponent(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  vertexIndex: number,
  slot: number,
): number {
  if (slot === 0) return attribute.getX(vertexIndex);
  if (slot === 1) return attribute.getY(vertexIndex);
  if (slot === 2) return attribute.getZ(vertexIndex);
  return attribute.getW(vertexIndex);
}

function setAttributeComponent(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  vertexIndex: number,
  slot: number,
  value: number,
): void {
  if (slot === 0) attribute.setX(vertexIndex, value);
  else if (slot === 1) attribute.setY(vertexIndex, value);
  else if (slot === 2) attribute.setZ(vertexIndex, value);
  else attribute.setW(vertexIndex, value);
}

export function captureRigSkinIndexSnapshots(
  root: THREE.Object3D | null,
): RigSkinIndexHistorySnapshot[] {
  if (!root) return [];

  return collectSkinnedMeshes(root).flatMap((mesh) => {
    const attribute = mesh.geometry.getAttribute('skinIndex');
    if (!attribute) return [];

    const itemSize = Math.min(attribute.itemSize, 4);
    const values: number[] = [];
    for (let vertexIndex = 0; vertexIndex < attribute.count; vertexIndex += 1) {
      for (let slot = 0; slot < itemSize; slot += 1) {
        values.push(getAttributeComponent(attribute, vertexIndex, slot));
      }
    }
    return [{ mesh, count: attribute.count, itemSize, values }];
  });
}

export function restoreRigSkinIndexSnapshots(
  snapshots: RigSkinIndexHistorySnapshot[],
): void {
  for (const snapshot of snapshots) {
    const attribute = snapshot.mesh.geometry.getAttribute('skinIndex');
    if (!attribute) continue;

    const count = Math.min(attribute.count, snapshot.count);
    const itemSize = Math.min(attribute.itemSize, snapshot.itemSize, 4);
    for (let vertexIndex = 0; vertexIndex < count; vertexIndex += 1) {
      for (let slot = 0; slot < itemSize; slot += 1) {
        const value = snapshot.values[(vertexIndex * snapshot.itemSize) + slot];
        if (Number.isFinite(value)) {
          setAttributeComponent(attribute, vertexIndex, slot, value);
        }
      }
    }
    attribute.needsUpdate = true;
  }
}

export function setRigSnapshotSelection(
  snapshot: RigHistorySnapshot | null,
  selectedBoneName: string,
): RigHistorySnapshot | null {
  if (snapshot) {
    snapshot.selectedBoneName = selectedBoneName;
    snapshot.skinEditState = {
      ...snapshot.skinEditState,
      selectedBoneName: selectedBoneName && selectedBoneName !== 'Scene' ? selectedBoneName : '',
    };
  }
  return snapshot;
}

export function sameRigBoneTransformSnapshot(
  left: RigHistorySnapshot | null,
  right: RigHistorySnapshot | null,
  boneName: string,
): boolean {
  if (!left || !right || !boneName) return false;
  const leftBone = left.bones.find((bone) => bone.name === boneName);
  const rightBone = right.bones.find((bone) => bone.name === boneName);
  if (!leftBone || !rightBone) return false;
  return sameNumberArray(leftBone.position, rightBone.position)
    && sameNumberArray(leftBone.quaternion, rightBone.quaternion)
    && sameNumberArray(leftBone.scale, rightBone.scale);
}
