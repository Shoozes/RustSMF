import path from 'node:path';
import { CONDITIONING_MODE, CONDITIONING_NLERP_MODE, type ConditioningRecipe } from './skeletalConditioning';
import { parseTransitionFloor } from './skeletalTransitionFloor';
import { parsePlantedIdle } from './skeletalPlantedIdle';
import { parseTerminalRotationClosure } from './skeletalTerminalRotation';

export const SKELETAL_EXPORT_JOB_SCHEMA = 'rustsmf.skeletal-export-job.v1';
export const SKELETAL_EXPORT_JOB_V2_SCHEMA = 'rustsmf.skeletal-export-job.v2';
export const SKELETAL_EXPORT_JOB_V3_SCHEMA = 'rustsmf.skeletal-export-job.v3';
export const SKELETAL_EXPORT_JOB_LIMIT = 1024 * 1024;

interface SkeletalExportJobBase {
  input: { skinnedModel: string };
  export: {
    rootJoint: string;
    units: 'meters';
    upAxis: '+Y';
    forwardAxis: '+Z';
    handedness: 'right';
    ticksPerSecond: 60;
    rootMotion: 'separate-track';
  };
  output: { generationRoot: string; currentPointer?: string };
}

export interface SkeletalExportJobV1 extends SkeletalExportJobBase {
  $schema: typeof SKELETAL_EXPORT_JOB_SCHEMA;
  export: SkeletalExportJobBase['export'] & { clipIds?: never };
}

export interface SkeletalExportJobV2 extends SkeletalExportJobBase {
  $schema: typeof SKELETAL_EXPORT_JOB_V2_SCHEMA;
  export: SkeletalExportJobBase['export'] & { clipIds: string[] };
}

export interface SkeletalExportJobV3 extends SkeletalExportJobBase {
  $schema: typeof SKELETAL_EXPORT_JOB_V3_SCHEMA;
  export: SkeletalExportJobBase['export'] & { clipIds: string[] };
  conditioning: ConditioningRecipe;
  output: SkeletalExportJobBase['output'] & { conditioningRoot: string };
}
export type SkeletalExportJob = SkeletalExportJobV1 | SkeletalExportJobV2 | SkeletalExportJobV3;

export function selectSkeletalExportClips<T extends { name: string }>(
  sourceClips: readonly T[],
  requestedClipIds: readonly string[],
): T[] {
  const requested = new Set<string>();
  const selected: T[] = [];
  for (const clipId of requestedClipIds) {
    if (requested.has(clipId)) fail(`Explicit clip selection contains duplicate clip ID ${JSON.stringify(clipId)}.`);
    requested.add(clipId);
    const matches = sourceClips.filter(clip => clip.name === clipId);
    if (matches.length === 0) fail(`Requested animation clip ${JSON.stringify(clipId)} was not found in the source GLB.`);
    if (matches.length > 1) fail(`Requested animation clip ${JSON.stringify(clipId)} is ambiguous because the source GLB contains ${matches.length} clips with that exact name.`);
    selected.push(matches[0]);
  }
  return selected;
}

export interface SkeletalExportPathPolicy {
  isAbsolute: (value: string) => boolean;
  resolve: (value: string) => string;
  comparisonKey: (value: string) => string;
}

const DEFAULT_PATH_POLICY: SkeletalExportPathPolicy = {
  isAbsolute: path.isAbsolute,
  resolve: path.resolve,
  comparisonKey: value => process.platform === 'win32'
    ? path.resolve(value).toLocaleLowerCase('en-US')
    : path.resolve(value),
};

function fail(message: string): never {
  throw new Error(message);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be a JSON object.`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const allowed = new Set(expected);
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  const missing = expected.filter(key => !Object.prototype.hasOwnProperty.call(value, key));
  if (unknown.length > 0) fail(`${label} contains unsupported field(s): ${unknown.join(', ')}.`);
  if (missing.length > 0) fail(`${label} is missing required field(s): ${missing.join(', ')}.`);
}

function absolutePath(value: unknown, label: string, paths: SkeletalExportPathPolicy): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty absolute path.`);
  if (!paths.isAbsolute(value)) fail(`${label} must be an absolute path.`);
  return paths.resolve(value);
}

export function parseSkeletalExportJobDocument(
  value: unknown,
  paths: SkeletalExportPathPolicy = DEFAULT_PATH_POLICY,
): SkeletalExportJob {
  const document = record(value, 'Skeletal export job');
  const schema = document.$schema;
  const isV1 = schema === SKELETAL_EXPORT_JOB_SCHEMA;
  const isV2 = schema === SKELETAL_EXPORT_JOB_V2_SCHEMA;
  const isV3 = schema === SKELETAL_EXPORT_JOB_V3_SCHEMA;
  const selectsClips = isV2 || isV3;
  if (!isV1 && !selectsClips) fail(`Skeletal export job schema must be ${SKELETAL_EXPORT_JOB_SCHEMA}, ${SKELETAL_EXPORT_JOB_V2_SCHEMA} or ${SKELETAL_EXPORT_JOB_V3_SCHEMA}.`);
  exactKeys(document, ['$schema', 'input', 'export', 'output', ...(isV3 ? ['conditioning'] : [])], 'Skeletal export job');
  const input = record(document.input, 'job.input');
  exactKeys(input, ['skinnedModel'], 'job.input');
  const skinnedModel = absolutePath(input.skinnedModel, 'job.input.skinnedModel', paths);
  if (path.extname(skinnedModel).toLocaleLowerCase('en-US') !== '.glb') {
    fail('job.input.skinnedModel must name one self-contained .glb. FBX, external glTF sidecars, and other formats are not admitted by this exporter slice.');
  }
  const exportSettings = record(document.export, 'job.export');
  if (selectsClips && !Object.prototype.hasOwnProperty.call(exportSettings, 'clipIds')) {
    fail('job.export.clipIds must contain 1 to 32 explicit source animation clip IDs.');
  }
  exactKeys(exportSettings, [
    'rootJoint', 'units', 'upAxis', 'forwardAxis', 'handedness', 'ticksPerSecond', 'rootMotion',
    ...(selectsClips ? ['clipIds'] : []),
  ], 'job.export');
  if (typeof exportSettings.rootJoint !== 'string' || !exportSettings.rootJoint.trim()) {
    fail('job.export.rootJoint must name the source skeleton root joint.');
  }
  if (exportSettings.units !== 'meters'
    || exportSettings.upAxis !== '+Y'
    || exportSettings.forwardAxis !== '+Z'
    || exportSettings.handedness !== 'right'
    || exportSettings.ticksPerSecond !== 60
    || exportSettings.rootMotion !== 'separate-track') {
    fail('job.export must declare meters, right-handed +Y up / +Z forward coordinates, a 60 Hz tick rate, and separate-track root motion for this exporter slice.');
  }
  let clipIds: string[] | undefined;
  if (selectsClips) {
    if (!Array.isArray(exportSettings.clipIds) || exportSettings.clipIds.length === 0 || exportSettings.clipIds.length > 32) {
      fail('job.export.clipIds must contain 1 to 32 explicit source animation clip IDs.');
    }
    clipIds = exportSettings.clipIds.map((clipId, index) => {
      if (typeof clipId !== 'string' || !/^[A-Za-z0-9_.-]{1,64}$/.test(clipId)) {
        fail(`job.export.clipIds[${index}] must be a 1–64 character ASCII clip ID using letters, digits, underscore, dot, or hyphen.`);
      }
      return clipId;
    });
    if (new Set(clipIds).size !== clipIds.length) fail('job.export.clipIds must not contain duplicate IDs.');
  }
  const output = record(document.output, 'job.output');
  const outputKeys = Object.prototype.hasOwnProperty.call(output, 'currentPointer')
    ? ['generationRoot', 'currentPointer']
    : ['generationRoot'];
  exactKeys(output, [...outputKeys, ...(isV3 ? ['conditioningRoot'] : [])], 'job.output');
  const generationRoot = absolutePath(output.generationRoot, 'job.output.generationRoot', paths);
  const currentPointer = Object.prototype.hasOwnProperty.call(output, 'currentPointer')
    ? absolutePath(output.currentPointer, 'job.output.currentPointer', paths)
    : undefined;
  if (currentPointer && paths.comparisonKey(path.dirname(currentPointer)) !== paths.comparisonKey(generationRoot)) {
    fail('job.output.currentPointer must be a direct child of job.output.generationRoot.');
  }
  if (currentPointer && paths.comparisonKey(currentPointer) === paths.comparisonKey(skinnedModel)) {
    fail('job.output.currentPointer cannot overwrite job.input.skinnedModel.');
  }
  const common: SkeletalExportJobBase = {
    input: { skinnedModel },
    export: {
      rootJoint: exportSettings.rootJoint,
      units: 'meters',
      upAxis: '+Y',
      forwardAxis: '+Z',
      handedness: 'right',
      ticksPerSecond: 60,
      rootMotion: 'separate-track',
    },
    output: {
      generationRoot,
      ...(currentPointer ? { currentPointer } : {}),
    },
  };
  if (isV3) {
    const c = record(document.conditioning, 'job.conditioning');
    exactKeys(c, ['mode', 'sourceRootJoint', 'locomotionRootJoint', 'clipIds', 'transitions', ...['transitionFloor','plantedIdle','terminalRotationClosure'].filter(key=>Object.prototype.hasOwnProperty.call(c,key))], 'job.conditioning');
    const identifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(v);
    if ((c.mode !== CONDITIONING_MODE && c.mode !== CONDITIONING_NLERP_MODE) || !identifier(c.sourceRootJoint) || !identifier(c.locomotionRootJoint) || c.sourceRootJoint === c.locomotionRootJoint || c.locomotionRootJoint !== common.export.rootJoint) fail('job.conditioning must name a supported mode, distinct source/locomotion roots and export the locomotion root.');
    if (!Array.isArray(c.clipIds) || c.clipIds.length < 1 || c.clipIds.length > 32 || !c.clipIds.every(identifier) || new Set(c.clipIds).size !== c.clipIds.length) fail('job.conditioning.clipIds must contain 1–32 unique safe source names.');
    if (!Array.isArray(c.transitions) || c.transitions.length > 3) fail('job.conditioning.transitions must contain at most three gait recipes.');
    const transitions = c.transitions.map((value, index) => {
      const t = record(value, `job.conditioning.transitions[${index}]`);
      exactKeys(t, ['gait', 'idle', 'phases', 'durationTicks'], 'transition');
      if (!identifier(t.gait) || !identifier(t.idle) || !(c.clipIds as string[]).includes(t.gait) || !(c.clipIds as string[]).includes(t.idle) || t.durationTicks !== 6 || !Array.isArray(t.phases) || t.phases.length < 1 || t.phases.length > 4 || !t.phases.every(p => [0, .25, .5, .75].includes(p)) || new Set(t.phases).size !== t.phases.length) fail('Transition requires selected gait/idle clips, six ticks and unique quarter phases.');
      return { gait: t.gait, idle: t.idle, phases: t.phases as number[], durationTicks: 6 as const };
    });
    if (new Set(transitions.map(t => t.gait)).size !== transitions.length) fail('Duplicate conditioning gait recipe.');
    const floor = Object.prototype.hasOwnProperty.call(c, 'transitionFloor') ? parseTransitionFloor(c.transitionFloor,
      transitions.flatMap(t => t.phases.flatMap(p => ['start', 'stop'].map(kind => `${kind}-${t.gait}-p${p * 100}`)))) : undefined;
    if (floor && c.mode !== CONDITIONING_NLERP_MODE) fail('transitionFloor requires the explicit NLERP mode.');
    const planted = Object.prototype.hasOwnProperty.call(c,'plantedIdle') ? parsePlantedIdle(c.plantedIdle,transitions.map(t=>t.idle),c.clipIds as string[]) : undefined;
    if (planted && c.mode !== CONDITIONING_NLERP_MODE) fail('plantedIdle requires the explicit NLERP mode.');
    const terminal = Object.prototype.hasOwnProperty.call(c,'terminalRotationClosure') ? parseTerminalRotationClosure(c.terminalRotationClosure, transitions.map(t => t.gait), c.clipIds as string[], [c.sourceRootJoint, c.locomotionRootJoint]) : undefined;
    if (terminal && c.mode !== CONDITIONING_NLERP_MODE) fail('terminalRotationClosure requires the explicit NLERP mode.');
    if (common.output.currentPointer) fail('Conditioned candidate jobs omit the current pointer.');
    return { ...common, $schema: SKELETAL_EXPORT_JOB_V3_SCHEMA, export: { ...common.export, clipIds: clipIds! }, conditioning: { mode: c.mode, sourceRootJoint: c.sourceRootJoint, locomotionRootJoint: c.locomotionRootJoint, clipIds: c.clipIds, transitions, ...(floor ? { transitionFloor: floor } : {}), ...(planted ? { plantedIdle:planted } : {}), ...(terminal ? { terminalRotationClosure: terminal } : {}) }, output: { ...common.output, conditioningRoot: absolutePath(output.conditioningRoot, 'job.output.conditioningRoot', paths) } };
  }
  if (isV2) {
    const explicitClipIds = clipIds ?? fail('job.export.clipIds must contain 1 to 32 explicit source animation clip IDs.');
    return {
      $schema: SKELETAL_EXPORT_JOB_V2_SCHEMA,
      ...common,
      export: { ...common.export, clipIds: explicitClipIds },
    };
  }
  return { $schema: SKELETAL_EXPORT_JOB_SCHEMA, ...common };
}
