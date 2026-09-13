import { createHash, randomBytes } from 'node:crypto';
import {
  mkdir,
  open,
  rename,
  rm,
} from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import {
  bytesToArrayBuffer,
  exportGLB,
  loadFBX,
  loadGLB,
  validateExportedGLB,
} from '../src/loaders';
import { installFileReaderTestPolyfill } from '../src/test/installFileReaderTestPolyfill';
import {
  retargetAnimationClip,
  type AnimationRetargetReport,
} from '../src/utils/animationRetarget';
import {
  GAME_READY_JOB_SCHEMA,
  parseGameReadyJob,
} from '../src/utils/gameReadyJob';
import { validateGameReadyModel } from '../src/utils/gameReadyValidation';
import {
  embedMaterialTextures,
  validateEmbeddedGlbTextures,
  validateStepClipTiming,
  type EmbeddedMaterialReport,
  type EmbeddedTextureInput,
} from '../src/utils/glbContainer';
import {
  applyPreparedMaterialRepair,
  assertMaterialRepairPreservedModel,
  captureMaterialRepairFingerprint,
  parseObjMaterialReference,
  parseObjReference,
  prepareMaterialRepair,
  type ObjMaterialReference,
} from '../src/utils/materialRepair';
import { buildRigMap, resolveLogicalAttachments } from '../src/utils/rigMapping';
import { compareMappedRigProportions, type RigCompatibilityReport } from '../src/utils/rigCompatibility';
import {
  createModelResourceBundle,
  MAX_MODEL_RESOURCE_BUNDLE_BYTES,
  MAX_MODEL_RESOURCE_FILE_BYTES,
} from '../src/utils/modelResourceBundle';
import { MAX_MODEL_INPUT_BYTES } from '../src/utils/modelFormat';
import { disposeThreeObject } from '../src/utils/threeDisposal';
import { readFileBounded, readFilesBounded } from './bounded-file-read';

const TOOL_VERSION = '1.0.0';
const MAX_JOB_BYTES = 1024 * 1024;

interface LoadedAsset {
  root: THREE.Group;
  skeleton?: THREE.Skeleton;
  clips: THREE.AnimationClip[];
  dispose(): void;
}

interface InputFileRecord {
  path: string;
  bytes: Uint8Array;
  sha256: string;
}

function usage(): string {
  return [
    'RustSMF game-ready CLI',
    '',
    'Usage:',
    '  npm.cmd run game-ready -- --help',
    '  npm.cmd run game-ready -- --job C:\\absolute\\path\\fighter.game-ready.json',
    '',
    `Job schema: ${GAME_READY_JOB_SCHEMA}`,
    'The job repairs rigged FBX/GLB materials from an OBJ/MTL/image bundle,',
    'optionally retargets explicitly mapped animation clips, validates skin and',
    'sampled deformation, exports a self-contained GLB, and writes JSON evidence.',
    'All input and output paths must be absolute. Exit 0 means final GLB re-import passed.',
  ].join('\n');
}

function fail(message: string): never {
  throw new Error(message);
}

function pathComparisonKey(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLocaleLowerCase('en-US') : resolved;
}

const GAME_READY_PATH_POLICY = {
  isAbsolute: path.isAbsolute,
  resolve: path.resolve,
  comparisonKey: pathComparisonKey,
};

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readBounded(filePath: string, limit = MAX_MODEL_INPUT_BYTES): Promise<InputFileRecord> {
  const bytes = await readFileBounded(filePath, limit);
  return { path: filePath, bytes, sha256: sha256(bytes) };
}

function installNodeThreeRuntime(): void {
  installFileReaderTestPolyfill();
  if (typeof globalThis.ProgressEvent === 'undefined') {
    class NodeProgressEvent {
      readonly type: string;
      readonly lengthComputable: boolean;
      readonly loaded: number;
      readonly total: number;
      constructor(type: string, init: { lengthComputable?: boolean; loaded?: number; total?: number } = {}) {
        this.type = type;
        this.lengthComputable = init.lengthComputable ?? false;
        this.loaded = init.loaded ?? 0;
        this.total = init.total ?? 0;
      }
    }
    Reflect.set(globalThis, 'ProgressEvent', NodeProgressEvent);
  }
  if (typeof globalThis.createImageBitmap === 'undefined') {
    Reflect.set(globalThis, 'createImageBitmap', async () => ({ width: 1, height: 1, close() {} }));
  }
  if (!Reflect.has(globalThis, 'self')) Reflect.set(globalThis, 'self', globalThis);
}

async function loadAsset(file: InputFileRecord): Promise<LoadedAsset> {
  const extension = path.extname(file.path).toLocaleLowerCase('en-US');
  const buffer = bytesToArrayBuffer(file.bytes);
  if (extension === '.fbx') {
    const loaded = await loadFBX(buffer);
    return {
      root: loaded.root,
      skeleton: loaded.skeleton,
      clips: loaded.clips,
      dispose: () => {
        loaded.mixer.stopAllAction();
        disposeThreeObject(loaded.root);
      },
    };
  }
  if (extension === '.glb') {
    const loaded = await loadGLB(buffer);
    return {
      root: loaded.root,
      skeleton: loaded.skeleton,
      clips: loaded.clips,
      dispose: () => {
        loaded.mixer.stopAllAction();
        disposeThreeObject(loaded.root);
      },
    };
  }
  fail(`Unsupported rigged model extension ${extension}; use .fbx or .glb.`);
}

function normalizeBundleName(baseDirectory: string, filePath: string): string {
  const relative = path.relative(baseDirectory, filePath).replace(/\\/g, '/');
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) {
    fail(`Reference sidecar ${filePath} must be inside the OBJ directory ${baseDirectory}.`);
  }
  return relative;
}

function renameClips(clips: readonly THREE.AnimationClip[], names: Readonly<Record<string, string>>): THREE.AnimationClip[] {
  const output = clips.map((clip) => {
    const clone = clip.clone();
    clone.name = names[clip.name]?.trim() || clip.name || 'clip';
    return clone;
  });
  const unique = new Set(output.map((clip) => clip.name));
  if (unique.size !== output.length) fail('Clip renaming creates duplicate target names.');
  return output;
}

function mimeType(file: InputFileRecord): EmbeddedTextureInput['mimeType'] {
  const bytes = file.bytes;
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  fail(`Texture ${file.path} is not a valid JPEG or PNG by signature.`);
}

function resolveReferenceTextures(
  reference: ObjMaterialReference,
  mtlDirectory: string,
  textureFiles: readonly InputFileRecord[],
): Map<string, EmbeddedTextureInput> {
  const byPath = new Map(textureFiles.map((file) => [path.resolve(file.path).toLocaleLowerCase('en-US'), file]));
  const result = new Map<string, EmbeddedTextureInput>();
  for (const material of reference.materials) {
    for (const resource of Object.values(material.textures)) {
      if (!resource) continue;
      const resolvedPath = path.resolve(mtlDirectory, resource);
      const file = byPath.get(resolvedPath.toLocaleLowerCase('en-US'));
      if (!file) fail(`MTL texture ${resource} resolves to ${resolvedPath}, which is not listed in job.input.textures.`);
      result.set(resource.toLocaleLowerCase('en-US'), {
        resource,
        mimeType: mimeType(file),
        bytes: file.bytes,
      });
    }
  }
  return result;
}

async function writeStaged(filePath: string, bytes: Uint8Array): Promise<void> {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(temporary, 'wx');
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, filePath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeStaged(filePath, new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`));
}

async function runJob(jobPath: string): Promise<{ glb: string; manifest: string; report: string; sha256: string }> {
  const rawJob = await readBounded(jobPath, MAX_JOB_BYTES);
  const job = parseGameReadyJob(
    JSON.parse(new TextDecoder().decode(rawJob.bytes)) as unknown,
    GAME_READY_PATH_POLICY,
  );
  const inputRequests = [
    { path: job.input.riggedModel, limit: MAX_MODEL_INPUT_BYTES },
    { path: job.input.referenceObj, limit: MAX_MODEL_INPUT_BYTES },
    { path: job.input.referenceMtl, limit: MAX_MODEL_RESOURCE_FILE_BYTES },
    ...job.input.textures.map((filePath) => ({ path: filePath, limit: MAX_MODEL_RESOURCE_FILE_BYTES })),
    ...(job.rig.retarget ? [{ path: job.rig.retarget.sourceModel, limit: MAX_MODEL_INPUT_BYTES }] : []),
  ];
  const inputs = (await readFilesBounded(
    inputRequests,
    MAX_MODEL_RESOURCE_BUNDLE_BYTES,
    pathComparisonKey,
  )).map((input) => ({ ...input, sha256: sha256(input.bytes) }));
  const inputByPath = new Map(inputs.map((item) => [pathComparisonKey(item.path), item]));
  const getInput = (filePath: string): InputFileRecord => {
    const input = inputByPath.get(pathComparisonKey(filePath));
    if (!input) fail(`Input ${filePath} was not loaded.`);
    return input;
  };

  const target = await loadAsset(getInput(job.input.riggedModel));
  let source: LoadedAsset | null = null;
  try {
    if (!target.skeleton) fail('Rigged target contains no skeleton.');
    const objFile = getInput(job.input.referenceObj);
    const mtlFile = getInput(job.input.referenceMtl);
    const objText = new TextDecoder().decode(objFile.bytes);
    const mtlText = new TextDecoder().decode(mtlFile.bytes);
    const parsedObj = parseObjReference(objText);
    const expectedMtl = path.resolve(path.dirname(objFile.path), parsedObj.materialLibrary);
    if (expectedMtl.toLocaleLowerCase('en-US') !== path.resolve(mtlFile.path).toLocaleLowerCase('en-US')) {
      fail(`OBJ references ${expectedMtl}, but job.input.referenceMtl is ${mtlFile.path}.`);
    }
    const objDirectory = path.dirname(objFile.path);
    const bundleEntries = [mtlFile, ...job.input.textures.map(getInput)].map((file) => ({
      name: normalizeBundleName(objDirectory, file.path),
      data: file.bytes,
    }));
    createModelResourceBundle(
      { name: path.basename(objFile.path), data: objFile.bytes },
      bundleEntries,
    );
    const reference = parseObjMaterialReference(objText, mtlText, bundleEntries.map((entry) => entry.name));
    const materialFingerprint = captureMaterialRepairFingerprint(target.root, target.clips);
    const prepared = await prepareMaterialRepair(target.root, reference);
    applyPreparedMaterialRepair(prepared);
    assertMaterialRepairPreservedModel(materialFingerprint, target.root, target.clips);

    const clips = renameClips(target.clips, job.rig.clipNames ?? {});
    const retargetReports: AnimationRetargetReport[] = [];
    let rigMapReport: ReturnType<typeof buildRigMap> | null = null;
    let rigCompatibility: RigCompatibilityReport | null = null;
    if (job.rig.retarget) {
      source = await loadAsset(getInput(job.rig.retarget.sourceModel));
      if (!source.skeleton) fail('Retarget source contains no skeleton.');
      rigMapReport = buildRigMap(source.skeleton, target.skeleton, {
        manualMap: job.rig.retarget.manualMap,
        allowFuzzy: job.rig.retarget.allowFuzzy ?? true,
        requireManualForOpaqueNames: true,
      });
      if (!rigMapReport.ok) {
        fail(rigMapReport.diagnostics.filter((item) => item.level === 'error').map((item) => item.message).join(' '));
      }
      rigCompatibility = compareMappedRigProportions(source.skeleton, target.skeleton, rigMapReport);
      const selected = job.rig.retarget.clips?.length
        ? source.clips.filter((clip) => job.rig.retarget!.clips!.includes(clip.name))
        : source.clips;
      if (selected.length === 0) fail('Retarget selection contains no source clips.');
      if (job.rig.retarget.clips && selected.length !== job.rig.retarget.clips.length) {
        const found = new Set(selected.map((clip) => clip.name));
        fail(`Retarget source is missing clips: ${job.rig.retarget.clips.filter((name) => !found.has(name)).join(', ')}.`);
      }
      const occupiedClipNames = new Set(clips.map((clip) => clip.name));
      const sourceReferenceClip = job.rig.retarget.sourceReferenceClip
        ? source.clips.find((clip) => clip.name === job.rig.retarget!.sourceReferenceClip)
        : undefined;
      if (job.rig.retarget.sourceReferenceClip && !sourceReferenceClip) {
        fail(`Retarget source is missing reference clip ${job.rig.retarget.sourceReferenceClip}.`);
      }
      const targetReferenceClip = job.rig.retarget.targetReferenceClip
        ? target.clips.find((clip) => clip.name === job.rig.retarget!.targetReferenceClip)
        : undefined;
      if (job.rig.retarget.targetReferenceClip && !targetReferenceClip) {
        fail(`Target model is missing reference clip ${job.rig.retarget.targetReferenceClip}.`);
      }
      for (const clip of selected) {
        const targetName = job.rig.retarget.clipNames?.[clip.name] || clip.name;
        if (occupiedClipNames.has(targetName)) fail(`Retarget clip ${targetName} collides with an existing target clip.`);
        const result = retargetAnimationClip(clip, source.skeleton, target.skeleton, rigMapReport, {
          clipName: targetName,
          applyUpCorrection: job.rig.retarget.applyUpCorrection,
          alignMappedBoneDirections: job.rig.retarget.alignMappedBoneDirections,
          directionTransferMode: job.rig.retarget.clipDirectionTransfer?.[clip.name],
          directionTransferBones: job.rig.retarget.clipDirectionTransferBones?.[clip.name],
          sourceReferencePose: job.rig.retarget.sourceReferencePose,
          sourceReferenceClip,
          targetReferenceClip,
          preserveTargetLeafRotations: job.rig.retarget.preserveTargetLeafRotations,
          preserveTargetRotations: job.rig.retarget.clipPreserveTargetRotations?.[clip.name],
          poseRecovery: job.rig.retarget.clipPoseRecovery?.[clip.name],
          scaleRootMotion: job.rig.retarget.scaleRootMotion,
          sampleRateHz: job.rig.retarget.sampleRateHz,
          interpolation: job.rig.retarget.interpolation,
          nextDownRationalTimes: job.rig.retarget.nextDownRationalTimes,
        });
        clips.push(result.clip);
        retargetReports.push(result.report);
        occupiedClipNames.add(result.clip.name);
      }
    }

    const attachments = resolveLogicalAttachments(target.skeleton, job.rig.attachments);
    const validation = validateGameReadyModel(target.root, target.skeleton, clips);
    const draftGlb = await exportGLB(target.root, clips);
    const textureFiles = job.input.textures.map(getInput);
    const textureInputs = resolveReferenceTextures(reference, path.dirname(mtlFile.path), textureFiles);
    const embedded = embedMaterialTextures(draftGlb, reference.materials, textureInputs, {
      sourceTextureFlipY: job.materialRepair.textureFlipY,
    });
    validateEmbeddedGlbTextures(embedded.bytes);
    const stepTiming = job.rig.retarget?.interpolation === 'step'
      && job.rig.retarget.sampleRateHz !== undefined
      && job.rig.retarget.nextDownRationalTimes
      ? validateStepClipTiming(
        embedded.bytes,
        retargetReports.map((item) => item.targetClip),
        job.rig.retarget.sampleRateHz,
      )
      : [];
    const roundtrip = await validateExportedGLB(embedded.bytes, target.root, clips);
    const outputHash = sha256(embedded.bytes);
    const protectedFingerprint = captureMaterialRepairFingerprint(target.root, clips);
    const inputRecords = inputs.map((input) => ({ path: input.path, byteLength: input.bytes.byteLength, sha256: input.sha256 }));
    const report = {
      $schema: 'rustsmf.game-ready-report.v1',
      status: 'complete',
      tool: { name: 'RustSMF game-ready CLI', version: TOOL_VERSION },
      job: { path: jobPath, sha256: rawJob.sha256 },
      provenance: job.provenance,
      inputs: inputRecords,
      materialRepair: {
        mode: job.materialRepair.mode,
        textureFlipY: job.materialRepair.textureFlipY,
        plan: prepared.plan,
        referenceWarnings: reference.warnings,
        embeddedMaterials: embedded.report satisfies EmbeddedMaterialReport[],
      },
      rig: {
        attachments,
        retargetMap: rigMapReport,
        compatibility: rigCompatibility,
        retargetClips: retargetReports,
        protectedFingerprint,
      },
      coordinates: job.coordinates,
      validation: {
        source: validation,
        exportedRoundtrip: roundtrip,
        embeddedTextureCount: embedded.report.reduce((sum, item) => sum + item.textures.length, 0),
        externalResourceUris: 0,
        stepTiming,
      },
      output: { path: job.output.glb, byteLength: embedded.bytes.byteLength, sha256: outputHash },
      limitations: [
        'Forward is a declared authored convention; it is not inferred from mesh topology.',
        'Retargeting preserves target proportions and transfers sampled world-rotation deltas or explicitly scoped absolute directions; different limb structures are not claimed anatomically equivalent.',
        'Independent fighter instances must clone the skinned scene and own separate AnimationMixer/action state.',
      ],
    };
    const manifest = {
      $schema: 'rustsmf.game-ready-manifest.v1',
      asset: {
        glb: job.output.glb,
        sha256: outputHash,
        byteLength: embedded.bytes.byteLength,
        classification: job.provenance.classification ?? 'LOCAL',
      },
      coordinates: job.coordinates,
      attachments,
      rigCompatibility: rigCompatibility ? {
        segmentCount: rigCompatibility.segments.length,
        warningCount: rigCompatibility.warningCount,
        warningThreshold: rigCompatibility.segmentWarningThreshold,
        minimumNormalizedRatio: rigCompatibility.minimumNormalizedRatio,
        maximumNormalizedRatio: rigCompatibility.maximumNormalizedRatio,
      } : null,
      clips: validation.clips,
      clipTimingContract: stepTiming.length > 0 ? {
        sampleRateHz: job.rig.retarget!.sampleRateHz,
        interpolation: 'STEP',
        float32Timestamps: 'next-down when nearest float32 exceeds exact frame/sampleRate',
        verifiedClips: stepTiming.length,
      } : null,
      instanceContract: {
        clone: 'SkeletonUtils.clone(scene)',
        animation: 'one AnimationMixer and action set per fighter instance',
      },
      provenance: job.provenance,
      report: job.output.report,
    };
    await writeStaged(job.output.glb, embedded.bytes);
    await writeJson(job.output.report, report);
    await writeJson(job.output.manifest, manifest);
    return { ...job.output, sha256: outputHash };
  } finally {
    source?.dispose();
    target.dispose();
  }
}

async function main(): Promise<void> {
  installNodeThreeRuntime();
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const jobIndex = args.indexOf('--job');
  if (jobIndex < 0 || !args[jobIndex + 1] || args.length !== 2) fail('Use exactly --job <absolute-path>, or --help.');
  const jobPathValue = args[jobIndex + 1];
  if (!path.isAbsolute(jobPathValue)) fail('--job must be an absolute path.');
  const jobPath = path.resolve(jobPathValue);
  const result = await runJob(jobPath);
  process.stdout.write(`${JSON.stringify({ status: 'complete', ...result })}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ status: 'failed', error: message })}\n`);
  process.exitCode = 1;
});
