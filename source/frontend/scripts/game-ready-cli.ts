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
  GAME_READY_PRESERVE_JOB_SCHEMA,
  parseGameReadyJobDocument,
  type GameReadyJobDocument,
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
  parseGlbContainer,
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
import {
  hasUsableTextureImage,
  waitForTextureImages,
} from '../src/utils/textureImageReadiness';
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
  removedTextureMaps: number;
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
    `Repair schema: ${GAME_READY_JOB_SCHEMA}`,
    `Preserve schema: ${GAME_READY_PRESERVE_JOB_SCHEMA}`,
    'V2 jobs repair rigged FBX/GLB materials from an OBJ/MTL/image bundle. V3 jobs',
    'preserve supported existing materials from embedded GLB or sidecar-backed FBX.',
    'Both modes optionally retarget explicitly mapped clips, validate skin and',
    'sampled deformation, export a self-contained GLB, and write JSON evidence.',
    'SIGINT/SIGTERM cancellation is checked at bounded read/load and pre-publication',
    'boundaries; once the atomic generation commit starts, publication completes.',
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

async function readBounded(filePath: string, limit = MAX_MODEL_INPUT_BYTES, signal?: AbortSignal): Promise<InputFileRecord> {
  const bytes = await readFileBounded(filePath, limit, signal);
  return { path: filePath, bytes, sha256: sha256(bytes) };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = signal.reason instanceof Error ? signal.reason : new Error('Game-ready job cancelled.');
  error.name = 'AbortError';
  throw error;
}

const PRESERVE_TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
] as const;

interface PreservedMaterialSummary {
  materialNames: string[];
  texturedMaterialNames: string[];
  textureCount: number;
}

function isMaterialTextured(material: Record<string, unknown>): boolean {
  const pbr = Reflect.get(material, 'pbrMetallicRoughness');
  return [
    Reflect.get(pbr ?? {}, 'baseColorTexture'),
    Reflect.get(pbr ?? {}, 'metallicRoughnessTexture'),
    Reflect.get(material, 'normalTexture'),
    Reflect.get(material, 'occlusionTexture'),
    Reflect.get(material, 'emissiveTexture'),
  ].some((texture) => texture !== undefined);
}

async function inspectPreservedMaterials(root: THREE.Object3D): Promise<PreservedMaterialSummary> {
  const supportedSlots = new Set<string>(PRESERVE_TEXTURE_SLOTS);
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const texturedMaterials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!('isMesh' in object && object.isMesh)) return;
    const value = Reflect.get(object, 'material') as THREE.Material | THREE.Material[] | null | undefined;
    const slots = Array.isArray(value) ? value : value ? [value] : [];
    if (slots.length === 0 || slots.some((material) => !material || !material.isMaterial)) {
      fail(`Mesh ${object.name || '(unnamed)'} has no complete material assignment.`);
    }
    for (const material of slots) {
      materials.add(material);
      const textureProperties = Object.keys(material)
        .filter((key) => Reflect.get(material, key) instanceof THREE.Texture);
      const unsupported = textureProperties.filter((key) => !supportedSlots.has(key));
      if (unsupported.length > 0) {
        fail(`Material ${material.name || '(unnamed)'} uses texture slots that GLB preservation does not support: ${unsupported.join(', ')}.`);
      }
      let hasTexture = false;
      for (const slot of PRESERVE_TEXTURE_SLOTS) {
        const texture = Reflect.get(material, slot);
        if (!(texture instanceof THREE.Texture)) continue;
        textures.add(texture);
        hasTexture = true;
      }
      if (hasTexture) texturedMaterials.add(material);
    }
  });
  if (materials.size === 0) fail('Preserve-existing requires at least one mesh material.');
  const materialTextures = [...textures];
  await waitForTextureImages(materialTextures);
  if (materialTextures.some((texture) => !hasUsableTextureImage(texture))) {
    fail('Preserve-existing found a material texture whose image did not become ready.');
  }
  return {
    materialNames: [...materials].map((material) => material.name || '(unnamed)').sort(),
    texturedMaterialNames: [...texturedMaterials].map((material) => material.name || '(unnamed)').sort(),
    textureCount: materialTextures.length,
  };
}

function assertPreservedMaterialsExported(
  source: PreservedMaterialSummary,
  bytes: Uint8Array,
): { materialCount: number; textureCount: number; imageCount: number } {
  validateEmbeddedGlbTextures(bytes);
  const { json } = parseGlbContainer(bytes);
  const materials = (json.materials ?? []) as Array<Record<string, unknown>>;
  if (materials.length < source.materialNames.length) {
    fail(`GLB export dropped materials: expected at least ${source.materialNames.length}, found ${materials.length}.`);
  }
  const outputByName = new Map<string, Record<string, unknown>[]>();
  for (const material of materials) {
    const name = typeof material.name === 'string' && material.name ? material.name : '(unnamed)';
    outputByName.set(name, [...(outputByName.get(name) ?? []), material]);
  }
  for (const name of source.materialNames) {
    if (!outputByName.has(name)) fail(`GLB export dropped existing material ${name}.`);
  }
  for (const name of source.texturedMaterialNames) {
    if (!(outputByName.get(name) ?? []).some(isMaterialTextured)) {
      fail(`GLB export dropped texture assignments from existing material ${name}.`);
    }
  }
  const textureCount = json.textures?.length ?? 0;
  const imageCount = json.images?.length ?? 0;
  if (source.textureCount > 0 && (textureCount === 0 || imageCount === 0)) {
    fail('GLB export dropped all textures from the existing materials.');
  }
  return { materialCount: materials.length, textureCount, imageCount };
}

async function loadAsset(file: InputFileRecord, sidecars?: readonly InputFileRecord[]): Promise<LoadedAsset> {
  const extension = path.extname(file.path).toLocaleLowerCase('en-US');
  const buffer = bytesToArrayBuffer(file.bytes);
  if (extension === '.fbx') {
    const input = sidecars === undefined
      ? buffer
      : createModelResourceBundle(
        { name: path.basename(file.path), data: file.bytes },
        sidecars.map((sidecar) => ({
          name: normalizeBundleName(path.dirname(file.path), sidecar.path),
          data: sidecar.bytes,
        })),
      );
    const loaded = await loadFBX(input, { strictResources: sidecars !== undefined });
    return {
      root: loaded.root,
      skeleton: loaded.skeleton,
      clips: loaded.clips,
      removedTextureMaps: loaded.summary.removedTextureMaps,
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
      removedTextureMaps: 0,
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

async function runJob(jobPath: string, signal?: AbortSignal): Promise<GameReadyPublishedGeneration> {
  const rawJob = await readBounded(jobPath, MAX_JOB_BYTES, signal);
  throwIfAborted(signal);
  const job: GameReadyJobDocument = parseGameReadyJobDocument(
    JSON.parse(new TextDecoder().decode(rawJob.bytes)) as unknown,
    GAME_READY_PATH_POLICY,
  );
  const inputRequests: Array<{ role: string; path: string; limit: number }> = [
    { role: 'target', path: job.input.riggedModel, limit: MAX_MODEL_INPUT_BYTES },
  ];
  if (job.$schema === GAME_READY_JOB_SCHEMA) {
    inputRequests.push(
      { role: 'reference-obj', path: job.input.referenceObj, limit: MAX_MODEL_INPUT_BYTES },
      { role: 'reference-mtl', path: job.input.referenceMtl, limit: MAX_MODEL_RESOURCE_FILE_BYTES },
      ...job.input.textures.map((filePath, index) => ({ role: `texture-${index}`, path: filePath, limit: MAX_MODEL_RESOURCE_FILE_BYTES })),
    );
  } else {
    inputRequests.push(...job.input.sidecars.map((filePath, index) => ({
      role: `sidecar-${index}`,
      path: filePath,
      limit: MAX_MODEL_RESOURCE_FILE_BYTES,
    })));
  }
  if (job.rig.retarget) inputRequests.push({
    role: 'retarget-source',
    path: job.rig.retarget.sourceModel,
    limit: MAX_MODEL_INPUT_BYTES,
  });
  const inputs = (await readFilesBounded(
    inputRequests.map(({ path: filePath, limit }) => ({ path: filePath, limit })),
    MAX_MODEL_RESOURCE_BUNDLE_BYTES,
    pathComparisonKey,
    signal,
  )).map((input) => ({ ...input, sha256: sha256(input.bytes) }));
  throwIfAborted(signal);
  const inputByPath = new Map(inputs.map((item) => [pathComparisonKey(item.path), item]));
  const getInput = (filePath: string): InputFileRecord => {
    const input = inputByPath.get(pathComparisonKey(filePath));
    if (!input) fail(`Input ${filePath} was not loaded.`);
    return input;
  };

  const targetSidecars = job.$schema === GAME_READY_PRESERVE_JOB_SCHEMA
    && /\.fbx$/i.test(job.input.riggedModel)
    ? job.input.sidecars.map(getInput)
    : undefined;
  const targetInput = getInput(job.input.riggedModel);
  if (job.$schema === GAME_READY_PRESERVE_JOB_SCHEMA && /\.glb$/i.test(job.input.riggedModel)) {
    validateEmbeddedGlbTextures(targetInput.bytes);
  }
  throwIfAborted(signal);
  const target = await loadAsset(targetInput, targetSidecars);
  let source: LoadedAsset | null = null;
  try {
    throwIfAborted(signal);
    if (!target.skeleton) fail('Rigged target contains no skeleton.');
    let reference: ObjMaterialReference | null = null;
    let prepared: Awaited<ReturnType<typeof prepareMaterialRepair>> | null = null;
    let preserveSummary: PreservedMaterialSummary | null = null;
    if (job.$schema === GAME_READY_JOB_SCHEMA) {
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
      reference = parseObjMaterialReference(objText, mtlText, bundleEntries.map((entry) => entry.name));
      const materialFingerprint = captureMaterialRepairFingerprint(target.root, target.clips);
      prepared = await prepareMaterialRepair(target.root, reference);
      applyPreparedMaterialRepair(prepared);
      assertMaterialRepairPreservedModel(materialFingerprint, target.root, target.clips);
    } else {
      if (target.removedTextureMaps > 0) {
        fail(`Preserve-existing cannot continue: FBX loading removed ${target.removedTextureMaps} unavailable texture map(s).`);
      }
      preserveSummary = await inspectPreservedMaterials(target.root);
    }
    throwIfAborted(signal);

    const clips = renameClips(target.clips, job.rig.clipNames ?? {});
    const retargetReports: AnimationRetargetReport[] = [];
    let rigMapReport: ReturnType<typeof buildRigMap> | null = null;
    let rigCompatibility: RigCompatibilityReport | null = null;
    if (job.rig.retarget) {
      source = await loadAsset(getInput(job.rig.retarget.sourceModel));
      throwIfAborted(signal);
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

    const attachments = resolveLogicalAttachments(target.skeleton, job.rig.attachments, { allowMissing: true });
    throwIfAborted(signal);
    const validation = validateGameReadyModel(target.root, target.skeleton, clips);
    throwIfAborted(signal);
    const draftGlb = await exportGLB(target.root, clips);
    throwIfAborted(signal);
    let outputGlb = draftGlb;
    let embeddedMaterialReports: EmbeddedMaterialReport[] = [];
    let preservedOutputSummary: { materialCount: number; textureCount: number; imageCount: number } | null = null;
    if (job.$schema === GAME_READY_JOB_SCHEMA) {
      if (!reference || !prepared) fail('Repair job did not produce a material repair plan.');
      const mtlFile = getInput(job.input.referenceMtl);
      const textureFiles = job.input.textures.map(getInput);
      const textureInputs = resolveReferenceTextures(reference, path.dirname(mtlFile.path), textureFiles);
      const embedded = embedMaterialTextures(draftGlb, reference.materials, textureInputs, {
        sourceTextureFlipY: job.materialRepair.textureFlipY,
      });
      outputGlb = embedded.bytes;
      embeddedMaterialReports = embedded.report;
      validateEmbeddedGlbTextures(outputGlb);
    } else {
      if (!preserveSummary) fail('Preserve-existing job did not produce a material readiness report.');
      preservedOutputSummary = assertPreservedMaterialsExported(preserveSummary, outputGlb);
    }
    throwIfAborted(signal);
    const stepTiming = job.rig.retarget?.interpolation === 'step'
      && job.rig.retarget.sampleRateHz !== undefined
      && job.rig.retarget.nextDownRationalTimes
      ? validateStepClipTiming(
        outputGlb,
        retargetReports.map((item) => item.targetClip),
        job.rig.retarget.sampleRateHz,
      )
      : [];
    const roundtrip = await validateExportedGLB(outputGlb, target.root, clips);
    throwIfAborted(signal);
    const outputHash = sha256(outputGlb);
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
    throwIfAborted(signal);
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
      ...(job.$schema === GAME_READY_JOB_SCHEMA
        ? {
          materialRepair: {
            mode: job.materialRepair.mode,
            textureFlipY: job.materialRepair.textureFlipY,
            plan: prepared!.plan,
            referenceWarnings: reference!.warnings,
            embeddedMaterials: embeddedMaterialReports satisfies EmbeddedMaterialReport[],
          },
        }
        : {
          materials: {
            mode: job.materials.mode,
            preservation: {
              source: preserveSummary,
              exported: preservedOutputSummary,
            },
          },
        }),
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
        embeddedTextureCount: preservedOutputSummary?.textureCount
          ?? embeddedMaterialReports.reduce((sum, item) => sum + item.textures.length, 0),
        externalResourceUris: 0,
        stepTiming,
      },
      output: { path: 'model.glb', byteLength: outputGlb.byteLength, sha256: outputHash },
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
        byteLength: outputGlb.byteLength,
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
      model: outputGlb,
      job,
      mapping,
      report,
      manifest,
      producer,
      inputs: generationInputs,
    }, { ...job.output, signal });
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
    const result = await runJob(jobPath, controller.signal);
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

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ status: 'failed', error: message })}\n`);
  process.exitCode = 1;
});
