import * as THREE from 'three';
import type { ImportedSmf } from '../loaders/smf';
import { threeMatrixToSmf, dqCreateFromMatrix, dqNegate } from '../loaders/coord';
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
}

export type PoseEditMap = Record<string, PoseBoneEdit>;

export function emptyPoseEdit(): PoseBoneEdit {
  return { dx: 0, dy: 0, dRotZ: 0 };
}

export function applyNudgeDelta(current: PoseBoneEdit, delta: BoneNudgeDelta): PoseBoneEdit {
  if (delta.reset) return emptyPoseEdit();
  return {
    dx: current.dx + (delta.x ?? 0),
    dy: current.dy + (delta.y ?? 0),
    dRotZ: current.dRotZ + (delta.rotZ ?? 0),
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
// SMF bones built by buildThreeScene are named "Bone_N" where N is the index.
// Returns -1 if the name does not match or is out of range.
export function smfBoneNameToIndex(bones: ImportedSmf['bones'], boneName: string): number {
  const match = /^Bone_(\d+)$/.exec(boneName);
  if (!match) return -1;
  const idx = parseInt(match[1], 10);
  if (idx < 0 || idx >= bones.length) return -1;
  return idx;
}

// Deep clone of ImportedSmf for safe mutation before export.
// Copies all typed arrays by value so the original is not modified.
export function cloneImportedSmf(smf: ImportedSmf): ImportedSmf {
  return {
    meshes: smf.meshes.map(m => ({
      ...m,
      positions: new Float32Array(m.positions),
      normals: new Float32Array(m.normals),
      uvs: new Float32Array(m.uvs),
      tangents: new Float32Array(m.tangents),
      skinIndices: new Uint16Array(m.skinIndices),
      skinWeights: new Float32Array(m.skinWeights),
      triangles: m.triangles.map(t => [...t]),
    })),
    textures: smf.textures.map(t => ({ ...t })),
    bones: smf.bones.map(b => ({
      ...b,
      dq: new Float32Array(b.dq),
      axis: [...b.axis],
    })),
    animations: smf.animations.map(a => ({
      ...a,
      times: [...a.times],
      frames: a.frames.map(frame => frame.map(dq => new Float32Array(dq))),
      lockedBones: [...a.lockedBones],
    })),
  };
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
    name => edits[name].dx !== 0 || edits[name].dy !== 0 || edits[name].dRotZ !== 0
  );
  if (editedNames.length === 0) return smf;

  const cloned = cloneImportedSmf(smf);

  for (const boneName of editedNames) {
    const smfIdx = smfBoneNameToIndex(cloned.bones, boneName);
    if (smfIdx < 0) continue;

    const threeBone = findBoneByName(skeleton, boneName);
    if (!threeBone) continue;

    threeBone.updateMatrix();
    const smfMat = threeMatrixToSmf(threeBone.matrix);
    const rawDq = dqCreateFromMatrix(smfMat);
    cloned.bones[smfIdx].dq = dqNegate(rawDq);
  }

  return cloned;
}
