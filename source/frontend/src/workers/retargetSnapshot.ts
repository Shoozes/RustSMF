import * as THREE from 'three';
import type { SkeletonSnapshotV1, AnalysisClipV1 } from './retargetAnalysisTypes';
import type { AnimationRetargetOptions } from '../utils/animationRetarget';
import { trackInterpolation, restoreTrackInterpolation, type TrackInterpolation } from '../utils/animationTrackInterpolation';

export interface ClipSnapshot {
  name: string;
  duration: number;
  blendMode: THREE.AnimationBlendMode;
  tracks: Array<{ name: string; type: string; interpolation: TrackInterpolation;
    times: Float32Array; values: Float32Array | string[] | boolean[] }>;
}
export type BakeOptions = Omit<AnimationRetargetOptions, 'sourceReferenceClip' | 'targetReferenceClip' | 'endpointTargetClips'> & {
  sourceReferenceClip?: ClipSnapshot; targetReferenceClip?: ClipSnapshot; endpointTargetClips?: ClipSnapshot[];
};

const ownedRest = new WeakMap<THREE.Skeleton, Map<THREE.Object3D, THREE.Matrix4>>();
export const MAX_TRANSFER_BONES = 512;
export function assertTransferBoneCount(count: number): void {
  if (!Number.isInteger(count) || count < 1 || count > MAX_TRANSFER_BONES) {
    throw new Error(`Transfer supports 1–${MAX_TRANSFER_BONES} bones; this rig has ${count}.`);
  }
}

/** Capture authored local rest transforms before playback, including helper ancestry. */
export function rememberRetargetRest(skeleton: THREE.Skeleton): void {
  const helpers = new Map<THREE.Object3D, THREE.Matrix4>();
  for (const bone of skeleton.bones) {
    for (let node: THREE.Object3D | null = bone; node && node.type !== 'Scene'; node = node.parent) {
      if (helpers.has(node)) continue;
      node.updateMatrix(); helpers.set(node, node.matrix.clone());
    }
  }
  ownedRest.set(skeleton, helpers);
}

/** Copy the complete helper ancestry; never pose or detach the live editor skeleton. */
export function snapshotSkeleton(skeleton: THREE.Skeleton, rest:'bind'|'current'='bind'): SkeletonSnapshotV1 {
  assertTransferBoneCount(skeleton.bones.length);
  const nodes: THREE.Object3D[] = [], indices = new Map<THREE.Object3D, number>();
  const add = (node: THREE.Object3D): number => {
    const prior = indices.get(node); if (prior !== undefined) return prior;
    if (node.parent && node.parent.type !== 'Scene') add(node.parent);
    const index = nodes.length; if (index >= 4096) throw new Error('Transfer helper hierarchy exceeds 4096 nodes.');
    indices.set(node, index); nodes.push(node); return index;
  };
  const bones = skeleton.bones.map(add);
  const worlds: THREE.Matrix4[] = [];
  const saved = ownedRest.get(skeleton);
  return { bones, nodes: nodes.map(node => {
    const parent = node.parent ? indices.get(node.parent) ?? null : null;
    const parentWorld = parent === null ? new THREE.Matrix4() : worlds[parent];
    const local = (rest==='bind' ? saved?.get(node)?.clone() : undefined)
      ?? new THREE.Matrix4().compose(node.position, node.quaternion, node.scale);
    const world = parentWorld.clone().multiply(local); worlds.push(world);
    const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
    local.decompose(position, quaternion, scale);
    const worldPosition = new THREE.Vector3(), worldQuaternion = new THREE.Quaternion();
    world.decompose(worldPosition, worldQuaternion, new THREE.Vector3());
    return { id: node.uuid, name: node.name, parent, isBone: node instanceof THREE.Bone,
      position: position.toArray(), quaternion: quaternion.toArray(), scale: scale.toArray(),
      worldPosition: worldPosition.toArray(), worldQuaternion: worldQuaternion.toArray() };
  }) };
}

export function restoreSkeleton(snapshot: SkeletonSnapshotV1): THREE.Skeleton {
  assertTransferBoneCount(snapshot.bones.length);
  if (snapshot.nodes.length > 4096) throw new Error('Transfer skeleton exceeds 4096 nodes.');
  const nodes = snapshot.nodes.map(item => {
    const node = item.isBone ? new THREE.Bone() : new THREE.Group();
    if (item.id) node.uuid = item.id;
    node.name = item.name; node.position.fromArray(item.position); node.quaternion.fromArray(item.quaternion); node.scale.fromArray(item.scale);
    return node;
  });
  snapshot.nodes.forEach((item, i) => {
    if (item.parent !== null) {
      if (item.parent < 0 || item.parent >= i) throw new Error('Transfer hierarchy must be ordered and acyclic.');
      nodes[item.parent].add(nodes[i]);
    }
  });
  nodes.filter(node => !node.parent).forEach(node => node.updateMatrixWorld(true));
  return new THREE.Skeleton(snapshot.bones.map(i => {
    if (!(nodes[i] instanceof THREE.Bone)) throw new Error('Transfer bone index is invalid.');
    return nodes[i] as THREE.Bone;
  }));
}

export function snapshotClip(clip: THREE.AnimationClip): ClipSnapshot {
  if (clip.tracks.length > 32768) throw new Error('Transfer clip exceeds 32768 tracks.');
  let size = 0;
  return { name: clip.name, duration: clip.duration, blendMode: clip.blendMode, tracks: clip.tracks.map(track => {
    size += track.times.length + track.values.length;
    if (size > 16_000_000) throw new Error('Transfer clip exceeds 16 million values.');
    return { name: track.name, type: track.ValueTypeName, interpolation: trackInterpolation(track),
      times: new Float32Array(track.times), values: Array.isArray(track.values) ? [...track.values] : new Float32Array(track.values) };
  }) };
}
export function restoreClip(clip: ClipSnapshot): THREE.AnimationClip {
  const constructors: Record<string, typeof THREE.KeyframeTrack> = {
    quaternion: THREE.QuaternionKeyframeTrack, vector: THREE.VectorKeyframeTrack, number: THREE.NumberKeyframeTrack,
    color: THREE.ColorKeyframeTrack, bool: THREE.BooleanKeyframeTrack, string: THREE.StringKeyframeTrack,
  };
  return new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.map(track => {
    const Track = constructors[track.type]; if (!Track) throw new Error(`Unsupported transfer track type ${track.type}.`);
    const restored = new Track(track.name, track.times, track.values,
      track.interpolation === 'gltf-cubic-spline' ? THREE.InterpolateLinear : track.interpolation);
    restoreTrackInterpolation(restored, track.interpolation);
    return restored;
  }), clip.blendMode);
}
export function clipMetadata(clip: THREE.AnimationClip): AnalysisClipV1 {
  return { name: clip.name, duration: clip.duration, tracks: clip.tracks.map(track => {
    try { const parsed = THREE.PropertyBinding.parseTrackName(track.name); return {name: track.name,
      bone: parsed.objectName === 'bones' ? parsed.objectIndex ?? null : parsed.nodeName ?? null, property: parsed.propertyName}; }
    catch { return { name: track.name, bone: null, property: null }; }
  }) };
}
export function snapshotOptions(options: AnimationRetargetOptions): BakeOptions {
  const { sourceReferenceClip, targetReferenceClip, endpointTargetClips, ...plain } = options;
  return { ...structuredClone(plain), ...(sourceReferenceClip ? {sourceReferenceClip: snapshotClip(sourceReferenceClip)} : {}),
    ...(targetReferenceClip ? {targetReferenceClip: snapshotClip(targetReferenceClip)} : {}),
    ...(endpointTargetClips ? {endpointTargetClips: endpointTargetClips.map(snapshotClip)} : {}) };
}
export function restoreOptions(options: BakeOptions): AnimationRetargetOptions {
  const { sourceReferenceClip, targetReferenceClip, endpointTargetClips, ...plain } = options;
  return { ...plain, ...(sourceReferenceClip ? {sourceReferenceClip: restoreClip(sourceReferenceClip)} : {}),
    ...(targetReferenceClip ? {targetReferenceClip: restoreClip(targetReferenceClip)} : {}),
    ...(endpointTargetClips ? {endpointTargetClips: endpointTargetClips.map(restoreClip)} : {}) };
}

export function clipTransferables(clips: ClipSnapshot[]): Transferable[] {
  return [...new Set(clips.flatMap(clip => clip.tracks.flatMap(track => [track.times.buffer,
    ...(ArrayBuffer.isView(track.values) ? [track.values.buffer] : [])])))];
}
