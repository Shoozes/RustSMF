import type { DirectionTransferMode, PoseRecoveryEnvelope } from './animationRetarget';
import { MAX_MODEL_RESOURCE_FILES } from './modelResourceBundle';
import type { LogicalAttachmentRole } from './rigMapping';

export const GAME_READY_JOB_SCHEMA = 'rustsmf.game-ready-job.v1';
export const MAX_GAME_READY_TEXTURE_FILES = MAX_MODEL_RESOURCE_FILES - 2;

export interface RetargetJob {
  sourceModel: string;
  clips?: string[];
  clipNames?: Record<string, string>;
  manualMap: Record<string, string>;
  allowFuzzy?: boolean;
  applyUpCorrection?: boolean;
  alignMappedBoneDirections?: boolean;
  clipDirectionTransfer?: Record<string, DirectionTransferMode>;
  clipDirectionTransferBones?: Record<string, string[]>;
  sourceReferencePose?: 'rest' | 'first-frame' | 'clip';
  sourceReferenceClip?: string;
  targetReferenceClip?: string;
  preserveTargetLeafRotations?: boolean;
  clipPreserveTargetRotations?: Record<string, string[]>;
  clipPoseRecovery?: Record<string, PoseRecoveryEnvelope>;
  scaleRootMotion?: boolean;
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
    glb: string;
    manifest: string;
    report: string;
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

function parseClipSelection(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || !item.trim())) {
    fail('job.rig.retarget.clips must be a non-empty array of clip names when supplied.');
  }
  const clips = value as string[];
  if (new Set(clips).size !== clips.length) fail('job.rig.retarget.clips must not contain duplicates.');
  return [...clips];
}

function assertUniquePaths(paths: readonly string[], label: string, policy: GameReadyPathPolicy): void {
  const keys = paths.map((item) => policy.comparisonKey(item));
  if (new Set(keys).size !== keys.length) fail(`${label} must not contain duplicate paths.`);
}

export function parseGameReadyJob(value: unknown, paths: GameReadyPathPolicy): GameReadyJob {
  const job = objectValue(value, 'job');
  if (job.$schema !== GAME_READY_JOB_SCHEMA) fail(`job.$schema must equal ${GAME_READY_JOB_SCHEMA}.`);
  const input = objectValue(job.input, 'job.input');
  const textureValues = input.textures;
  if (!Array.isArray(textureValues) || textureValues.length === 0 || textureValues.length > MAX_GAME_READY_TEXTURE_FILES) {
    fail(`job.input.textures must contain 1-${MAX_GAME_READY_TEXTURE_FILES} absolute JPEG/PNG paths.`);
  }
  const textures = textureValues.map((item, index) => absolutePath(item, `job.input.textures[${index}]`, paths));
  assertUniquePaths(textures, 'job.input.textures', paths);

  const materialRepair = objectValue(job.materialRepair, 'job.materialRepair');
  if (materialRepair.mode !== 'strict-auto') fail('job.materialRepair.mode must equal strict-auto.');
  const textureFlipY = materialRepair.textureFlipY === undefined
    ? true
    : optionalBoolean(materialRepair.textureFlipY, 'job.materialRepair.textureFlipY')!;

  const coordinates = objectValue(job.coordinates, 'job.coordinates');
  if (typeof coordinates.unitMeters !== 'number' || !Number.isFinite(coordinates.unitMeters) || coordinates.unitMeters <= 0) {
    fail('job.coordinates.unitMeters must be a positive finite number.');
  }
  if (coordinates.up !== '+Y' || coordinates.forward !== '+Z' || typeof coordinates.grounded !== 'boolean') {
    fail('job.coordinates must explicitly use up +Y, forward +Z, and a boolean grounded value.');
  }

  const rigValue = objectValue(job.rig, 'job.rig');
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
    retarget = {
      sourceModel: absolutePath(source.sourceModel, 'job.rig.retarget.sourceModel', paths),
      clips: parseClipSelection(source.clips),
      clipNames: stringMap(source.clipNames, 'job.rig.retarget.clipNames'),
      manualMap: stringMap(source.manualMap, 'job.rig.retarget.manualMap'),
      allowFuzzy: optionalBoolean(source.allowFuzzy, 'job.rig.retarget.allowFuzzy'),
      applyUpCorrection: optionalBoolean(source.applyUpCorrection, 'job.rig.retarget.applyUpCorrection'),
      alignMappedBoneDirections: source.alignMappedBoneDirections === undefined
        ? true
        : optionalBoolean(source.alignMappedBoneDirections, 'job.rig.retarget.alignMappedBoneDirections'),
      clipDirectionTransfer: directionTransferMap(source.clipDirectionTransfer, 'job.rig.retarget.clipDirectionTransfer'),
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
      clipPreserveTargetRotations: stringArrayMap(source.clipPreserveTargetRotations, 'job.rig.retarget.clipPreserveTargetRotations'),
      clipPoseRecovery: poseRecoveryMap(source.clipPoseRecovery, 'job.rig.retarget.clipPoseRecovery'),
      scaleRootMotion: optionalBoolean(source.scaleRootMotion, 'job.rig.retarget.scaleRootMotion'),
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
    if (retarget.sourceReferencePose === 'clip' && !retarget.sourceReferenceClip) {
      fail('job.rig.retarget.sourceReferencePose clip requires sourceReferenceClip.');
    }
  }

  const output = objectValue(job.output, 'job.output');
  const provenance = objectValue(job.provenance, 'job.provenance');
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
      glb: absolutePath(output.glb, 'job.output.glb', paths),
      manifest: absolutePath(output.manifest, 'job.output.manifest', paths),
      report: absolutePath(output.report, 'job.output.report', paths),
    },
    provenance: {
      generator: provenance.generator === undefined ? undefined : stringValue(provenance.generator, 'job.provenance.generator'),
      ownership: stringValue(provenance.ownership, 'job.provenance.ownership'),
      classification: provenance.classification === undefined ? undefined : stringValue(provenance.classification, 'job.provenance.classification'),
      notes: provenance.notes as string[] | undefined,
    },
  };
  const outputPaths = Object.values(parsed.output);
  assertUniquePaths(outputPaths, 'job.output paths', paths);
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
