import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileBounded } from './bounded-file-read';
import { installNodeThreeRuntime } from './node-three-runtime';
import { readSkeletalExportProducer } from './skeletal-export-producer';
import { solveNativePoseContacts } from './pose-contact-native';
import {
  bytesToArrayBuffer,
} from '../src/loaders/smfBinary';
import { loadGLB } from '../src/loaders/glb';
import { MAX_MODEL_INPUT_BYTES } from '../src/utils/modelFormat';
import { disposeThreeObject } from '../src/utils/threeDisposal';
import { conditionSkeletalModel, CONDITIONING_NLERP_MODE, measureConditioningDifferences, type ConditioningReport } from '../src/utils/skeletalConditioning';
import { bakeHipYLoopEndpoint, measureHipYLoopEndpointFidelity } from '../src/utils/skeletalHipYLoopEndpoint';
import { TWO_KEY_EXPORT_BOUNDARY_POLICY, twoKeyExportReports, type TwoKeyExportBoundary } from '../src/utils/skeletalTwoKeyExportBoundary';
import {
  prepareSkeletalExport,
  SKELETAL_ASSET_SCHEMA,
  type PreparedSkeletalExport,
} from '../src/utils/skeletalExport';
import {
  parseSkeletalExportJobDocument,
  SKELETAL_EXPORT_JOB_LIMIT,
  SKELETAL_EXPORT_JOB_SCHEMA,
  SKELETAL_EXPORT_JOB_V2_SCHEMA,
  SKELETAL_EXPORT_JOB_V3_SCHEMA,
  SKELETAL_EXPORT_JOB_V4_SCHEMA,
  selectSkeletalExportClips,
  type SkeletalExportJob,
} from '../src/utils/skeletalExportJob';
import {
  normalizedSkeletalJsonBytes,
  publishSkeletalExportGeneration,
  publishConditionedSkeletalInput,
  skeletalInputSetIdentity,
  type SkeletalExportInput,
  type SkeletalExportProducer,
} from '../src/utils/skeletalExportGeneration';

const ROOT_EXTRACTION = {
  mode: 'separate-track',
  translation: 'current authored root global position minus its authored bind global position, in scene-root space and meters',
  yaw: 'shortest-arc +Y twist of current authored root global rotation relative to authored bind, in radians',
  residualJointPose: 'remaining root TRS stays in the root joint track; root pitch/roll are refused when they cannot be represented by the separate yaw channel',
};

interface SourceInput {
  path: string;
  bytes: Uint8Array;
  sha256: string;
}

export interface SkeletalExportJobResult {
  id: string;
  directory: string;
  manifest: string;
  asset: string;
  mapping: string;
  references: string;
  currentPointer?: string;
  hashes: { asset: string; mapping: string; references: string };
  bytes: { asset: number; mapping: number; references: number };
  sourceIdentitySha256: string;
  exporterIdentitySha256: string;
  inputSetIdentitySha256: string;
  settingsIdentitySha256: string;
  statistics: PreparedSkeletalExport['statistics'];
  conditioning?: { directory: string; model: string; recipe: string; report: string };
}

function fail(message: string): never {
  throw new Error(message);
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = signal.reason instanceof Error ? signal.reason : new Error('Skeletal export cancelled.');
  error.name = 'AbortError';
  throw error;
}

function readInput(filePath: string, bytes: Uint8Array): SourceInput {
  return { path: filePath, bytes, sha256: sha256(bytes) };
}

function settingsDocument(job: SkeletalExportJob): Record<string, unknown> {
  const document: Record<string, unknown> = {
    schema: job.$schema === SKELETAL_EXPORT_JOB_V4_SCHEMA
      ? 'rustsmf.skeletal-export-settings.v4'
      : job.$schema === SKELETAL_EXPORT_JOB_V3_SCHEMA
      ? 'rustsmf.skeletal-export-settings.v3'
      : job.$schema === SKELETAL_EXPORT_JOB_V2_SCHEMA
      ? 'rustsmf.skeletal-export-settings.v2'
      : 'rustsmf.skeletal-export-settings.v1',
    assetSchema: SKELETAL_ASSET_SCHEMA,
    coordinates: {
      units: job.export.units,
      upAxis: job.export.upAxis,
      forwardAxis: job.export.forwardAxis,
      handedness: job.export.handedness,
    },
    rootJoint: job.export.rootJoint,
    ticksPerSecond: job.export.ticksPerSecond,
    rootMotion: job.export.rootMotion,
    bindPose: 'authored GLB bind/inverse-bind state from RustSMF GLB loader; no animation frame is used as rest pose',
    mesh: 'preserve every loaded skinned vertex and triangle in scene traversal order; no decimation, influence pruning, or vertex deduplication',
    animation: job.$schema !== SKELETAL_EXPORT_JOB_SCHEMA
      ? 'preserve explicitly selected source clip channels at their authored integer 60 Hz key ticks, adding exact zero and duration endpoints; linear vector and shortest-arc quaternion interpolation only'
      : 'preserve all admitted clip channels at their authored integer 60 Hz key ticks, adding exact zero and duration endpoints; linear vector and shortest-arc quaternion interpolation only',
    rootExtraction: ROOT_EXTRACTION,
    references: {
      phasePolicy: 'clip endpoints plus three fractional interior phases per clip',
      vertexPolicy: 'all exported vertices in source-to-export order',
      maximumBytes: 16 * 1024 * 1024,
    },
  };
  if (job.$schema !== SKELETAL_EXPORT_JOB_SCHEMA) {
    document.clipSelection = { mode: 'explicit-exact-source-name', clipIds: job.export.clipIds };
  }
  if (job.$schema === SKELETAL_EXPORT_JOB_V3_SCHEMA) document.conditioning = job.conditioning;
  if (job.$schema === SKELETAL_EXPORT_JOB_V4_SCHEMA) document.endpoint = job.endpoint;
  if ((job.$schema === SKELETAL_EXPORT_JOB_V3_SCHEMA || job.$schema === SKELETAL_EXPORT_JOB_V4_SCHEMA) && job.export.twoKeyExportBoundary) {
    document.twoKeyExportSampling = { policy: TWO_KEY_EXPORT_BOUNDARY_POLICY,
      unselectedKeys: 'pre-authoring canonical chord at existing nominal tick/60',
      selectedKeys: 'authored re-imported GLB at existing nominal tick/60',
      references: 'authored re-imported GLB; unchanged independent phases and tolerances' };
    if (job.$schema === SKELETAL_EXPORT_JOB_V3_SCHEMA && job.conditioning.rotationSpanBake) document.rotationSpanExportSampling = {
      selectedRotations: 'only declared joint/tick rotations from authored re-imported GLB at nominal tick/60',
      preservedComponents: 'all other transform components, keys and root samples from restored baseline',
    };
  }
  if ((job.$schema === SKELETAL_EXPORT_JOB_V3_SCHEMA && job.conditioning.mode === CONDITIONING_NLERP_MODE)
    || job.$schema === SKELETAL_EXPORT_JOB_V4_SCHEMA) {
    document.animation = 'preserve float32 60 Hz sampled poses; canonical chord CUBICSPLINE joint rotations normalize to shortest-arc NLERP; translation, scale and locomotion yaw remain LINEAR with continuous yaw winding';
  }
  return document;
}

function semantics(job: SkeletalExportJob): Record<string, unknown> {
  const result: Record<string, unknown> = {
    units: job.export.units,
    upAxis: job.export.upAxis,
    forwardAxis: job.export.forwardAxis,
    handedness: job.export.handedness,
    angles: 'radians',
    ticksPerSecond: job.export.ticksPerSecond,
    rootMotion: job.export.rootMotion,
    bindPose: 'authored GLB bind/inverse-bind state in RustSMF loader scene-root local coordinates; no arbitrary animation frame is used',
    meshCoordinates: 'positions and normals are in common skeleton bind space',
    matrixOrder: 'row-major; translation at indices 3, 7, and 11',
    referenceSpace: 'source-deformed positions, normals, and joint matrices after separate root-motion extraction; rootPosition and rootYaw remain separate sample fields',
    rootExtraction: {
      ...ROOT_EXTRACTION,
      sourceJointId: job.export.rootJoint,
      axis: '+Y',
    },
  };
  return result;
}

async function readJob(jobPath: string, signal?: AbortSignal): Promise<SkeletalExportJob> {
  const jobBytes = await readFileBounded(jobPath, SKELETAL_EXPORT_JOB_LIMIT, signal);
  throwIfAborted(signal);
  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(jobBytes)) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`Skeletal export job is not valid UTF-8 JSON: ${detail}`);
  }
  return parseSkeletalExportJobDocument(decoded);
}

async function readSource(job: SkeletalExportJob, signal?: AbortSignal): Promise<SourceInput> {
  const bytes = await readFileBounded(job.input.skinnedModel, MAX_MODEL_INPUT_BYTES, signal);
  throwIfAborted(signal);
  return readInput(job.input.skinnedModel, bytes);
}

export async function runSkeletalExportJob(
  jobPath: string,
  signal?: AbortSignal,
): Promise<SkeletalExportJobResult> {
  if (!path.isAbsolute(jobPath)) fail('--job must be an absolute path.');
  const job = await readJob(path.resolve(jobPath), signal);
  throwIfAborted(signal);
  const input = await readSource(job, signal);
  throwIfAborted(signal);
  let loaded: Awaited<ReturnType<typeof loadGLB>> | undefined;
  let original: Awaited<ReturnType<typeof loadGLB>> | undefined;
  let conditioning: SkeletalExportJobResult['conditioning'];
  let twoKeyExportBoundary: TwoKeyExportBoundary | undefined;
  try {
    loaded = await loadGLB(bytesToArrayBuffer(input.bytes));
    throwIfAborted(signal);
    const producer: SkeletalExportProducer = await readSkeletalExportProducer();
    let source = input;
    const inputs: SkeletalExportInput[] = [];
    if (job.$schema === SKELETAL_EXPORT_JOB_V3_SCHEMA) {
      const conditioned = await conditionSkeletalModel(loaded, job.conditioning, signal, solveNativePoseContacts);
      if (job.export.twoKeyExportBoundary) twoKeyExportBoundary = {
        policy: TWO_KEY_EXPORT_BOUNDARY_POLICY,
        ...(conditioned.report.twoKeyRotationBake ? { report: conditioned.report.twoKeyRotationBake }
          : conditioned.report.twoKeyRotationBakes ? { reports: conditioned.report.twoKeyRotationBakes }
          : conditioned.report.rotationSpanBake ? { spanReport: conditioned.report.rotationSpanBake }
          : conditioned.report.pelvisLayerBake ? { pelvisReport: conditioned.report.pelvisLayerBake }
          : conditioned.report.stanceTrajectoryBake ? { stanceReport: conditioned.report.stanceTrajectoryBake } : fail('Missing rotation authoring reports.')),
        ...(conditioned.report.rotationSpanBake ? { spanReport: conditioned.report.rotationSpanBake } : {}),
        ...(conditioned.report.pelvisLayerBake ? { pelvisReport: conditioned.report.pelvisLayerBake } : {}),
        ...(conditioned.report.stanceTrajectoryBake ? { stanceReport: conditioned.report.stanceTrajectoryBake } : {}),
      };
      disposeThreeObject(loaded.root); loaded = undefined;
      loaded = await loadGLB(bytesToArrayBuffer(conditioned.bytes));
      original = await loadGLB(bytesToArrayBuffer(input.bytes));
      source = readInput(input.path, conditioned.bytes);
      const recipe = normalizedSkeletalJsonBytes(job.conditioning);
      const report = normalizedSkeletalJsonBytes({ ...conditioned.report,
        sourceModelIdentitySha256: source.sha256, originalSourceIdentitySha256: input.sha256,
        recipeIdentitySha256: sha256(recipe), producer,
        differences: measureConditioningDifferences(original, loaded, job.conditioning.clipIds,job.conditioning.plantedIdle?.clipId,job.conditioning.terminalRotationClosure,job.conditioning.twoKeyRotationBake,job.conditioning.twoKeyRotationBakes,job.conditioning.rotationSpanBake,job.conditioning.pelvisLayerBake,conditioned.report.pelvisLayerBake,job.conditioning.stanceTrajectoryBake),
      });
      throwIfAborted(signal);
      conditioning = await publishConditionedSkeletalInput(source.bytes, recipe, report, { generationRoot: job.output.conditioningRoot, signal });
      inputs.push({ role: 'original-skinned-model', sha256: input.sha256, bytes: input.bytes.byteLength },
        { role: 'conditioning-recipe', sha256: sha256(recipe), bytes: recipe.byteLength },
        { role: 'conditioning-report', sha256: sha256(report), bytes: report.byteLength });
    }
    if (job.$schema === SKELETAL_EXPORT_JOB_V4_SCHEMA) {
      const priorBytes = await readFileBounded(job.input.conditioningReport, SKELETAL_EXPORT_JOB_LIMIT, signal);
      const originalBytes = await readFileBounded(job.input.originalSkinnedModel, MAX_MODEL_INPUT_BYTES, signal);
      throwIfAborted(signal);
      let prior: ConditioningReport & { sourceModelIdentitySha256: string; originalSourceIdentitySha256: string; recipeIdentitySha256: string; differences?: unknown };
      try { prior = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(priorBytes)) as typeof prior; }
      catch { fail('v4 requires a valid UTF-8 conditioning report.'); }
      if (!prior || typeof prior !== 'object' || !prior.recipe || typeof prior.recipe !== 'object'
        || !Array.isArray(prior.recipe.clipIds)) fail('v4 requires a complete conditioning report.');
      const priorRecipe = normalizedSkeletalJsonBytes(prior.recipe);
      if (prior.schema !== 'rustsmf.skeletal-conditioning.v1' || prior.sourceModelIdentitySha256 !== input.sha256
        || prior.originalSourceIdentitySha256 !== sha256(originalBytes) || prior.recipeIdentitySha256 !== sha256(priorRecipe)
        || prior.recipe.mode !== CONDITIONING_NLERP_MODE || prior.recipe.locomotionRootJoint !== job.export.rootJoint
        || prior.recipe.sourceRootJoint !== job.endpoint.joint || !prior.recipe.clipIds.includes(job.endpoint.clipId)
        || !Array.isArray(prior.clips) || !prior.clips.some(c => c.id === job.endpoint.clipId && c.durationTicks === 90))
        fail('v4 endpoint inputs lack matching conditioned source, original source or NLERP report provenance.');
      const reports = prior.twoKeyRotationBakes;
      const context: TwoKeyExportBoundary = { policy: TWO_KEY_EXPORT_BOUNDARY_POLICY,
        ...(reports ? { reports } : {}),
        ...(prior.rotationSpanBake ? { spanReport: prior.rotationSpanBake } : {}),
        ...(prior.pelvisLayerBake ? { pelvisReport: prior.pelvisLayerBake } : {}),
        ...(prior.stanceTrajectoryBake ? { stanceReport: prior.stanceTrajectoryBake } : {}) } as TwoKeyExportBoundary;
      twoKeyExportReports(context);
      const baked = bakeHipYLoopEndpoint(input.bytes, job.endpoint);
      source = readInput(input.path, baked.bytes);
      original = loaded; loaded = undefined;
      loaded = await loadGLB(bytesToArrayBuffer(baked.bytes));
      const fidelity = measureHipYLoopEndpointFidelity(original, loaded, job.endpoint, baked.report);
      disposeThreeObject(loaded.root); loaded = undefined;
      loaded = await loadGLB(bytesToArrayBuffer(baked.bytes));
      const recipe = normalizedSkeletalJsonBytes(job.endpoint);
      const renewed: Record<string, unknown> = { ...prior, sourceModelIdentitySha256: source.sha256,
        producer, differencePolicy: prior.differencePolicy + ' Explicit postconditioned walkSlow hip-Y tick-90 endpoint correction; every earlier quarter pose and all root/rotation/mesh channels retain source fidelity.',
        preEndpointConditioningReportSha256: sha256(priorBytes), preEndpointSourceModelIdentitySha256: input.sha256,
        preEndpointDifferences: prior.differences, hipYLoopEndpointBake: baked.report, hipYLoopEndpointFidelity: fidelity };
      delete renewed.differences;
      const report = normalizedSkeletalJsonBytes(renewed);
      conditioning = await publishConditionedSkeletalInput(source.bytes, recipe, report, { generationRoot: job.output.conditioningRoot, signal });
      twoKeyExportBoundary = { ...context, endpointReport: baked.report };
      inputs.push({ role: 'original-skinned-model', sha256: sha256(originalBytes), bytes: originalBytes.byteLength },
        { role: 'conditioning-recipe', sha256: sha256(priorRecipe), bytes: priorRecipe.byteLength },
        { role: 'pre-endpoint-conditioning-report', sha256: sha256(priorBytes), bytes: priorBytes.byteLength },
        { role: 'pre-endpoint-skinned-model', sha256: input.sha256, bytes: input.bytes.byteLength },
        { role: 'hip-y-loop-endpoint-recipe', sha256: sha256(recipe), bytes: recipe.byteLength },
        { role: 'conditioning-report', sha256: sha256(report), bytes: report.byteLength });
    }
    const clips = job.$schema !== SKELETAL_EXPORT_JOB_SCHEMA
      ? selectSkeletalExportClips(loaded.clips, job.export.clipIds)
      : loaded.clips;
    let exportBoundary: TwoKeyExportBoundary | undefined;
    const spanReport = twoKeyExportBoundary?.spanReport;
    const selectedSpan = spanReport && clips.some(c => c.name === spanReport.clipId) ? spanReport : undefined;
    if (twoKeyExportBoundary?.report) {
      const context = twoKeyExportBoundary;
      if (clips.some(c => c.name === context.report?.clipId)) exportBoundary = { policy: TWO_KEY_EXPORT_BOUNDARY_POLICY, report: context.report!, ...(selectedSpan ? { spanReport: selectedSpan } : {}) };
    } else if (twoKeyExportBoundary?.reports) {
      const reports = twoKeyExportBoundary.reports.filter(r => clips.some(c => c.name === r.clipId));
      if (reports.length) exportBoundary = { policy: TWO_KEY_EXPORT_BOUNDARY_POLICY, reports, ...(selectedSpan ? { spanReport: selectedSpan } : {}) };
    }
    if (!exportBoundary && selectedSpan) exportBoundary = { policy: TWO_KEY_EXPORT_BOUNDARY_POLICY, spanReport: selectedSpan };
    const selectedPelvis = twoKeyExportBoundary?.pelvisReport;
    if (selectedPelvis && clips.some(c => c.name === selectedPelvis.clipId)) exportBoundary = exportBoundary
      ? { ...exportBoundary, pelvisReport: selectedPelvis }
      : { policy: TWO_KEY_EXPORT_BOUNDARY_POLICY, pelvisReport: selectedPelvis };
    const selectedStance = twoKeyExportBoundary?.stanceReport;
    if (selectedStance && clips.some(c => c.name === selectedStance.clipId)) exportBoundary = exportBoundary
      ? { ...exportBoundary, stanceReport: selectedStance }
      : { policy: TWO_KEY_EXPORT_BOUNDARY_POLICY, stanceReport: selectedStance };
    const selectedEndpoint = twoKeyExportBoundary?.endpointReport;
    if (selectedEndpoint && clips.some(c => c.name === selectedEndpoint.clipId)) exportBoundary = exportBoundary
      ? { ...exportBoundary, endpointReport: selectedEndpoint }
      : { policy: TWO_KEY_EXPORT_BOUNDARY_POLICY, endpointReport: selectedEndpoint };
    const prepared = await prepareSkeletalExport({ ...loaded, clips }, {
      sourceIdentitySha256: source.sha256,
      rootJoint: job.export.rootJoint,
      signal,
      ...(exportBoundary ? { twoKeyExportBoundary: exportBoundary } : {}),
      ...(((job.$schema === SKELETAL_EXPORT_JOB_V3_SCHEMA && job.conditioning.mode === CONDITIONING_NLERP_MODE)
        || job.$schema === SKELETAL_EXPORT_JOB_V4_SCHEMA)
        ? { conditionedRotationMode: CONDITIONING_NLERP_MODE } : {}),
    });
    throwIfAborted(signal);
    inputs.push({
      role: 'source-skinned-model',
      sha256: source.sha256,
      bytes: source.bytes.byteLength,
    });
    const inputSetIdentitySha256 = skeletalInputSetIdentity(inputs);
    const settingsIdentitySha256 = sha256(normalizedSkeletalJsonBytes(settingsDocument(job)));
    const publication = await publishSkeletalExportGeneration({
      asset: prepared.assetBytes,
      mapping: prepared.mappingBytes,
      references: prepared.referenceBytes,
      producer,
      inputSetIdentitySha256,
      inputs,
      settingsIdentitySha256,
      semantics: semantics(job),
    }, {
      ...job.output,
      signal,
    });
    return {
      ...publication,
      sourceIdentitySha256: producer.sourceIdentitySha256,
      exporterIdentitySha256: producer.exporterIdentitySha256,
      inputSetIdentitySha256,
      settingsIdentitySha256,
      statistics: prepared.statistics,
      ...(conditioning ? { conditioning } : {}),
    };
  } finally {
    if (loaded) {
      loaded.mixer.stopAllAction();
      disposeThreeObject(loaded.root);
    }
    if (original) { original.mixer.stopAllAction(); disposeThreeObject(original.root); }
  }
}

function usage(): string {
  return [
    'RustSMF skeletal asset exporter',
    '',
    'Usage:',
    '  npm.cmd run skeletal-export -- --help',
    '  npm.cmd run skeletal-export -- --job C:\\absolute\\path\\skeletal-export.json',
    '',
    `Job schema: ${SKELETAL_EXPORT_JOB_SCHEMA}`,
    'Input is one self-contained, skinned GLB. V1 retains all admitted clips; v2 selects exact clip IDs; v3 explicitly conditions a separate continuous GLB.',
    'The output is a new immutable generation containing asset.json, mapping.json, references.json, and manifest.json.',
    'The optional current pointer is replaced only after the complete generation is visible.',
    'SIGINT/SIGTERM cancellation is cooperative during bounded reads, source sampling, and pre-publication.',
  ].join('\n');
}

function failArgs(): never {
  throw new Error('Use exactly --job <absolute-path>, or --help.');
}

async function main(): Promise<void> {
  installNodeThreeRuntime();
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (args.length !== 2 || args[0] !== '--job' || !args[1]) failArgs();
  const jobPath = args[1];
  if (!path.isAbsolute(jobPath)) fail('--job must be an absolute path.');
  const controller = new AbortController();
  let requestedSignal: 'SIGINT' | 'SIGTERM' | null = null;
  const onSigint = (): void => {
    requestedSignal ??= 'SIGINT';
    controller.abort(new Error('Received SIGINT; cancellation requested.'));
  };
  const onSigterm = (): void => {
    requestedSignal ??= 'SIGTERM';
    controller.abort(new Error('Received SIGTERM; cancellation requested.'));
  };
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
  try {
    const result = await runSkeletalExportJob(jobPath, controller.signal);
    process.stdout.write(`${JSON.stringify({ status: 'complete', ...result })}\n`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const cancelled = controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
    process.stderr.write(`${JSON.stringify({ status: cancelled ? 'cancelled' : 'failed', error: message })}\n`);
    if (cancelled) process.exitCode = requestedSignal === 'SIGTERM' ? 143 : 130;
    else process.exitCode = 1;
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ status: 'failed', error: message })}\n`);
  process.exitCode = 1;
});
