import * as THREE from 'three';
import type { SkeletonSnapshotV1, AnalysisResultV1 } from './retargetAnalysisTypes';
import type { AnimationRetargetReport } from '../utils/animationRetarget';
import type { BakeInput } from './retargetProtocol';
import type { ClipSnapshot } from './retargetSnapshot';
export interface PortableTrackV1 {
  name?: string;
  boneChannel?: boolean;
  node: number;
  property: 'position' | 'quaternion' | 'scale';
  interpolation: 'step' | 'linear' | 'smooth' | 'gltf-cubic-spline';
  times: number[];
  values: number[];
}
export interface PortableClipV1 { name: string; duration: number; blendMode: number; tracks: PortableTrackV1[] }
export interface PortableClipJobV1 {
  clip: PortableClipV1;
  options: Record<string, unknown>;
  sourceReferenceClip: PortableClipV1 | null;
  targetReferenceClip: PortableClipV1 | null;
  endpointTargetClips: PortableClipV1[];
}
/** Internal API v1 wire format, separate from public project/profile/job formats. */
export interface PortableBakeRequestV1 {
  apiVersion: 1;
  operation: 'sample' | 'bake';
  source: SkeletonSnapshotV1;
  target: SkeletonSnapshotV1;
  mapping: Record<string, string>;
  mappingDetails?: AnalysisResultV1['mapping'];
  clips: PortableClipJobV1[];
  sampleTimes: number[];
}
export interface PortableBakeResponseV1 {
  apiVersion: 1;
  stage: 'core-bake';
  capabilities: ['core-bake-v1'];
  status: 'baked' | 'error';
  error?: { code: string; path: string; message: string };
  clips: Array<{ clip: PortableClipV1; report: Omit<AnimationRetargetReport,
    'forearmTwist' | 'endpointEnvelope' | 'jointConstraints' | 'targetChainCurls' | 'naturalMotion' | 'poseRanges' | 'localReferenceCorrections' | 'poseRecovery'> }>;
}
export interface PortableAdvancedBakeResponseV1 extends Omit<PortableBakeResponseV1, 'stage' | 'capabilities' | 'clips'> {
  stage: 'advanced-bake';
  capabilities: ['core-bake-v1', 'advanced-bake-v1'];
  clips: Array<{clip: PortableClipV1; report: AnimationRetargetReport}>;
}
export interface PortablePoseV1 {
  local: Array<{ position: number[]; quaternion: number[]; scale: number[] }>;
  worldMatrices: number[][];
}
export interface PortableSampleResponseV1 {
  apiVersion: 1;
  stage: 'sampler';
  capabilities: ['sample-trs-v1'];
  status: 'sampled' | 'error';
  error?: { code: string; path: string; message: string };
  targetRest?: PortablePoseV1;
  clips: Array<{ job: number; role: string; name: string; samples: Array<{ time: number; pose: PortablePoseV1 }> }>;
}
export function portableBakeRequest(input: BakeInput, sampleTimes: readonly number[], operation: 'sample' | 'bake' = 'sample'): PortableBakeRequestV1 {
  if (!input.clips.length || input.clips.length > 256 || !sampleTimes.length || sampleTimes.length > 20_000
    || sampleTimes.some(time => !Number.isFinite(time) || Math.abs(time) > 1e9)) throw new Error('Invalid portable clip/sample count or time.');
  for (const skeleton of [input.source, input.target]) {
    if (!skeleton.nodes.length || skeleton.nodes.length > 4096 || !skeleton.bones.length || skeleton.bones.length > 2048
      || new Set(skeleton.nodes.map(node => node.name)).size !== skeleton.nodes.length) throw new Error('Portable skeleton requires bounded, uniquely named nodes.');
  }
  let values = 0;
  const copyClip = (clip: ClipSnapshot, skeleton: SkeletonSnapshotV1): PortableClipV1 => {
    if (clip.tracks.length > 32768) throw new Error('Portable clip exceeds 32768 tracks.');
    return { name: clip.name, duration: clip.duration, blendMode: clip.blendMode, tracks: clip.tracks.map(track => {
      values += track.times.length + track.values.length;
      if (values > 16_000_000) throw new Error('Portable input exceeds 16 million values.');
      const binding = THREE.PropertyBinding.parseTrackName(track.name);
      if (binding.objectName && binding.objectName !== 'bones' || binding.propertyIndex !== undefined) throw new Error(`Unsupported portable track binding ${track.name}.`);
      const name = binding.objectName === 'bones' ? binding.objectIndex : binding.nodeName;
      const node = skeleton.nodes.findIndex(candidate => candidate.name === name);
      const property = binding.propertyName;
      if (node < 0 || !['position', 'quaternion', 'scale'].includes(property)
        || track.type !== (property === 'quaternion' ? 'quaternion' : 'vector') || !(track.values instanceof Float32Array)) throw new Error(`Unsupported portable transform track ${track.name}.`);
      const interpolation = track.interpolation === 'gltf-cubic-spline' ? track.interpolation
        : ({ [THREE.InterpolateDiscrete]: 'step', [THREE.InterpolateLinear]: 'linear', [THREE.InterpolateSmooth]: 'smooth' } as const)[track.interpolation];
      if (!interpolation || property === 'quaternion' && interpolation === 'smooth') throw new Error(`Unsupported portable interpolation on ${track.name}.`);
      return { ...(operation === 'bake' ? { name: track.name, boneChannel: binding.nodeName === name } : {}), node, property: property as PortableTrackV1['property'], interpolation, times: Array.from(track.times), values: Array.from(track.values) };
    }) };
  };
  const clips = input.clips.map(({ clip, options }) => {
    const { sourceReferenceClip, targetReferenceClip, endpointTargetClips, ...plain } = options;
    if ((endpointTargetClips?.length ?? 0) > 256) throw new Error('Portable endpoint clip count exceeds 256.');
    return { clip: copyClip(clip, input.source), options: structuredClone(Object.fromEntries(Object.entries(plain).filter(([, value]) => value !== undefined))),
      sourceReferenceClip: sourceReferenceClip ? copyClip(sourceReferenceClip, input.source) : null,
      targetReferenceClip: targetReferenceClip ? copyClip(targetReferenceClip, input.target) : null,
      endpointTargetClips: (endpointTargetClips ?? []).map(value => copyClip(value, input.target)) };
  });
  const result: PortableBakeRequestV1 = { apiVersion: 1, operation, source: structuredClone(input.source), target: structuredClone(input.target), mapping: { ...input.mapping.map }, clips, sampleTimes: [...sampleTimes] };
  if (operation === 'bake') result.mappingDetails = structuredClone(input.mapping);
  const text = JSON.stringify(result, (_key, value: unknown) => {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Portable input must contain finite numbers.');
    return value;
  });
  if (new TextEncoder().encode(text).byteLength > 16 * 1024 * 1024) throw new Error('Portable JSON exceeds 16 MiB.');
  return result;
}
