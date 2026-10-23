import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKELETAL_EXPORT_JOB_SCHEMA, SKELETAL_EXPORT_JOB_V2_SCHEMA, SKELETAL_EXPORT_JOB_V3_SCHEMA } from './skeletalExportJob';
import { CONDITIONING_MODE, CONDITIONING_NLERP_MODE } from './skeletalConditioning';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../');
const sourceRoot = path.join(repositoryRoot, 'source');
const cliPath = path.join(sourceRoot, 'frontend', 'scripts', 'skeletal-export-cli.ts');
const signalRobotPath = path.join(repositoryRoot, 'examples', 'rustsmf-demo.glb');

function invoke(jobPath: string): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, ['--import', 'tsx', cliPath, '--job', jobPath], {
    cwd: sourceRoot,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
  });
}

for (const mode of [CONDITIONING_MODE, CONDITIONING_NLERP_MODE]) test(`v3 ${mode} reimports and binds an immutable conditioned GLB reproducibly`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skeletal-v3-cli-'));
  const jobPath = path.join(root, 'job.json');
  try {
    await writeFile(jobPath, JSON.stringify({ $schema: SKELETAL_EXPORT_JOB_V3_SCHEMA,
      input: { skinnedModel: signalRobotPath },
      export: { rootJoint: 'LocomotionRoot', units: 'meters', upAxis: '+Y', forwardAxis: '+Z', handedness: 'right', ticksPerSecond: 60, rootMotion: 'separate-track', clipIds: ['Wave'] },
      conditioning: { mode, sourceRootJoint: 'Base', locomotionRootJoint: 'LocomotionRoot', clipIds: ['Wave', 'Turn'], transitions: [] },
      output: { generationRoot: path.join(root, 'generations'), conditioningRoot: path.join(root, 'conditioned') },
    }));
    const first = invoke(jobPath), second = invoke(jobPath);
    assert.equal(first.status, 0, first.stderr); assert.equal(second.status, 0, second.stderr);
    const result = JSON.parse(first.stdout) as { id: string; manifest: string; conditioning: { model: string; report: string; recipe: string } };
    assert.equal((JSON.parse(second.stdout) as { id: string }).id, result.id);
    const manifest = JSON.parse(await readFile(result.manifest, 'utf8')) as { inputs: Array<{ role: string; sha256: string }> };
    const identities = new Map(manifest.inputs.map(input => [input.role, input.sha256]));
    const hash = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
    assert.equal(identities.get('source-skinned-model'), hash(await readFile(result.conditioning.model)));
    assert.equal(identities.get('original-skinned-model'), hash(await readFile(signalRobotPath)));
    assert.notEqual(identities.get('source-skinned-model'), identities.get('original-skinned-model'));
    assert.equal(identities.get('conditioning-report'), hash(await readFile(result.conditioning.report)));
    assert.equal(identities.get('conditioning-recipe'), hash(await readFile(result.conditioning.recipe)));
    assert.equal((JSON.parse(await readFile(result.conditioning.recipe, 'utf8')) as { mode: string }).mode, mode);
    assert.deepEqual((await readdir(path.join(root, 'generations'))), [result.id]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CLI publishes a repeatable producer-bound packet and preserves it on source validation failure', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skeletal-cli-'));
  const generationRoot = path.join(root, 'generations');
  const currentPointer = path.join(generationRoot, 'current.json');
  const jobPath = path.join(root, 'job.json');
  const sourceBytesBefore = await readFile(signalRobotPath);
  const sourceShaBefore = createHash('sha256').update(sourceBytesBefore).digest('hex');
  const baseJob = {
    $schema: SKELETAL_EXPORT_JOB_SCHEMA,
    input: { skinnedModel: signalRobotPath },
    export: {
      rootJoint: 'Base',
      units: 'meters',
      upAxis: '+Y',
      forwardAxis: '+Z',
      handedness: 'right',
      ticksPerSecond: 60,
      rootMotion: 'separate-track',
    },
    output: { generationRoot, currentPointer },
  };
  try {
    await writeFile(jobPath, `${JSON.stringify(baseJob, null, 2)}\n`);
    const firstRun = invoke(jobPath);
    assert.equal(firstRun.status, 0, firstRun.stderr || firstRun.error?.message);
    const first = JSON.parse(firstRun.stdout) as {
      status: string;
      id: string;
      hashes: { asset: string; mapping: string; references: string };
      sourceIdentitySha256: string;
      exporterIdentitySha256: string;
      settingsIdentitySha256: string;
      statistics: { joints: number; vertices: number; indices: number; clips: number };
      manifest: string;
    };
    assert.equal(first.status, 'complete');
    assert.match(first.sourceIdentitySha256, /^[a-f0-9]{64}$/);
    assert.match(first.exporterIdentitySha256, /^[a-f0-9]{64}$/);
    assert.equal(first.settingsIdentitySha256, 'b1e587cd4fc3d4a928c60bbdf8c9b920f3f49d773e1aeca7f2f65aa01b870336');
    assert.deepEqual(first.statistics, { joints: 5, vertices: 2400, indices: 360, clips: 2, keys: 18, referenceSamples: 10 });
    const manifestBytes = await readFile(first.manifest);
    const manifest = JSON.parse(manifestBytes.toString('utf8')) as {
      schema: string;
      generationId: string;
      producer: { repository: string; revision: string; workingTree: string; sourceIdentitySha256: string; exporterIdentitySha256: string };
      inputSetIdentitySha256: string;
      settingsIdentitySha256: string;
      inputs: Array<{ role: string; bytes: number; sha256: string }>;
      artifacts: Record<string, { path: string; bytes: number; sha256: string }>;
      semantics: Record<string, unknown>;
    };
    assert.equal(manifest.schema, 'gaim.skeletal-export-generation.v1');
    assert.equal(manifest.generationId, first.id);
    assert.equal(manifest.producer.repository, 'Shoozes/RustSMF');
    assert.match(manifest.producer.revision, /^[a-f0-9]{40}$/);
    assert.ok(['clean', 'dirty'].includes(manifest.producer.workingTree));
    assert.equal(manifest.producer.sourceIdentitySha256, first.sourceIdentitySha256);
    assert.equal(manifest.producer.exporterIdentitySha256, first.exporterIdentitySha256);
    assert.match(manifest.inputSetIdentitySha256, /^[a-f0-9]{64}$/);
    assert.match(manifest.settingsIdentitySha256, /^[a-f0-9]{64}$/);
    assert.equal(
      manifest.inputSetIdentitySha256,
      createHash('sha256').update(JSON.stringify(manifest.inputs)).digest('hex'),
    );
    assert.deepEqual(manifest.inputs.map(input => input.role), ['source-skinned-model']);
    assert.match(manifest.inputs[0].sha256, /^[a-f0-9]{64}$/);
    assert.ok(manifest.inputs[0].bytes > 0);
    assert.deepEqual(manifest.semantics, {
      units: 'meters',
      upAxis: '+Y',
      forwardAxis: '+Z',
      handedness: 'right',
      angles: 'radians',
      ticksPerSecond: 60,
      rootMotion: 'separate-track',
      bindPose: 'authored GLB bind/inverse-bind state in RustSMF loader scene-root local coordinates; no arbitrary animation frame is used',
      meshCoordinates: 'positions and normals are in common skeleton bind space',
      matrixOrder: 'row-major; translation at indices 3, 7, and 11',
      referenceSpace: 'source-deformed positions, normals, and joint matrices after separate root-motion extraction; rootPosition and rootYaw remain separate sample fields',
      rootExtraction: {
        mode: 'separate-track',
        translation: 'current authored root global position minus its authored bind global position, in scene-root space and meters',
        yaw: 'shortest-arc +Y twist of current authored root global rotation relative to authored bind, in radians',
        residualJointPose: 'remaining root TRS stays in the root joint track; root pitch/roll are refused when they cannot be represented by the separate yaw channel',
        sourceJointId: 'Base',
        axis: '+Y',
      },
    });
    assert.deepEqual(Object.keys(manifest.artifacts).sort(), ['asset', 'mapping', 'references']);
    const artifactPayloads = new Map<string, Uint8Array>();
    for (const [name, artifact] of Object.entries(manifest.artifacts)) {
      const bytes = await readFile(path.join(path.dirname(first.manifest), artifact.path));
      assert.equal(bytes.byteLength, artifact.bytes, name);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256, name);
      assert.equal(artifact.sha256, first.hashes[name as keyof typeof first.hashes], name);
      artifactPayloads.set(name, bytes);
    }
    const asset = JSON.parse(Buffer.from(artifactPayloads.get('asset')!).toString('utf8')) as {
      schema: string;
      mesh: { positions: unknown[]; normals: unknown[]; indices: unknown[]; joints: unknown[]; weights: unknown[] };
      clips: Array<{ id: string }>;
    };
    assert.equal(asset.schema, 'gaim.skeletal-asset.v1');
    assert.ok(artifactPayloads.get('asset')!.byteLength <= 4 * 1024 * 1024);
    assert.equal(asset.mesh.positions.length, 2400);
    assert.equal(asset.mesh.normals.length, 2400);
    assert.equal(asset.mesh.indices.length, 360);
    assert.equal(asset.mesh.joints.length, 2400);
    assert.equal(asset.mesh.weights.length, 2400);
    assert.deepEqual(asset.clips.map(clip => clip.id), ['Wave', 'Turn']);
    const mapping = JSON.parse(Buffer.from(artifactPayloads.get('mapping')!).toString('utf8')) as {
      schema: string;
      sourceIdentitySha256: string;
      sourceJointCount: number;
      sourceVertexCount: number;
      vertices: Array<{ sourceIndex: number; exportIndices: number[] }>;
    };
    assert.equal(mapping.schema, 'gaim.skeletal-export-mapping.v1');
    assert.equal(mapping.sourceIdentitySha256, manifest.inputs[0].sha256);
    assert.equal(mapping.sourceJointCount, 5);
    assert.equal(mapping.sourceVertexCount, 2400);
    assert.equal(mapping.vertices.length, 2400);
    assert.deepEqual(mapping.vertices[2399], { sourceIndex: 2399, exportIndices: [2399] });
    const references = JSON.parse(Buffer.from(artifactPayloads.get('references')!).toString('utf8')) as {
      schema: string;
      sourceIdentitySha256: string;
      tolerances: { position: number; normalRadians: number; matrix: number; rootPosition: number; rootYawRadians: number };
      samples: Array<{ clipId: string; positions: unknown[]; normals: unknown[]; joints: unknown[] }>;
    };
    assert.equal(references.schema, 'gaim.skeletal-reference-samples.v1');
    assert.equal(references.sourceIdentitySha256, manifest.inputs[0].sha256);
    assert.deepEqual(references.tolerances, {
      position: 5e-5,
      normalRadians: 1e-4,
      matrix: 1e-4,
      rootPosition: 1e-5,
      rootYawRadians: 1e-5,
    });
    assert.equal(references.samples.length, 10);
    assert.ok(references.samples.every(sample => sample.positions.length === 2400 && sample.normals.length === 2400 && sample.joints.length === 5));
    const pointerBeforeFailure = await readFile(currentPointer);
    const secondRun = invoke(jobPath);
    assert.equal(secondRun.status, 0, secondRun.stderr || secondRun.error?.message);
    const second = JSON.parse(secondRun.stdout) as { id: string; hashes: typeof first.hashes };
    assert.equal(second.id, first.id);
    assert.deepEqual(second.hashes, first.hashes);
    assert.deepEqual(await readFile(first.manifest), manifestBytes);
    assert.deepEqual(await readFile(currentPointer), pointerBeforeFailure);

    await writeFile(jobPath, `${JSON.stringify({
      ...baseJob,
      $schema: SKELETAL_EXPORT_JOB_V2_SCHEMA,
      export: { ...baseJob.export, clipIds: ['Turn', 'Wave'] },
    }, null, 2)}\n`);
    const selectedRun = invoke(jobPath);
    assert.equal(selectedRun.status, 0, selectedRun.stderr || selectedRun.error?.message);
    const selected = JSON.parse(selectedRun.stdout) as {
      status: string;
      id: string;
      settingsIdentitySha256: string;
      manifest: string;
    };
    assert.equal(selected.status, 'complete');
    assert.notEqual(selected.id, first.id);
    assert.notEqual(selected.settingsIdentitySha256, first.settingsIdentitySha256);
    const selectedManifest = JSON.parse(await readFile(selected.manifest, 'utf8')) as {
      inputSetIdentitySha256: string;
      settingsIdentitySha256: string;
      inputs: Array<{ sha256: string; bytes: number }>;
      semantics: Record<string, unknown>;
      artifacts: Record<string, { path: string; sha256: string }>;
    };
    assert.equal(selectedManifest.inputSetIdentitySha256, manifest.inputSetIdentitySha256);
    assert.notEqual(selectedManifest.settingsIdentitySha256, manifest.settingsIdentitySha256);
    assert.equal(Object.prototype.hasOwnProperty.call(selectedManifest.semantics, 'clipSelection'), false);
    assert.equal(selectedManifest.inputs[0].sha256, sourceShaBefore);
    assert.equal(selectedManifest.inputs[0].bytes, sourceBytesBefore.byteLength);
    const selectedAsset = JSON.parse(await readFile(path.join(path.dirname(selected.manifest), selectedManifest.artifacts.asset.path), 'utf8')) as {
      clips: Array<{ id: string }>;
    };
    assert.deepEqual(selectedAsset.clips.map(clip => clip.id), ['Turn', 'Wave']);
    const selectedReferences = JSON.parse(await readFile(path.join(path.dirname(selected.manifest), selectedManifest.artifacts.references.path), 'utf8')) as {
      sourceIdentitySha256: string;
      samples: Array<{ clipId: string; positions: unknown[]; normals: unknown[]; joints: unknown[] }>;
    };
    assert.equal(selectedReferences.sourceIdentitySha256, sourceShaBefore);
    assert.deepEqual([...new Set(selectedReferences.samples.map(sample => sample.clipId))], ['Turn', 'Wave']);
    assert.equal(selectedReferences.samples.length, 10);
    assert.ok(selectedReferences.samples.every(sample => sample.positions.length === 2400 && sample.normals.length === 2400 && sample.joints.length === 5));
    const pointerAfterSelection = await readFile(currentPointer);

    await writeFile(jobPath, `${JSON.stringify({
      ...baseJob,
      $schema: SKELETAL_EXPORT_JOB_V2_SCHEMA,
      export: { ...baseJob.export, clipIds: ['MissingClip'] },
    }, null, 2)}\n`);
    const missingClipRun = invoke(jobPath);
    assert.equal(missingClipRun.status, 1);
    assert.match(missingClipRun.stderr, /was not found in the source GLB/);
    assert.deepEqual(await readFile(currentPointer), pointerAfterSelection);

    await writeFile(jobPath, `${JSON.stringify({
      ...baseJob,
      $schema: SKELETAL_EXPORT_JOB_V2_SCHEMA,
      export: { ...baseJob.export, clipIds: ['Turn', 'Turn'] },
    }, null, 2)}\n`);
    const duplicateClipRun = invoke(jobPath);
    assert.equal(duplicateClipRun.status, 1);
    assert.match(duplicateClipRun.stderr, /must not contain duplicate IDs/);
    assert.deepEqual(await readFile(currentPointer), pointerAfterSelection);

    await writeFile(jobPath, `${JSON.stringify(baseJob, null, 2)}\n`);
    const v1AfterV2 = invoke(jobPath);
    assert.equal(v1AfterV2.status, 0, v1AfterV2.stderr || v1AfterV2.error?.message);
    assert.equal((JSON.parse(v1AfterV2.stdout) as { id: string }).id, first.id);
    assert.deepEqual(await readFile(currentPointer), pointerBeforeFailure);
    assert.equal(createHash('sha256').update(await readFile(signalRobotPath)).digest('hex'), sourceShaBefore);

    await writeFile(jobPath, `${JSON.stringify({
      ...baseJob,
      export: { ...baseJob.export, rootJoint: 'MissingRoot' },
    }, null, 2)}\n`);
    const failedRun = invoke(jobPath);
    assert.equal(failedRun.status, 1);
    assert.match(failedRun.stderr, /does not match the single skeleton root/);
    assert.deepEqual(await readFile(currentPointer), pointerBeforeFailure);
    assert.deepEqual((await readdir(generationRoot)).filter(name => /^[a-f0-9]{64}$/.test(name)).sort(), [first.id, selected.id].sort());
    assert.equal((await readdir(generationRoot)).some(name => name.startsWith('.rustsmf-skeletal-staging-')), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
