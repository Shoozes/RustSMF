import path from 'node:path';
import { CONDITIONING_MODE, CONDITIONING_NLERP_MODE, type ConditioningRecipe } from './skeletalConditioning';
import { parseTransitionFloor } from './skeletalTransitionFloor';
import { parsePlantedIdle } from './skeletalPlantedIdle';
import { parseTerminalRotationClosure } from './skeletalTerminalRotation';
import { parseTwoKeyRotationSelection } from './skeletalTwoKeyRotation';
import { TWO_KEY_EXPORT_BOUNDARY_POLICY } from './skeletalTwoKeyExportBoundary';
import { parseRotationSpanBake, assertDisjointRotationSpan } from './skeletalRotationSpan';
import { parsePelvisLayer } from './skeletalPelvisLayer';
import { assertDisjointStanceTrajectory, parseStanceTrajectory } from './skeletalStanceTrajectory';
import { parseHipYLoopEndpoint, type HipYLoopEndpointRecipe } from './skeletalHipYLoopEndpoint';
import { parseCoupledBodyHeight, type CoupledBodyHeightRecipe } from './skeletalCoupledBodyHeight';

export const SKELETAL_EXPORT_JOB_SCHEMA = 'rustsmf.skeletal-export-job.v1';
export const SKELETAL_EXPORT_JOB_V2_SCHEMA = 'rustsmf.skeletal-export-job.v2';
export const SKELETAL_EXPORT_JOB_V3_SCHEMA = 'rustsmf.skeletal-export-job.v3';
export const SKELETAL_EXPORT_JOB_V4_SCHEMA = 'rustsmf.skeletal-export-job.v4';
export const SKELETAL_EXPORT_JOB_V5_SCHEMA = 'rustsmf.skeletal-export-job.v5';
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
  export: SkeletalExportJobBase['export'] & { clipIds: string[]; twoKeyExportBoundary?: typeof TWO_KEY_EXPORT_BOUNDARY_POLICY };
  conditioning: ConditioningRecipe;
  output: SkeletalExportJobBase['output'] & { conditioningRoot: string };
}
export interface SkeletalExportJobV4 extends SkeletalExportJobBase {
  $schema: typeof SKELETAL_EXPORT_JOB_V4_SCHEMA;
  input: SkeletalExportJobBase['input'] & { conditioningReport: string; originalSkinnedModel: string };
  export: SkeletalExportJobBase['export'] & { clipIds: string[]; twoKeyExportBoundary: typeof TWO_KEY_EXPORT_BOUNDARY_POLICY };
  endpoint: HipYLoopEndpointRecipe;
  output: SkeletalExportJobBase['output'] & { conditioningRoot: string };
}
export interface SkeletalExportJobV5 extends SkeletalExportJobBase {
  $schema: typeof SKELETAL_EXPORT_JOB_V5_SCHEMA;
  input: SkeletalExportJobBase['input'] & { conditioningReport: string; originalSkinnedModel: string };
  export: SkeletalExportJobBase['export'] & { clipIds: string[]; twoKeyExportBoundary: typeof TWO_KEY_EXPORT_BOUNDARY_POLICY };
  coupledBodyHeight: CoupledBodyHeightRecipe;
  output: SkeletalExportJobBase['output'] & { conditioningRoot: string };
}
export type SkeletalExportJob = SkeletalExportJobV1 | SkeletalExportJobV2 | SkeletalExportJobV3 | SkeletalExportJobV4 | SkeletalExportJobV5;

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
  const isV4 = schema === SKELETAL_EXPORT_JOB_V4_SCHEMA;
  const isV5 = schema === SKELETAL_EXPORT_JOB_V5_SCHEMA;
  const selectsClips = isV2 || isV3 || isV4 || isV5;
  if (!isV1 && !selectsClips) fail(`Skeletal export job schema must be ${SKELETAL_EXPORT_JOB_SCHEMA}, ${SKELETAL_EXPORT_JOB_V2_SCHEMA}, ${SKELETAL_EXPORT_JOB_V3_SCHEMA}, ${SKELETAL_EXPORT_JOB_V4_SCHEMA} or ${SKELETAL_EXPORT_JOB_V5_SCHEMA}.`);
  exactKeys(document, ['$schema', 'input', 'export', 'output', ...(isV3 ? ['conditioning'] : []), ...(isV4 ? ['endpoint'] : []), ...(isV5 ? ['coupledBodyHeight'] : [])], 'Skeletal export job');
  const input = record(document.input, 'job.input');
  exactKeys(input, ['skinnedModel', ...(isV4 || isV5 ? ['conditioningReport', 'originalSkinnedModel'] : [])], 'job.input');
  const skinnedModel = absolutePath(input.skinnedModel, 'job.input.skinnedModel', paths);
  const conditioningReport = isV4 || isV5 ? absolutePath(input.conditioningReport, 'job.input.conditioningReport', paths) : undefined;
  const originalSkinnedModel = isV4 || isV5 ? absolutePath(input.originalSkinnedModel, 'job.input.originalSkinnedModel', paths) : undefined;
  if (conditioningReport && (path.extname(conditioningReport).toLocaleLowerCase('en-US') !== '.json'
    || paths.comparisonKey(conditioningReport) === paths.comparisonKey(skinnedModel)
    || paths.comparisonKey(conditioningReport) === paths.comparisonKey(originalSkinnedModel!)
    || paths.comparisonKey(originalSkinnedModel!) === paths.comparisonKey(skinnedModel)
    || path.extname(originalSkinnedModel!).toLocaleLowerCase('en-US') !== '.glb')) fail('v4/v5 inputs must be three distinct absolute .glb/.json paths.');
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
    ...((isV3 && Object.prototype.hasOwnProperty.call(exportSettings, 'twoKeyExportBoundary')) || isV4 || isV5 ? ['twoKeyExportBoundary'] : []),
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
  exactKeys(output, [...outputKeys, ...(isV3 || isV4 || isV5 ? ['conditioningRoot'] : [])], 'job.output');
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
  if (isV4) {
    if (common.export.rootJoint !== 'LocomotionRoot' || exportSettings.twoKeyExportBoundary !== TWO_KEY_EXPORT_BOUNDARY_POLICY)
      fail('v4 endpoint export requires the conditioned locomotion root and explicit boundary policy.');
    if (common.output.currentPointer) fail('Conditioned candidate jobs omit the current pointer.');
    return { ...common, $schema: SKELETAL_EXPORT_JOB_V4_SCHEMA,
      input: { skinnedModel, conditioningReport: conditioningReport!, originalSkinnedModel: originalSkinnedModel! },
      export: { ...common.export, clipIds: clipIds!, twoKeyExportBoundary: TWO_KEY_EXPORT_BOUNDARY_POLICY },
      endpoint: parseHipYLoopEndpoint(document.endpoint),
      output: { ...common.output, conditioningRoot: absolutePath(output.conditioningRoot, 'job.output.conditioningRoot', paths) } };
  }
  if (isV5) {
    if (common.export.rootJoint !== 'LocomotionRoot' || exportSettings.twoKeyExportBoundary !== TWO_KEY_EXPORT_BOUNDARY_POLICY)
      fail('v5 coupled export requires the conditioned locomotion root and explicit boundary policy.');
    if (common.output.currentPointer) fail('Conditioned candidate jobs omit the current pointer.');
    return { ...common, $schema: SKELETAL_EXPORT_JOB_V5_SCHEMA,
      input: { skinnedModel, conditioningReport: conditioningReport!, originalSkinnedModel: originalSkinnedModel! },
      export: { ...common.export, clipIds: clipIds!, twoKeyExportBoundary: TWO_KEY_EXPORT_BOUNDARY_POLICY },
      coupledBodyHeight: parseCoupledBodyHeight(document.coupledBodyHeight),
      output: { ...common.output, conditioningRoot: absolutePath(output.conditioningRoot, 'job.output.conditioningRoot', paths) } };
  }
  if (isV3) {
    const c = record(document.conditioning, 'job.conditioning');
    exactKeys(c, ['mode', 'sourceRootJoint', 'locomotionRootJoint', 'clipIds', 'transitions', ...['transitionFloor','plantedIdle','terminalRotationClosure','twoKeyRotationBake','twoKeyRotationBakes','rotationSpanBake','pelvisLayerBake','stanceTrajectoryBake'].filter(key=>Object.prototype.hasOwnProperty.call(c,key))], 'job.conditioning');
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
    const rotations = parseTwoKeyRotationSelection(c, transitions.map(t => t.gait), c.clipIds as string[], [c.sourceRootJoint, c.locomotionRootJoint]);
    const span = Object.prototype.hasOwnProperty.call(c, 'rotationSpanBake') ? parseRotationSpanBake(c.rotationSpanBake, transitions.map(t => t.gait), c.clipIds as string[], [c.sourceRootJoint, c.locomotionRootJoint]) : undefined;
    if (span) {
      assertDisjointRotationSpan(span, rotations.twoKeyRotationBake ? [rotations.twoKeyRotationBake] : rotations.twoKeyRotationBakes ?? []);
      if (terminal?.clipId === span.clipId && span.startTick + span.rotations[0].values.length >= terminal.startTick
        && terminal.joints.some(j => span.rotations.some(r => r.joint === j))) fail('rotationSpanBake conflicts with terminal authoring.');
    }
    if ((rotations.twoKeyRotationBake || rotations.twoKeyRotationBakes) && c.mode !== CONDITIONING_NLERP_MODE) fail('Two-key rotation authoring requires the explicit NLERP mode.');
    const boundary = Object.prototype.hasOwnProperty.call(exportSettings, 'twoKeyExportBoundary');
    const pelvisLayer = Object.prototype.hasOwnProperty.call(c, 'pelvisLayerBake') ? parsePelvisLayer(c.pelvisLayerBake, transitions.map(t => t.gait), c.clipIds as string[], c.sourceRootJoint, c.locomotionRootJoint) : undefined;
    const stance = Object.prototype.hasOwnProperty.call(c, 'stanceTrajectoryBake') ? parseStanceTrajectory(c.stanceTrajectoryBake, transitions.map(t => t.gait), c.clipIds as string[]) : undefined;
    if (stance) {
      if (!boundary || c.mode !== CONDITIONING_NLERP_MODE || !floor?.clipIds.includes('start-walkSlow-p25') || !floor.clipIds.includes('stop-walkSlow-p25')
        || floor.floorY !== 0 || floor.maxLiftMeters > .1
        || !transitions.some(t => t.gait === 'walkSlow' && t.phases.includes(.25)))
        fail('stanceTrajectoryBake requires NLERP export-boundary preservation and both walkSlow p25 floor bakes.');
      assertDisjointStanceTrajectory(stance, rotations.twoKeyRotationBake ? [rotations.twoKeyRotationBake] : rotations.twoKeyRotationBakes ?? [], span);
      if (pelvisLayer?.clipId === stance.clipId && pelvisLayer.startTick <= 25 && pelvisLayer.startTick + 1 >= 1)
        fail('stanceTrajectoryBake cannot overlap the pelvis layer.');
    }
    if (pelvisLayer && (!boundary || c.mode !== CONDITIONING_NLERP_MODE)) fail('pelvisLayerBake requires explicit NLERP export-boundary preservation.');
    if (pelvisLayer && terminal?.clipId === pelvisLayer.clipId && pelvisLayer.startTick + 2 >= terminal.startTick) fail('pelvisLayerBake conflicts with terminal authoring.');
    if (span && (!boundary || c.mode !== CONDITIONING_NLERP_MODE)) fail('rotationSpanBake requires explicit NLERP export-boundary preservation.');
    if (boundary && (exportSettings.twoKeyExportBoundary !== TWO_KEY_EXPORT_BOUNDARY_POLICY
      || c.mode !== CONDITIONING_NLERP_MODE || (!rotations.twoKeyRotationBake && !rotations.twoKeyRotationBakes && !span && !pelvisLayer && !stance))) fail('twoKeyExportBoundary requires explicit NLERP bakes and the supported policy.');
    if (common.output.currentPointer) fail('Conditioned candidate jobs omit the current pointer.');
    return { ...common, $schema: SKELETAL_EXPORT_JOB_V3_SCHEMA, export: { ...common.export, clipIds: clipIds!, ...(boundary ? { twoKeyExportBoundary: TWO_KEY_EXPORT_BOUNDARY_POLICY } : {}) }, conditioning: { mode: c.mode, sourceRootJoint: c.sourceRootJoint, locomotionRootJoint: c.locomotionRootJoint, clipIds: c.clipIds, transitions, ...(floor ? { transitionFloor: floor } : {}), ...(planted ? { plantedIdle:planted } : {}), ...(terminal ? { terminalRotationClosure: terminal } : {}), ...rotations, ...(span ? { rotationSpanBake: span } : {}), ...(pelvisLayer ? { pelvisLayerBake: pelvisLayer } : {}), ...(stance ? { stanceTrajectoryBake: stance } : {}) }, output: { ...common.output, conditioningRoot: absolutePath(output.conditioningRoot, 'job.output.conditioningRoot', paths) } };
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
