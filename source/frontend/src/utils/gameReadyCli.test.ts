import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PNG } from 'pngjs';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { loadGLB } from '../loaders/glb';
import { loadFBX } from '../loaders/fbx';
import { installFileReaderTestPolyfill } from '../test/installFileReaderTestPolyfill';
import { installNodeThreeRuntime } from '../../scripts/node-three-runtime';
import { createSkinnedGlbFixtureInputWithOptions } from '../../tests/helpers/skinned-glb-fixture';
import { createExternalFbxFixtureInputs } from '../../tests/helpers/external-fbx-fixture';
import {
  parseGlbContainer,
  type EmbeddedMaterialReport,
} from './glbContainer';
import {
  publishGameReadyGeneration,
  type GameReadyGenerationFiles,
  type GameReadyPublicationStep,
} from './gameReadyGeneration';
import { GAME_READY_JOB_SCHEMA, GAME_READY_PRESERVE_JOB_SCHEMA } from './gameReadyJob';
import { createModelResourceBundle } from './modelResourceBundle';
import { disposeThreeObject } from './threeDisposal';

const execFileAsync = promisify(execFile);
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repositoryRoot = path.resolve(frontendRoot, '../..');
const cliPath = path.join(frontendRoot, 'scripts', 'game-ready-cli.ts');
const tsxPath = path.resolve(frontendRoot, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');
const receiptPath = path.join(frontendRoot, 'test-results', 'game-ready-neutral', 'receipt.json');
const BASE_COLOR_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAANSURBVBhXY2BgYPgPAAEEAQBwIGULAAAAAElFTkSuQmCC',
  'base64',
);

interface NeutralFixture {
  target: Buffer;
  source: Buffer;
  obj: string;
  mtl: string;
  texture: Buffer;
}

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface PublishedResult {
  status: 'complete';
  id: string;
  directory: string;
  model: string;
  job: string;
  mapping: string;
  report: string;
  manifest: string;
  currentPointer: string;
  sha256: string;
}

interface CliReport {
  status: string;
  producer: { repository: string; revision: string; workingTree: string; sourceIdentitySha256: string };
  provenance: { ownership: string; classification?: string };
  inputs: Array<{ role: string; name: string; sha256: string; byteLength: number }>;
  materialRepair: { embeddedMaterials: EmbeddedMaterialReport[] };
  rig: {
    retargetMap: { map: Record<string, string> };
    retargetClips: Array<{ sourceClip: string; targetClip: string; directionTransferBones?: string[] | null }>;
  };
  validation: {
    source: { boneCount: number; clipCount: number; clips: Array<{ name: string; duration: number }> };
    exportedRoundtrip: { boneCount: number; clipCount: number; clipNames: string[] };
    embeddedTextureCount: number;
  };
}

interface CliManifest {
  generation: { id: string; immutable: boolean; publication: string };
  producer: { repository: string; sourceIdentitySha256: string };
  inputs: Array<{ role: string; name: string; sha256: string; byteLength: number }>;
  asset: { glb: string; sha256: string; byteLength: number };
  clips: Array<{ name: string; duration: number; trackCount: number }>;
}

interface PreserveCliReport {
  materials: {
    mode: 'preserve-existing';
    preservation: {
      source: { materialNames: string[]; texturedMaterialNames: string[]; textureCount: number };
      exported: { materialCount: number; textureCount: number; imageCount: number };
    };
  };
  validation: {
    source: { boneCount: number; clipCount: number };
    exportedRoundtrip: { boneCount: number; clipNames: string[] };
    embeddedTextureCount: number;
  };
}

interface IsolatedWorkspace {
  root: string;
  cliPath: string;
}

interface ReimportEvidence {
  boneNames: string[];
  clipNames: string[];
  durationSeconds: number;
  sampled: {
    timeSeconds: number;
    rootPosition: number[];
    tipQuaternion: number[];
  };
  skin: {
    indices: number[];
    weights: number[];
  };
  material: {
    name: string;
    imageMimeType: string;
    baseColorRgba: number[];
  };
}

function hash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function firstEmbeddedPngPixels(bytes: Uint8Array): Uint8Array {
  const { json, binary } = parseGlbContainer(bytes);
  const image = json.images?.[0];
  assert.equal(image?.mimeType, 'image/png');
  assert.equal(image?.uri, undefined);
  assert.ok(image?.bufferView !== undefined);
  const view = json.bufferViews?.[image!.bufferView!];
  assert.ok(view);
  const start = view.byteOffset ?? 0;
  const encoded = Buffer.from(binary.subarray(start, start + view.byteLength));
  let offset = 8;
  while (offset + 12 <= encoded.byteLength) {
    const chunkLength = encoded.readUInt32BE(offset);
    const chunkType = encoded.toString('ascii', offset + 4, offset + 8);
    offset += chunkLength + 12;
    if (chunkType === 'IEND') break;
  }
  return PNG.sync.read(encoded.subarray(0, offset)).data;
}

function clip(name: string, rootName: string, tipName: string, tipDegrees: number, rootTravel: number): THREE.AnimationClip {
  const duration = 0.5;
  const middle = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(tipDegrees))
    .toArray();
  return new THREE.AnimationClip(name, duration, [
    new THREE.QuaternionKeyframeTrack(`${tipName}.quaternion`, [0, duration / 2, duration], [
      0, 0, 0, 1,
      ...middle,
      0, 0, 0, 1,
    ]),
    new THREE.VectorKeyframeTrack(`${rootName}.position`, [0, duration], [
      0, 0, 0,
      rootTravel, 0, 0,
    ]),
  ]);
}

async function exportNeutralGlb(prefix: 'Source' | 'Target'): Promise<Buffer> {
  installFileReaderTestPolyfill();
  const root = new THREE.Group();
  root.name = `${prefix}NeutralRoot`;
  const rootBone = new THREE.Bone();
  rootBone.name = `${prefix}Root`;
  const tipBone = new THREE.Bone();
  tipBone.name = `${prefix}Tip`;
  tipBone.position.y = 1;
  rootBone.add(tipBone);
  root.add(rootBone);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.35, 0, 0,
    0.35, 0, 0,
    0.35, 1, 0,
    -0.35, 1, 0,
  ], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0,
    1, 0,
    1, 1,
    0, 1,
  ], 2));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([
    0, 0, 0, 0,
    0, 0, 0, 0,
    1, 0, 0, 0,
    1, 0, 0, 0,
  ], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([
    1, 0, 0, 0,
    1, 0, 0, 0,
    1, 0, 0, 0,
    1, 0, 0, 0,
  ], 4));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const material = new THREE.MeshStandardMaterial({ name: 'NeutralMaterial', color: 0x4a9f82 });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'NeutralMesh';
  mesh.bind(new THREE.Skeleton([rootBone, tipBone]));
  root.add(mesh);
  const clips = [
    clip('Idle', `${prefix}Root`, `${prefix}Tip`, 0, 0.01),
    clip('Reach', `${prefix}Root`, `${prefix}Tip`, 35, 0.12),
  ];
  root.updateMatrixWorld(true);
  try {
    const exported = await new GLTFExporter().parseAsync(root, { binary: true, animations: clips });
    if (!(exported instanceof ArrayBuffer)) throw new Error('Neutral fixture export did not produce GLB bytes.');
    return Buffer.from(exported);
  } finally {
    disposeThreeObject(root);
  }
}

async function createNeutralFixture(): Promise<NeutralFixture> {
  return {
    target: await exportNeutralGlb('Target'),
    source: await exportNeutralGlb('Source'),
    obj: [
      'mtllib neutral.mtl',
      'o NeutralMesh',
      'v -0.35 0 0',
      'v 0.35 0 0',
      'v 0.35 1 0',
      'v -0.35 1 0',
      'usemtl NeutralMaterial',
      'f 1 2 3',
      'f 1 3 4',
      '',
    ].join('\n'),
    mtl: [
      'newmtl NeutralMaterial',
      'Kd 0.25 0.6 0.4',
      'Pr 0.7',
      'map_Kd neutral-basecolor.png',
      '',
    ].join('\n'),
    texture: BASE_COLOR_PNG,
  };
}

function jobFor(
  root: string,
  target: string,
  source: string,
  obj: string,
  mtl: string,
  texture: string,
  generationRoot = path.join(root, 'generations'),
): Record<string, unknown> {
  return {
    $schema: GAME_READY_JOB_SCHEMA,
    input: {
      riggedModel: target,
      referenceObj: obj,
      referenceMtl: mtl,
      textures: [texture],
    },
    materialRepair: { mode: 'strict-auto', textureFlipY: true },
    coordinates: { unitMeters: 1, up: '+Y', forward: '+Z', grounded: true },
    rig: {
      attachments: { root: 'TargetRoot' },
      retarget: {
        sourceModel: source,
        clips: ['Idle', 'Reach'],
        manualMap: { SourceRoot: 'TargetRoot', SourceTip: 'TargetTip' },
        allowFuzzy: false,
        applyUpCorrection: false,
        alignMappedBoneDirections: true,
        directionAlignmentBones: ['TargetRoot'],
        directionTransfer: 'relative',
        directionTransferBones: ['TargetRoot'],
        replaceClips: ['Idle', 'Reach'],
      },
    },
    output: {
      generationRoot,
      currentPointer: path.join(generationRoot, 'current.json'),
    },
    provenance: {
      generator: 'neutral-cli-integration-test',
      ownership: 'caller-owned neutral fixture',
      classification: 'NEUTRAL_TEST',
      notes: ['No fight-game-study or GaimEngine metadata or code is required.'],
    },
  };
}

function preserveJobFor(
  root: string,
  target: string,
  sidecars: string[] = [],
  generationRoot = path.join(root, 'preserved-generations'),
): Record<string, unknown> {
  return {
    $schema: GAME_READY_PRESERVE_JOB_SCHEMA,
    input: { riggedModel: target, sidecars },
    materials: { mode: 'preserve-existing' },
    coordinates: { unitMeters: 1, up: '+Y', forward: '+Z', grounded: true },
    rig: {},
    output: {
      generationRoot,
      currentPointer: path.join(generationRoot, 'current.json'),
    },
    provenance: {
      generator: 'preserve-existing-neutral-test',
      ownership: 'caller-owned neutral fixture',
      classification: 'NEUTRAL_TEST',
    },
  };
}

async function writeJob(filePath: string, value: Record<string, unknown>): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function invokeCli(jobPath: string, executablePath = cliPath, cwd = frontendRoot): Promise<CliResult> {
  try {
    const result = await execFileAsync(process.execPath, [tsxPath, executablePath, '--job', jobPath], {
      cwd,
      env: { ...process.env },
      maxBuffer: 4 * 1024 * 1024,
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error: unknown) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string; message?: string };
    return {
      code: typeof failure.code === 'number' ? failure.code : 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? failure.message ?? String(error),
    };
  }
}

async function createIsolatedToolWorkspace(parentRoot: string): Promise<IsolatedWorkspace> {
  const root = path.join(parentRoot, 'isolated-tool-workspace');
  const sourceRoot = path.join(root, 'source');
  const sourceFrontendRoot = path.join(sourceRoot, 'frontend');
  const excludedDirectoryNames = new Set([
    'node_modules',
    'dist',
    'playwright-report',
    'test-results',
    'target',
    'output',
    'runtime-data',
  ]);
  await mkdir(sourceRoot, { recursive: true });
  await cp(path.join(repositoryRoot, 'source', 'frontend'), sourceFrontendRoot, {
    recursive: true,
    filter(sourcePath) {
      const relative = path.relative(path.join(repositoryRoot, 'source', 'frontend'), sourcePath);
      return !relative.split(path.sep).some((segment) => excludedDirectoryNames.has(segment));
    },
  });
  await cp(path.join(repositoryRoot, 'source', 'package.json'), path.join(sourceRoot, 'package.json'));
  await cp(path.join(repositoryRoot, 'source', 'package-lock.json'), path.join(sourceRoot, 'package-lock.json'));
  await writeFile(path.join(root, '.gitignore'), 'source/node_modules/\n');
  await symlink(path.join(repositoryRoot, 'source', 'node_modules'), path.join(sourceRoot, 'node_modules'), 'junction');

  await execFileAsync('git', ['init', '--quiet'], { cwd: root });
  await execFileAsync('git', ['config', 'user.name', 'RustSMF isolated proof'], { cwd: root });
  await execFileAsync('git', ['config', 'user.email', 'rustsmf-isolated-proof@example.invalid'], { cwd: root });
  await execFileAsync('git', ['add', 'source', '.gitignore'], { cwd: root });
  await execFileAsync('git', ['commit', '--quiet', '-m', 'isolated neutral CLI proof'], { cwd: root });
  const status = await execFileAsync('git', ['status', '--porcelain'], { cwd: root });
  assert.equal(status.stdout, '');
  return { root, cliPath: path.join(sourceFrontendRoot, 'scripts', 'game-ready-cli.ts') };
}

function parsePublishedResult(stdout: string): PublishedResult {
  const value = JSON.parse(stdout.trim()) as PublishedResult;
  assert.equal(value.status, 'complete');
  assert.match(value.id, /^[a-f0-9]{64}$/);
  return value;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

async function generationIds(root: string): Promise<string[]> {
  return (await readdir(root)).filter((name) => /^[a-f0-9]{64}$/.test(name)).sort();
}

async function inputHashes(paths: readonly string[]): Promise<string[]> {
  return Promise.all(paths.map(async (filePath) => hash(await readFile(filePath))));
}

test('neutral saved job runs through the CLI, reimports, and preserves failed-attempt state', async () => {
  installNodeThreeRuntime();
  const root = await mkdtemp(path.join(os.tmpdir(), 'rustsmf-neutral-cli-'));
  const fixture = await createNeutralFixture();
  const targetPath = path.join(root, 'target.glb');
  const sourcePath = path.join(root, 'source.glb');
  const objPath = path.join(root, 'neutral.obj');
  const mtlPath = path.join(root, 'neutral.mtl');
  const texturePath = path.join(root, 'neutral-basecolor.png');
  const jobPath = path.join(root, 'neutral.job.json');
  const malformedMappingPath = path.join(root, 'malformed-mapping.job.json');
  const missingClipPath = path.join(root, 'missing-clip.job.json');
  const callerInputs = [targetPath, sourcePath, objPath, mtlPath, texturePath, jobPath];
  let reimportEvidence: ReimportEvidence | undefined;
  try {
    await writeFile(targetPath, fixture.target);
    await writeFile(sourcePath, fixture.source);
    await writeFile(objPath, fixture.obj);
    await writeFile(mtlPath, fixture.mtl);
    await writeFile(texturePath, fixture.texture);
    await writeJob(jobPath, jobFor(root, targetPath, sourcePath, objPath, mtlPath, texturePath));
    const originalInputHashes = await inputHashes(callerInputs);

    const baselineRun = await invokeCli(jobPath);
    assert.equal(baselineRun.code, 0, baselineRun.stderr);
    const published = parsePublishedResult(baselineRun.stdout);
    const manifest = await readJson<CliManifest>(published.manifest);
    const report = await readJson<CliReport>(published.report);
    assert.equal(manifest.generation.id, published.id);
    assert.equal(manifest.generation.immutable, true);
    assert.equal(manifest.generation.publication, 'manifest-last-directory-rename');
    assert.equal(manifest.producer.repository, 'Shoozes/RustSMF');
    assert.equal(report.provenance.ownership, 'caller-owned neutral fixture');
    assert.equal(report.provenance.classification, 'NEUTRAL_TEST');
    assert.deepEqual(report.rig.retargetMap.map, { SourceRoot: 'TargetRoot', SourceTip: 'TargetTip' });
    assert.deepEqual(report.rig.retargetClips.map((item) => item.targetClip), ['Idle', 'Reach']);
    assert.ok(report.rig.retargetClips.every((item) => item.directionTransferBones?.includes('TargetRoot')));
    assert.equal(report.validation.source.boneCount, 2);
    assert.equal(report.validation.source.clipCount, 2);
    assert.deepEqual(report.validation.exportedRoundtrip.clipNames, ['Idle', 'Reach']);
    assert.equal(report.validation.exportedRoundtrip.clipCount, 2);
    assert.equal(report.validation.embeddedTextureCount, 1);
    assert.equal(report.materialRepair.embeddedMaterials[0].textures.length, 1);
    assert.equal(manifest.clips.length, 2);
    assert.deepEqual(manifest.clips.map((clipInfo) => clipInfo.name), ['Idle', 'Reach']);
    assert.ok(manifest.clips.every((clipInfo) => clipInfo.duration > 0 && clipInfo.trackCount > 0));

    const outputBytes = new Uint8Array(await readFile(published.model));
    const parsedContainer = parseGlbContainer(outputBytes);
    const outputMaterial = parsedContainer.json.materials?.find((material) => material.name === 'NeutralMaterial');
    assert.ok(outputMaterial?.pbrMetallicRoughness?.baseColorTexture);
    assert.equal(parsedContainer.json.images?.length, 1);
    const embeddedImage = parsedContainer.json.images?.[0];
    assert.equal(embeddedImage?.mimeType, 'image/png');
    assert.ok(embeddedImage?.bufferView !== undefined);
    const embeddedView = parsedContainer.json.bufferViews?.[embeddedImage.bufferView];
    assert.ok(embeddedView);
    const embeddedOffset = embeddedView.byteOffset ?? 0;
    const embeddedPixels = PNG.sync.read(Buffer.from(parsedContainer.binary.subarray(
      embeddedOffset,
      embeddedOffset + embeddedView.byteLength,
    ))).data;
    assert.deepEqual([...embeddedPixels], [...PNG.sync.read(BASE_COLOR_PNG).data]);
    assert.deepEqual(parsedContainer.json.animations?.map((animation) => animation.name), ['Idle', 'Reach']);
    const loaded = await loadGLB(outputBytes.buffer.slice(outputBytes.byteOffset, outputBytes.byteOffset + outputBytes.byteLength));
    try {
      assert.deepEqual(loaded.skeleton?.bones.map((bone) => bone.name), ['TargetRoot', 'TargetTip']);
      assert.deepEqual(loaded.clips.map((clipInfo) => clipInfo.name), ['Idle', 'Reach']);
      assert.ok(loaded.clips.every((clipInfo) => Math.abs(clipInfo.duration - 0.5) < 1e-5));
      const reach = loaded.clips.find((clipInfo) => clipInfo.name === 'Reach');
      assert.ok(reach?.tracks.some((track) => track.name === 'TargetTip.quaternion'));
      const mesh = loaded.root.getObjectByName('NeutralMesh');
      assert.ok(mesh instanceof THREE.SkinnedMesh);
      const skinIndex = mesh.geometry.getAttribute('skinIndex');
      const skinWeight = mesh.geometry.getAttribute('skinWeight');
      assert.equal(skinIndex?.itemSize, 4);
      assert.equal(skinWeight?.itemSize, 4);
      assert.deepEqual(Array.from(skinIndex?.array ?? []).slice(0, 16), [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
      assert.deepEqual(Array.from(skinWeight?.array ?? []).slice(0, 16), [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
      const loadedMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      assert.equal(loadedMaterial.name, 'NeutralMaterial');
      assert.ok(loadedMaterial.map?.image);

      const targetRoot = loaded.skeleton?.getBoneByName('TargetRoot');
      const targetTip = loaded.skeleton?.getBoneByName('TargetTip');
      assert.ok(targetRoot && targetTip && reach);
      const reachAction = loaded.mixer.clipAction(reach);
      reachAction.play();
      loaded.mixer.setTime(0.25);
      loaded.root.updateMatrixWorld(true);
      assert.ok(Math.abs(targetRoot.position.x - 0.06) < 1e-4, `unexpected Reach root travel: ${targetRoot.position.x}`);
      assert.ok(Math.abs(targetTip.quaternion.z - Math.sin(THREE.MathUtils.degToRad(35) / 2)) < 1e-3);
      assert.ok(Math.abs(targetTip.quaternion.w - Math.cos(THREE.MathUtils.degToRad(35) / 2)) < 1e-3);
      reimportEvidence = {
        boneNames: loaded.skeleton!.bones.map((bone) => bone.name),
        clipNames: loaded.clips.map((clipInfo) => clipInfo.name),
        durationSeconds: reach.duration,
        sampled: {
          timeSeconds: 0.25,
          rootPosition: targetRoot.position.toArray(),
          tipQuaternion: targetTip.quaternion.toArray(),
        },
        skin: {
          indices: Array.from(skinIndex!.array as ArrayLike<number>).slice(0, 16),
          weights: Array.from(skinWeight!.array as ArrayLike<number>).slice(0, 16),
        },
        material: {
          name: loadedMaterial.name,
          imageMimeType: embeddedImage.mimeType!,
          baseColorRgba: [...embeddedPixels],
        },
      };
    } finally {
      loaded.mixer.stopAllAction();
      disposeThreeObject(loaded.root);
    }

    const originalCurrent = await readJson<{ generation: string }>(published.currentPointer);
    const baselineIds = await generationIds(path.join(root, 'generations'));
    assert.deepEqual(baselineIds, [published.id]);

    const isolatedWorkspace = await createIsolatedToolWorkspace(root);
    const isolatedGenerationRoot = path.join(root, 'isolated-generations');
    const isolatedJobPath = path.join(root, 'isolated-neutral.job.json');
    await writeJob(
      isolatedJobPath,
      jobFor(root, targetPath, sourcePath, objPath, mtlPath, texturePath, isolatedGenerationRoot),
    );
    assert.deepEqual((await readdir(isolatedWorkspace.root)).sort(), ['.git', '.gitignore', 'source']);
    for (const sibling of ['fight-game-study', 'GaimEngine']) {
      await assert.rejects(access(path.join(isolatedWorkspace.root, sibling)));
    }
    const isolatedRun = await invokeCli(isolatedJobPath, isolatedWorkspace.cliPath, isolatedWorkspace.root);
    assert.equal(isolatedRun.code, 0, isolatedRun.stderr);
    const isolatedPublished = parsePublishedResult(isolatedRun.stdout);
    const isolatedReport = await readJson<CliReport>(isolatedPublished.report);
    const isolatedManifest = await readJson<CliManifest>(isolatedPublished.manifest);
    assert.equal(isolatedReport.producer.workingTree, 'clean');
    assert.notEqual(isolatedReport.producer.revision, report.producer.revision);
    assert.equal(isolatedManifest.generation.id, isolatedPublished.id);
    assert.deepEqual(isolatedManifest.clips.map((clipInfo) => clipInfo.name), ['Idle', 'Reach']);
    const isolatedProof = {
      mode: 'copied-tool-workspace',
      workspaceEntries: ['.git', '.gitignore', 'source'],
      revision: isolatedReport.producer.revision,
      workingTree: isolatedReport.producer.workingTree,
      generationId: isolatedPublished.id,
      absentConsumerCheckouts: ['fight-game-study', 'GaimEngine'],
    };

    const malformedMapping = structuredClone(jobFor(root, targetPath, sourcePath, objPath, mtlPath, texturePath));
    ((malformedMapping.rig as Record<string, unknown>).retarget as Record<string, unknown>).manualMap = {
      SourceMissing: 'TargetRoot',
    };
    await writeJob(malformedMappingPath, malformedMapping);
    const malformedInputHashes = await inputHashes([malformedMappingPath]);
    const malformedRun = await invokeCli(malformedMappingPath);
    assert.notEqual(malformedRun.code, 0);
    assert.match(malformedRun.stderr, /Manual source bone SourceMissing does not exist/);
    assert.deepEqual(await readJson<{ generation: string }>(published.currentPointer), originalCurrent);
    assert.deepEqual(await generationIds(path.join(root, 'generations')), baselineIds);
    assert.deepEqual(await inputHashes(callerInputs), originalInputHashes);
    assert.deepEqual(await inputHashes([malformedMappingPath]), malformedInputHashes);

    const missingClip = structuredClone(jobFor(root, targetPath, sourcePath, objPath, mtlPath, texturePath));
    ((missingClip.rig as Record<string, unknown>).retarget as Record<string, unknown>).clips = ['Missing'];
    await writeJob(missingClipPath, missingClip);
    const missingClipInputHashes = await inputHashes([missingClipPath]);
    const missingClipRun = await invokeCli(missingClipPath);
    assert.notEqual(missingClipRun.code, 0);
    assert.match(missingClipRun.stderr, /Retarget selection contains no source clips/);
    assert.deepEqual(await readJson<{ generation: string }>(published.currentPointer), originalCurrent);
    assert.deepEqual(await generationIds(path.join(root, 'generations')), baselineIds);
    assert.deepEqual(await inputHashes(callerInputs), originalInputHashes);
    assert.deepEqual(await inputHashes([missingClipPath]), missingClipInputHashes);

    const baselineFiles: GameReadyGenerationFiles = {
      model: outputBytes,
      job: await readJson(published.job),
      mapping: await readJson(published.mapping),
      report,
      manifest: manifest as unknown as Record<string, unknown>,
      producer: manifest.producer as unknown as GameReadyGenerationFiles['producer'],
      inputs: manifest.inputs,
    };
    await assert.rejects(
      publishGameReadyGeneration(baselineFiles, {
        generationRoot: path.join(root, 'generations'),
        currentPointer: published.currentPointer,
        afterStep(step: GameReadyPublicationStep) {
          if (step === 'report') throw new Error('neutral interrupted publication');
        },
      }),
      /staging remains.*neutral interrupted publication/,
    );
    assert.deepEqual(await readJson<{ generation: string }>(published.currentPointer), originalCurrent);
    assert.deepEqual(await generationIds(path.join(root, 'generations')), baselineIds);
    assert.deepEqual(await inputHashes(callerInputs), originalInputHashes);

    await mkdir(path.dirname(receiptPath), { recursive: true });
    assert.ok(reimportEvidence);
    await writeFile(receiptPath, `${JSON.stringify({
      $schema: 'rustsmf.game-ready-neutral-proof.v1',
      repository: report.producer.repository,
      revision: report.producer.revision,
      workingTree: report.producer.workingTree,
      sourceIdentitySha256: report.producer.sourceIdentitySha256,
      generation: {
        id: published.id,
        modelSha256: published.sha256,
        inputRoles: manifest.inputs.map((input) => input.role),
        inputHashes: manifest.inputs.map((input) => ({ role: input.role, sha256: input.sha256 })),
        clipNames: manifest.clips.map((clipInfo) => clipInfo.name),
        embeddedTextureCount: report.validation.embeddedTextureCount,
      },
      isolation: isolatedProof,
      reimport: { ...reimportEvidence, skinSlotsPerVertex: 4 },
      failureCases: [
        'malformed manual mapping leaves current generation and caller inputs unchanged',
        'missing source clip leaves current generation and caller inputs unchanged',
        'interrupted publication leaves prior generation and caller inputs unchanged',
      ],
    }, null, 2)}\n`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('v3 preserve-existing exports an embedded textured skinned GLB without repair inputs', async () => {
  installNodeThreeRuntime();
  const root = await mkdtemp(path.join(os.tmpdir(), 'rustsmf-preserve-glb-'));
  try {
    const fixture = await createSkinnedGlbFixtureInputWithOptions({ withTexture: true });
    const targetPath = path.join(root, fixture.name);
    const jobPath = path.join(root, 'preserve.job.json');
    const targetBytes = Buffer.from(fixture.buffer);
    await writeFile(targetPath, targetBytes);
    await writeJob(jobPath, preserveJobFor(root, targetPath));
    const originalInputHashes = await inputHashes([targetPath, jobPath]);

    const run = await invokeCli(jobPath);
    assert.equal(run.code, 0, run.stderr);
    const published = parsePublishedResult(run.stdout);
    const report = await readJson<PreserveCliReport>(published.report);
    const normalizedJob = await readJson<Record<string, unknown>>(published.job);
    assert.equal(normalizedJob.$schema, GAME_READY_PRESERVE_JOB_SCHEMA);
    assert.deepEqual(normalizedJob.input, { riggedModel: targetPath, sidecars: [] });
    assert.equal('referenceObj' in (normalizedJob.input as Record<string, unknown>), false);
    assert.equal(report.materials.mode, 'preserve-existing');
    assert.equal(report.materials.preservation.source.textureCount, 1);
    assert.ok(report.materials.preservation.exported.imageCount > 0);
    assert.equal(report.validation.source.boneCount, 2);
    assert.deepEqual(report.validation.exportedRoundtrip.clipNames, ['FixtureBend']);
    assert.equal(report.validation.embeddedTextureCount, report.materials.preservation.exported.textureCount);
    assert.deepEqual([...firstEmbeddedPngPixels(new Uint8Array(await readFile(published.model)))],
      [...firstEmbeddedPngPixels(targetBytes)]);

    const outputBytes = new Uint8Array(await readFile(published.model));
    const loaded = await loadGLB(outputBytes.buffer.slice(outputBytes.byteOffset, outputBytes.byteOffset + outputBytes.byteLength));
    try {
      assert.deepEqual(loaded.skeleton?.bones.map((bone) => bone.name), ['FixtureRoot', 'FixtureTip']);
      assert.deepEqual(loaded.clips.map((clipInfo) => clipInfo.name), ['FixtureBend']);
      const mesh = loaded.root.getObjectByName('FixtureSkinnedMesh');
      assert.ok(mesh instanceof THREE.SkinnedMesh);
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      assert.ok(material.map?.image);
      assert.ok((material.map.image as { width?: number }).width! > 0);
    } finally {
      loaded.mixer.stopAllAction();
      disposeThreeObject(loaded.root);
    }
    assert.deepEqual(await inputHashes([targetPath, jobPath]), originalInputHashes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('v3 preserve-existing resolves FBX texture sidecars and roundtrips a skinned animated FBX', async () => {
  installNodeThreeRuntime();
  const root = await mkdtemp(path.join(os.tmpdir(), 'rustsmf-preserve-fbx-'));
  try {
    const externalFiles = createExternalFbxFixtureInputs();
    const externalModelPath = path.join(root, externalFiles[0].name);
    const externalTexturePath = path.join(root, externalFiles[1].name);
    const externalJobPath = path.join(root, 'sidecar.job.json');
    await writeFile(externalModelPath, externalFiles[0].buffer);
    await writeFile(externalTexturePath, externalFiles[1].buffer);
    const externalBundle = createModelResourceBundle(
      { name: externalFiles[0].name, data: externalFiles[0].buffer },
      [{ name: externalFiles[1].name, data: externalFiles[1].buffer }],
    );
    const externalLoaded = await loadFBX(externalBundle, { strictResources: true });
    try {
      assert.equal(externalLoaded.summary.textureMapCount, 1);
      assert.equal(externalLoaded.summary.removedTextureMaps, 0);
      let mesh: THREE.Object3D | undefined;
      externalLoaded.root.traverse((object) => { if ('isMesh' in object && object.isMesh) mesh = object; });
      assert.ok(mesh);
      const material = Array.isArray(Reflect.get(mesh, 'material'))
        ? Reflect.get(mesh, 'material')[0] as THREE.Material
        : Reflect.get(mesh, 'material') as THREE.Material;
      assert.ok(Reflect.get(material, 'map'));
      assert.ok(Reflect.get(Reflect.get(material, 'map'), 'image'));
    } finally {
      externalLoaded.mixer.stopAllAction();
      disposeThreeObject(externalLoaded.root);
    }
    await writeJob(externalJobPath, preserveJobFor(root, externalModelPath, [externalTexturePath]));
    const staticFbxRun = await invokeCli(externalJobPath);
    assert.notEqual(staticFbxRun.code, 0);
    assert.match(staticFbxRun.stderr, /Rigged target contains no skeleton/);
    await assert.rejects(access(path.join(root, 'preserved-generations')));

    const riggedTargetPath = path.join(root, 'independent_skinned.fbx');
    const riggedJobPath = path.join(root, 'rigged-preserve.job.json');
    const fixturePath = path.join(frontendRoot, 'tests', 'fixtures', 'independent-fbx', 'independent_skinned.fbx');
    const fixtureBytes = await readFile(fixturePath);
    await writeFile(riggedTargetPath, fixtureBytes);
    await writeJob(riggedJobPath, preserveJobFor(root, riggedTargetPath, [], path.join(root, 'rigged-generations')));
    const run = await invokeCli(riggedJobPath);
    assert.equal(run.code, 0, run.stderr);
    const published = parsePublishedResult(run.stdout);
    const report = await readJson<PreserveCliReport>(published.report);
    assert.equal(report.materials.mode, 'preserve-existing');
    assert.equal(report.materials.preservation.source.textureCount, 1);
    assert.ok(report.materials.preservation.exported.imageCount > 0);
    assert.equal(report.validation.source.boneCount, 2);
    assert.equal(report.validation.source.clipCount, 1);
    assert.equal(report.validation.exportedRoundtrip.boneCount, 2);
    assert.deepEqual(report.validation.exportedRoundtrip.clipNames, ['Scene']);

    const outputBytes = new Uint8Array(await readFile(published.model));
    const loaded = await loadGLB(outputBytes.buffer.slice(outputBytes.byteOffset, outputBytes.byteOffset + outputBytes.byteLength));
    try {
      assert.equal(loaded.skeleton?.bones.length, 2);
      assert.deepEqual(loaded.clips.map((clipInfo) => clipInfo.name), ['Scene']);
      const meshes: THREE.Mesh[] = [];
      loaded.root.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object); });
      assert.ok(meshes.some((mesh) => {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        return materials.some((material) => !!Reflect.get(material, 'map') && !!Reflect.get(Reflect.get(material, 'map'), 'image'));
      }));
    } finally {
      loaded.mixer.stopAllAction();
      disposeThreeObject(loaded.root);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
