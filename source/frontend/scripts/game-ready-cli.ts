import { createHash } from 'node:crypto';
import path from 'node:path';
import * as THREE from 'three';
import {
  exportGLB,
  loadGLB,
  validateExportedGLB,
} from '../src/loaders/glb';
import { loadFBX } from '../src/loaders/fbx';
import { bytesToArrayBuffer } from '../src/loaders/smfBinary';
import { installNodeThreeRuntime } from './node-three-runtime';
import {
  retargetAnimationClip,
  type AnimationRetargetReport,
} from '../src/utils/animationRetarget';
import {
  GAME_READY_JOB_SCHEMA,
  parseGameReadyJob,
} from '../src/utils/gameReadyJob';
import {
  profileClipOptions,
  mergeRetargetClips,
  RETARGET_PROFILE_SCHEMA,
  type RetargetProfile,
} from '../src/utils/retargetProfile';
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
import { readGameReadyProducer } from './game-ready-producer';
import {
  publishGameReadyGeneration,
  type GameReadyGenerationInput,
  type GameReadyPublishedGeneration,
} from '../src/utils/gameReadyGeneration';

const TOOL_VERSION = '2.0.0';
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
    'All input and output paths must be absolute. Each success publishes a fresh,',
    'immutable generation directory; an optional current pointer changes last.',
    'Exit 0 means final GLB re-import and complete generation publication passed.',
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

async function runJob(jobPath: string): Promise<GameReadyPublishedGeneration> {
  const rawJob = await readBounded(jobPath, MAX_JOB_BYTES);
  const job = parseGameReadyJob(
    JSON.parse(new TextDecoder().decode(rawJob.bytes)) as unknown,
    GAME_READY_PATH_POLICY,
  );
  const inputRequests = [
    { role: 'target', path: job.input.riggedModel, limit: MAX_MODEL_INPUT_BYTES },
    { role: 'reference-obj', path: job.input.referenceObj, limit: MAX_MODEL_INPUT_BYTES },
    { role: 'reference-mtl', path: job.input.referenceMtl, limit: MAX_MODEL_RESOURCE_FILE_BYTES },
    ...job.input.textures.map((filePath, index) => ({ role: `texture-${index}`, path: filePath, limit: MAX_MODEL_RESOURCE_FILE_BYTES })),
    ...(job.rig.retarget ? [{ role: 'retarget-source', path: job.rig.retarget.sourceModel, limit: MAX_MODEL_INPUT_BYTES }] : []),
  ];
  const inputs = (await readFilesBounded(
    inputRequests.map(({ path: filePath, limit }) => ({ path: filePath, limit })),
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
      const generated: THREE.AnimationClip[] = [];
      const retargetProfile: RetargetProfile = {
        $schema: RETARGET_PROFILE_SCHEMA,
        retarget: job.rig.retarget,
        targetClipNames: job.rig.clipNames ?? {},
      };
      for (const clip of selected) {
        const options = profileClipOptions(retargetProfile, clip, source.clips, clips);
        const result = retargetAnimationClip(clip, source.skeleton, target.skeleton, rigMapReport, options);
        generated.push(result.clip);
        retargetReports.push(result.report);
      }
      const merged = mergeRetargetClips(clips, generated, job.rig.retarget.replaceClips);
      clips.splice(0, clips.length, ...merged);
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
    const generationInputs: GameReadyGenerationInput[] = inputRequests.map(({ role, path: inputPath }) => {
      const input = getInput(inputPath);
      return { role, name: path.basename(input.path), byteLength: input.bytes.byteLength, sha256: input.sha256 };
    });
    const inputRecords = inputRequests.map(({ role, path: inputPath }) => {
      const input = getInput(inputPath);
      return { role, path: input.path, byteLength: input.bytes.byteLength, sha256: input.sha256 };
    });
    const producer = await readGameReadyProducer({ name: 'RustSMF game-ready CLI', version: TOOL_VERSION });
    const mapping = {
      $schema: 'rustsmf.game-ready-mapping.v1',
      manual: job.rig.retarget?.manualMap ?? {},
      resolved: rigMapReport,
    };
    const report = {
      $schema: 'rustsmf.game-ready-report.v1',
      status: 'complete',
      tool: producer.tool,
      producer,
      job: { sourcePath: jobPath, sourceSha256: rawJob.sha256, artifact: 'job.json' },
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
      output: { path: 'model.glb', byteLength: embedded.bytes.byteLength, sha256: outputHash },
      limitations: [
        'Forward is a declared authored convention; it is not inferred from mesh topology.',
        'Retargeting preserves target proportions and transfers sampled world-rotation deltas or explicitly scoped absolute directions; different limb structures are not claimed anatomically equivalent.',
        'Independent fighter instances must clone the skinned scene and own separate AnimationMixer/action state.',
      ],
    };
    const manifest = {
      $schema: 'rustsmf.game-ready-manifest.v1',
      asset: {
        glb: 'model.glb',
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
    };
    return publishGameReadyGeneration({
      model: embedded.bytes,
      job,
      mapping,
      report,
      manifest,
      producer,
      inputs: generationInputs,
    }, job.output);
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
