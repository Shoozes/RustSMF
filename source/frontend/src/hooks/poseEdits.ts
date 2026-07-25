import * as THREE from 'three';
import type { ImportedSmf } from '../loaders/smf';
import { threeMatrixToSmf, dqCreateFromMatrix, dqNegate } from '../loaders/coord';
import { cloneImportedSmf } from '../loaders/smfData';
import { findBoneByName } from '../utils/bonePicker';

/**
 * Pose-edit layer types and helpers.
 * Tracks live bone nudges (position/rotation deltas) keyed by Three.js bone name.
 * Used by useLoadModel to record edits and apply them at SMF export time.
 */

export interface BoneNudgeDelta {
  x?: number;
  y?: number;
  rotZ?: number;
  reset?: boolean;
}

export interface PoseBoneEdit {
  dx: number;
  dy: number;
  dRotZ: number;
  dirty?: boolean;
  hasScale?: boolean;
}

export type PoseEditMap = Record<string, PoseBoneEdit>;

export function emptyPoseEdit(): PoseBoneEdit {
  return { dx: 0, dy: 0, dRotZ: 0, dirty: false, hasScale: false };
}

export function hasPoseEdits(edits: PoseEditMap): boolean {
  return Object.values(edits).some((edit) => (
    edit.dirty === true
    || edit.dx !== 0
    || edit.dy !== 0
    || edit.dRotZ !== 0
  ));
}

export function hasUnsupportedPoseScaleEdits(edits: PoseEditMap): boolean {
  return Object.values(edits).some((edit) => edit.hasScale === true);
}

export function markPoseBoneEdited(
  current: PoseBoneEdit,
  options: { hasScale?: boolean } = {},
): PoseBoneEdit {
  return {
    ...current,
    dirty: true,
    hasScale: options.hasScale ?? current.hasScale ?? false,
  };
}

export function applyNudgeDelta(current: PoseBoneEdit, delta: BoneNudgeDelta): PoseBoneEdit {
  if (delta.reset) return emptyPoseEdit();
  return {
    dx: current.dx + (delta.x ?? 0),
    dy: current.dy + (delta.y ?? 0),
    dRotZ: current.dRotZ + (delta.rotZ ?? 0),
    dirty: current.dirty ?? false,
    hasScale: current.hasScale ?? false,
  };
}

export function clonePoseEditMap(map: PoseEditMap): PoseEditMap {
  const out: PoseEditMap = {};
  for (const key of Object.keys(map)) {
    out[key] = { ...map[key] };
  }
  return out;
}

// Map a Three.js bone name to its index in the SMF bones array.
// Names now SMF_Node_N (or _head for dummies). Regex tightened for new builder while
// preserving index roundtrip for pose edits + export. Heads not selectable via skel.
export function smfBoneNameToIndex(bones: ImportedSmf['bones'], boneName: string): number {
  const match = /^SMF_Node_(\d+)/.exec(boneName);
  if (!match) return -1;
  const idx = parseInt(match[1], 10);
  if (idx < 0 || idx >= bones.length) return -1;
  return idx;
}

// Apply recorded pose edits to a clone of the ImportedSmf.
// For each edited bone, reads the current Three.js bone matrix, converts to SMF space DQ,
// and stores it using the negated-storage convention matching importSMF.
// Returns a new ImportedSmf; does not mutate the original.
export function applyPoseEditsToSmf(
  smf: ImportedSmf,
  edits: PoseEditMap,
  skeleton: THREE.Skeleton
): ImportedSmf {
  const editedNames = Object.keys(edits).filter(
    name => edits[name].dirty === true || edits[name].dx !== 0 || edits[name].dy !== 0 || edits[name].dRotZ !== 0
  );
  if (editedNames.length === 0) return smf;

  const cloned = cloneImportedSmf(smf);

  for (const boneName of editedNames) {
    const smfIdx = smfBoneNameToIndex(cloned.bones, boneName);
    if (smfIdx < 0) continue;

    const threeBone = findBoneByName(skeleton, boneName);
    if (!threeBone) continue;

    threeBone.updateWorldMatrix(true, false);
    const smfMat = threeMatrixToSmf(threeBone.matrixWorld);
    const rawDq = dqCreateFromMatrix(smfMat);
    cloned.bones[smfIdx].dq = dqNegate(rawDq);
  }

  return cloned;
}
