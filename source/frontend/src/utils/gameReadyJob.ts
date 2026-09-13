import type {
  DirectionTransferMode,
  PoseRecoveryEnvelope,
  TargetChainCurl,
} from './animationRetarget';
import { MAX_MODEL_RESOURCE_FILES } from './modelResourceBundle';
import {validateRetargetVisualTiming,type RetargetVisualTiming} from './retargetTiming';
import {parsePoseRangeProfile,type PoseRangeProfile} from './poseRanges';
import type { LogicalAttachmentRole } from './rigMapping';
import type {
  NaturalFootContact,
  NaturalLegProfile,
  NaturalLegMotionLimits,
  NaturalMotionProfile,
  NaturalTorsoProfile,
} from './naturalRetarget';

export const GAME_READY_JOB_SCHEMA = 'rustsmf.game-ready-job.v2';
export const MAX_GAME_READY_TEXTURE_FILES = MAX_MODEL_RESOURCE_FILES - 2;

export interface RetargetJob {
  sourceModel: string;
  clips?: string[];
  clipNames?: Record<string, string>;
  manualMap: Record<string, string>;
  allowFuzzy?: boolean;
  applyUpCorrection?: boolean;
  alignMappedBoneDirections?: boolean;
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
  clipPreserveTargetRotations?: Record<string, string[]>;
  clipPoseRecovery?: Record<string, PoseRecoveryEnvelope>;
  scaleRootMotion?: boolean;
  replaceClips?: string[];
  extractRootMotionBone?: string;
  clipVisualTiming?: Record<string,RetargetVisualTiming>;
  sampleRateHz?: number;
  interpolation?: 'linear' | 'step';
  nextDownRationalTimes?: boolean;
}

export interface GameReadyJob {
  $schema: typeof GAME_READY_JOB_SCHEMA;
  input: {
    riggedModel: string;
    referenceObj: string;
    referenceMtl: string;
    textures: string[];
  };
  materialRepair: { mode: 'strict-auto'; textureFlipY: boolean };
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
  if (!Array.isArray(value) || value.length === 0) fail(`${label} must be a non-empty array when supplied.`);
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
      rejectUnknownFields(contact, ['foot', 'positionMode', 'startFrame', 'endFrame', 'blendFrames'], `${label}.${clipName}[${index}]`);
      if (contact.positionMode !== undefined && contact.positionMode !== 'planted' && contact.positionMode !== 'plane') {
        fail(`${label}.${clipName}[${index}].positionMode must be planted or plane.`);
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
      if ((2 * blendFrames) > (endFrame - startFrame + 1)) {
        fail(`${label}.${clipName}[${index}].blendFrames leaves no full-weight contact frame.`);
      }
      return { foot: contact.foot, startFrame, endFrame, blendFrames,
        ...(contact.positionMode === undefined ? {} : {positionMode:contact.positionMode}) };
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
  rejectUnknownFields(source, ['torso', 'legs', 'contacts', 'rootTravelPerFrame', 'legMotionLimits', 'reachTransfer', 'grounding', 'legOrientation'], label);
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
  return { torso, legs: parsedLegs, contacts, rootTravelPerFrame, legMotionLimits, reachTransfer, grounding, legOrientation };
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
  const job = objectValue(value, 'job');
  rejectUnknownFields(job, ['$schema', 'input', 'materialRepair', 'coordinates', 'rig', 'output', 'provenance'], 'job');
  if (job.$schema !== GAME_READY_JOB_SCHEMA) fail(`job.$schema must equal ${GAME_READY_JOB_SCHEMA}.`);
  const input = objectValue(job.input, 'job.input');
  rejectUnknownFields(input, ['riggedModel', 'referenceObj', 'referenceMtl', 'textures'], 'job.input');
  const textureValues = input.textures;
  if (!Array.isArray(textureValues) || textureValues.length === 0 || textureValues.length > MAX_GAME_READY_TEXTURE_FILES) {
    fail(`job.input.textures must contain 1-${MAX_GAME_READY_TEXTURE_FILES} absolute JPEG/PNG paths.`);
  }
  const textures = textureValues.map((item, index) => absolutePath(item, `job.input.textures[${index}]`, paths));
  assertUniquePaths(textures, 'job.input.textures', paths);

  const materialRepair = objectValue(job.materialRepair, 'job.materialRepair');
  rejectUnknownFields(materialRepair, ['mode', 'textureFlipY'], 'job.materialRepair');
  if (materialRepair.mode !== 'strict-auto') fail('job.materialRepair.mode must equal strict-auto.');
  const textureFlipY = materialRepair.textureFlipY === undefined
    ? true
    : optionalBoolean(materialRepair.textureFlipY, 'job.materialRepair.textureFlipY')!;

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
      'alignMappedBoneDirections', 'directionTransfer', 'directionTransferBones',
      'clipDirectionTransfer', 'clipDirectionTransferBones', 'sourceReferencePose',
      'sourceReferenceClip', 'targetReferenceClip', 'preserveTargetLeafRotations',
      'preserveTargetRotations', 'targetChainCurls', 'naturalMotion', 'poseRanges',
      'clipPreserveTargetRotations', 'clipPoseRecovery', 'scaleRootMotion', 'sampleRateHz',
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
      clipPreserveTargetRotations: stringArrayMap(source.clipPreserveTargetRotations, 'job.rig.retarget.clipPreserveTargetRotations'),
      clipPoseRecovery: poseRecoveryMap(source.clipPoseRecovery, 'job.rig.retarget.clipPoseRecovery'),
      scaleRootMotion: optionalBoolean(source.scaleRootMotion, 'job.rig.retarget.scaleRootMotion'),
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
    if (retarget.sampleRateHz !== undefined && (!Number.isFinite(retarget.sampleRateHz) || retarget.sampleRateHz <= 0 || retarget.sampleRateHz > 240)) {
      fail('job.rig.retarget.sampleRateHz must be from 1 through 240.');
    }
    if (Object.keys(retarget.clipVisualTiming ?? {}).length && retarget.sampleRateHz !== 60) fail('Visual timing requires sampleRateHz 60.');
    const selectedTimingClips=retarget.clips;
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
  const parsed: GameReadyJob = {
    $schema: GAME_READY_JOB_SCHEMA,
    input: {
      riggedModel: absolutePath(input.riggedModel, 'job.input.riggedModel', paths),
      referenceObj: absolutePath(input.referenceObj, 'job.input.referenceObj', paths),
      referenceMtl: absolutePath(input.referenceMtl, 'job.input.referenceMtl', paths),
      textures,
    },
    materialRepair: { mode: 'strict-auto', textureFlipY },
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
  const outputPaths = Object.values(parsed.output).filter((item): item is string => item !== undefined);
  assertUniquePaths(outputPaths, 'job.output paths', paths);
  if (parsed.output.currentPointer
    && paths.comparisonKey(pathDirectory(parsed.output.currentPointer)) !== paths.comparisonKey(parsed.output.generationRoot)) {
    fail('job.output.currentPointer must be a direct child of job.output.generationRoot.');
  }
  const inputPaths = [
    parsed.input.riggedModel,
    parsed.input.referenceObj,
    parsed.input.referenceMtl,
    ...parsed.input.textures,
    ...(parsed.rig.retarget ? [parsed.rig.retarget.sourceModel] : []),
  ];
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
