import * as THREE from 'three';
import type { RigMapDecision, RigMapResult } from './rigMapping';
import {auditPoseRanges,poseRangeSummary,type PoseRangeProfile,type PoseRangeReport} from './poseRanges';
import {retargetSourceTime,validateRetargetVisualTiming,type RetargetVisualTiming} from './retargetTiming';
import {
  alignNaturalAnatomicalFrame,
  calibratedNaturalBend,
  contactBlendWeight,
  lengthNormalizedWeights,
  limitNaturalLegDirection,
  naturalSolePoint,
  resolveNaturalContactPose,
  solveNaturalTwoBoneLeg,
  solveNaturalPelvisCorrection,
  type NaturalContactDiagnostic,
  type NaturalFootContact,
  type NaturalFootSide,
  type NaturalMotionProfile,
  type NaturalMotionReport,
} from './naturalRetarget';

const MAX_RETARGET_SAMPLES = 20_000;
const TIME_EPSILON = 1e-6;

export interface PoseRecoveryEnvelope {
  peakFrame: number;
  holdThroughFrame: number;
  returnByFrame: number;
}

export type DirectionTransferMode = 'relative' | 'absolute';

export interface TargetChainCurl {
  palmBone: string;
  bones: string[];
  palmNormal: [number, number, number];
  degrees: number[];
}

export interface AnimationRetargetOptions {
  clipName?: string;
  applyUpCorrection?: boolean;
  scaleRootMotion?: boolean;
  extractRootMotionBone?: string;
  visualTiming?: RetargetVisualTiming;
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
  targetChainCurls?: TargetChainCurl[];
  naturalMotion?: NaturalMotionProfile;
  poseRanges?: PoseRangeProfile;
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
  rootMotionExtraction?: { bone: string; maximumDisplacement: number };
  visualTiming?: RetargetVisualTiming & { sourceDuration: number };
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
  targetChainCurls: TargetChainCurl[];
  naturalMotion: NaturalMotionReport | null;
  poseRanges?: PoseRangeReport;
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

interface PreparedNaturalLeg {
  side: NaturalFootSide;
  profile: NaturalMotionProfile['legs'][NaturalFootSide];
  sourceHip: BoneRestState;
  sourceKnee: BoneRestState;
  sourceAnkle: BoneRestState;
  targetHip: BoneRestState;
  targetKnee: BoneRestState;
  targetAnkle: BoneRestState;
  firstLength: number;
  secondLength: number;
  sourceReferenceReach: number;
  sourceReferenceBend: number;
  targetReferenceBend: number;
  targetReferenceReach: THREE.Vector3;
  targetHipLocalDirection: THREE.Vector3;
  targetKneeLocalDirection: THREE.Vector3;
  referenceBendPlaneNormal: THREE.Vector3;
  referenceSolePoint: THREE.Vector3;
}

interface PreparedNaturalMotion {
  profile: NaturalMotionProfile;
  pelvis: BoneRestState;
  pelvisDecision: RigMapDecision;
  torso: {
    states: BoneRestState[];
    effectiveWeights: number[];
    terminalDecision: RigMapDecision;
  } | null;
  legs: Record<NaturalFootSide, PreparedNaturalLeg>;
  contacts: Array<{
    key: string;
    contact: NaturalFootContact;
    diagnostic: NaturalContactDiagnostic;
  }>;
  legMotionLimit: NaturalMotionReport['legMotionLimit'];
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

function targetChainCurlQuaternions(
  curls: readonly TargetChainCurl[],
  targetReference: ReadonlyMap<string, BoneRestState>,
  mappedTargetNames: ReadonlySet<string>,
): Map<string, THREE.Quaternion> {
  const result = new Map<string, THREE.Quaternion>();
  for (const curl of curls) {
    if (!curl.palmBone.trim()) throw new Error('Target chain curl palmBone must be non-empty.');
    if (curl.bones.length === 0) throw new Error(`Target chain curl from ${curl.palmBone} must contain at least one bone.`);
    if (curl.degrees.length !== curl.bones.length) {
      throw new Error(`Target chain curl from ${curl.palmBone} must provide one angle per bone.`);
    }
    if (curl.degrees.some((degrees) => !Number.isFinite(degrees) || Math.abs(degrees) > 180)) {
      throw new Error(`Target chain curl from ${curl.palmBone} angles must be finite values from -180 through 180 degrees.`);
    }
    if (curl.palmNormal.some((component) => !Number.isFinite(component))) {
      throw new Error(`Target palm normal for ${curl.palmBone} must contain finite components.`);
    }
    const palm = targetReference.get(curl.palmBone);
    if (!palm) throw new Error(`Cannot curl from unknown target palm bone ${curl.palmBone}.`);
    const palmNormal = new THREE.Vector3(...curl.palmNormal);
    if (palmNormal.lengthSq() <= 1e-12) throw new Error(`Target palm normal for ${curl.palmBone} must be non-zero.`);
    palmNormal.normalize().applyQuaternion(palm.worldQuaternion).normalize();
    let expectedParent = palm.bone;
    for (let index = 0; index < curl.bones.length; index += 1) {
      const boneName = curl.bones[index];
      if (!boneName.trim()) throw new Error(`Target chain curl from ${curl.palmBone} contains an empty bone name.`);
      const state = targetReference.get(boneName);
      if (!state) throw new Error(`Cannot curl unknown target bone ${boneName}.`);
      if (mappedTargetNames.has(boneName)) {
        throw new Error(`Cannot curl mapped target bone ${boneName}; curl only unmapped child chains.`);
      }
      if (result.has(boneName)) throw new Error(`Target curl bone ${boneName} is configured more than once.`);
      if (state.parentBone !== expectedParent) {
        throw new Error(`Target curl chain ${curl.palmBone} must list direct descendants in hierarchy order.`);
      }
      const nextState = index + 1 < curl.bones.length ? targetReference.get(curl.bones[index + 1]) : undefined;
      const segmentDirection = nextState
        ? nextState.worldPosition.clone().sub(state.worldPosition)
        : new THREE.Vector3(0, 1, 0).applyQuaternion(state.worldQuaternion);
      const hingeWorld = segmentDirection.normalize().cross(palmNormal).normalize();
      if (hingeWorld.lengthSq() <= 1e-12) {
        throw new Error(`Target curl bone ${boneName} is parallel to its palm normal.`);
      }
      const hingeLocal = hingeWorld.applyQuaternion(state.worldQuaternion.clone().invert()).normalize();
      result.set(
        boneName,
        new THREE.Quaternion().setFromAxisAngle(hingeLocal, THREE.MathUtils.degToRad(curl.degrees[index])),
      );
      expectedParent = state.bone;
    }
  }
  return result;
}

function prepareNaturalMotion(
  profile: NaturalMotionProfile,
  clipName: string,
  sampleCount: number,
  mapping: RigMapResult,
  sourceRest: ReadonlyMap<string, BoneRestState>,
  targetReference: ReadonlyMap<string, BoneRestState>,
  sourceReferenceWorldPositions: ReadonlyMap<string, THREE.Vector3>,
  occupiedTargetBones: ReadonlySet<string>,
): PreparedNaturalMotion {
  const grounding = profile.grounding?.[clipName];
  if (grounding && (![grounding.strideScale,grounding.rootHeightOffset,grounding.groundHeight].every(Number.isFinite)
    || grounding.strideScale <= 0 || grounding.strideScale > 4)) throw new Error('Invalid natural grounding calibration.');
  if (profile.legOrientation !== undefined && !['animated','calibrated'].includes(profile.legOrientation)) throw new Error('Invalid natural leg orientation mode.');
  const decisionByTarget = new Map(mapping.decisions.map((decision) => [decision.target, decision]));
  const pelvisDecision = mapping.decisions.find((decision) => decision.canonical === 'hips');
  if (!pelvisDecision) throw new Error('Natural motion requires one mapped canonical hips bone.');
  const pelvis = targetReference.get(pelvisDecision.target);
  if (!pelvis) throw new Error(`Natural motion cannot resolve target pelvis ${pelvisDecision.target}.`);

  const configured = new Set<string>();
  const reserve = (name: string, owner: string) => {
    if (configured.has(name) || occupiedTargetBones.has(name)) {
      throw new Error(`Natural motion ${owner} conflicts on target bone ${name}.`);
    }
    configured.add(name);
  };

  let torso: PreparedNaturalMotion['torso'] = null;
  if (profile.torso) {
    const states = profile.torso.targetBones.map((name, index) => {
      reserve(name, 'torso chain');
      const state = targetReference.get(name);
      if (!state) throw new Error(`Natural motion torso target bone ${name} does not exist.`);
      if (index > 0 && state.parentBone !== targetReference.get(profile.torso!.targetBones[index - 1])?.bone) {
        throw new Error('Natural motion torso targetBones must be a direct hierarchy chain.');
      }
      if (!state.parentBone) throw new Error(`Natural motion torso bone ${name} must have a parent.`);
      return state;
    });
    const terminalDecision = decisionByTarget.get(states.at(-1)!.bone.name);
    if (!terminalDecision) throw new Error('Natural motion torso terminal target must be mapped.');
    const lengths = states.map((state) => state.worldPosition.distanceTo(targetReference.get(state.parentBone!.name)!.worldPosition));
    torso = {
      states,
      effectiveWeights: lengthNormalizedWeights(lengths, profile.torso.weights),
      terminalDecision,
    };
  }

  const legs = Object.fromEntries((['left', 'right'] as const).map((side) => {
    const legProfile = profile.legs[side];
    const targetStates = [legProfile.hip, legProfile.knee, legProfile.ankle].map((name) => {
      reserve(name, `${side} leg`);
      const state = targetReference.get(name);
      if (!state) throw new Error(`Natural motion ${side} leg target bone ${name} does not exist.`);
      return state;
    });
    const [targetHip, targetKnee, targetAnkle] = targetStates;
    if (targetKnee.parentBone !== targetHip.bone || targetAnkle.parentBone !== targetKnee.bone) {
      throw new Error(`Natural motion ${side} target leg must be a direct hip-knee-ankle chain.`);
    }
    const decisions = targetStates.map((state) => decisionByTarget.get(state.bone.name));
    if (decisions.some((decision) => !decision)) {
      throw new Error(`Natural motion ${side} leg hip, knee, and ankle must all be mapped.`);
    }
    const [hipDecision, kneeDecision, ankleDecision] = decisions as RigMapDecision[];
    const sourceHip = sourceRest.get(hipDecision.source)!;
    const sourceKnee = sourceRest.get(kneeDecision.source)!;
    const sourceAnkle = sourceRest.get(ankleDecision.source)!;
    const sourceReferenceReach = sourceReferenceWorldPositions.get(sourceHip.bone.name)!
      .distanceTo(sourceReferenceWorldPositions.get(sourceAnkle.bone.name)!);
    const sourceFirst = sourceReferenceWorldPositions.get(sourceKnee.bone.name)!.clone()
      .sub(sourceReferenceWorldPositions.get(sourceHip.bone.name)!);
    const sourceSecond = sourceReferenceWorldPositions.get(sourceAnkle.bone.name)!.clone()
      .sub(sourceReferenceWorldPositions.get(sourceKnee.bone.name)!);
    const sourceReferenceBend = sourceFirst.angleTo(sourceSecond);
    if (sourceReferenceReach <= 1e-10) throw new Error(`Natural motion ${side} source reference leg has zero reach.`);
    const targetReferenceReach = targetAnkle.worldPosition.clone().sub(targetHip.worldPosition);
    const firstVector = targetKnee.worldPosition.clone().sub(targetHip.worldPosition);
    const secondVector = targetAnkle.worldPosition.clone().sub(targetKnee.worldPosition);
    if (firstVector.lengthSq() <= 1e-10 || secondVector.lengthSq() <= 1e-10) {
      throw new Error(`Natural motion ${side} target reference leg has a zero-length segment.`);
    }
    const referenceBendPlaneNormal = firstVector.clone().cross(secondVector);
    if (referenceBendPlaneNormal.lengthSq() <= 1e-10) {
      const referencePole = new THREE.Vector3(...legProfile.pole)
        .applyQuaternion(pelvis.worldQuaternion);
      referenceBendPlaneNormal.copy(targetReferenceReach).normalize().cross(referencePole);
    }
    if (referenceBendPlaneNormal.lengthSq() <= 1e-10) {
      throw new Error(`Natural motion ${side} reference leg and pelvis-local pole do not define a bend plane.`);
    }
    referenceBendPlaneNormal.normalize();
    const prepared: PreparedNaturalLeg = {
      side,
      profile: legProfile,
      sourceHip,
      sourceKnee,
      sourceAnkle,
      targetHip,
      targetKnee,
      targetAnkle,
      firstLength: firstVector.length(),
      secondLength: secondVector.length(),
      sourceReferenceReach,
      sourceReferenceBend,
      targetReferenceBend: firstVector.angleTo(secondVector),
      targetReferenceReach,
      targetHipLocalDirection: firstVector.clone().applyQuaternion(targetHip.worldQuaternion.clone().invert()).normalize(),
      targetKneeLocalDirection: secondVector.clone().applyQuaternion(targetKnee.worldQuaternion.clone().invert()).normalize(),
      referenceBendPlaneNormal,
      referenceSolePoint: targetAnkle.worldPosition.clone()
        .add(new THREE.Vector3(...legProfile.soleOffset).applyQuaternion(targetAnkle.worldQuaternion)),
    };
    if (profile.reachTransfer === 'calibrated-bend') {
      calibratedNaturalBend(sourceReferenceBend, sourceReferenceBend, prepared.targetReferenceBend);
    }
    return [side, prepared];
  })) as unknown as Record<NaturalFootSide, PreparedNaturalLeg>;

  const contacts = (profile.contacts?.[clipName] ?? []).map((contact, index) => {
    if (contact.positionMode !== undefined && contact.positionMode !== 'planted' && contact.positionMode !== 'plane') {
      throw new Error('Natural contact positionMode must be planted or plane.');
    }
    if (contact.endFrame >= sampleCount) {
      throw new Error(`Natural motion ${clipName} ${contact.foot}-foot contact ends after frame ${sampleCount - 1}.`);
    }
    return {
      key: `${clipName}:${contact.foot}:${index}`,
      contact,
      diagnostic: {
        ...contact,
        clip: clipName,
        fullWeightStartFrame: contact.startFrame + Math.max(0, contact.blendFrames - 1),
        fullWeightEndFrame: contact.endFrame - Math.max(0, contact.blendFrames - 1),
        maximumResidual: 0,
        maximumResidualFrame: null,
        maximumPelvisCorrection: 0,
        maximumPelvisCorrectionFrame: null,
        clampedSamples: 0,
        unreachable: false,
        rootTravelPerFrame: [
          ...(profile.rootTravelPerFrame?.[clipName] ?? [0, 0, 0]),
        ] as [number, number, number],
      },
    };
  });
  const configuredLimit = profile.legMotionLimits?.[clipName];
  const legMotionLimit: NaturalMotionReport['legMotionLimit'] = configuredLimit ? {
    ...configuredLimit,
    sides: {
      left: {
        constrainedSamples: 0,
        maximumRequestedForwardDegrees: 0,
        maximumRequestedBackwardDegrees: 0,
        maximumRequestedLateralDegrees: 0,
      },
      right: {
        constrainedSamples: 0,
        maximumRequestedForwardDegrees: 0,
        maximumRequestedBackwardDegrees: 0,
        maximumRequestedLateralDegrees: 0,
      },
    },
  } : null;
  return { profile, pelvis, pelvisDecision, torso, legs, contacts, legMotionLimit };
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
  const targetReferenceQuaternionBones = new Set<string>();
  const targetReferencePositionBones = new Set<string>();
  if (options.targetReferenceClip) {
    const targetReferenceTracks = sampledTracksForClip(
      options.targetReferenceClip,
      target,
      new Set(target.bones.map((bone) => bone.name)),
    ).sampled;
    if (targetReferenceTracks.length === 0) {
      throw new Error(`Target reference clip ${options.targetReferenceClip.name || '(unnamed)'} has no bone transform tracks.`);
    }
    for (const track of targetReferenceTracks) {
      if (track.property === 'quaternion') targetReferenceQuaternionBones.add(track.bone.name);
      else targetReferencePositionBones.add(track.bone.name);
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
  if (options.visualTiming) {
    validateRetargetVisualTiming(options.visualTiming);
    if (options.sampleRateHz !== 60) throw new Error('Visual timing requires an explicit 60 Hz sample rate.');
  }
  const outputDuration = options.visualTiming ? options.visualTiming.durationFrames / 60 : clip.duration;
  const adjustRationalTimes = options.nextDownRationalTimes ?? false;
  if (adjustRationalTimes && options.sampleRateHz === undefined) {
    throw new Error('nextDownRationalTimes requires an explicit sampleRateHz.');
  }
  const { evaluationTimes, outputTimes } = sampleSchedule(
    sampled,
    outputDuration,
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
  const referenceIntermediateTargetBones = new Set(targetOrder
    .filter((bone) => !targetDecisions.has(bone.name) && activeDecisions.some((decision) => (
      isBoneDescendantOf(targetReference.get(decision.target)!.bone, bone)
    )))
    .map((bone) => bone.name));
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
  const targetChainCurls = options.targetChainCurls ?? [];
  const mappedTargetNames = new Set(mapping.decisions.map((decision) => decision.target));
  const targetLocalRotationOffsetQuaternions = targetChainCurlQuaternions(
    targetChainCurls,
    targetReference,
    mappedTargetNames,
  );
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
  const extractedRoot = options.extractRootMotionBone ? sourceRest.get(options.extractRootMotionBone) : undefined;
  if (options.extractRootMotionBone && (!extractedRoot || !rootDecision
    || !isBoneDescendantOf(sourceRest.get(rootDecision.source)!.bone, extractedRoot.bone))) {
    throw new Error('Root-motion extraction requires an existing source ancestor of the mapped pelvis.');
  }
  let maximumExtractedDisplacement = 0;
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

  let naturalMotion: PreparedNaturalMotion | null = null;
  if (options.naturalMotion) {
    if (!sourceReferenceClip || !options.targetReferenceClip) {
      throw new Error('Natural motion requires explicit source and target reference clips.');
    }
    if ((options.sampleRateHz ?? 60) !== 60) {
      throw new Error('Natural motion contact frames require a 60 Hz retarget sample rate.');
    }
    naturalMotion = prepareNaturalMotion(
      options.naturalMotion,
      clip.name,
      outputTimes.length,
      mapping,
      sourceRest,
      targetReference,
      sourceReferenceWorldPositions,
      new Set(targetLocalRotationOffsetQuaternions.keys()),
    );
    if (!rootDecision || naturalMotion.pelvisDecision.target !== rootDecision.target) {
      throw new Error('Natural motion requires the canonical target pelvis to be the retarget root.');
    }
  }
  const naturalLegBends = {
    left: { minimum: Number.POSITIVE_INFINITY, maximum: Number.NEGATIVE_INFINITY },
    right: { minimum: Number.POSITIVE_INFINITY, maximum: Number.NEGATIVE_INFINITY },
  };
  const contactPins = new Map<string, { sole: THREE.Vector3; quaternion: THREE.Quaternion }>();
  const previousNaturalLegPlane = naturalMotion ? {
    left: naturalMotion.legs.left.referenceBendPlaneNormal.clone(),
    right: naturalMotion.legs.right.referenceBendPlaneNormal.clone(),
  } : null;

  try {
    for (let frameIndex = 0; frameIndex < evaluationTimes.length; frameIndex += 1) {
      const time = options.visualTiming
        ? retargetSourceTime(evaluationTimes[frameIndex], clip.duration, options.visualTiming)
        : evaluationTimes[frameIndex];
      restoreRestState(sourceRest);
      evaluateTracks(sampled, time);
      source.bones[0]?.updateWorldMatrix(true, true);

      const transferredWorldQuaternion = (decision: RigMapDecision, targetState: BoneRestState) => {
        if (!worldAnimatedSources.has(decision.source)) return targetState.worldQuaternion.clone();
        const sourceAnimatedWorld = sourceRest.get(decision.source)!.bone
          .getWorldQuaternion(new THREE.Quaternion());
        return correctedDelta(
          sourceAnimatedWorld,
          sourceReferenceWorldQuaternions.get(decision.source)!,
          correction,
        ).multiply(targetState.worldQuaternion).normalize();
      };

      let desiredRootLocalPosition: THREE.Vector3 | null = null;
      let desiredRootWorldPosition = rootDecision
        ? targetReference.get(rootDecision.target)!.worldPosition.clone()
        : new THREE.Vector3();
      if (rootDecision && rootHasPositionTrack) {
        const sourceState = sourceRest.get(rootDecision.source)!;
        const targetState = targetReference.get(rootDecision.target)!;
        const sourceAnimated = sourceState.bone.getWorldPosition(new THREE.Vector3());
        const delta = sourceAnimated.sub(sourceReferenceWorldPositions.get(rootDecision.source)!);
        if (extractedRoot) {
          const travel = extractedRoot.bone.getWorldPosition(new THREE.Vector3())
            .sub(sourceReferenceWorldPositions.get(extractedRoot.bone.name)!);
          maximumExtractedDisplacement = Math.max(maximumExtractedDisplacement, travel.length());
          delta.sub(travel);
        }
        delta.applyQuaternion(correction)
          .multiplyScalar(rootMotionScale);
        desiredRootWorldPosition = targetState.worldPosition.clone().add(delta);
        desiredRootLocalPosition = desiredRootWorldPosition.clone()
          .applyMatrix4(targetState.parentWorldMatrix.clone().invert());
      }

      const grounding = naturalMotion?.profile.grounding?.[clip.name];
      if (grounding && rootDecision) {
        desiredRootWorldPosition.y += grounding.rootHeightOffset;
        desiredRootLocalPosition = desiredRootWorldPosition.clone()
          .applyMatrix4(targetReference.get(rootDecision.target)!.parentWorldMatrix.clone().invert());
      }
      const naturalTorsoWorld = new Map<string, THREE.Quaternion>();
      const naturalLegWorld = new Map<string, THREE.Quaternion>();
      const naturalFootCorrections = new Map<string, THREE.Quaternion>();
      let pelvisCorrection = new THREE.Vector3();
      if (naturalMotion) {
        const pelvisWorldQuaternion = transferredWorldQuaternion(
          naturalMotion.pelvisDecision,
          naturalMotion.pelvis,
        );
        // The leg solver and baked hierarchy must use the same pelvis frame.
        // A later generic direction alignment otherwise moves the solved hips.
        naturalTorsoWorld.set(naturalMotion.pelvis.bone.name, pelvisWorldQuaternion);
        if (naturalMotion.torso) {
          const terminalSource = sourceRest.get(naturalMotion.torso.terminalDecision.source)!;
          const sourceAnimatedWorld = terminalSource.bone.getWorldQuaternion(new THREE.Quaternion());
          const sourcePelvis = sourceRest.get(naturalMotion.pelvisDecision.source)!;
          const sourcePelvisReference = sourceReferenceWorldQuaternions.get(sourcePelvis.bone.name)!;
          const sourcePelvisAnimated = sourcePelvis.bone.getWorldQuaternion(new THREE.Quaternion());
          // Remove inherited parent motion before distributing torso articulation.
          // Express articulation in source-reference world axes for correction.
          const articulationWorld = sourcePelvisReference.clone()
            .multiply(sourcePelvisAnimated.clone().invert())
            .multiply(sourceAnimatedWorld);
          const totalDelta = correctedDelta(
            articulationWorld,
            sourceReferenceWorldQuaternions.get(terminalSource.bone.name)!,
            correction,
          );
          let cumulativeWeight = 0;
          for (let index = 0; index < naturalMotion.torso.states.length; index += 1) {
            cumulativeWeight += naturalMotion.torso.effectiveWeights[index];
            const partial = new THREE.Quaternion().slerp(totalDelta, cumulativeWeight);
            const state = naturalMotion.torso.states[index];
            naturalTorsoWorld.set(
              state.bone.name,
              pelvisWorldQuaternion.clone()
                .multiply(naturalMotion.pelvis.worldQuaternion.clone().invert())
                .multiply(partial).multiply(state.worldQuaternion).normalize(),
            );
          }
        }

        const pelvisReferenceDelta = pelvisWorldQuaternion.clone()
          .multiply(naturalMotion.pelvis.worldQuaternion.clone().invert())
          .normalize();
        const legFrames = new Map<NaturalFootSide, {
          prepared: PreparedNaturalLeg;
          hip: THREE.Vector3;
          desiredAnkle: THREE.Vector3;
          naturalFootQuaternion: THREE.Quaternion;
          desiredFootQuaternion: THREE.Quaternion;
          contact: PreparedNaturalMotion['contacts'][number] | null;
          contactWeight: number;
          poleWorld: THREE.Vector3;
        }>();
        const pelvisConstraints: Parameters<typeof solveNaturalPelvisCorrection>[0][number][] = [];
        for (const side of ['left', 'right'] as const) {
          const prepared = naturalMotion.legs[side];
          const hip = prepared.targetHip.worldPosition.clone()
            .sub(naturalMotion.pelvis.worldPosition)
            .applyQuaternion(pelvisReferenceDelta)
            .add(desiredRootWorldPosition);
          const sourceHip = prepared.sourceHip.bone.getWorldPosition(new THREE.Vector3());
          const sourceAnkle = prepared.sourceAnkle.bone.getWorldPosition(new THREE.Vector3());
          const sourceAnimatedReach = sourceAnkle.sub(sourceHip);
          if (sourceAnimatedReach.lengthSq() <= 1e-10) {
            throw new Error(`Natural motion ${side} source leg collapsed at frame ${frameIndex}.`);
          }
          const sourceReferenceReach = sourceReferenceWorldPositions.get(prepared.sourceAnkle.bone.name)!
            .clone()
            .sub(sourceReferenceWorldPositions.get(prepared.sourceHip.bone.name)!);
          const sourceDirectionDelta = new THREE.Quaternion().setFromUnitVectors(
            sourceReferenceReach.clone().normalize(),
            sourceAnimatedReach.clone().normalize(),
          );
          const correctedDirectionDelta = correction.clone()
            .multiply(sourceDirectionDelta)
            .multiply(correction.clone().invert())
            .normalize();
          let desiredReach = prepared.targetReferenceReach.clone()
            .applyQuaternion(correctedDirectionDelta)
            .normalize()
            .multiplyScalar(
              prepared.targetReferenceReach.length()
              * sourceAnimatedReach.length()
              / prepared.sourceReferenceReach,
            );
          if (naturalMotion.profile.reachTransfer === 'calibrated-bend') {
            const sourceKnee = prepared.sourceKnee.bone.getWorldPosition(new THREE.Vector3());
            const sourceFirst = sourceKnee.clone().sub(sourceHip);
            const sourceSecond = prepared.sourceAnkle.bone.getWorldPosition(new THREE.Vector3()).sub(sourceKnee);
            if (sourceFirst.lengthSq() <= 1e-10 || sourceSecond.lengthSq() <= 1e-10) {
              throw new Error(`Natural motion ${side} source segment collapsed at frame ${frameIndex}.`);
            }
            const bend = calibratedNaturalBend(sourceFirst.angleTo(sourceSecond), prepared.sourceReferenceBend, prepared.targetReferenceBend);
            const reach = Math.sqrt(Math.max(0, prepared.firstLength ** 2 + prepared.secondLength ** 2
              + 2 * prepared.firstLength * prepared.secondLength * Math.cos(bend)));
            desiredReach.setLength(reach);
          }
          if (grounding) desiredReach.z *= grounding.strideScale;
          const contact = naturalMotion.contacts.find(({ contact: candidate }) => (
            candidate.foot === side
            && frameIndex >= candidate.startFrame
            && frameIndex <= candidate.endFrame
          )) ?? null;
          const weight = contact ? contactBlendWeight(frameIndex, contact.contact) : 0;
          if (naturalMotion.legMotionLimit) {
            const directionLimit = limitNaturalLegDirection(
              desiredReach.clone().normalize().applyQuaternion(pelvisWorldQuaternion.clone().invert()),
              naturalMotion.legMotionLimit,
              1 - weight,
            );
            const diagnostic = naturalMotion.legMotionLimit.sides[side];
            diagnostic.maximumRequestedForwardDegrees = Math.max(
              diagnostic.maximumRequestedForwardDegrees,
              directionLimit.requestedSagittalDegrees,
            );
            diagnostic.maximumRequestedBackwardDegrees = Math.max(
              diagnostic.maximumRequestedBackwardDegrees,
              -directionLimit.requestedSagittalDegrees,
            );
            diagnostic.maximumRequestedLateralDegrees = Math.max(
              diagnostic.maximumRequestedLateralDegrees,
              Math.abs(directionLimit.requestedLateralDegrees),
            );
            if (directionLimit.constrained) diagnostic.constrainedSamples += 1;
            desiredReach = directionLimit.direction
              .applyQuaternion(pelvisWorldQuaternion)
              .multiplyScalar(desiredReach.length());
          }
          let poleWorld = new THREE.Vector3(...prepared.profile.pole).applyQuaternion(pelvisWorldQuaternion);
          if (naturalMotion.profile.legOrientation === 'animated') {
            const sourceKnee = prepared.sourceKnee.bone.getWorldPosition(new THREE.Vector3());
            const normal = sourceKnee.clone().sub(sourceHip).cross(prepared.sourceAnkle.bone.getWorldPosition(new THREE.Vector3()).sub(sourceKnee));
            if (normal.lengthSq() > 1e-10) {
              normal.normalize().applyQuaternion(correction);
              const animatedPole = desiredReach.clone().cross(normal);
              if (animatedPole.lengthSq() > 1e-10) poleWorld = animatedPole.normalize();
            }
          }
          const naturalAnkle = hip.clone().add(desiredReach);
          const naturalFootQuaternion = transferredWorldQuaternion(
            targetDecisions.get(prepared.targetAnkle.bone.name)!,
            prepared.targetAnkle,
          );
          let desiredAnkle = naturalAnkle;
          let desiredFootQuaternion = naturalFootQuaternion;
          if (contact) {
            const naturalSole = naturalSolePoint(
              naturalAnkle,
              naturalFootQuaternion,
              prepared.profile.soleOffset,
            );
            let pin = contactPins.get(contact.key);
            const planeContact = contact.contact.positionMode === 'plane';
            if (!pin || planeContact) {
              pin = {
                sole: naturalSole.clone().setComponent(1, grounding?.groundHeight ?? prepared.referenceSolePoint.y),
                quaternion: prepared.targetAnkle.worldQuaternion.clone(),
              };
              contactPins.set(contact.key, pin);
            }
            const contactPose = resolveNaturalContactPose({
              naturalAnkle,
              naturalFootQuaternion,
              referenceFootQuaternion: pin.quaternion,
              soleOffset: prepared.profile.soleOffset,
              pinnedSole: pin.sole,
              rootTravelPerFrame: contact.diagnostic.rootTravelPerFrame,
              elapsedFrames: planeContact ? 0 : frameIndex - contact.contact.startFrame,
              weight,
            });
            desiredFootQuaternion = contactPose.footQuaternion;
            desiredAnkle = contactPose.ankle;
            const legConstraint: Parameters<typeof solveNaturalTwoBoneLeg>[0] = {
              hip,
              desiredAnkle,
              referenceKnee: prepared.targetKnee.worldPosition,
              poleDirection: poleWorld,
              previousPlaneNormal: previousNaturalLegPlane![side],
              firstLength: prepared.firstLength,
              secondLength: prepared.secondLength,
              minBendDegrees: THREE.MathUtils.lerp(
                prepared.profile.minBendDegrees,
                naturalMotion.legMotionLimit?.minimumSwingBendDegrees ?? prepared.profile.minBendDegrees,
                1 - weight,
              ),
              maxBendDegrees: prepared.profile.maxBendDegrees,
            };
            pelvisConstraints.push({leg:legConstraint,maximumCorrection:prepared.profile.maxPelvisCorrection * weight});
          }
          legFrames.set(side, {
            prepared,
            hip,
            desiredAnkle,
            naturalFootQuaternion,
            desiredFootQuaternion,
            contact,
            contactWeight: weight,
            poleWorld,
          });
        }
        if (pelvisConstraints.length > 0) {
          pelvisCorrection = solveNaturalPelvisCorrection(pelvisConstraints);
          desiredRootWorldPosition.add(pelvisCorrection);
          const targetState = targetReference.get(rootDecision!.target)!;
          desiredRootLocalPosition = desiredRootWorldPosition.clone()
            .applyMatrix4(targetState.parentWorldMatrix.clone().invert());
        }
        for (const side of ['left', 'right'] as const) {
          const frame = legFrames.get(side)!;
          frame.hip.add(pelvisCorrection);
          if (!frame.contact) frame.desiredAnkle.add(pelvisCorrection);
          const poleWorld = frame.poleWorld;
          const solved = solveNaturalTwoBoneLeg({
            hip: frame.hip,
            desiredAnkle: frame.desiredAnkle,
            referenceKnee: frame.prepared.targetKnee.worldPosition,
            poleDirection: poleWorld,
            previousPlaneNormal: previousNaturalLegPlane![side],
            firstLength: frame.prepared.firstLength,
            secondLength: frame.prepared.secondLength,
            minBendDegrees: THREE.MathUtils.lerp(
              frame.prepared.profile.minBendDegrees,
              naturalMotion.legMotionLimit?.minimumSwingBendDegrees ?? frame.prepared.profile.minBendDegrees,
              1 - frame.contactWeight,
            ),
            maxBendDegrees: frame.prepared.profile.maxBendDegrees,
          });
          naturalLegBends[side].minimum = Math.min(naturalLegBends[side].minimum, solved.bendDegrees);
          naturalLegBends[side].maximum = Math.max(naturalLegBends[side].maximum, solved.bendDegrees);
          previousNaturalLegPlane![side].copy(solved.bendPlaneNormal);
          const thighDirection = solved.knee.clone().sub(frame.hip).normalize();
          const shinDirection = solved.ankle.clone().sub(solved.knee).normalize();
          const referenceThighDirection = frame.prepared.targetHipLocalDirection.clone()
            .applyQuaternion(frame.prepared.targetHip.worldQuaternion)
            .normalize();
          const referenceShinDirection = frame.prepared.targetKneeLocalDirection.clone()
            .applyQuaternion(frame.prepared.targetKnee.worldQuaternion)
            .normalize();
          naturalLegWorld.set(frame.prepared.targetHip.bone.name, alignNaturalAnatomicalFrame(
            referenceThighDirection,
            frame.prepared.referenceBendPlaneNormal,
            thighDirection,
            solved.bendPlaneNormal,
            frame.prepared.targetHip.worldQuaternion,
          ));
          naturalLegWorld.set(frame.prepared.targetKnee.bone.name, alignNaturalAnatomicalFrame(
            referenceShinDirection,
            frame.prepared.referenceBendPlaneNormal,
            shinDirection,
            solved.bendPlaneNormal,
            frame.prepared.targetKnee.worldQuaternion,
          ));
          if (naturalMotion.profile.legOrientation === 'animated') {
            for (const [state, localDirection, solvedDirection] of [
              [frame.prepared.targetHip, frame.prepared.targetHipLocalDirection, thighDirection],
              [frame.prepared.targetKnee, frame.prepared.targetKneeLocalDirection, shinDirection],
            ] as const) {
              const base = transferredWorldQuaternion(targetDecisions.get(state.bone.name)!, state);
              const baseDirection = localDirection.clone().applyQuaternion(base).normalize();
              naturalLegWorld.set(state.bone.name, new THREE.Quaternion().setFromUnitVectors(baseDirection, solvedDirection).multiply(base).normalize());
            }
          }
          const footQuaternion = frame.desiredFootQuaternion;
          if (frame.contact) {
            const diagnostic = frame.contact.diagnostic;
            if (solved.residual > diagnostic.maximumResidual) {
              diagnostic.maximumResidual = solved.residual;
              diagnostic.maximumResidualFrame = frameIndex;
            }
            if (pelvisCorrection.length() > diagnostic.maximumPelvisCorrection) {
              diagnostic.maximumPelvisCorrection = pelvisCorrection.length();
              diagnostic.maximumPelvisCorrectionFrame = frameIndex;
            }
            if (solved.clamped) diagnostic.clampedSamples += 1;
            if (frame.contactWeight >= 1 && solved.residual > 1e-5) diagnostic.unreachable = true;
          }
          naturalLegWorld.set(frame.prepared.targetAnkle.bone.name, footQuaternion);
          naturalFootCorrections.set(frame.prepared.targetAnkle.bone.name,
            footQuaternion.clone().multiply(frame.naturalFootQuaternion.clone().invert()).normalize());
        }
      }

      const desiredTargetWorld = new Map<string, THREE.Quaternion>();
      for (const targetBone of targetOrder) {
        const targetState = targetReference.get(targetBone.name)!;
        const decision = targetDecisions.get(targetBone.name);
        let worldQuaternion: THREE.Quaternion;
        const naturalWorldQuaternion = naturalLegWorld.get(targetBone.name)
          ?? naturalTorsoWorld.get(targetBone.name);
        if (naturalWorldQuaternion) {
          worldQuaternion = naturalWorldQuaternion;
        } else if (preservedTargetRotationSet.has(targetBone.name) && targetState.parentBone) {
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
          // Mapped toes retain their local articulation when an ankle is solved.
          // Transferring their old world orientation would undo the sole correction.
          for(let ancestor=targetState.parentBone;ancestor;ancestor=targetReference.get(ancestor.name)!.parentBone){
            const footCorrection=naturalFootCorrections.get(ancestor.name);
            if(footCorrection){worldQuaternion.premultiply(footCorrection).normalize();break;}
          }
        } else if (targetState.parentBone) {
          const parentWorld = desiredTargetWorld.get(targetState.parentBone.name)
            ?? targetReference.get(targetState.parentBone.name)!.worldQuaternion;
          const localQuaternion = targetState.localQuaternion.clone();
          const localOffset = targetLocalRotationOffsetQuaternions.get(targetBone.name);
          if (localOffset) localQuaternion.multiply(localOffset).normalize();
          worldQuaternion = parentWorld.clone().multiply(localQuaternion).normalize();
        } else {
          worldQuaternion = targetState.worldQuaternion.clone();
          const localOffset = targetLocalRotationOffsetQuaternions.get(targetBone.name);
          if (localOffset) worldQuaternion.multiply(localOffset).normalize();
        }
        desiredTargetWorld.set(targetBone.name, worldQuaternion);

        if (!naturalWorldQuaternion && (
          targetLocalRotationOffsetQuaternions.has(targetBone.name)
          || (referenceIntermediateTargetBones.has(targetBone.name) && targetReferenceQuaternionBones.has(targetBone.name))
        )) {
          const values = quaternionValues.get(targetBone.name) ?? [];
          const localQuaternion = targetState.localQuaternion.clone();
          const localOffset = targetLocalRotationOffsetQuaternions.get(targetBone.name);
          if (localOffset) localQuaternion.multiply(localOffset).normalize();
          localQuaternion.toArray(values, values.length);
          quaternionValues.set(targetBone.name, values);
        }
        if (referenceIntermediateTargetBones.has(targetBone.name) && targetReferencePositionBones.has(targetBone.name)) {
          const values = positionValues.get(targetBone.name) ?? [];
          targetState.localPosition.toArray(values, values.length);
          positionValues.set(targetBone.name, values);
        }

        if (!naturalWorldQuaternion && (!decision || !worldAnimatedSources.has(decision.source))) continue;
        const parentWorld = targetState.parentBone
          ? desiredTargetWorld.get(targetState.parentBone.name)!
          : new THREE.Quaternion().setFromRotationMatrix(targetState.parentWorldMatrix);
        const local = parentWorld.clone().invert().multiply(worldQuaternion).normalize();
        const values = quaternionValues.get(targetBone.name) ?? [];
        values.push(local.x, local.y, local.z, local.w);
        quaternionValues.set(targetBone.name, values);
      }

      if (rootDecision && desiredRootLocalPosition) {
        const values = positionValues.get(rootDecision.target) ?? [];
        values.push(desiredRootLocalPosition.x, desiredRootLocalPosition.y, desiredRootLocalPosition.z);
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
  const retargeted = new THREE.AnimationClip(targetName, outputDuration, tracks);
  const poseRanges = options.poseRanges ? auditPoseRanges(options.poseRanges,targetName,outputTimes.length,
    new Set(targetOrder.map(bone=>bone.name)),(frame,bone)=>{
      const values=quaternionValues.get(bone);
      return values ? new THREE.Quaternion().fromArray(values,frame*4) : targetReference.get(bone)!.localQuaternion.clone();
    }) : undefined;
  if(poseRanges?.issues.length && options.poseRanges?.policy==='reject') throw new Error(poseRangeSummary(poseRanges));
  return {
    clip: retargeted,
    report: {
      sourceClip: clip.name || '(unnamed)',
      poseRanges,
      targetClip: targetName,
      duration: outputDuration,
      visualTiming: options.visualTiming ? {...options.visualTiming,sourceDuration:clip.duration} : undefined,
      sampleCount: outputTimes.length,
      quaternionTrackCount: quaternionValues.size,
      positionTrackCount: positionValues.size,
      discardedTracks: discarded,
      hierarchyOnlyTracks: hierarchyOnly,
      mappedBones: activeDecisions,
      rootMotionScale,
      rootMotionExtraction: extractedRoot ? { bone: extractedRoot.bone.name, maximumDisplacement: maximumExtractedDisplacement } : undefined,
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
      targetChainCurls: structuredClone(targetChainCurls),
      naturalMotion: naturalMotion ? {
        contactSpace: 'model',
        torso: naturalMotion.torso ? {
          targetBones: naturalMotion.torso.states.map((state) => state.bone.name),
          effectiveWeights: [...naturalMotion.torso.effectiveWeights],
        } : null,
        legs: {
          left: {
            hip: naturalMotion.legs.left.targetHip.bone.name,
            knee: naturalMotion.legs.left.targetKnee.bone.name,
            ankle: naturalMotion.legs.left.targetAnkle.bone.name,
            soleOffsetAnkleLocal: [...naturalMotion.legs.left.profile.soleOffset],
            referenceSolePoint: naturalMotion.legs.left.referenceSolePoint.toArray(),
            referenceFootQuaternion: naturalMotion.legs.left.targetAnkle.worldQuaternion.toArray(),
            polePelvisLocal: [...naturalMotion.legs.left.profile.pole],
            referenceBendPlaneNormal: naturalMotion.legs.left.referenceBendPlaneNormal.toArray(),
            minimumBendDegrees: naturalLegBends.left.minimum,
            maximumBendDegrees: naturalLegBends.left.maximum,
          },
          right: {
            hip: naturalMotion.legs.right.targetHip.bone.name,
            knee: naturalMotion.legs.right.targetKnee.bone.name,
            ankle: naturalMotion.legs.right.targetAnkle.bone.name,
            soleOffsetAnkleLocal: [...naturalMotion.legs.right.profile.soleOffset],
            referenceSolePoint: naturalMotion.legs.right.referenceSolePoint.toArray(),
            referenceFootQuaternion: naturalMotion.legs.right.targetAnkle.worldQuaternion.toArray(),
            polePelvisLocal: [...naturalMotion.legs.right.profile.pole],
            referenceBendPlaneNormal: naturalMotion.legs.right.referenceBendPlaneNormal.toArray(),
            minimumBendDegrees: naturalLegBends.right.minimum,
            maximumBendDegrees: naturalLegBends.right.maximum,
          },
        },
        contacts: naturalMotion.contacts.map(({ diagnostic }) => structuredClone(diagnostic)),
        legMotionLimit: naturalMotion.legMotionLimit
          ? structuredClone(naturalMotion.legMotionLimit)
          : null,
      } : null,
      poseRecovery: poseRecovery ? { ...poseRecovery } : null,
    },
  };
}
