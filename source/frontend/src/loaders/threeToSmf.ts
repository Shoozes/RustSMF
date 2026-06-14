import * as THREE from 'three';
import type { ImportedSmf } from './smf';
import { threeVecToSmf, threeMatrixToSmf, dqCreateFromMatrix, dqNegate } from './coord';

/**
 * Converts Three.js skinned scene data to an ImportedSmf structure for SMF export.
 * Core of the SMF export path for non-SMF sources (GLB/FBX loaded models).
 * Guards against unsupported cases (no skeleton, scale animation, static roots).
 *
 * Coordinate transform: Three.js (Y-up RH) -> SMF (Z-up LH) via coord helpers.
 * DQ storage convention matches importSMF (negated on read, negated on store).
 */

export class SmfConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmfConversionError';
  }
}

export interface SmfConversionSource {
  skeleton: THREE.Skeleton;
  skinnedMeshes?: THREE.SkinnedMesh[];
  clips?: THREE.AnimationClip[];
}

// Convert a Three.js bone's current local matrix to SMF-space DQ (negated storage convention).
function boneLocalToDq(bone: THREE.Bone): Float32Array {
  bone.updateMatrix();
  const smfMat = threeMatrixToSmf(bone.matrix);
  const raw = dqCreateFromMatrix(smfMat);
  return dqNegate(raw);
}

// Linear-interpolate a single component from a flat keyframe track at time t.
function sampleTrackComponent(
  values: ArrayLike<number>,
  times: ArrayLike<number>,
  t: number,
  stride: number,
  component: number
): number {
  const n = times.length;
  if (n === 0) return 0;
  if (t <= times[0]) return values[component];
  if (t >= times[n - 1]) return values[(n - 1) * stride + component];
  let i = 0;
  while (i < n - 1 && times[i + 1] < t) i++;
  const alpha = (t - times[i]) / (times[i + 1] - times[i]);
  return values[i * stride + component] * (1 - alpha) + values[(i + 1) * stride + component] * alpha;
}

export function buildImportedSmfFromThree(src: SmfConversionSource): ImportedSmf {
  const { skeleton, skinnedMeshes = [], clips = [] } = src;

  if (!skeleton || skeleton.bones.length === 0) {
    throw new SmfConversionError(
      'SMF conversion requires a skinned skeleton; static roots without bones should use GLB export'
    );
  }

  // Reject scale animation (SMF DQ path has no scale channel)
  for (const clip of clips) {
    for (const track of clip.tracks) {
      if (/\.scale(\.|$)/.test(track.name)) {
        throw new SmfConversionError(
          `Clip "${clip.name}" has scale track "${track.name}"; SMF export does not support scale animation`
        );
      }
    }
  }

  // Build SMF bones from skeleton using current local transforms
  const bones: ImportedSmf['bones'] = skeleton.bones.map((b, i) => {
    const parentBone = b.parent instanceof THREE.Bone ? b.parent : null;
    const parentIdx = parentBone ? skeleton.bones.indexOf(parentBone) : -1;
    return {
      index: i,
      parent: parentIdx,
      isBone: 1,
      dq: boneLocalToDq(b),
      axis: [0, 1, 0],
    };
  });

  // Build mesh data from first skinned mesh
  const meshes: ImportedSmf['meshes'] = [];
  const mesh = skinnedMeshes[0];
  if (mesh) {
    const geo = mesh.geometry;
    const posArr = (geo.attributes.position?.array as Float32Array) ?? new Float32Array(0);
    const norArr = (geo.attributes.normal?.array as Float32Array) ?? new Float32Array(0);
    const uvArr = (geo.attributes.uv?.array as Float32Array) ?? new Float32Array(0);
    const tanArr = (geo.attributes.tangent?.array as Float32Array) ?? new Float32Array(0);
    const skinIdxArr = (geo.attributes.skinIndex?.array as Uint16Array) ?? new Uint16Array(0);
    const skinWArr = (geo.attributes.skinWeight?.array as Float32Array) ?? new Float32Array(0);
    const verts = posArr.length / 3;

    const smfPos = new Float32Array(posArr.length);
    const smfNor = new Float32Array(norArr.length);
    for (let v = 0; v < verts; v++) {
      const sp = threeVecToSmf(new THREE.Vector3(posArr[v * 3], posArr[v * 3 + 1], posArr[v * 3 + 2]));
      smfPos[v * 3] = sp[0]; smfPos[v * 3 + 1] = sp[1]; smfPos[v * 3 + 2] = sp[2];
      if (norArr.length > 0) {
        const sn = threeVecToSmf(new THREE.Vector3(norArr[v * 3], norArr[v * 3 + 1], norArr[v * 3 + 2]));
        smfNor[v * 3] = sn[0]; smfNor[v * 3 + 1] = sn[1]; smfNor[v * 3 + 2] = sn[2];
      }
    }

    const triangles: number[][] = [];
    if (geo.index) {
      const idx = geo.index.array;
      for (let i = 0; i < idx.length; i += 3) triangles.push([idx[i], idx[i + 1], idx[i + 2]]);
    } else {
      for (let i = 0; i < verts; i += 3) triangles.push([i, i + 1, i + 2]);
    }

    meshes.push({
      name: mesh.name || 'Mesh_0',
      verts,
      triangles,
      texIdx: -1,
      positions: smfPos,
      normals: smfNor,
      uvs: uvArr,
      tangents: tanArr,
      skinIndices: skinIdxArr,
      skinWeights: skinWArr,
      visible: mesh.visible ? 1 : 0,
    });
  }

  // Build animations from clip track data (no mixer, direct track interpolation)
  const animations: ImportedSmf['animations'] = clips.map((clip, ci) => {
    // Collect all unique keyframe times across all tracks
    const timeSet = new Set<number>();
    for (const track of clip.tracks) {
      for (let i = 0; i < track.times.length; i++) timeSet.add(track.times[i]);
    }
    const times = Array.from(timeSet).sort((a, b) => a - b);
    if (times.length === 0) times.push(0);

    // Build per-bone position and quaternion track lookups
    const boneQuatTimes = new Map<string, ArrayLike<number>>();
    const boneQuatValues = new Map<string, ArrayLike<number>>();
    const bonePosTime = new Map<string, ArrayLike<number>>();
    const bonePosValues = new Map<string, ArrayLike<number>>();

    for (const track of clip.tracks) {
      const dot = track.name.lastIndexOf('.');
      const boneName = track.name.slice(0, dot);
      const prop = track.name.slice(dot + 1);
      if (prop === 'quaternion') {
        boneQuatTimes.set(boneName, track.times);
        boneQuatValues.set(boneName, track.values);
      } else if (prop === 'position') {
        bonePosTime.set(boneName, track.times);
        bonePosValues.set(boneName, track.values);
      }
    }

    const frames: Float32Array[][] = times.map(t =>
      skeleton.bones.map(bone => {
        const qtimes = boneQuatTimes.get(bone.name);
        const qvals = boneQuatValues.get(bone.name);
        const ptimes = bonePosTime.get(bone.name);
        const pvals = bonePosValues.get(bone.name);

        const qx = qtimes ? sampleTrackComponent(qvals!, qtimes, t, 4, 0) : bone.quaternion.x;
        const qy = qtimes ? sampleTrackComponent(qvals!, qtimes, t, 4, 1) : bone.quaternion.y;
        const qz = qtimes ? sampleTrackComponent(qvals!, qtimes, t, 4, 2) : bone.quaternion.z;
        const qw = qtimes ? sampleTrackComponent(qvals!, qtimes, t, 4, 3) : bone.quaternion.w;
        const px = ptimes ? sampleTrackComponent(pvals!, ptimes, t, 3, 0) : bone.position.x;
        const py = ptimes ? sampleTrackComponent(pvals!, ptimes, t, 3, 1) : bone.position.y;
        const pz = ptimes ? sampleTrackComponent(pvals!, ptimes, t, 3, 2) : bone.position.z;

        const tmp = new THREE.Bone();
        tmp.position.set(px, py, pz);
        tmp.quaternion.set(qx, qy, qz, qw);
        return boneLocalToDq(tmp);
      })
    );

    return {
      name: clip.name || `Anim_${ci}`,
      duration: clip.duration,
      times,
      frames,
      nodeCount: skeleton.bones.length,
      loop: 1,
      interpolation: 1,
      sampleFrameMultiplier: 1,
      lockedBones: [],
    };
  });

  return { meshes, textures: [], bones, animations };
}
