import type {
  DirectionTransferMode,
  PoseRecoveryEnvelope,
  TargetChainCurl,
} from './animationRetarget';
import { MAX_MODEL_RESOURCE_FILES } from './modelResourceBundle';
import { parseSwingTrajectories } from './swingTrajectory';
import {validateRetargetVisualTiming,type RetargetVisualTiming} from './retargetTiming';
import {parsePoseRangeProfile,type PoseRangeProfile} from './poseRanges';
import { naturalContactRamp, parseContactPoint, parseContactPatch, parseRootTravelSamples, validateRootTravelBindings } from './naturalRetarget';
import { parseLocalReferenceCorrections, type LocalReferenceCorrection } from './retargetReference';
import { parseClipJointConstraints, type HeadJointConstraint } from './retargetJointConstraints';
import { parseClipForearmTwist, type ForearmTwistShare } from './forearmTwist';
import { parseEndpointEnvelopes, validateEndpointWindows, type EndpointEnvelope } from './endpointEnvelope';
import type { LogicalAttachmentRole } from './rigMapping';
import type {
  NaturalFootContact,
  NaturalLegProfile,
  NaturalLegMotionLimits,
  NaturalMotionProfile,
  NaturalTorsoProfile,
} from './naturalRetarget';

export const GAME_READY_JOB_SCHEMA = 'rustsmf.game-ready-job.v2';
export const GAME_READY_PRESERVE_JOB_SCHEMA = 'rustsmf.game-ready-job.v3';
export const MAX_GAME_READY_TEXTURE_FILES = MAX_MODEL_RESOURCE_FILES - 2;
export const MAX_GAME_READY_SIDECAR_FILES = MAX_MODEL_RESOURCE_FILES - 1;

export interface RetargetJob {
  sourceModel: string;
  clips?: string[];
  clipNames?: Record<string, string>;
  manualMap: Record<string, string>;
  allowFuzzy?: boolean;
  applyUpCorrection?: boolean;
  alignMappedBoneDirections?: boolean;
  directionAlignmentBones?: string[];
  directionTransfer?: DirectionTransferMode;
  directionTransferBones?: string[];
  clipDirectionTransfer?: Record<string, DirectionTransferMode>;
  clipDirectionTransferBones?: Record<string, string[]>;
  sourceReferencePose?: 'rest' | 'first-frame' | 'clip';
  sourceReferenceClip?: string;
  targetReferenceClip?: string;
  preserveTargetLeafRotations?: boolean;
  preserveTargetRotations?: string[];
  targetChainCurls?: TargetChainCurl[];
  naturalMotion?: NaturalMotionProfile;
  poseRanges?: PoseRangeProfile;
  localReferenceCorrections?: Record<string, LocalReferenceCorrection>;
  clipJointConstraints?: Record<string, HeadJointConstraint>;
  clipForearmTwist?: Record<string, ForearmTwistShare[]>;
  clipEndpointEnvelopes?: Record<string, EndpointEnvelope>;
  clipPreserveTargetRotations?: Record<string, string[]>;
  clipPoseRecovery?: Record<string, PoseRecoveryEnvelope>;
  scaleRootMotion?: boolean;
  rootMotionScale?: number;
  replaceClips?: string[];
  extractRootMotionBone?: string;
  clipVisualTiming?: Record<string,RetargetVisualTiming>;
  sampleRateHz?: number;
  interpolation?: 'linear' | 'step';
  nextDownRationalTimes?: boolean;
}

interface GameReadyJobCommon {
  coordinates: {
    unitMeters: number;
    up: '+Y';
    forward: '+Z';
    grounded: boolean;
  };
  rig: {
    clipNames?: Record<string, string>;
    attachments?: Partial<Record<LogicalAttachmentRole, string>>;
    retarget?: RetargetJob | null;
  };
  output: {
    generationRoot: string;
    currentPointer?: string;
  };
  provenance: {
    generator?: string;
    ownership: string;
    classification?: string;
    notes?: string[];
  };
}

export interface GameReadyJob extends GameReadyJobCommon {
  $schema: typeof GAME_READY_JOB_SCHEMA;
  input: {
    riggedModel: string;
    referenceObj: string;
    referenceMtl: string;
    textures: string[];
  };
  materialRepair: { mode: 'strict-auto'; textureFlipY: boolean };
}

export interface PreserveExistingGameReadyJob extends GameReadyJobCommon {
  $schema: typeof GAME_READY_PRESERVE_JOB_SCHEMA;
  input: {
    riggedModel: string;
    sidecars: string[];
  };
  materials: { mode: 'preserve-existing' };
}

export type GameReadyJobDocument = GameReadyJob | PreserveExistingGameReadyJob;

export interface GameReadyPathPolicy {
  isAbsolute(value: string): boolean;
  resolve(value: string): string;
  comparisonKey(value: string): string;
}

const ATTACHMENT_ROLES = [
  'root',
  'torso',
  'head',
  'rightHand',
  'leftHand',
  'rightFoot',
  'leftFoot',
] as const satisfies readonly LogicalAttachmentRole[];

function fail(message: string): never {
  throw new Error(message);
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function rejectUnknownFields(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  label: string,
): void {
  const known = new Set(allowed);
  const unknown = Object.keys(value).filter((field) => !known.has(field));
  if (unknown.length > 0) fail(`${label} contains unknown fields: ${unknown.join(', ')}.`);
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string.`);
  return value;
}

function absolutePath(value: unknown, label: string, paths: GameReadyPathPolicy): string {
  const result = stringValue(value, label);
  if (!paths.isAbsolute(result)) fail(`${label} must be an absolute path.`);
  return paths.resolve(result);
}

function stringMap(value: unknown, label: string): Record<string, string> {
  if (value === undefined) return {};
  const object = objectValue(value, label);
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(object)) {
    if (!key.trim() || typeof entry !== 'string' || !entry.trim()) {
      fail(`${label} must contain non-empty string keys and values.`);
    }
    result[key] = entry;
  }
  return result;
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') fail(`${label} must be boolean.`);
  return value;
}

function poseRecoveryMap(value: unknown, label: string): Record<string, PoseRecoveryEnvelope> {
  if (value === undefined) return {};
  const source = objectValue(value, label);
  const result: Record<string, PoseRecoveryEnvelope> = {};
  for (const [clipName, entry] of Object.entries(source)) {
    if (!clipName.trim()) fail(`${label} must contain non-empty clip names.`);
    const envelope = objectValue(entry, `${label}.${clipName}`);
    rejectUnknownFields(envelope, ['peakFrame', 'holdThroughFrame', 'returnByFrame'], `${label}.${clipName}`);
    const frames = {
      peakFrame: envelope.peakFrame,
      holdThroughFrame: envelope.holdThroughFrame,
      returnByFrame: envelope.returnByFrame,
    };
    if (Object.values(frames).some((frame) => !Number.isInteger(frame) || (frame as number) < 0)) {
      fail(`${label}.${clipName} frames must be non-negative integers.`);
    }
    if (
      (frames.holdThroughFrame as number) < (frames.peakFrame as number)
      || (frames.returnByFrame as number) <= (frames.holdThroughFrame as number)
    ) {
      fail(`${label}.${clipName} requires peakFrame <= holdThroughFrame < returnByFrame.`);
    }
    result[clipName] = frames as PoseRecoveryEnvelope;
  }
  return result;
}

function stringArrayMap(value: unknown, label: string): Record<string, string[]> {
  if (value === undefined) return {};
  const source = objectValue(value, label);
  const result: Record<string, string[]> = {};
  for (const [clipName, entry] of Object.entries(source)) {
    if (!clipName.trim()) fail(`${label} must contain non-empty clip names.`);
    if (!Array.isArray(entry) || entry.length === 0 || entry.some((name) => typeof name !== 'string' || !name.trim())) {
      fail(`${label}.${clipName} must be a non-empty array of target bone names.`);
    }
    const names = entry as string[];
    if (new Set(names).size !== names.length) fail(`${label}.${clipName} must not contain duplicate target bone names.`);
    result[clipName] = [...names];
  }
  return result;
}

function directionTransferMap(value: unknown, label: string): Record<string, DirectionTransferMode> {
  if (value === undefined) return {};
  const source = objectValue(value, label);
  const result: Record<string, DirectionTransferMode> = {};
  for (const [clipName, entry] of Object.entries(source)) {
    if (!clipName.trim() || (entry !== 'relative' && entry !== 'absolute')) {
      fail(`${label} must map non-empty clip names to relative or absolute.`);
    }
    result[clipName] = entry;
  }
  return result;
}

function targetChainCurlArray(
  value: unknown,
  label: string,
): TargetChainCurl[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`${label} must be an array when supplied.`);
  const result: TargetChainCurl[] = [];
  const configuredBones = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const curl = objectValue(entry, `${label}[${index}]`);
    rejectUnknownFields(curl, ['palmBone', 'bones', 'palmNormal', 'degrees'], `${label}[${index}]`);
    const palmBone = stringValue(curl.palmBone, `${label}[${index}].palmBone`);
    const bones = stringArray(curl.bones, `${label}[${index}].bones`)!;
    if (!Array.isArray(curl.palmNormal) || curl.palmNormal.length !== 3
      || curl.palmNormal.some((component) => typeof component !== 'number' || !Number.isFinite(component))) {
      fail(`${label}[${index}].palmNormal must contain three finite numbers.`);
    }
    const palmNormal = curl.palmNormal as [number, number, number];
    if (palmNormal.every((component) => component === 0)) fail(`${label}[${index}].palmNormal must be non-zero.`);
    if (!Array.isArray(curl.degrees) || curl.degrees.length !== bones.length
      || curl.degrees.some((degrees) => typeof degrees !== 'number' || !Number.isFinite(degrees) || Math.abs(degrees) > 180)) {
      fail(`${label}[${index}].degrees must match bones with finite values from -180 through 180.`);
    }
    for (const boneName of bones) {
      if (configuredBones.has(boneName)) fail(`${label} must not configure target bone ${boneName} more than once.`);
      configuredBones.add(boneName);
    }
    result.push({ palmBone, bones, palmNormal: [...palmNormal], degrees: [...curl.degrees] as number[] });
  }
  return result;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be a finite number.`);
  return value;
}

function naturalLegProfile(value: unknown, label: string): NaturalLegProfile {
  const source = objectValue(value, label);
  rejectUnknownFields(
    source,
    ['hip', 'knee', 'ankle', 'soleOffset', 'pole', 'minBendDegrees', 'maxBendDegrees', 'maxPelvisCorrection'],
    label,
  );
  if (!Array.isArray(source.pole) || source.pole.length !== 3
    || source.pole.some((component) => typeof component !== 'number' || !Number.isFinite(component))) {
    fail(`${label}.pole must contain three finite pelvis-local components.`);
  }
  const pole = source.pole as [number, number, number];
  if (pole.every((component) => component === 0)) fail(`${label}.pole must be non-zero.`);
  if (!Array.isArray(source.soleOffset) || source.soleOffset.length !== 3
    || source.soleOffset.some((component) => typeof component !== 'number' || !Number.isFinite(component))) {
    fail(`${label}.soleOffset must contain three finite ankle-local components.`);
  }
  const minBendDegrees = finiteNumber(source.minBendDegrees, `${label}.minBendDegrees`);
  const maxBendDegrees = finiteNumber(source.maxBendDegrees, `${label}.maxBendDegrees`);
  const maxPelvisCorrection = finiteNumber(source.maxPelvisCorrection, `${label}.maxPelvisCorrection`);
  if (minBendDegrees < 0 || maxBendDegrees >= 180 || minBendDegrees > maxBendDegrees) {
    fail(`${label} requires 0 <= minBendDegrees <= maxBendDegrees < 180.`);
  }
  if (maxPelvisCorrection < 0) fail(`${label}.maxPelvisCorrection must be non-negative.`);
  return {
    hip: stringValue(source.hip, `${label}.hip`),
    knee: stringValue(source.knee, `${label}.knee`),
    ankle: stringValue(source.ankle, `${label}.ankle`),
    soleOffset: [...source.soleOffset] as [number, number, number],
    pole: [...pole],
    minBendDegrees,
    maxBendDegrees,
    maxPelvisCorrection,
  };
}

function naturalContactMap(value: unknown, label: string): Record<string, NaturalFootContact[]> {
  if (value === undefined) return {};
  const source = objectValue(value, label);
  const result: Record<string, NaturalFootContact[]> = {};
  for (const [clipName, entries] of Object.entries(source)) {
    if (!clipName.trim() || !Array.isArray(entries) || entries.length === 0) {
      fail(`${label} must map non-empty clip names to non-empty contact arrays.`);
    }
    const contacts = entries.map((entry, index): NaturalFootContact => {
      const contact = objectValue(entry, `${label}.${clipName}[${index}]`);
      rejectUnknownFields(contact, ['foot', 'positionMode', 'orientationMode', 'contactPoint', 'contactBone', 'contactPatch', 'startFrame', 'endFrame', 'anchorFrame', 'blendFrames', 'blendInFrames', 'blendOutFrames', 'wrapToStart'], `${label}.${clipName}[${index}]`);
      if(contact.contactPatch!==undefined&&(contact.positionMode!=='plane'||contact.orientationMode!=='animated'||contact.contactPoint!==undefined||contact.contactBone!==undefined||contact.anchorFrame!==undefined||contact.wrapToStart))fail('contactPatch requires plane/animated contact without point, bone, anchor or wrap overrides.');
      if (contact.contactBone !== undefined && (typeof contact.contactBone !== 'string' || !contact.contactBone.trim() || contact.contactBone.length>160 || contact.contactPoint===undefined)) fail('contactBone requires a bounded bone name and contactPoint.');
      if (contact.positionMode !== undefined && contact.positionMode !== 'planted' && contact.positionMode !== 'plane') {
        fail(`${label}.${clipName}[${index}].positionMode must be planted or plane.`);
      }
      if (contact.orientationMode !== undefined && contact.orientationMode !== 'reference' && contact.orientationMode !== 'animated-heading' && contact.orientationMode !== 'animated') {
        fail(`${label}.${clipName}[${index}].orientationMode must be reference, animated-heading or animated.`);
      }
      if (contact.foot !== 'left' && contact.foot !== 'right') {
        fail(`${label}.${clipName}[${index}].foot must be left or right.`);
      }
      for (const field of ['startFrame', 'endFrame', 'blendFrames'] as const) {
        if (!Number.isInteger(contact[field]) || (contact[field] as number) < 0) {
          fail(`${label}.${clipName}[${index}].${field} must be a non-negative integer 60 Hz frame.`);
        }
      }
      const startFrame = contact.startFrame as number;
      const endFrame = contact.endFrame as number;
      const blendFrames = contact.blendFrames as number;
      if (endFrame < startFrame) fail(`${label}.${clipName}[${index}] requires startFrame <= endFrame.`);
      if (contact.blendInFrames === undefined && contact.blendOutFrames === undefined && (2 * blendFrames) > (endFrame - startFrame + 1)) {
        fail(`${label}.${clipName}[${index}].blendFrames leaves no full-weight contact frame.`);
      }
      const parsed: NaturalFootContact = { foot: contact.foot, startFrame, endFrame, blendFrames,
        ...(contact.contactPoint === undefined ? {} : { contactPoint: parseContactPoint(contact.contactPoint) }),
        ...(contact.contactBone === undefined ? {} : { contactBone: contact.contactBone as string }),
        ...(contact.contactPatch === undefined ? {} : { contactPatch: parseContactPatch(contact.contactPatch) }),
        ...(contact.anchorFrame === undefined ? {} : { anchorFrame: contact.anchorFrame as number }),
        ...(contact.wrapToStart === undefined ? {} : { wrapToStart: optionalBoolean(contact.wrapToStart, 'contact.wrapToStart') }),
        ...(contact.blendInFrames === undefined ? {} : { blendInFrames: contact.blendInFrames as number }),
        ...(contact.blendOutFrames === undefined ? {} : { blendOutFrames: contact.blendOutFrames as number }),
        ...(contact.positionMode === undefined ? {} : {positionMode:contact.positionMode}),
        ...(contact.orientationMode === undefined ? {} : {orientationMode:contact.orientationMode}) };
      naturalContactRamp(parsed);
      if (parsed.wrapToStart && (parsed.startFrame === 0 || parsed.positionMode === 'plane')) fail('Wrapped contact requires a later planted interval.');
      return parsed;
    });
    for (const foot of ['left', 'right'] as const) {
      const ordered = contacts.filter((contact) => contact.foot === foot).sort((a, b) => a.startFrame - b.startFrame);
      if (ordered.some((contact, index) => index > 0 && contact.startFrame <= ordered[index - 1].endFrame)) {
        fail(`${label}.${clipName} contains overlapping ${foot}-foot contacts.`);
      }
    }
    result[clipName] = contacts;
  }
  return result;
}

function finiteVectorMap(value: unknown, label: string): Record<string, [number, number, number]> {
  if (value === undefined) return {};
  const source = objectValue(value, label);
  const result: Record<string, [number, number, number]> = {};
  for (const [clipName, vector] of Object.entries(source)) {
    if (!clipName.trim() || !Array.isArray(vector) || vector.length !== 3
      || vector.some((component) => typeof component !== 'number' || !Number.isFinite(component))) {
      fail(`${label} must map non-empty clip names to three finite model-space components per 60 Hz frame.`);
    }
    result[clipName] = [...vector] as [number, number, number];
  }
  return result;
}

function naturalLegMotionLimitMap(value: unknown, label: string): Record<string, NaturalLegMotionLimits> {
  if (value === undefined) return {};
  const source = objectValue(value, label);
  const result: Record<string, NaturalLegMotionLimits> = {};
  for (const [clipName, entry] of Object.entries(source)) {
    if (!clipName.trim()) fail(`${label} clip names must be non-empty.`);
    const limit = objectValue(entry, `${label}.${clipName}`);
    rejectUnknownFields(limit, [
      'maximumForwardDegrees', 'maximumBackwardDegrees', 'maximumLateralDegrees',
      'minimumSwingBendDegrees',
    ], `${label}.${clipName}`);
    const parsed = {
      maximumForwardDegrees: finiteNumber(limit.maximumForwardDegrees, `${label}.${clipName}.maximumForwardDegrees`),
      maximumBackwardDegrees: finiteNumber(limit.maximumBackwardDegrees, `${label}.${clipName}.maximumBackwardDegrees`),
      maximumLateralDegrees: finiteNumber(limit.maximumLateralDegrees, `${label}.${clipName}.maximumLateralDegrees`),
      minimumSwingBendDegrees: finiteNumber(limit.minimumSwingBendDegrees, `${label}.${clipName}.minimumSwingBendDegrees`),
    };
    if ([parsed.maximumForwardDegrees, parsed.maximumBackwardDegrees, parsed.maximumLateralDegrees]
      .some((angle) => angle < 0 || angle >= 90)) {
      fail(`${label}.${clipName} direction limits must be from 0 up to, but not including, 90 degrees.`);
    }
    if (parsed.minimumSwingBendDegrees < 0 || parsed.minimumSwingBendDegrees >= 180) {
      fail(`${label}.${clipName}.minimumSwingBendDegrees must be from 0 up to, but not including, 180.`);
    }
    result[clipName] = parsed;
  }
  return result;
}

function naturalMotionProfile(value: unknown, label: string): NaturalMotionProfile | undefined {
  if (value === undefined) return undefined;
  const source = objectValue(value, label);
  rejectUnknownFields(source, ['torso', 'legs', 'contacts', 'rootTravelPerFrame', 'rootTravelSamples', 'swingTrajectories', 'legMotionLimits', 'reachTransfer', 'grounding', 'legOrientation'], label);
  if (source.reachTransfer !== undefined && source.reachTransfer !== 'reference-ratio' && source.reachTransfer !== 'calibrated-bend') {
    fail(`${label}.reachTransfer must be reference-ratio or calibrated-bend.`);
  }
  const reachTransfer = source.reachTransfer as NaturalMotionProfile['reachTransfer'];
  if (source.legOrientation !== undefined && !['calibrated','animated'].includes(String(source.legOrientation))) fail(`${label}.legOrientation must be calibrated or animated.`);
  const legOrientation = source.legOrientation as NaturalMotionProfile['legOrientation'];
  const grounding: NonNullable<NaturalMotionProfile['grounding']> = {};
  for (const [name, raw] of Object.entries(source.grounding === undefined ? {} : objectValue(source.grounding, `${label}.grounding`))) {
    if (!name.trim()) fail(`${label}.grounding requires named clips.`);
    const entry = objectValue(raw, `${label}.grounding.${name}`);
    rejectUnknownFields(entry, ['strideScale','rootHeightOffset','groundHeight'], `${label}.grounding.${name}`);
    const strideScale = finiteNumber(entry.strideScale, 'grounding.strideScale');
    if (strideScale <= 0 || strideScale > 4) fail('grounding.strideScale must be positive and at most 4.');
    grounding[name] = {strideScale, rootHeightOffset:finiteNumber(entry.rootHeightOffset,'grounding.rootHeightOffset'), groundHeight:finiteNumber(entry.groundHeight,'grounding.groundHeight')};
  }

  const legs = objectValue(source.legs, `${label}.legs`);
  const unknownLegs = Object.keys(legs).filter((side) => side !== 'left' && side !== 'right');
  if (unknownLegs.length > 0) fail(`${label}.legs contains unknown sides: ${unknownLegs.join(', ')}.`);
  const parsedLegs = {
    left: naturalLegProfile(legs.left, `${label}.legs.left`),
    right: naturalLegProfile(legs.right, `${label}.legs.right`),
  };
  let torso: NaturalTorsoProfile | undefined;
  if (source.torso !== undefined) {
    const torsoSource = objectValue(source.torso, `${label}.torso`);
    rejectUnknownFields(torsoSource, ['targetBones', 'weights'], `${label}.torso`);
    const targetBones = stringArray(torsoSource.targetBones, `${label}.torso.targetBones`)!;
    let weights: number[] | undefined;
    if (torsoSource.weights !== undefined) {
      if (!Array.isArray(torsoSource.weights) || torsoSource.weights.length !== targetBones.length
        || torsoSource.weights.some((weight) => typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0)
        || torsoSource.weights.every((weight) => weight === 0)) {
        fail(`${label}.torso.weights must match targetBones with finite non-negative values including one positive value.`);
      }
      weights = [...torsoSource.weights] as number[];
    }
    torso = { targetBones, weights };
  }
  const configuredBones = [
    parsedLegs.left.hip, parsedLegs.left.knee, parsedLegs.left.ankle,
    parsedLegs.right.hip, parsedLegs.right.knee, parsedLegs.right.ankle,
  ];
  if (new Set(configuredBones).size !== configuredBones.length) fail(`${label}.legs must use six distinct target bones.`);
  if (torso?.targetBones.some((bone) => configuredBones.includes(bone))) {
    fail(`${label}.torso and legs must not configure the same target bone.`);
  }
  const contacts = naturalContactMap(source.contacts, `${label}.contacts`);
  const rootTravelPerFrame = finiteVectorMap(source.rootTravelPerFrame, `${label}.rootTravelPerFrame`);
  const legMotionLimits = naturalLegMotionLimitMap(source.legMotionLimits, `${label}.legMotionLimits`);
  const orphanTravel = Object.keys(rootTravelPerFrame).filter((clipName) => !contacts[clipName]);
  if (orphanTravel.length > 0) {
    fail(`${label}.rootTravelPerFrame has no contact intervals for: ${orphanTravel.join(', ')}.`);
  }
  const maximumMinimumSwingBend = Math.min(parsedLegs.left.maxBendDegrees, parsedLegs.right.maxBendDegrees);
  const invalidSwingBends = Object.entries(legMotionLimits)
    .filter(([, limit]) => limit.minimumSwingBendDegrees > maximumMinimumSwingBend)
    .map(([clipName]) => clipName);
  if (invalidSwingBends.length > 0) {
    fail(`${label}.legMotionLimits minimumSwingBendDegrees exceeds a configured leg maximum for: ${invalidSwingBends.join(', ')}.`);
  }
  const rootTravelSamples = parseRootTravelSamples(source.rootTravelSamples);
  const swingTrajectories = parseSwingTrajectories(source.swingTrajectories);
  for (const [name, entries] of Object.entries(swingTrajectories ?? {})) {
    if (!rootTravelSamples?.[name]) fail('Swing trajectories require sampled receiving-root travel.');
    if(entries.some(s=>[s.endFrame,s.startAnchorFrame,s.endAnchorFrame].some(f=>f>=rootTravelSamples![name].length))) fail('Swing frame exceeds sampled root travel.');
  }
  const profile = { torso, legs: parsedLegs, contacts, rootTravelPerFrame, legMotionLimits, reachTransfer, grounding, legOrientation,
    ...(swingTrajectories === undefined ? {} : { swingTrajectories }),
    ...(rootTravelSamples === undefined ? {} : { rootTravelSamples }) };
  validateRootTravelBindings(profile);
  return profile;
}

function visualTimingMap(value: unknown): Record<string,RetargetVisualTiming> {
  if (value === undefined) return {};
  const source=objectValue(value,'clipVisualTiming'),result: Record<string,RetargetVisualTiming>={};
  for (const [name,raw] of Object.entries(source)) {
    if (!name.trim()) fail('Visual timing requires a clip name.');
    const entry=objectValue(raw,`clipVisualTiming.${name}`);
    rejectUnknownFields(entry,['durationFrames','cycles','landmarks'],`clipVisualTiming.${name}`);
    if (typeof entry.durationFrames !== 'number' || typeof entry.cycles !== 'number') fail('Visual timing requires numeric durationFrames and cycles.');
    const timing: RetargetVisualTiming={durationFrames:entry.durationFrames,cycles:entry.cycles};
    if (entry.landmarks !== undefined) {
      if (!Array.isArray(entry.landmarks)) fail('Visual landmarks must be an array.');
      timing.landmarks=entry.landmarks.map((rawPoint,index)=>{
        const point=objectValue(rawPoint,`clipVisualTiming.${name}.landmarks[${index}]`);
        rejectUnknownFields(point,['outputFrame','sourcePhase'],'Visual landmark');
        return {outputFrame:finiteNumber(point.outputFrame,'landmark.outputFrame'),sourcePhase:finiteNumber(point.sourcePhase,'landmark.sourcePhase')};
      });
    }
    validateRetargetVisualTiming(timing);result[name]=timing;
  }
  return result;
}

function stringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || !item.trim())) {
    fail(`${label} must be a non-empty array of names when supplied.`);
  }
  const names = value as string[];
  if (new Set(names).size !== names.length) fail(`${label} must not contain duplicates.`);
  return [...names];
}

export function resolvePreservedTargetRotations(
  retarget: Pick<RetargetJob, 'preserveTargetRotations' | 'clipPreserveTargetRotations'>,
  clipName: string,
): string[] {
  return [...new Set([
    ...(retarget.preserveTargetRotations ?? []),
    ...(retarget.clipPreserveTargetRotations?.[clipName] ?? []),
  ])];
}

function assertUniquePaths(paths: readonly string[], label: string, policy: GameReadyPathPolicy): void {
  const keys = paths.map((item) => policy.comparisonKey(item));
  if (new Set(keys).size !== keys.length) fail(`${label} must not contain duplicate paths.`);
}

export function parseGameReadyJob(value: unknown, paths: GameReadyPathPolicy): GameReadyJob {
  const parsed = parseGameReadyJobDocument(value, paths);
  if (parsed.$schema !== GAME_READY_JOB_SCHEMA) {
    fail(`This caller requires ${GAME_READY_JOB_SCHEMA}; use parseGameReadyJobDocument for versioned CLI jobs.`);
  }
  return parsed;
}

export function parseGameReadyJobDocument(value: unknown, paths: GameReadyPathPolicy): GameReadyJobDocument {
  const job = objectValue(value, 'job');
  const schema = job.$schema;
  if (schema !== GAME_READY_JOB_SCHEMA && schema !== GAME_READY_PRESERVE_JOB_SCHEMA) {
    fail(`job.$schema must equal ${GAME_READY_JOB_SCHEMA} or ${GAME_READY_PRESERVE_JOB_SCHEMA}.`);
  }
  rejectUnknownFields(job, schema === GAME_READY_JOB_SCHEMA
    ? ['$schema', 'input', 'materialRepair', 'coordinates', 'rig', 'output', 'provenance']
    : ['$schema', 'input', 'materials', 'coordinates', 'rig', 'output', 'provenance'], 'job');
  const input = objectValue(job.input, 'job.input');
  let legacyInput: GameReadyJob['input'] | undefined;
  let preserveInput: PreserveExistingGameReadyJob['input'] | undefined;
  let textureFlipY = true;
  if (schema === GAME_READY_JOB_SCHEMA) {
    rejectUnknownFields(input, ['riggedModel', 'referenceObj', 'referenceMtl', 'textures'], 'job.input');
    const textureValues = input.textures;
    if (!Array.isArray(textureValues) || textureValues.length === 0 || textureValues.length > MAX_GAME_READY_TEXTURE_FILES) {
      fail(`job.input.textures must contain 1-${MAX_GAME_READY_TEXTURE_FILES} absolute JPEG/PNG paths.`);
    }
    const textures = textureValues.map((item, index) => absolutePath(item, `job.input.textures[${index}]`, paths));
    assertUniquePaths(textures, 'job.input.textures', paths);
    legacyInput = {
      riggedModel: absolutePath(input.riggedModel, 'job.input.riggedModel', paths),
      referenceObj: absolutePath(input.referenceObj, 'job.input.referenceObj', paths),
      referenceMtl: absolutePath(input.referenceMtl, 'job.input.referenceMtl', paths),
      textures,
    };

    const materialRepair = objectValue(job.materialRepair, 'job.materialRepair');
    rejectUnknownFields(materialRepair, ['mode', 'textureFlipY'], 'job.materialRepair');
    if (materialRepair.mode !== 'strict-auto') fail('job.materialRepair.mode must equal strict-auto.');
    textureFlipY = materialRepair.textureFlipY === undefined
      ? true
      : optionalBoolean(materialRepair.textureFlipY, 'job.materialRepair.textureFlipY')!;
  } else {
    rejectUnknownFields(input, ['riggedModel', 'sidecars'], 'job.input');
    const riggedModel = absolutePath(input.riggedModel, 'job.input.riggedModel', paths);
    const sidecarValues = input.sidecars;
    if (!Array.isArray(sidecarValues) || sidecarValues.length > MAX_GAME_READY_SIDECAR_FILES) {
      fail(`job.input.sidecars must be an array of 0-${MAX_GAME_READY_SIDECAR_FILES} absolute paths.`);
    }
    const sidecars = sidecarValues.map((item, index) => absolutePath(item, `job.input.sidecars[${index}]`, paths));
    assertUniquePaths([riggedModel, ...sidecars], 'job.input.riggedModel and sidecars', paths);
    if (/\.glb$/i.test(riggedModel) && sidecars.length > 0) {
      fail('Embedded GLB preserve-existing jobs must not declare sidecars.');
    }
    if (!/\.(?:fbx|glb)$/i.test(riggedModel)) {
      fail('Preserve-existing jobs support only embedded .glb or sidecar-backed .fbx targets.');
    }
    const materials = objectValue(job.materials, 'job.materials');
    rejectUnknownFields(materials, ['mode'], 'job.materials');
    if (materials.mode !== 'preserve-existing') {
      fail('job.materials.mode must equal preserve-existing.');
    }
    preserveInput = { riggedModel, sidecars };
  }

  const coordinates = objectValue(job.coordinates, 'job.coordinates');
  rejectUnknownFields(coordinates, ['unitMeters', 'up', 'forward', 'grounded'], 'job.coordinates');
  if (typeof coordinates.unitMeters !== 'number' || !Number.isFinite(coordinates.unitMeters) || coordinates.unitMeters <= 0) {
    fail('job.coordinates.unitMeters must be a positive finite number.');
  }
  if (coordinates.up !== '+Y' || coordinates.forward !== '+Z' || typeof coordinates.grounded !== 'boolean') {
    fail('job.coordinates must explicitly use up +Y, forward +Z, and a boolean grounded value.');
  }

  const rigValue = objectValue(job.rig, 'job.rig');
  rejectUnknownFields(rigValue, ['clipNames', 'attachments', 'retarget'], 'job.rig');
  const attachmentValue = rigValue.attachments === undefined ? {} : objectValue(rigValue.attachments, 'job.rig.attachments');
  const attachmentRoles = new Set<string>(ATTACHMENT_ROLES);
  const unknownAttachmentRoles = Object.keys(attachmentValue).filter((role) => !attachmentRoles.has(role));
  if (unknownAttachmentRoles.length > 0) {
    fail(`job.rig.attachments contains unknown roles: ${unknownAttachmentRoles.join(', ')}.`);
  }
  const attachments: Partial<Record<LogicalAttachmentRole, string>> = {};
  for (const role of ATTACHMENT_ROLES) {
    const bone = attachmentValue[role];
    if (bone !== undefined) attachments[role] = stringValue(bone, `job.rig.attachments.${role}`);
  }

  let retarget: RetargetJob | null = null;
  if (rigValue.retarget !== undefined && rigValue.retarget !== null) {
    const source = objectValue(rigValue.retarget, 'job.rig.retarget');
    rejectUnknownFields(source, [
      'sourceModel', 'clips', 'clipNames', 'manualMap', 'allowFuzzy', 'applyUpCorrection',
      'alignMappedBoneDirections', 'directionAlignmentBones', 'directionTransfer', 'directionTransferBones',
      'clipDirectionTransfer', 'clipDirectionTransferBones', 'sourceReferencePose',
      'sourceReferenceClip', 'targetReferenceClip', 'preserveTargetLeafRotations',
      'preserveTargetRotations', 'targetChainCurls', 'naturalMotion', 'poseRanges', 'localReferenceCorrections', 'clipJointConstraints', 'clipForearmTwist', 'clipEndpointEnvelopes',
      'clipPreserveTargetRotations', 'clipPoseRecovery', 'scaleRootMotion', 'rootMotionScale', 'sampleRateHz',
      'interpolation', 'nextDownRationalTimes', 'extractRootMotionBone', 'clipVisualTiming', 'replaceClips',
    ], 'job.rig.retarget');
    retarget = {
      sourceModel: absolutePath(source.sourceModel, 'job.rig.retarget.sourceModel', paths),
      clips: stringArray(source.clips, 'job.rig.retarget.clips'),
      replaceClips: stringArray(source.replaceClips, 'job.rig.retarget.replaceClips'),
      clipNames: stringMap(source.clipNames, 'job.rig.retarget.clipNames'),
      manualMap: stringMap(source.manualMap, 'job.rig.retarget.manualMap'),
      allowFuzzy: optionalBoolean(source.allowFuzzy, 'job.rig.retarget.allowFuzzy'),
      applyUpCorrection: optionalBoolean(source.applyUpCorrection, 'job.rig.retarget.applyUpCorrection'),
      alignMappedBoneDirections: source.alignMappedBoneDirections === undefined
        ? true
        : optionalBoolean(source.alignMappedBoneDirections, 'job.rig.retarget.alignMappedBoneDirections'),
      directionTransfer: source.directionTransfer === undefined
        ? undefined
        : source.directionTransfer === 'relative' || source.directionTransfer === 'absolute'
          ? source.directionTransfer
          : fail('job.rig.retarget.directionTransfer must be relative or absolute.'),
      clipDirectionTransfer: directionTransferMap(source.clipDirectionTransfer, 'job.rig.retarget.clipDirectionTransfer'),
      directionAlignmentBones: stringArray(source.directionAlignmentBones, 'job.rig.retarget.directionAlignmentBones'),
      directionTransferBones: stringArray(
        source.directionTransferBones,
        'job.rig.retarget.directionTransferBones',
      ),
      clipDirectionTransferBones: stringArrayMap(source.clipDirectionTransferBones, 'job.rig.retarget.clipDirectionTransferBones'),
      sourceReferencePose: source.sourceReferencePose === undefined
        ? 'rest'
        : source.sourceReferencePose === 'rest' || source.sourceReferencePose === 'first-frame' || source.sourceReferencePose === 'clip'
          ? source.sourceReferencePose
          : fail('job.rig.retarget.sourceReferencePose must be rest, first-frame, or clip.'),
      sourceReferenceClip: source.sourceReferenceClip === undefined
        ? undefined
        : stringValue(source.sourceReferenceClip, 'job.rig.retarget.sourceReferenceClip'),
      targetReferenceClip: source.targetReferenceClip === undefined
        ? undefined
        : stringValue(source.targetReferenceClip, 'job.rig.retarget.targetReferenceClip'),
      preserveTargetLeafRotations: optionalBoolean(source.preserveTargetLeafRotations, 'job.rig.retarget.preserveTargetLeafRotations'),
      preserveTargetRotations: stringArray(source.preserveTargetRotations, 'job.rig.retarget.preserveTargetRotations'),
      targetChainCurls: targetChainCurlArray(
        source.targetChainCurls,
        'job.rig.retarget.targetChainCurls',
      ),
      naturalMotion: naturalMotionProfile(source.naturalMotion, 'job.rig.retarget.naturalMotion'),
      poseRanges: source.poseRanges === undefined ? undefined : parsePoseRangeProfile(source.poseRanges),
      localReferenceCorrections: parseLocalReferenceCorrections(source.localReferenceCorrections),
      clipJointConstraints: parseClipJointConstraints(source.clipJointConstraints),
      clipForearmTwist: parseClipForearmTwist(source.clipForearmTwist),
      ...(source.clipEndpointEnvelopes === undefined ? {} : { clipEndpointEnvelopes: parseEndpointEnvelopes(source.clipEndpointEnvelopes) }),
      clipPreserveTargetRotations: stringArrayMap(source.clipPreserveTargetRotations, 'job.rig.retarget.clipPreserveTargetRotations'),
      clipPoseRecovery: poseRecoveryMap(source.clipPoseRecovery, 'job.rig.retarget.clipPoseRecovery'),
      scaleRootMotion: optionalBoolean(source.scaleRootMotion, 'job.rig.retarget.scaleRootMotion'),
      rootMotionScale: source.rootMotionScale === undefined ? undefined
        : finiteNumber(source.rootMotionScale, 'job.rig.retarget.rootMotionScale'),
      extractRootMotionBone: source.extractRootMotionBone === undefined ? undefined
        : stringValue(source.extractRootMotionBone, 'job.rig.retarget.extractRootMotionBone'),
      clipVisualTiming: visualTimingMap(source.clipVisualTiming),
      sampleRateHz: source.sampleRateHz === undefined
        ? undefined
        : typeof source.sampleRateHz === 'number'
          ? source.sampleRateHz
          : fail('job.rig.retarget.sampleRateHz must be a number.'),
      interpolation: source.interpolation === undefined
        ? undefined
        : source.interpolation === 'linear' || source.interpolation === 'step'
          ? source.interpolation
          : fail('job.rig.retarget.interpolation must be linear or step.'),
      nextDownRationalTimes: optionalBoolean(source.nextDownRationalTimes, 'job.rig.retarget.nextDownRationalTimes'),
    };
    if (retarget.rootMotionScale !== undefined && (retarget.rootMotionScale <= 0 || retarget.scaleRootMotion === false)) {
      fail('job.rig.retarget.rootMotionScale must be positive with scaleRootMotion not false.');
    }
    if (retarget.directionAlignmentBones) {
      if (retarget.alignMappedBoneDirections === false) fail('directionAlignmentBones requires direction alignment enabled.');
      const aligned = new Set(retarget.directionAlignmentBones);
      const directed = [...(retarget.directionTransferBones ?? []), ...Object.values(retarget.clipDirectionTransferBones ?? {}).flat()];
      if (directed.some(name => !aligned.has(name))) fail('directionTransferBones must be included in directionAlignmentBones.');
    }
    if (retarget.sampleRateHz !== undefined && (!Number.isFinite(retarget.sampleRateHz) || retarget.sampleRateHz <= 0 || retarget.sampleRateHz > 240)) {
      fail('job.rig.retarget.sampleRateHz must be from 1 through 240.');
    }
    if (Object.keys(retarget.clipVisualTiming ?? {}).length && retarget.sampleRateHz !== 60) fail('Visual timing requires sampleRateHz 60.');
    const selectedTimingClips=retarget.clips;
    for (const [name, envelope] of Object.entries(retarget.clipEndpointEnvelopes ?? {})) {
      if (retarget.clips && !retarget.clips.includes(name)) fail('Endpoint envelope configures an unselected source clip.');
      if (retarget.sampleRateHz !== 60 || retarget.interpolation !== 'step' || retarget.clipPoseRecovery?.[name]
        || retarget.clipJointConstraints?.[name]
        || Object.keys(retarget.localReferenceCorrections ?? {}).length) fail('Endpoint envelopes require 60 Hz STEP and no recovery/joint/wrist/reference post-corrections.');
      const timing = retarget.clipVisualTiming?.[name];
      if (timing) validateEndpointWindows(envelope, timing.durationFrames + 1);
    }
    for (const name of Object.keys(retarget.naturalMotion?.rootTravelSamples ?? {})) {
      if (retarget.clips && !retarget.clips.includes(name)) fail('rootTravelSamples configures an unselected source clip.');
      if (retarget.sampleRateHz !== 60 || retarget.interpolation !== 'step') fail('rootTravelSamples requires explicit 60 Hz STEP sampling.');
      const timing = retarget.clipVisualTiming?.[name];
      if (timing && retarget.naturalMotion!.rootTravelSamples![name].length !== timing.durationFrames + 1) fail('rootTravelSamples must cover every output frame including the terminal.');
    }
    for (const [name, pairs] of Object.entries(retarget.clipForearmTwist ?? {})) {
      if (retarget.clips && !retarget.clips.includes(name)) fail('Forearm twist configures an unselected clip.');
      if (pairs.length && (retarget.alignMappedBoneDirections !== false || retarget.interpolation !== 'step'
        || retarget.naturalMotion || retarget.clipJointConstraints?.[name] || retarget.clipPoseRecovery?.[name]
        || Object.keys(retarget.localReferenceCorrections ?? {}).length
        || pairs.some(pair => [pair.forearm, pair.hand].some(bone => resolvePreservedTargetRotations(retarget!, name).includes(bone))))) {
        fail('Forearm twist requires an isolated STEP post-pass with direction alignment disabled and no conflicting correction/preservation.');
      }
    }
    const jointRanges = retarget.poseRanges?.joints;
    for (const [name, constraint] of Object.entries(retarget.clipJointConstraints ?? {})) {
      if (retarget.clips && !retarget.clips.includes(name)) fail('Joint constraints configure an unselected clip.');
      if (!jointRanges || ![constraint.neck, constraint.head].every(bone => jointRanges.some(joint => joint.bone === bone))) fail('Joint constraints require calibrated neck/head pose ranges.');
      if (retarget.alignMappedBoneDirections !== false || retarget.clipPoseRecovery?.[name]) fail('Joint constraints require direction alignment disabled and no pose recovery.');
    }
    if (selectedTimingClips && Object.keys(retarget.clipVisualTiming ?? {}).some(name=>!selectedTimingClips.includes(name))) fail('Visual timing configures an unselected clip.');
    if (retarget.sourceReferencePose === 'clip' && !retarget.sourceReferenceClip) {
      fail('job.rig.retarget.sourceReferencePose clip requires sourceReferenceClip.');
    }
    if (retarget.naturalMotion && (retarget.sampleRateHz ?? 60) !== 60) {
      fail('job.rig.retarget.naturalMotion contact frames require sampleRateHz 60.');
    }
    if (retarget.clips && retarget.naturalMotion) {
      const selected = new Set(retarget.clips);
      const unselectedContacts = Object.keys(retarget.naturalMotion.contacts ?? {})
        .filter((clipName) => !selected.has(clipName));
      if (unselectedContacts.length > 0) {
        fail(`job.rig.retarget.naturalMotion.contacts configures unselected clips: ${unselectedContacts.join(', ')}.`);
      }
      if (Object.keys(retarget.naturalMotion.grounding ?? {}).some(name => !selected.has(name))) fail('Natural grounding configures unselected clips.');
      const unselectedMotionLimits = Object.keys(retarget.naturalMotion.legMotionLimits ?? {})
        .filter((clipName) => !selected.has(clipName));
      if (unselectedMotionLimits.length > 0) {
        fail(`job.rig.retarget.naturalMotion.legMotionLimits configures unselected clips: ${unselectedMotionLimits.join(', ')}.`);
      }
    }
  }

  const output = objectValue(job.output, 'job.output');
  const provenance = objectValue(job.provenance, 'job.provenance');
  rejectUnknownFields(output, ['generationRoot', 'currentPointer'], 'job.output');
  rejectUnknownFields(provenance, ['generator', 'ownership', 'classification', 'notes'], 'job.provenance');
  if (provenance.notes !== undefined && (!Array.isArray(provenance.notes) || provenance.notes.some((item) => typeof item !== 'string'))) {
    fail('job.provenance.notes must be an array of strings.');
  }
  const common: GameReadyJobCommon = {
    coordinates: {
      unitMeters: coordinates.unitMeters,
      up: '+Y',
      forward: '+Z',
      grounded: coordinates.grounded,
    },
    rig: {
      clipNames: stringMap(rigValue.clipNames, 'job.rig.clipNames'),
      attachments,
      retarget,
    },
    output: {
      generationRoot: absolutePath(output.generationRoot, 'job.output.generationRoot', paths),
      currentPointer: output.currentPointer === undefined
        ? undefined
        : absolutePath(output.currentPointer, 'job.output.currentPointer', paths),
    },
    provenance: {
      generator: provenance.generator === undefined ? undefined : stringValue(provenance.generator, 'job.provenance.generator'),
      ownership: stringValue(provenance.ownership, 'job.provenance.ownership'),
      classification: provenance.classification === undefined ? undefined : stringValue(provenance.classification, 'job.provenance.classification'),
      notes: provenance.notes as string[] | undefined,
    },
  };
  const parsed: GameReadyJobDocument = schema === GAME_READY_JOB_SCHEMA
    ? {
      ...common,
      $schema: GAME_READY_JOB_SCHEMA,
      input: legacyInput!,
      materialRepair: { mode: 'strict-auto', textureFlipY },
    }
    : {
      ...common,
      $schema: GAME_READY_PRESERVE_JOB_SCHEMA,
      input: preserveInput!,
      materials: { mode: 'preserve-existing' },
    };
  const outputPaths = Object.values(parsed.output).filter((item): item is string => item !== undefined);
  assertUniquePaths(outputPaths, 'job.output paths', paths);
  if (parsed.output.currentPointer
    && paths.comparisonKey(pathDirectory(parsed.output.currentPointer)) !== paths.comparisonKey(parsed.output.generationRoot)) {
    fail('job.output.currentPointer must be a direct child of job.output.generationRoot.');
  }
  const inputPaths = parsed.$schema === GAME_READY_JOB_SCHEMA
    ? [
      parsed.input.riggedModel,
      parsed.input.referenceObj,
      parsed.input.referenceMtl,
      ...parsed.input.textures,
      ...(parsed.rig.retarget ? [parsed.rig.retarget.sourceModel] : []),
    ]
    : [
      parsed.input.riggedModel,
      ...parsed.input.sidecars,
      ...(parsed.rig.retarget ? [parsed.rig.retarget.sourceModel] : []),
    ];
  if (parsed.$schema === GAME_READY_PRESERVE_JOB_SCHEMA) {
    assertUniquePaths(inputPaths, 'job.input and retarget paths', paths);
  }
  const inputKeys = new Set(inputPaths.map((item) => paths.comparisonKey(item)));
  if (outputPaths.some((item) => inputKeys.has(paths.comparisonKey(item)))) {
    fail('Output paths must not overwrite input files.');
  }
  return parsed;
}

function pathDirectory(value: string): string {
  const slash = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
  return slash <= 0 ? value.slice(0, Math.max(1, slash)) : value.slice(0, slash);
}
