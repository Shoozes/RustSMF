import * as THREE from 'three';
import { createTrackInterpolant, trackSampleSize } from './animationTrackInterpolation';

export type ScaleAxis = 'x' | 'y' | 'z';

export interface BoneScaleTransfer {
  sourceBone: string;
  targetBone: string;
  /** Source local scale component used for each target local axis. */
  axes: [ScaleAxis, ScaleAxis, ScaleAxis];
  /** Fraction of each source scale delta retained on the target. */
  strength: [number, number, number];
}

export function parseClipScaleTransfer(value: unknown): Record<string, BoneScaleTransfer[]> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('clipScaleTransfer must be an object.');
  const clips = Object.entries(value);
  if (clips.length > 128) throw new Error('clipScaleTransfer exceeds 128 clips.');
  const result: Record<string, BoneScaleTransfer[]> = {};
  for (const [clip, raw] of clips) {
    if (!clip.trim() || ['__proto__', 'prototype', 'constructor'].includes(clip)
      || !Array.isArray(raw) || raw.length === 0 || raw.length > 16) {
      throw new Error(`clipScaleTransfer.${clip} requires 1–16 bone transfers.`);
    }
    const targets = new Set<string>();
    result[clip] = raw.map((entry: unknown, index: number) => {
      const label = `clipScaleTransfer.${clip}[${index}]`;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${label} must be an object.`);
      const spec = entry as Record<string, unknown>;
      if (Object.keys(spec).some(key => !['sourceBone', 'targetBone', 'axes', 'strength'].includes(key))) {
        throw new Error(`${label} has unknown fields.`);
      }
      if (typeof spec.sourceBone !== 'string' || !spec.sourceBone.trim()
        || typeof spec.targetBone !== 'string' || !spec.targetBone.trim()) throw new Error(`${label} requires sourceBone and targetBone.`);
      if (targets.has(spec.targetBone)) throw new Error(`${label} repeats target bone ${spec.targetBone}.`);
      targets.add(spec.targetBone);
      if (!Array.isArray(spec.axes) || spec.axes.length !== 3
        || spec.axes.some(axis => !['x', 'y', 'z'].includes(axis))) throw new Error(`${label}.axes must name three source axes.`);
      if (!Array.isArray(spec.strength) || spec.strength.length !== 3
        || spec.strength.some(amount => typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 1)) {
        throw new Error(`${label}.strength must contain three finite amounts from 0 to 1.`);
      }
      return {
        sourceBone: spec.sourceBone,
        targetBone: spec.targetBone,
        axes: [...spec.axes] as BoneScaleTransfer['axes'],
        strength: [...spec.strength] as BoneScaleTransfer['strength'],
      };
    });
  }
  return result;
}

function scaleTrack(clip: THREE.AnimationClip, bone: string): THREE.KeyframeTrack | undefined {
  const matches = clip.tracks.filter(track => track.name === `${bone}.scale`);
  if (matches.length > 1) throw new Error(`Ambiguous scale tracks for ${bone} in ${clip.name}.`);
  return matches[0];
}

export function applyTargetReferenceScales(
  clip: THREE.AnimationClip,
  target: THREE.Skeleton,
  targetBoneNames: ReadonlySet<string>,
): void {
  const bones = new Map(target.bones.map(bone => [bone.name, bone]));
  for (const name of targetBoneNames) {
    const track = scaleTrack(clip, name);
    if (!track) continue;
    if (trackSampleSize(track) !== 3) throw new Error(`Target reference clip has an invalid scale track for ${name}.`);
    const bone = bones.get(name);
    if (!bone) throw new Error(`Target reference scale bone ${name} is missing.`);
    bone.scale.fromArray(createTrackInterpolant(track).evaluate(0));
  }
}

export function prepareScaleTransfer(
  clip: THREE.AnimationClip,
  source: THREE.Skeleton,
  target: THREE.Skeleton,
  mappedSources: ReadonlySet<string>,
  specs: readonly BoneScaleTransfer[],
  sourceReferenceClip: THREE.AnimationClip | undefined,
  targetReferenceScales: ReadonlyMap<string, THREE.Vector3>,
): { tracks: THREE.KeyframeTrack[]; sample: (sourceTimes: readonly number[], outputTimes: readonly number[]) => THREE.VectorKeyframeTrack[] } {
  const sourceBones = new Map(source.bones.map(bone => [bone.name, bone]));
  const targetBones = new Set(target.bones.map(bone => bone.name));
  const prepared = specs.map(spec => {
    const sourceBone = sourceBones.get(spec.sourceBone);
    const targetScale = targetReferenceScales.get(spec.targetBone);
    if (!sourceBone || !mappedSources.has(spec.sourceBone) || !targetBones.has(spec.targetBone) || !targetScale) {
      throw new Error(`Scale transfer requires mapped source ${spec.sourceBone} and target bone ${spec.targetBone}.`);
    }
    const track = scaleTrack(clip, spec.sourceBone);
    if (!track || trackSampleSize(track) !== 3) throw new Error(`Scale transfer source ${spec.sourceBone} has no vector scale track in ${clip.name}.`);
    const referenceTrack = sourceReferenceClip && scaleTrack(sourceReferenceClip, spec.sourceBone);
    const neutral = referenceTrack
      ? Array.from(createTrackInterpolant(referenceTrack).evaluate(0) as ArrayLike<number>)
      : sourceBone.scale.toArray();
    if ([...neutral, ...targetScale.toArray()].some(value => !Number.isFinite(value) || value <= 0)) {
      throw new Error(`Scale transfer ${spec.sourceBone} has a non-positive reference scale.`);
    }
    return { spec, track, interpolant: createTrackInterpolant(track), neutral, targetScale: targetScale.toArray() };
  });
  return {
    tracks: prepared.map(item => item.track),
    sample: (sourceTimes, outputTimes) => prepared.map(({ spec, interpolant, neutral, targetScale }) => {
      if (sourceTimes.length !== outputTimes.length) throw new Error('Scale transfer time schedules differ.');
      const values: number[] = [];
      for (const time of sourceTimes) {
        const sample = interpolant.evaluate(time) as ArrayLike<number>;
        for (let axis = 0; axis < 3; axis++) {
          const sourceAxis = 'xyz'.indexOf(spec.axes[axis]);
          const ratio = sample[sourceAxis] / neutral[sourceAxis];
          if (!Number.isFinite(ratio) || ratio < 0.25 || ratio > 4) {
            throw new Error(`Scale transfer ${spec.sourceBone} exceeds safe source ratio 0.25–4.`);
          }
          values.push(targetScale[axis] * (1 + spec.strength[axis] * (ratio - 1)));
        }
      }
      return new THREE.VectorKeyframeTrack(`${spec.targetBone}.scale`, outputTimes, values);
    }),
  };
}
