import * as THREE from 'three';
import type { RigMapDecision, RigMapResult } from './rigMapping';
import { buildRigMap } from './rigMapping';
import { parseSwingTrajectories, sampleSwingTrajectory, sampleSwingDescendantRotation, type SwingAnchor, type SwingTrajectory, type SwingRotationEnvelope } from './swingTrajectory';
import { bakeEndpointEnvelope, finishEndpointEnvelope, captureContactAnchor, captureContactPointOffsets, captureDescendantRotations, type EndpointEnvelope, type EndpointEnvelopeReport } from './endpointEnvelope';
import { parseLocalReferenceCorrections, type LocalReferenceCorrection } from './retargetReference';
import { parseForearmTwistShares, redistributeForearmTwist, type ForearmTwistShare, type ForearmTwistReport } from './forearmTwist';
import { constrainHeadChain, parseClipJointConstraints, type HeadJointConstraint } from './retargetJointConstraints';
import {auditPoseRanges,parsePoseRangeProfile,poseRangeSummary,type PoseRangeProfile,type PoseRangeReport} from './poseRanges';
import {retargetSourceFrameTime,validateRetargetVisualTiming,type RetargetVisualTiming} from './retargetTiming';
import { applyTargetReferenceScales, prepareScaleTransfer, type BoneScaleTransfer } from './retargetScale';
import {
  alignNaturalAnatomicalFrame,
  calibratedNaturalBend,
  contactBlendWeight,
  lengthNormalizedWeights,
  limitNaturalLegDirection,
  naturalSolePoint,
  naturalFootHeading,
  naturalContactOrientation,
  parseContactPoint,
  parseContactPatch,
  lowestContactPoint,
  naturalContactRamp,
  parseRootTravelSamples,
  validateRootTravelBindings,
  sampledRootDisplacement,
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
  /** Explicit calibrated multiplier; omission retains mapped-height scaling. */
  rootMotionScale?: number;
  extractRootMotionBone?: string;
  visualTiming?: RetargetVisualTiming;
  sampleRateHz?: number;
  interpolation?: 'linear' | 'step';
  nextDownRationalTimes?: boolean;
  alignMappedBoneDirections?: boolean;
  /** Only these target bones get direction constraints; others still rotate. */
  directionAlignmentBones?: string[];
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
  localReferenceCorrections?: Record<string, LocalReferenceCorrection>;
  jointConstraints?: HeadJointConstraint;
  poseRecovery?: PoseRecoveryEnvelope;
  forearmTwist?: ForearmTwistShare[];
  endpointEnvelope?: EndpointEnvelope;
  endpointTargetClips?: readonly THREE.AnimationClip[];
  scaleTransfer?: BoneScaleTransfer[];
}

export interface AnimationRetargetReport {
  forearmTwist?: ForearmTwistReport[];
  endpointEnvelope?: EndpointEnvelopeReport;
  jointConstraints?: { neck: string; head: string; correctedSamples: number; maximumCorrectionDegrees: number; maximumResidualDegrees: number; maximumResidualFrame: number | null };
  sourceClip: string;
  targetClip: string;
  duration: number;
  sampleCount: number;
  quaternionTrackCount: number;
  positionTrackCount: number;
  scaleTrackCount: number;
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
  localReferenceCorrections?: Record<string, LocalReferenceCorrection>;
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
    loopStartKey?: string;
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

function uniqueSampleTimes(tracks: readonly Pick<SampledTrack, 'track'>[], duration: number): number[] {
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
  tracks: readonly Pick<SampledTrack, 'track'>[],
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
    if (contact.orientationMode !== undefined && contact.orientationMode !== 'reference' && contact.orientationMode !== 'animated-heading' && contact.orientationMode !== 'animated') {
      throw new Error('Natural contact orientationMode must be reference, animated-heading or animated.');
    }
    parseContactPoint(contact.contactPoint);
    const patch=parseContactPatch(contact.contactPatch);
    if(patch){
      if(contact.positionMode!=='plane'||contact.orientationMode!=='animated'||contact.contactPoint!==undefined||contact.contactBone!==undefined||contact.anchorFrame!==undefined||contact.wrapToStart)throw new Error('contactPatch requires plane/animated contact without point, bone, anchor or wrap overrides.');
      for(const point of patch)if(point.bone){const bone=targetReference.get(point.bone)?.bone;if(!bone||!isBoneDescendantOf(bone,legs[contact.foot].targetAnkle.bone))throw new Error('contactPatch bone must be an ankle descendant.');}
    }
    if (contact.contactBone !== undefined) {
      const bone=targetReference.get(contact.contactBone)?.bone;
      if (!bone || !contact.contactPoint || !isBoneDescendantOf(bone,legs[contact.foot].targetAnkle.bone)) throw new Error('contactBone requires an ankle descendant and contactPoint.');
      if (contact.wrapToStart) throw new Error('Articulated contactBone does not support wrapped contacts.');
    }
    if (contact.endFrame >= sampleCount) {
      throw new Error(`Natural motion ${clipName} ${contact.foot}-foot contact ends after frame ${sampleCount - 1}.`);
    }
    const openingIndex = (profile.contacts?.[clipName] ?? []).findIndex(candidate => candidate.foot === contact.foot && candidate.startFrame === 0);
    if (contact.wrapToStart !== undefined && typeof contact.wrapToStart !== 'boolean') throw new Error('Contact wrapToStart must be boolean.');
    if (contact.wrapToStart && (contact.startFrame === 0 || contact.endFrame !== sampleCount - 1 || contact.positionMode === 'plane' || openingIndex < 0)) {
      throw new Error('Wrapped contact must be terminal/planted and have a same-foot opening interval.');
    }
    if (contact.wrapToStart) {
      const opening = profile.contacts![clipName][openingIndex];
      if (profile.contacts![clipName].filter(candidate => candidate.foot === contact.foot && candidate.startFrame === 0).length !== 1
        || (opening.orientationMode ?? 'reference') !== (contact.orientationMode ?? 'reference')
        || JSON.stringify(opening.contactPoint ?? legs[contact.foot].profile.soleOffset) !== JSON.stringify(contact.contactPoint ?? legs[contact.foot].profile.soleOffset)) {
        throw new Error('Wrapped contact requires one opening interval with matching orientation policy.');
      }
      if (opening.positionMode === 'plane' || contactBlendWeight(0, opening) !== 1 || contactBlendWeight(contact.endFrame, contact) !== 1) {
        throw new Error('Wrapped contact requires full-weight planted support at both loop endpoints.');
      }
    }
    const ramp = naturalContactRamp(contact);
    return {
      key: `${clipName}:${contact.foot}:${index}`,
      loopStartKey: contact.wrapToStart ? `${clipName}:${contact.foot}:${openingIndex}` : undefined,
      contact,
      diagnostic: {
        ...contact,
        clip: clipName,
        fullWeightStartFrame: ramp.fullWeightStartFrame,
        fullWeightEndFrame: ramp.fullWeightEndFrame,
        maximumResidual: 0,
        maximumResidualFrame: null,
        maximumPelvisCorrection: 0,
        maximumPelvisCorrectionFrame: null,
        clampedSamples: 0,
        unreachable: false,
        ...(profile.rootTravelSamples?.[clipName] ? {} : { rootTravelPerFrame: [
          ...(profile.rootTravelPerFrame?.[clipName] ?? [0, 0, 0]),
        ] as [number, number, number] }),
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
  if (options.endpointEnvelope) {
    if (options.sampleRateHz !== 60 || options.interpolation !== 'step' || options.poseRecovery || options.jointConstraints
      || options.forearmTwist?.length || options.scaleTransfer?.length || Object.keys(options.localReferenceCorrections ?? {}).length) {
      throw new Error('Endpoint envelopes require 60 Hz STEP and no recovery/joint/wrist/scale/reference post-corrections.');
    }
    const core = retargetAnimationClip(clip, source, target, mapping, { ...options, endpointEnvelope: undefined, naturalMotion: undefined, poseRanges: undefined });
    core.clip.name = clip.name;
    const grounding = options.naturalMotion?.grounding?.[clip.name];
    const blended = bakeEndpointEnvelope(core.clip, target, options.endpointTargetClips ?? [], options.endpointEnvelope, grounding?.rootHeightOffset ?? 0);
    const natural = options.naturalMotion ? { ...options.naturalMotion, torso: undefined,
      ...(grounding ? { grounding: { ...options.naturalMotion.grounding, [clip.name]: { ...grounding, rootHeightOffset: 0 } } } : {}) } : undefined;
    const identity = buildRigMap(target, target, { manualMap: Object.fromEntries(target.bones.map(b => [b.name,b.name])) });
    const constrained = retargetAnimationClip(blended.clip, target, target, identity, {
      clipName: options.clipName, applyUpCorrection: false, alignMappedBoneDirections: false,
      scaleRootMotion: false, sampleRateHz: 60, interpolation: 'step', nextDownRationalTimes: options.nextDownRationalTimes,
      sourceReferencePose: options.targetReferenceClip ? 'clip' : 'rest', sourceReferenceClip: options.targetReferenceClip,
      targetReferenceClip: options.targetReferenceClip, naturalMotion: natural, poseRanges: options.poseRanges,
    });
    const finished = finishEndpointEnvelope(constrained.clip, target, blended);
    if (finished.report.status !== 'matched') throw new Error(`Endpoint constraints conflict with target poses: ${JSON.stringify(finished.report)}`);
    return { ...constrained, clip: finished.clip, report: { ...constrained.report, endpointEnvelope: finished.report } };
  }
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
    // Only opt-in scale bones inherit the target reference clip's neutral.
    applyTargetReferenceScales(options.targetReferenceClip, target,
      new Set((options.scaleTransfer ?? []).map(spec => spec.targetBone)));
    target.bones[0]?.updateWorldMatrix(true, true);
    targetReference = captureRestState(target);
    restoreRestState(targetRest);
  }
  const mappedSources = new Set(mapping.decisions.map((decision) => decision.source));
  const { sampled, discarded, hierarchyOnly } = sampledTracksForClip(clip, source, mappedSources);
  const scaleSourceTracks = (options.scaleTransfer ?? []).flatMap(spec =>
    clip.tracks.filter(track => track.name === `${spec.sourceBone}.scale`).map(track => ({ track })));
  if (sampled.length === 0 && scaleSourceTracks.length === 0) {
    throw new Error(`Source clip ${clip.name || '(unnamed)'} has no mapped bone transform tracks.`);
  }
  if (options.scaleTransfer?.length && options.poseRecovery) {
    throw new Error('Scale transfer cannot be combined with pose recovery.');
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
    [...sampled, ...scaleSourceTracks],
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
  const automaticRootMotionScale = options.scaleRootMotion === false || !height
    ? 1
    : height.target / height.source;
  if (options.rootMotionScale !== undefined && (!Number.isFinite(options.rootMotionScale)
    || options.rootMotionScale <= 0 || options.scaleRootMotion === false)) {
    throw new Error('rootMotionScale requires a positive finite number and scaleRootMotion not false.');
  }
  const rootMotionScale = options.rootMotionScale ?? automaticRootMotionScale;
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
  let directionConstraints = options.alignMappedBoneDirections === false
    ? []
    : buildDirectionConstraints(activeDecisions, sourceRest, targetReference);
  const alignmentNames = options.directionAlignmentBones;
  if (alignmentNames !== undefined) {
    if (options.alignMappedBoneDirections === false || !Array.isArray(alignmentNames) || alignmentNames.length === 0
      || alignmentNames.some(name => typeof name !== 'string' || !name.trim())
      || new Set(alignmentNames).size !== alignmentNames.length) {
      throw new Error('directionAlignmentBones requires unique non-empty names and direction alignment enabled.');
    }
    const available = new Set(directionConstraints.map(constraint => constraint.targetBone.name));
    for (const name of alignmentNames) {
      if (!available.has(name)) throw new Error(`directionAlignmentBones contains unknown or unconstrained target bone ${name}.`);
    }
    const selected = new Set(alignmentNames);
    directionConstraints = directionConstraints.filter(constraint => selected.has(constraint.targetBone.name));
  }
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

  const scaleTransfer = prepareScaleTransfer(
    clip, source, target, mappedSources, options.scaleTransfer ?? [], sourceReferenceClip,
    new Map([...targetReference].map(([name, state]) => [name, state.localScale])),
  );

  let naturalMotion: PreparedNaturalMotion | null = null;
  if (options.naturalMotion) {
    const rootTravelSamples = parseRootTravelSamples(options.naturalMotion.rootTravelSamples);
    validateRootTravelBindings({ ...options.naturalMotion, rootTravelSamples });
    if (rootTravelSamples?.[clip.name] && (options.sampleRateHz !== 60 || interpolation !== 'step'
      || rootTravelSamples[clip.name].length !== outputTimes.length)) {
      throw new Error('rootTravelSamples requires 60 Hz STEP and exact output sample coverage.');
    }
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
  const jointConstraint = options.jointConstraints
    ? parseClipJointConstraints({ [clip.name]: options.jointConstraints })[clip.name] : undefined;
  const jointProfile = jointConstraint && options.poseRanges ? parsePoseRangeProfile(options.poseRanges) : undefined;
  if (jointConstraint) {
    const neck = targetReference.get(jointConstraint.neck), head = targetReference.get(jointConstraint.head);
    if (!neck || !head || head.parentBone !== neck.bone || !neck.parentBone
      || neck.bone.children.some(child => child instanceof THREE.Bone && child !== head.bone)) throw new Error('Joint constraints require a direct unbranched neck/head pair.');
    if (!jointProfile || ![neck, head].every(state => jointProfile.joints.some(joint => joint.bone === state.bone.name))) throw new Error('Joint constraints require calibrated neck/head pose ranges.');
    if (options.alignMappedBoneDirections !== false || poseRecovery) throw new Error('Joint constraints require direction alignment disabled and no pose recovery.');
    if (![neck, head].every(state => {
      const decision = targetDecisions.get(state.bone.name);
      return decision && worldAnimatedSources.has(decision.source);
    })) throw new Error('Joint constraints require mapped animated neck/head rotations.');
    for (const state of [neck, head]) {
      if (naturalMotion && (naturalMotion.torso?.states.includes(state)
        || Object.values(naturalMotion.legs).some(leg => leg.targetAnkle.bone === state.bone || isBoneDescendantOf(leg.targetAnkle.bone, state.bone)))) throw new Error('Joint constraints cannot overlap torso or leg/contact ownership.');
    }
    for (const joint of jointProfile.joints.filter(joint => joint.bone === jointConstraint.neck || joint.bone === jointConstraint.head)) {
      if ([joint.flexionDegrees, joint.lateralDegrees, joint.twistDegrees].some(range => range[0] > 0 || range[1] < 0)) throw new Error('Joint constraints require envelopes containing the calibrated neutral pose.');
    }
    for (let ancestor: THREE.Bone | null = head.bone; ancestor; ancestor = targetReference.get(ancestor.name)!.parentBone) {
      if (preservedTargetRotationSet.has(ancestor.name) || targetLocalRotationOffsetQuaternions.has(ancestor.name)
        || options.localReferenceCorrections?.[ancestor.name]) throw new Error('Joint constraints conflict with preserved/curl/reference chain rotations.');
    }
  }
  const jointConstraintReport = jointConstraint ? { neck: jointConstraint.neck, head: jointConstraint.head,
    correctedSamples: 0, maximumCorrectionDegrees: 0, maximumResidualDegrees: 0, maximumResidualFrame: null as number | null } : undefined;
  const naturalLegBends = {
    left: { minimum: Number.POSITIVE_INFINITY, maximum: Number.NEGATIVE_INFINITY },
    right: { minimum: Number.POSITIVE_INFINITY, maximum: Number.NEGATIVE_INFINITY },
  };
  const contactPins = new Map<string, { sole: THREE.Vector3; quaternion: THREE.Quaternion }>();
  const contactOffsets = new Map<string,[number,number,number][]>();
  const patchOffsets = new Map<string,[number,number,number][][]>();
  if (naturalMotion?.contacts.some(c=>c.contact.contactBone||c.contact.contactPatch) && options.sampleRateHz!==60) throw new Error('Articulated contact geometry requires 60 Hz sampling.');
  const swingSpecs = parseSwingTrajectories(naturalMotion?.profile.swingTrajectories)?.[clip.name] ?? [];
  const swings: { spec: SwingTrajectory; start: SwingAnchor; end: SwingAnchor }[] = [];
  const swingDiagnostics=swingSpecs.map(spec=>({foot:spec.foot,startFrame:spec.startFrame,endFrame:spec.endFrame,maximumResidual:0,maximumResidualFrame:null as number|null}));
  const swingRotations=new Map<string,SwingRotationEnvelope[]>();
  if (swingSpecs.length && (options.sampleRateHz !== 60 || interpolation !== 'step' || !naturalMotion?.profile.rootTravelSamples?.[clip.name])) throw new Error('Swing trajectories require 60 Hz STEP and sampled root travel.');
  if (naturalMotion && (naturalMotion.contacts.some(c=>c.contact.anchorFrame !== undefined || c.contact.contactBone !== undefined || c.contact.contactPatch !== undefined) || swingSpecs.length)) {
    const preContact = retargetAnimationClip(clip,source,target,mapping,{...options,naturalMotion:undefined,poseRanges:undefined,jointConstraints:undefined}).clip;
    for (const contact of naturalMotion.contacts) {
      const leg=naturalMotion.legs[contact.contact.foot];
      if(contact.contact.contactPatch)patchOffsets.set(contact.key,contact.contact.contactPatch.map(p=>p.bone?captureContactPointOffsets(preContact,target,outputTimes.length,leg.targetAnkle.bone.name,p.bone,p.point):Array.from({length:outputTimes.length},()=>p.point)));
      if (contact.contact.contactBone) contactOffsets.set(contact.key,captureContactPointOffsets(preContact,target,outputTimes.length,leg.targetAnkle.bone.name,contact.contact.contactBone,contact.contact.contactPoint!));
      if(contact.contact.anchorFrame === undefined) continue;
      const anchor=captureContactAnchor(preContact,target,contact.contact.anchorFrame,leg.targetAnkle.bone.name,contactOffsets.get(contact.key)?.[contact.contact.anchorFrame] ?? contact.contact.contactPoint ?? leg.profile.soleOffset);
      anchor.sole.y=naturalMotion.profile.grounding?.[clip.name]?.groundHeight ?? leg.referenceSolePoint.y;
      anchor.quaternion=naturalContactOrientation(contact.contact.orientationMode,anchor.quaternion,leg.targetAnkle.worldQuaternion);
      contactPins.set(contact.key,anchor);
      contact.diagnostic.anchorSolePoint=anchor.sole.toArray();
      contact.diagnostic.anchorFootQuaternion=anchor.quaternion.toArray();
    }
    for (const spec of swingSpecs) {
      if ([spec.endFrame,spec.startAnchorFrame,spec.endAnchorFrame].some(f=>f>=outputTimes.length)) throw new Error('Swing frame exceeds output samples.');
      const leg=naturalMotion.legs[spec.foot],travel=naturalMotion.profile.rootTravelSamples![clip.name];
      const anchor=(frame:number,grounded:boolean):SwingAnchor=>{
        const value=captureContactAnchor(preContact,target,frame,leg.targetAnkle.bone.name,leg.profile.soleOffset);
        if(grounded){value.sole.y=naturalMotion.profile.grounding?.[clip.name]?.groundHeight ?? leg.referenceSolePoint.y;value.quaternion=naturalFootHeading(value.quaternion,leg.targetAnkle.worldQuaternion);}
        value.sole.add(new THREE.Vector3(...travel[frame]));return value;
      };
      swings.push({spec,start:anchor(spec.startAnchorFrame,spec.startGrounded),end:anchor(spec.endAnchorFrame,spec.endGrounded)});
      if(spec.descendantRotations){
        const start=captureDescendantRotations(preContact,target,spec.startAnchorFrame,leg.targetAnkle.bone.name);
        const end=captureDescendantRotations(preContact,target,spec.endAnchorFrame,leg.targetAnkle.bone.name);
        for(const [name,q]of start){const intervals=swingRotations.get(name)??[];intervals.push({spec,start:q,end:end.get(name)!});intervals.sort((a,b)=>a.spec.startFrame-b.spec.startFrame);swingRotations.set(name,intervals);}
      }
    }
  }
  const previousNaturalLegPlane = naturalMotion ? {
    left: naturalMotion.legs.left.referenceBendPlaneNormal.clone(),
    right: naturalMotion.legs.right.referenceBendPlaneNormal.clone(),
  } : null;

  let scaleTracks: THREE.VectorKeyframeTrack[] = [];
  try {
    const sourceTimes: number[] = [];
    for (let frameIndex = 0; frameIndex < evaluationTimes.length; frameIndex += 1) {
      const time = options.visualTiming
        ? Math.min(clip.duration, Math.fround(retargetSourceFrameTime(frameIndex, clip.duration, options.visualTiming)))
        : evaluationTimes[frameIndex];
      sourceTimes.push(time);
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
      const constrainedJointWorld = new Map<string, THREE.Quaternion>();
      let headWorldCorrection: THREE.Quaternion | undefined;
      const conditionHead = () => {
        if (!jointConstraint) return;
        const intendedWorld = (name: string): THREE.Quaternion => {
          const state = targetReference.get(name)!, decision = targetDecisions.get(name);
          if (naturalTorsoWorld.has(name)) return naturalTorsoWorld.get(name)!.clone();
          if (decision) return transferredWorldQuaternion(decision, state);
          return state.parentBone ? intendedWorld(state.parentBone.name).multiply(state.localQuaternion).normalize() : state.worldQuaternion.clone();
        };
        const neckState = targetReference.get(jointConstraint.neck)!;
        const parentWorld = intendedWorld(neckState.parentBone!.name);
        const neckWorld = intendedWorld(jointConstraint.neck), headWorld = intendedWorld(jointConstraint.head);
        const neck = parentWorld.clone().invert().multiply(neckWorld).normalize();
        const head = neckWorld.clone().invert().multiply(headWorld).normalize();
        const solved = constrainHeadChain(neck, head,
          jointProfile!.joints.find(joint => joint.bone === jointConstraint.neck)!,
          jointProfile!.joints.find(joint => joint.bone === jointConstraint.head)!, jointConstraint.transitionDegrees);
        const correctedNeckWorld = parentWorld.multiply(solved.neck).normalize();
        const correctedHeadWorld = correctedNeckWorld.clone().multiply(solved.head).normalize();
        constrainedJointWorld.set(jointConstraint.neck, correctedNeckWorld);
        constrainedJointWorld.set(jointConstraint.head, correctedHeadWorld);
        headWorldCorrection = correctedHeadWorld.clone().multiply(headWorld.invert()).normalize();
        if (solved.maximumCorrectionDegrees > 1e-4) jointConstraintReport!.correctedSamples++;
        jointConstraintReport!.maximumCorrectionDegrees = Math.max(jointConstraintReport!.maximumCorrectionDegrees, solved.maximumCorrectionDegrees);
        if (solved.residualDegrees > jointConstraintReport!.maximumResidualDegrees) {
          jointConstraintReport!.maximumResidualDegrees = solved.residualDegrees;
          jointConstraintReport!.maximumResidualFrame = frameIndex;
        }
      };
      if (!naturalMotion) conditionHead();
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

        conditionHead();
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
          swing: boolean;
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
          const swing=swings.find(s=>s.spec.foot===side && frameIndex>=s.spec.startFrame && frameIndex<=s.spec.endFrame);
          if(swing){
            const pose=sampleSwingTrajectory(swing.spec,swing.start,swing.end,frameIndex,new THREE.Vector3(...naturalMotion.profile.rootTravelSamples![clip.name][frameIndex]));
            naturalFootQuaternion.copy(pose.quaternion);
            naturalAnkle.copy(pose.sole).sub(new THREE.Vector3(...prepared.profile.soleOffset).applyQuaternion(pose.quaternion));
          }
          let desiredAnkle = naturalAnkle;
          let desiredFootQuaternion = naturalFootQuaternion;
          if (contact) {
            const patch=patchOffsets.get(contact.key);
            const contactPoint = patch ? lowestContactPoint(patch.map(p=>p[frameIndex]),naturalFootQuaternion) : contactOffsets.get(contact.key)?.[frameIndex] ?? contact.contact.contactPoint ?? prepared.profile.soleOffset;
            const naturalSole = naturalSolePoint(
              naturalAnkle,
              naturalFootQuaternion,
              contactPoint,
            );
            let pin = contactPins.get(contact.key);
            const planeContact = contact.contact.positionMode === 'plane';
            if (!pin && contact.loopStartKey) {
              const opening = contactPins.get(contact.loopStartKey);
              if (!opening) throw new Error('Wrapped contact opening pin is missing.');
              pin = {
                sole: opening.sole.clone().addScaledVector(new THREE.Vector3(...contact.diagnostic.rootTravelPerFrame!), contact.contact.endFrame - contact.contact.startFrame),
                quaternion: opening.quaternion.clone(),
              };
              contactPins.set(contact.key, pin);
            }
            if (!pin || planeContact) {
              pin = {
                sole: naturalSole.clone().setComponent(1, grounding?.groundHeight ?? prepared.referenceSolePoint.y),
                quaternion: naturalContactOrientation(contact.contact.orientationMode,naturalFootQuaternion,prepared.targetAnkle.worldQuaternion,pin?.quaternion),
              };
              contactPins.set(contact.key, pin);
            }
            const contactPose = resolveNaturalContactPose({
              naturalAnkle,
              naturalFootQuaternion,
              referenceFootQuaternion: pin.quaternion,
              soleOffset: contactPoint,
              pinnedSole: pin.sole,
              rootTravelPerFrame: contact.diagnostic.rootTravelPerFrame ?? [0, 0, 0],
              ...(naturalMotion.profile.rootTravelSamples?.[clip.name] ? { rootDisplacement: sampledRootDisplacement(
                naturalMotion.profile.rootTravelSamples[clip.name], frameIndex, planeContact ? frameIndex : (contact.contact.anchorFrame ?? contact.contact.startFrame),
              ) } : {}),
              elapsedFrames: planeContact ? 0 : frameIndex - (contact.contact.anchorFrame ?? contact.contact.startFrame),
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
            pelvisConstraints.push({leg:legConstraint,maximumCorrection:prepared.profile.maxPelvisCorrection,weight});
          }
          if(swing && !contact)pelvisConstraints.push({leg:{hip,desiredAnkle,referenceKnee:prepared.targetKnee.worldPosition,poleDirection:poleWorld,
            firstLength:prepared.firstLength,secondLength:prepared.secondLength,minBendDegrees:naturalMotion.legMotionLimit?.minimumSwingBendDegrees ?? prepared.profile.minBendDegrees,maxBendDegrees:prepared.profile.maxBendDegrees},maximumCorrection:prepared.profile.maxPelvisCorrection});
          legFrames.set(side, {
            prepared,
            hip,
            desiredAnkle,
            naturalFootQuaternion,
            desiredFootQuaternion,
            contact,
            contactWeight: weight,
            swing: Boolean(swing),
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
          if (!frame.contact && !frame.swing) frame.desiredAnkle.add(pelvisCorrection);
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
          if(frame.swing){const diagnostic=swingDiagnostics.find(s=>s.foot===side && frameIndex>=s.startFrame && frameIndex<=s.endFrame)!;if(solved.residual>diagnostic.maximumResidual){diagnostic.maximumResidual=solved.residual;diagnostic.maximumResidualFrame=frameIndex;}}
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
        const naturalWorldQuaternion = constrainedJointWorld.get(targetBone.name) ?? naturalLegWorld.get(targetBone.name)
          ?? naturalTorsoWorld.get(targetBone.name);
        const swingRotation=sampleSwingDescendantRotation(swingRotations.get(targetBone.name)??[],frameIndex);
        if (swingRotation && targetState.parentBone) {
          const parent=desiredTargetWorld.get(targetState.parentBone.name) ?? targetReference.get(targetState.parentBone.name)!.worldQuaternion;
          worldQuaternion=parent.clone().multiply(swingRotation).normalize();
        } else if (naturalWorldQuaternion) {
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
          if (headWorldCorrection && isBoneDescendantOf(targetBone, targetReference.get(jointConstraint!.head)!.bone)) {
            worldQuaternion.premultiply(headWorldCorrection).normalize();
          }
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
    scaleTracks = scaleTransfer.sample(sourceTimes, outputTimes);
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

  const localReferenceCorrections = parseLocalReferenceCorrections(options.localReferenceCorrections);
  const forearmTwist = parseForearmTwistShares(options.forearmTwist);
  if (forearmTwist.length && (options.alignMappedBoneDirections !== false || interpolation !== 'step'
    || options.naturalMotion || options.jointConstraints || options.poseRecovery || Object.keys(localReferenceCorrections).length
    || forearmTwist.some(pair => [pair.forearm, pair.hand].some(bone => preservedTargetRotationSet.has(bone))))) {
    throw new Error('Forearm twist requires an isolated STEP post-pass with direction alignment disabled and no conflicting correction/preservation.');
  }
  for (const [bone, calibration] of Object.entries(localReferenceCorrections)) {
    const values = quaternionValues.get(bone);
    if (!values) throw new Error(`Local reference correction requires an emitted rotation track for ${bone}.`);
    const correctedBone = targetReference.get(bone)!.bone;
    if (naturalMotion && Object.values(naturalMotion.legs).some(leg => leg.targetAnkle.bone === correctedBone || isBoneDescendantOf(leg.targetAnkle.bone, correctedBone))) {
      throw new Error(`Local reference correction for ${bone} would invalidate solved leg/contact diagnostics.`);
    }
    const offset = new THREE.Quaternion(...calibration.to).normalize()
      .multiply(new THREE.Quaternion(...calibration.from).normalize().invert());
    for (let frame = 0; frame < outputTimes.length; frame++) {
      new THREE.Quaternion().fromArray(values, frame * 4).premultiply(offset).normalize().toArray(values, frame * 4);
    }
  }
  const forearmTwistReport = forearmTwist.length
    ? redistributeForearmTwist(forearmTwist, targetReference, quaternionValues, positionValues, outputTimes.length) : undefined;
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
  for (const track of scaleTracks) {
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
      forearmTwist: forearmTwistReport,
      jointConstraints: jointConstraintReport,
      poseRanges,
      localReferenceCorrections,
      targetClip: targetName,
      duration: outputDuration,
      visualTiming: options.visualTiming ? {...options.visualTiming,sourceDuration:clip.duration} : undefined,
      sampleCount: outputTimes.length,
      quaternionTrackCount: quaternionValues.size,
      positionTrackCount: positionValues.size,
      scaleTrackCount: scaleTracks.length,
      discardedTracks: discarded.filter(name => !scaleTransfer.tracks.some(track => track.name === name)),
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
        ...(swingDiagnostics.length ? { swingTrajectories: swingDiagnostics } : {}),
        ...(naturalMotion.profile.rootTravelSamples?.[clip.name] ? { rootTravelSamples: structuredClone(naturalMotion.profile.rootTravelSamples[clip.name]) } : {}),
        legMotionLimit: naturalMotion.legMotionLimit
          ? structuredClone(naturalMotion.legMotionLimit)
          : null,
      } : null,
      poseRecovery: poseRecovery ? { ...poseRecovery } : null,
    },
  };
}
