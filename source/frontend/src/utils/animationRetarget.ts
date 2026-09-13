import * as THREE from 'three';
import type { RigMapDecision, RigMapResult } from './rigMapping';

const MAX_RETARGET_SAMPLES = 20_000;
const TIME_EPSILON = 1e-6;

export interface PoseRecoveryEnvelope {
  peakFrame: number;
  holdThroughFrame: number;
  returnByFrame: number;
}

export type DirectionTransferMode = 'relative' | 'absolute';

export interface AnimationRetargetOptions {
  clipName?: string;
  applyUpCorrection?: boolean;
  scaleRootMotion?: boolean;
  sampleRateHz?: number;
  interpolation?: 'linear' | 'step';
  nextDownRationalTimes?: boolean;
  alignMappedBoneDirections?: boolean;
  directionTransferMode?: DirectionTransferMode;
  directionTransferBones?: string[];
  sourceReferencePose?: 'rest' | 'first-frame' | 'clip';
  sourceReferenceClip?: THREE.AnimationClip;
  targetReferenceClip?: THREE.AnimationClip;
  preserveTargetLeafRotations?: boolean;
  preserveTargetRotations?: string[];
  poseRecovery?: PoseRecoveryEnvelope;
}

export interface AnimationRetargetReport {
  sourceClip: string;
  targetClip: string;
  duration: number;
  sampleCount: number;
  quaternionTrackCount: number;
  positionTrackCount: number;
  discardedTracks: string[];
  hierarchyOnlyTracks: string[];
  mappedBones: RigMapDecision[];
  rootMotionScale: number;
  upCorrection: [number, number, number, number];
  orientationCorrection: [number, number, number, number];
  sampleRateHz: number | null;
  interpolation: 'linear' | 'step';
  nextDownRationalTimes: boolean;
  directionAlignedBones: string[];
  directionTransferMode: DirectionTransferMode;
  directionTransferBones: string[] | null;
  sourceReferencePose: 'rest' | 'first-frame' | 'clip';
  sourceReferenceClip: string | null;
  targetReferenceClip: string | null;
  preservedTargetLeafRotations: string[];
  preservedTargetRotations: string[];
  poseRecovery: PoseRecoveryEnvelope | null;
}

export interface RetargetedAnimation {
  clip: THREE.AnimationClip;
  report: AnimationRetargetReport;
}

interface BoneRestState {
  bone: THREE.Bone;
  parentBone: THREE.Bone | null;
  localPosition: THREE.Vector3;
  localQuaternion: THREE.Quaternion;
  localScale: THREE.Vector3;
  worldPosition: THREE.Vector3;
  worldQuaternion: THREE.Quaternion;
  parentWorldMatrix: THREE.Matrix4;
}

interface SampledTrack {
  track: THREE.KeyframeTrack;
  bone: THREE.Bone;
  property: 'quaternion' | 'position';
  interpolant: THREE.Interpolant;
}

interface DirectionConstraint {
  sourceBone: THREE.Bone;
  sourceDescendant: THREE.Bone;
  sourceReferenceDirection: THREE.Vector3;
  targetBone: THREE.Bone;
  targetLocalDirection: THREE.Vector3;
  targetRestDirection: THREE.Vector3;
}

function boneDepth(bone: THREE.Bone): number {
  let depth = 0;
  let cursor: THREE.Object3D | null = bone.parent;
  while (cursor instanceof THREE.Bone) {
    depth += 1;
    cursor = cursor.parent;
  }
  return depth;
}

function isBoneDescendantOf(candidate: THREE.Bone, ancestor: THREE.Bone): boolean {
  let cursor: THREE.Object3D | null = candidate.parent;
  while (cursor instanceof THREE.Bone) {
    if (cursor === ancestor) return true;
    cursor = cursor.parent;
  }
  return false;
}

function buildDirectionConstraints(
  decisions: readonly RigMapDecision[],
  sourceRest: Map<string, BoneRestState>,
  targetRest: Map<string, BoneRestState>,
): DirectionConstraint[] {
  const constraints: DirectionConstraint[] = [];
  for (const decision of decisions) {
    const sourceState = sourceRest.get(decision.source);
    const targetState = targetRest.get(decision.target);
    if (!sourceState || !targetState) continue;
    const descendants = decisions.flatMap((candidate) => {
      const sourceDescendant = sourceRest.get(candidate.source)?.bone;
      const targetDescendant = targetRest.get(candidate.target)?.bone;
      if (
        !sourceDescendant
        || !targetDescendant
        || !isBoneDescendantOf(sourceDescendant, sourceState.bone)
        || !isBoneDescendantOf(targetDescendant, targetState.bone)
      ) return [];
      return [{ sourceDescendant, targetDescendant, distance: boneDepth(sourceDescendant) - boneDepth(sourceState.bone) }];
    });
    if (descendants.length === 0) continue;
    const nearestDistance = Math.min(...descendants.map((item) => item.distance));
    const nearest = descendants.filter((item) => item.distance === nearestDistance);
    // Branch points such as hips and chest do not have one unambiguous segment
    // direction. Their mapped descendants still receive their own constraints.
    if (nearest.length !== 1) continue;
    const targetDescendantState = targetRest.get(nearest[0].targetDescendant.name)!;
    const targetLocalDirection = targetDescendantState.worldPosition
      .clone()
      .sub(targetState.worldPosition)
      .applyQuaternion(targetState.worldQuaternion.clone().invert());
    const sourceReferenceDirection = sourceRest.get(nearest[0].sourceDescendant.name)!.worldPosition
      .clone()
      .sub(sourceState.worldPosition);
    if (targetLocalDirection.lengthSq() <= 1e-12 || sourceReferenceDirection.lengthSq() <= 1e-12) continue;
    constraints.push({
      sourceBone: sourceState.bone,
      sourceDescendant: nearest[0].sourceDescendant,
      sourceReferenceDirection: sourceReferenceDirection.normalize(),
      targetBone: targetState.bone,
      targetLocalDirection: targetLocalDirection.normalize(),
      targetRestDirection: targetLocalDirection.clone().applyQuaternion(targetState.worldQuaternion).normalize(),
    });
  }
  return constraints;
}

function captureRestState(skeleton: THREE.Skeleton): Map<string, BoneRestState> {
  skeleton.bones[0]?.updateWorldMatrix(true, true);
  const result = new Map<string, BoneRestState>();
  for (const bone of skeleton.bones) {
    bone.updateWorldMatrix(true, false);
    const worldPosition = new THREE.Vector3();
    const worldQuaternion = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    bone.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);
    const parentWorldMatrix = bone.parent
      ? bone.parent.matrixWorld.clone()
      : new THREE.Matrix4();
    result.set(bone.name, {
      bone,
      parentBone: bone.parent instanceof THREE.Bone ? bone.parent : null,
      localPosition: bone.position.clone(),
      localQuaternion: bone.quaternion.clone(),
      localScale: bone.scale.clone(),
      worldPosition,
      worldQuaternion,
      parentWorldMatrix,
    });
  }
  return result;
}

function restoreRestState(states: Map<string, BoneRestState>): void {
  for (const state of states.values()) {
    state.bone.position.copy(state.localPosition);
    state.bone.quaternion.copy(state.localQuaternion);
    state.bone.scale.copy(state.localScale);
  }
  states.values().next().value?.bone.updateWorldMatrix(true, true);
}

function targetNameFromTrack(trackName: string): string | null {
  try {
    return THREE.PropertyBinding.parseTrackName(trackName).nodeName ?? null;
  } catch {
    const propertyIndex = trackName.lastIndexOf('.');
    return propertyIndex > 0 ? trackName.slice(0, propertyIndex) : null;
  }
}

function propertyFromTrack(trackName: string): 'quaternion' | 'position' | null {
  if (trackName.endsWith('.quaternion')) return 'quaternion';
  if (trackName.endsWith('.position')) return 'position';
  return null;
}

function sampledTracksForClip(
  clip: THREE.AnimationClip,
  source: THREE.Skeleton,
  mappedSourceNames: ReadonlySet<string>,
): { sampled: SampledTrack[]; discarded: string[]; hierarchyOnly: string[] } {
  const bones = new Map(source.bones.map((bone) => [bone.name, bone]));
  const sampled: SampledTrack[] = [];
  const discarded: string[] = [];
  const hierarchyOnly: string[] = [];
  for (const track of clip.tracks) {
    const name = targetNameFromTrack(track.name);
    const property = propertyFromTrack(track.name);
    const bone = name ? bones.get(name) : undefined;
    if (!name || !property || !bone) {
      discarded.push(track.name);
      continue;
    }
    if (!mappedSourceNames.has(name)) hierarchyOnly.push(track.name);
    sampled.push({
      track,
      bone,
      property,
      interpolant: track.getInterpolation() === THREE.InterpolateDiscrete
        ? track.InterpolantFactoryMethodDiscrete()
        : track.getInterpolation() === THREE.InterpolateSmooth
          ? track.InterpolantFactoryMethodSmooth()
          : track.InterpolantFactoryMethodLinear(),
    });
  }
  return { sampled, discarded, hierarchyOnly };
}

function uniqueSampleTimes(tracks: readonly SampledTrack[], duration: number): number[] {
  const values = tracks.flatMap(({ track }) => Array.from(track.times));
  values.push(0, duration);
  values.sort((left, right) => left - right);
  const result: number[] = [];
  for (const value of values) {
    if (!Number.isFinite(value) || value < -TIME_EPSILON || value > duration + TIME_EPSILON) continue;
    const clamped = Math.min(duration, Math.max(0, value));
    if (result.length === 0 || Math.abs(clamped - result[result.length - 1]) > TIME_EPSILON) {
      result.push(clamped);
    }
  }
  if (result.length > MAX_RETARGET_SAMPLES) {
    throw new Error(`Retargeting requires ${result.length} samples; the limit is ${MAX_RETARGET_SAMPLES}.`);
  }
  return result;
}

function nextDownFloat32(value: number): number {
  const rounded = Math.fround(value);
  if (rounded <= value || rounded === 0) return rounded;
  const buffer = new ArrayBuffer(4);
  const float = new Float32Array(buffer);
  const bits = new Uint32Array(buffer);
  float[0] = rounded;
  bits[0] -= 1;
  return float[0];
}

function sampleSchedule(
  tracks: readonly SampledTrack[],
  duration: number,
  sampleRateHz: number | undefined,
  adjustRationalTimes: boolean,
): { evaluationTimes: number[]; outputTimes: number[] } {
  if (sampleRateHz === undefined) {
    const times = uniqueSampleTimes(tracks, duration);
    return { evaluationTimes: times, outputTimes: times };
  }
  if (!Number.isFinite(sampleRateHz) || sampleRateHz <= 0 || sampleRateHz > 240) {
    throw new Error('Retarget sampleRateHz must be a finite value from 1 through 240.');
  }
  const exactFrames = duration * sampleRateHz;
  const nearestFrame = Math.round(exactFrames);
  const frameCount = Math.abs(exactFrames - nearestFrame) <= 1e-3
    ? nearestFrame
    : Math.ceil(exactFrames);
  if (frameCount + 1 > MAX_RETARGET_SAMPLES) {
    throw new Error(`Retargeting requires ${frameCount + 1} samples; the limit is ${MAX_RETARGET_SAMPLES}.`);
  }
  const evaluationTimes: number[] = [];
  const outputTimes: number[] = [];
  for (let frame = 0; frame <= frameCount; frame += 1) {
    const rational = frame / sampleRateHz;
    const outputTime = Math.min(duration, rational);
    // Three stores track times as float32. Sampling at the higher-precision
    // rational can fall just before the intended STEP key when that key rounded
    // upward, so evaluate at the same float32 frame representation as the input.
    evaluationTimes.push(Math.min(duration, Math.fround(rational)));
    outputTimes.push(adjustRationalTimes ? nextDownFloat32(outputTime) : Math.fround(outputTime));
  }
  return { evaluationTimes, outputTimes };
}

function evaluateTracks(tracks: readonly SampledTrack[], time: number): void {
  for (const sampled of tracks) {
    const value = sampled.interpolant.evaluate(time);
    if (sampled.property === 'quaternion') {
      sampled.bone.quaternion.set(value[0], value[1], value[2], value[3]).normalize();
    } else {
      sampled.bone.position.set(value[0], value[1], value[2]);
    }
  }
}

function findMappedExtremes(
  sourceRest: Map<string, BoneRestState>,
  targetRest: Map<string, BoneRestState>,
  map: Readonly<Record<string, string>>,
): { source: number; target: number } | null {
  const pairs = Object.entries(map).flatMap(([sourceName, targetName]) => {
    const sourceState = sourceRest.get(sourceName);
    const targetState = targetRest.get(targetName);
    return sourceState && targetState ? [{ sourceState, targetState }] : [];
  });
  if (pairs.length < 2) return null;
  let sourceMin = Number.POSITIVE_INFINITY;
  let sourceMax = Number.NEGATIVE_INFINITY;
  let targetMin = Number.POSITIVE_INFINITY;
  let targetMax = Number.NEGATIVE_INFINITY;
  for (const pair of pairs) {
    sourceMin = Math.min(sourceMin, pair.sourceState.worldPosition.y);
    sourceMax = Math.max(sourceMax, pair.sourceState.worldPosition.y);
    targetMin = Math.min(targetMin, pair.targetState.worldPosition.y);
    targetMax = Math.max(targetMax, pair.targetState.worldPosition.y);
  }
  const sourceHeight = sourceMax - sourceMin;
  const targetHeight = targetMax - targetMin;
  return sourceHeight > 1e-8 && targetHeight > 1e-8
    ? { source: sourceHeight, target: targetHeight }
    : null;
}

function correctedDelta(
  sourceAnimatedWorld: THREE.Quaternion,
  sourceRestWorld: THREE.Quaternion,
  correction: THREE.Quaternion,
): THREE.Quaternion {
  const sourceDelta = sourceAnimatedWorld.clone().multiply(sourceRestWorld.clone().invert()).normalize();
  return correction.clone().multiply(sourceDelta).multiply(correction.clone().invert()).normalize();
}

function rootSourceDecision(
  decisions: readonly RigMapDecision[],
  sourceRest: Map<string, BoneRestState>,
): RigMapDecision | undefined {
  return decisions
    .filter((decision) => sourceRest.has(decision.source))
    .sort((left, right) => {
      const leftDepth = boneDepth(sourceRest.get(left.source)!.bone);
      const rightDepth = boneDepth(sourceRest.get(right.source)!.bone);
      return leftDepth - rightDepth;
    })[0];
}

function boneOrAncestorIsTracked(
  bone: THREE.Bone,
  trackedBoneNames: ReadonlySet<string>,
): boolean {
  let cursor: THREE.Bone | null = bone;
  while (cursor) {
    if (trackedBoneNames.has(cursor.name)) return true;
    cursor = cursor.parent instanceof THREE.Bone ? cursor.parent : null;
  }
  return false;
}

export function retargetAnimationClip(
  clip: THREE.AnimationClip,
  source: THREE.Skeleton,
  target: THREE.Skeleton,
  mapping: RigMapResult,
  options: AnimationRetargetOptions = {},
): RetargetedAnimation {
  if (!mapping.ok) {
    const errors = mapping.diagnostics.filter((diagnostic) => diagnostic.level === 'error');
    throw new Error(`Cannot retarget with an invalid rig map: ${errors.map((item) => item.message).join(' ')}`);
  }
  if (!Number.isFinite(clip.duration) || clip.duration <= 0) {
    throw new Error(`Source clip ${clip.name || '(unnamed)'} has an invalid duration.`);
  }

  const sourceRest = captureRestState(source);
  const targetRest = captureRestState(target);
  let targetReference = targetRest;
  if (options.targetReferenceClip) {
    const targetReferenceTracks = sampledTracksForClip(
      options.targetReferenceClip,
      target,
      new Set(target.bones.map((bone) => bone.name)),
    ).sampled;
    if (targetReferenceTracks.length === 0) {
      throw new Error(`Target reference clip ${options.targetReferenceClip.name || '(unnamed)'} has no bone transform tracks.`);
    }
    restoreRestState(targetRest);
    evaluateTracks(targetReferenceTracks, 0);
    target.bones[0]?.updateWorldMatrix(true, true);
    targetReference = captureRestState(target);
    restoreRestState(targetRest);
  }
  const mappedSources = new Set(mapping.decisions.map((decision) => decision.source));
  const { sampled, discarded, hierarchyOnly } = sampledTracksForClip(clip, source, mappedSources);
  if (sampled.length === 0) {
    throw new Error(`Source clip ${clip.name || '(unnamed)'} has no mapped bone transform tracks.`);
  }
  const interpolation = options.interpolation ?? 'linear';
  const adjustRationalTimes = options.nextDownRationalTimes ?? false;
  if (adjustRationalTimes && options.sampleRateHz === undefined) {
    throw new Error('nextDownRationalTimes requires an explicit sampleRateHz.');
  }
  const { evaluationTimes, outputTimes } = sampleSchedule(
    sampled,
    clip.duration,
    options.sampleRateHz,
    adjustRationalTimes,
  );
  const poseRecovery = options.poseRecovery;
  if (poseRecovery) {
    const frames = [poseRecovery.peakFrame, poseRecovery.holdThroughFrame, poseRecovery.returnByFrame];
    if (frames.some((frame) => !Number.isInteger(frame) || frame < 0 || frame >= outputTimes.length)) {
      throw new Error(`Pose recovery frames must be integers from 0 through ${outputTimes.length - 1}.`);
    }
    if (
      poseRecovery.holdThroughFrame < poseRecovery.peakFrame
      || poseRecovery.returnByFrame <= poseRecovery.holdThroughFrame
    ) {
      throw new Error('Pose recovery requires peakFrame <= holdThroughFrame < returnByFrame.');
    }
  }
  const animatedQuaternionSources = new Set(
    sampled.filter((entry) => entry.property === 'quaternion').map((entry) => entry.bone.name),
  );
  const positionSources = new Set(
    sampled.filter((entry) => entry.property === 'position').map((entry) => entry.bone.name),
  );
  const activeDecisions = mapping.decisions.filter((decision) => (
    boneOrAncestorIsTracked(sourceRest.get(decision.source)!.bone, animatedQuaternionSources)
    || boneOrAncestorIsTracked(sourceRest.get(decision.source)!.bone, positionSources)
  ));
  const worldAnimatedSources = new Set(activeDecisions
    .filter((decision) => boneOrAncestorIsTracked(sourceRest.get(decision.source)!.bone, animatedQuaternionSources))
    .map((decision) => decision.source));
  const targetDecisions = new Map(activeDecisions.map((decision) => [decision.target, decision]));
  const targetOrder = [...target.bones].sort((left, right) => boneDepth(left) - boneDepth(right));
  const preservedTargetLeafRotations = options.preserveTargetLeafRotations
    ? activeDecisions
      .filter((decision) => {
        const bone = targetReference.get(decision.target)!.bone;
        return !activeDecisions.some((candidate) => {
          const candidateBone = targetReference.get(candidate.target)!.bone;
          return candidateBone !== bone && isBoneDescendantOf(candidateBone, bone);
        });
      })
      .map((decision) => decision.target)
    : [];
  const explicitPreservedTargetRotations = options.preserveTargetRotations ?? [];
  for (const targetName of explicitPreservedTargetRotations) {
    if (!targetReference.has(targetName)) {
      throw new Error(`Cannot preserve unknown target bone rotation ${targetName}.`);
    }
    if (!targetDecisions.has(targetName)) {
      throw new Error(`Cannot preserve inactive or unmapped target bone rotation ${targetName}.`);
    }
  }
  const preservedTargetRotations = [...new Set([
    ...preservedTargetLeafRotations,
    ...explicitPreservedTargetRotations,
  ])];
  const preservedTargetRotationSet = new Set(preservedTargetRotations);
  const upCorrection = options.applyUpCorrection === false || !mapping.upCorrection
    ? new THREE.Quaternion()
    : new THREE.Quaternion().fromArray(mapping.upCorrection).normalize();
  const correction = options.applyUpCorrection === false
    ? new THREE.Quaternion()
    : new THREE.Quaternion().fromArray(mapping.orientationCorrection ?? mapping.upCorrection ?? [0, 0, 0, 1]).normalize();
  const height = findMappedExtremes(sourceRest, targetReference, mapping.map);
  const rootMotionScale = options.scaleRootMotion === false || !height
    ? 1
    : height.target / height.source;
  const rootDecision = rootSourceDecision(activeDecisions, sourceRest);
  const rootHasPositionTrack = !!rootDecision
    && boneOrAncestorIsTracked(sourceRest.get(rootDecision.source)!.bone, positionSources);
  const quaternionValues = new Map<string, number[]>();
  const positionValues = new Map<string, number[]>();
  const directionConstraints = options.alignMappedBoneDirections === false
    ? []
    : buildDirectionConstraints(activeDecisions, sourceRest, targetReference);
  const directionTransferMode = options.directionTransferMode ?? 'relative';
  const directionTransferBones = options.directionTransferBones ?? null;
  const directionTransferBoneSet = directionTransferBones ? new Set(directionTransferBones) : null;
  if (directionTransferBoneSet) {
    const constrainedTargets = new Set(directionConstraints.map((constraint) => constraint.targetBone.name));
    for (const targetName of directionTransferBoneSet) {
      if (!constrainedTargets.has(targetName)) {
        throw new Error(`Cannot transfer an absolute direction for unconstrained target bone ${targetName}.`);
      }
    }
  }
  const directionConstraintByTarget = new Map(directionConstraints.map((constraint) => [constraint.targetBone.name, constraint]));
  const sourceReferencePose = options.sourceReferencePose ?? 'rest';
  const sourceReferenceWorldQuaternions = new Map(
    [...sourceRest].map(([name, state]) => [name, state.worldQuaternion.clone()]),
  );
  const sourceReferenceWorldPositions = new Map(
    [...sourceRest].map(([name, state]) => [name, state.worldPosition.clone()]),
  );
  const sourceReferenceClip = sourceReferencePose === 'first-frame'
    ? clip
    : sourceReferencePose === 'clip'
      ? options.sourceReferenceClip
      : undefined;
  if (sourceReferencePose === 'clip' && !sourceReferenceClip) {
    throw new Error('sourceReferencePose clip requires a sourceReferenceClip.');
  }
  if (sourceReferenceClip) {
    const sourceReferenceTracks = sourceReferenceClip === clip
      ? sampled
      : sampledTracksForClip(
        sourceReferenceClip,
        source,
        new Set(source.bones.map((bone) => bone.name)),
      ).sampled;
    if (sourceReferenceTracks.length === 0) {
      throw new Error(`Source reference clip ${sourceReferenceClip.name || '(unnamed)'} has no bone transform tracks.`);
    }
    restoreRestState(sourceRest);
    evaluateTracks(sourceReferenceTracks, 0);
    source.bones[0]?.updateWorldMatrix(true, true);
    for (const [name, state] of sourceRest) {
      sourceReferenceWorldQuaternions.set(name, state.bone.getWorldQuaternion(new THREE.Quaternion()));
      sourceReferenceWorldPositions.set(name, state.bone.getWorldPosition(new THREE.Vector3()));
    }
    for (const constraint of directionConstraints) {
      const referenceDirection = constraint.sourceDescendant.getWorldPosition(new THREE.Vector3())
        .sub(constraint.sourceBone.getWorldPosition(new THREE.Vector3()));
      if (referenceDirection.lengthSq() > 1e-12) {
        constraint.sourceReferenceDirection.copy(referenceDirection.normalize());
      }
    }
    restoreRestState(sourceRest);
  }

  try {
    for (const time of evaluationTimes) {
      restoreRestState(sourceRest);
      evaluateTracks(sampled, time);
      source.bones[0]?.updateWorldMatrix(true, true);

      const desiredTargetWorld = new Map<string, THREE.Quaternion>();
      for (const targetBone of targetOrder) {
        const targetState = targetReference.get(targetBone.name)!;
        const decision = targetDecisions.get(targetBone.name);
        let worldQuaternion: THREE.Quaternion;
        if (preservedTargetRotationSet.has(targetBone.name) && targetState.parentBone) {
          const parentWorld = desiredTargetWorld.get(targetState.parentBone.name)
            ?? targetReference.get(targetState.parentBone.name)!.worldQuaternion;
          worldQuaternion = parentWorld.clone().multiply(targetState.localQuaternion).normalize();
        } else if (decision && worldAnimatedSources.has(decision.source)) {
          const sourceState = sourceRest.get(decision.source)!;
          const sourceAnimatedWorld = new THREE.Quaternion();
          sourceState.bone.getWorldQuaternion(sourceAnimatedWorld);
          worldQuaternion = correctedDelta(
            sourceAnimatedWorld,
            sourceReferenceWorldQuaternions.get(decision.source)!,
            correction,
          ).multiply(targetState.worldQuaternion).normalize();
          const directionConstraint = directionConstraintByTarget.get(targetBone.name);
          if (directionConstraint) {
            const sourcePosition = directionConstraint.sourceBone.getWorldPosition(new THREE.Vector3());
            const sourceDescendantPosition = directionConstraint.sourceDescendant.getWorldPosition(new THREE.Vector3());
            const sourceAnimatedDirection = sourceDescendantPosition.sub(sourcePosition);
            if (sourceAnimatedDirection.lengthSq() > 1e-12) {
              sourceAnimatedDirection.normalize();
              const useAbsoluteDirection = directionTransferMode === 'absolute'
                && (!directionTransferBoneSet || directionTransferBoneSet.has(targetBone.name));
              const desiredDirection = useAbsoluteDirection
                ? sourceAnimatedDirection.clone().applyQuaternion(correction).normalize()
                : directionConstraint.targetRestDirection
                  .clone()
                  .applyQuaternion(
                    correction.clone()
                      .multiply(new THREE.Quaternion().setFromUnitVectors(
                        directionConstraint.sourceReferenceDirection,
                        sourceAnimatedDirection,
                      ))
                      .multiply(correction.clone().invert())
                      .normalize(),
                  )
                  .normalize();
              const currentDirection = directionConstraint.targetLocalDirection
                .clone()
                .applyQuaternion(worldQuaternion)
                .normalize();
              const swing = new THREE.Quaternion().setFromUnitVectors(currentDirection, desiredDirection);
              worldQuaternion = swing.multiply(worldQuaternion).normalize();
            }
          }
        } else if (targetState.parentBone) {
          const parentWorld = desiredTargetWorld.get(targetState.parentBone.name)
            ?? targetReference.get(targetState.parentBone.name)!.worldQuaternion;
          worldQuaternion = parentWorld.clone().multiply(targetState.localQuaternion).normalize();
        } else {
          worldQuaternion = targetState.worldQuaternion.clone();
        }
        desiredTargetWorld.set(targetBone.name, worldQuaternion);

        if (!decision || !worldAnimatedSources.has(decision.source)) continue;
        const parentWorld = targetState.parentBone
          ? desiredTargetWorld.get(targetState.parentBone.name)!
          : new THREE.Quaternion().setFromRotationMatrix(targetState.parentWorldMatrix);
        const local = parentWorld.clone().invert().multiply(worldQuaternion).normalize();
        const values = quaternionValues.get(targetBone.name) ?? [];
        values.push(local.x, local.y, local.z, local.w);
        quaternionValues.set(targetBone.name, values);
      }

      if (rootDecision && rootHasPositionTrack) {
        const sourceState = sourceRest.get(rootDecision.source)!;
        const targetState = targetReference.get(rootDecision.target)!;
        const sourceAnimated = new THREE.Vector3();
        sourceState.bone.getWorldPosition(sourceAnimated);
        const delta = sourceAnimated
          .sub(sourceReferenceWorldPositions.get(rootDecision.source)!)
          .applyQuaternion(correction)
          .multiplyScalar(rootMotionScale);
        const desiredWorld = targetState.worldPosition.clone().add(delta);
        const desiredLocal = desiredWorld.applyMatrix4(targetState.parentWorldMatrix.clone().invert());
        const values = positionValues.get(rootDecision.target) ?? [];
        values.push(desiredLocal.x, desiredLocal.y, desiredLocal.z);
        positionValues.set(rootDecision.target, values);
      }
    }
  } finally {
    restoreRestState(sourceRest);
  }

  if (poseRecovery) {
    for (const [targetName, values] of quaternionValues) {
      const reference = targetReference.get(targetName)!.localQuaternion;
      const peakOffset = poseRecovery.peakFrame * 4;
      const peak = new THREE.Quaternion().fromArray(values, peakOffset).normalize();
      for (let frame = poseRecovery.peakFrame + 1; frame < outputTimes.length; frame += 1) {
        let recovered: THREE.Quaternion;
        if (frame <= poseRecovery.holdThroughFrame) {
          recovered = peak;
        } else if (frame <= poseRecovery.returnByFrame) {
          const alpha = (frame - poseRecovery.holdThroughFrame)
            / (poseRecovery.returnByFrame - poseRecovery.holdThroughFrame);
          recovered = peak.clone().slerp(reference, alpha).normalize();
        } else {
          recovered = reference;
        }
        recovered.toArray(values, frame * 4);
      }
    }
    for (const [targetName, values] of positionValues) {
      const reference = targetReference.get(targetName)!.localPosition;
      const peakOffset = poseRecovery.peakFrame * 3;
      const peak = new THREE.Vector3().fromArray(values, peakOffset);
      for (let frame = poseRecovery.peakFrame + 1; frame < outputTimes.length; frame += 1) {
        let recovered: THREE.Vector3;
        if (frame <= poseRecovery.holdThroughFrame) {
          recovered = peak;
        } else if (frame <= poseRecovery.returnByFrame) {
          const alpha = (frame - poseRecovery.holdThroughFrame)
            / (poseRecovery.returnByFrame - poseRecovery.holdThroughFrame);
          recovered = peak.clone().lerp(reference, alpha);
        } else {
          recovered = reference;
        }
        recovered.toArray(values, frame * 3);
      }
    }
  }

  const tracks: THREE.KeyframeTrack[] = [];
  for (const [targetName, values] of quaternionValues) {
    const track = new THREE.QuaternionKeyframeTrack(
      `${targetName}.quaternion`,
      outputTimes,
      values,
    );
    if (interpolation === 'step') track.setInterpolation(THREE.InterpolateDiscrete);
    tracks.push(track);
  }
  for (const [targetName, values] of positionValues) {
    const track = new THREE.VectorKeyframeTrack(
      `${targetName}.position`,
      outputTimes,
      values,
    );
    if (interpolation === 'step') track.setInterpolation(THREE.InterpolateDiscrete);
    tracks.push(track);
  }
  if (tracks.length === 0) {
    throw new Error(`Retargeting ${clip.name || '(unnamed)'} produced no target tracks.`);
  }
  const targetName = options.clipName?.trim() || clip.name || 'retargeted_clip';
  const retargeted = new THREE.AnimationClip(targetName, clip.duration, tracks);
  return {
    clip: retargeted,
    report: {
      sourceClip: clip.name || '(unnamed)',
      targetClip: targetName,
      duration: clip.duration,
      sampleCount: outputTimes.length,
      quaternionTrackCount: quaternionValues.size,
      positionTrackCount: positionValues.size,
      discardedTracks: discarded,
      hierarchyOnlyTracks: hierarchyOnly,
      mappedBones: activeDecisions,
      rootMotionScale,
      upCorrection: upCorrection.toArray(),
      orientationCorrection: correction.toArray(),
      sampleRateHz: options.sampleRateHz ?? null,
      interpolation,
      nextDownRationalTimes: adjustRationalTimes,
      directionAlignedBones: directionConstraints.map((constraint) => constraint.targetBone.name),
      directionTransferMode,
      directionTransferBones: directionTransferBones ? [...directionTransferBones] : null,
      sourceReferencePose,
      sourceReferenceClip: sourceReferenceClip?.name || null,
      targetReferenceClip: options.targetReferenceClip?.name || null,
      preservedTargetLeafRotations,
      preservedTargetRotations,
      poseRecovery: poseRecovery ? { ...poseRecovery } : null,
    },
  };
}
