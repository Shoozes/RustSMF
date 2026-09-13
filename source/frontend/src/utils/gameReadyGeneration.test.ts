import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  publishGameReadyGeneration,
  type GameReadyGenerationFiles,
  type GameReadyPublicationStep,
} from './gameReadyGeneration';

function fixture(): GameReadyGenerationFiles {
  const model = new Uint8Array([1, 2, 3, 4]);
  return {
    model,
    job: { $schema: 'test-job', output: { generationRoot: 'redacted' } },
    mapping: { $schema: 'test-mapping', decisions: [{ source: 'a', target: 'b' }] },
    report: { $schema: 'test-report', status: 'complete' },
    manifest: {
      coordinates: { up: '+Y', forward: '+Z' },
      asset: { classification: 'LOCAL' },
      clips: [{ name: 'idle', duration: 1 }],
    },
    producer: {
      repository: 'Shoozes/RustSMF',
      revision: 'a'.repeat(40),
      workingTree: 'clean',
      sourceIdentitySha256: 'b'.repeat(64),
      tool: { name: 'test', version: '1.0.0' },
    },
    inputs: [{ role: 'target', name: 'target.glb', sha256: 'c'.repeat(64), byteLength: 4 }],
  };
}

test('game-ready publication exposes a complete hash-bound generation and updates current last', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'game-ready-generation-'));
  const currentPointer = path.join(root, 'current.json');
  try {
    const result = await publishGameReadyGeneration(fixture(), { generationRoot: root, currentPointer });
    assert.equal(path.basename(result.directory), result.id);
    assert.deepEqual((await readdir(result.directory)).sort(), ['job.json', 'manifest.json', 'mapping.json', 'model.glb', 'report.json']);
    const manifest = JSON.parse(await readFile(result.manifest, 'utf8'));
    assert.equal(manifest.$schema, 'rustsmf.game-ready-manifest.v2');
    assert.equal(manifest.generation.id, result.id);
    assert.equal(manifest.generation.publication, 'manifest-last-directory-rename');
    for (const [role, record] of Object.entries(manifest.artifacts) as Array<[string, { path: string; sha256: string; byteLength: number }]>) {
      const bytes = await readFile(path.join(result.directory, record.path));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256, role);
      assert.equal(bytes.byteLength, record.byteLength, role);
    }
    const current = JSON.parse(await readFile(currentPointer, 'utf8'));
    assert.equal(current.generation, result.id);
    assert.equal(current.manifest, `${result.id}/manifest.json`);
    await assert.rejects(
      publishGameReadyGeneration(fixture(), { generationRoot: root, currentPointer }),
      /was not published/,
    );
    assert.equal(JSON.parse(await readFile(currentPointer, 'utf8')).generation, result.id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('publication failures leave prior generations and inputs untouched', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'game-ready-failures-'));
  const input = path.join(root, 'source.glb');
  const originalInput = new Uint8Array([9, 8, 7]);
  await writeFile(input, originalInput);
  try {
    const baselineFiles = fixture();
    const baseline = await publishGameReadyGeneration(baselineFiles, { generationRoot: root });
    const baselineManifest = await readFile(baseline.manifest);
    for (const failingStep of ['model', 'job', 'mapping', 'report', 'manifest'] as GameReadyPublicationStep[]) {
      const files = fixture();
      files.report = { $schema: 'test-report', status: 'complete', attempt: failingStep };
      await assert.rejects(
        publishGameReadyGeneration(files, {
          generationRoot: root,
          afterStep(step) { if (step === failingStep) throw new Error(`injected ${step}`); },
        }),
        /staging remains/,
      );
      assert.deepEqual(await readFile(baseline.manifest), baselineManifest);
      assert.deepEqual([...await readFile(input)], [...originalInput]);
      const entries = await readdir(root);
      const published = entries.filter((name) => /^[a-f0-9]{64}$/.test(name));
      assert.deepEqual(published, [baseline.id]);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('generation identity sorts input roles ordinally and normalizes names to NFC', async () => {
  const leftRoot = await mkdtemp(path.join(os.tmpdir(), 'game-ready-order-left-'));
  const rightRoot = await mkdtemp(path.join(os.tmpdir(), 'game-ready-order-right-'));
  const inputs = [
    { role: 'a', name: 'e\u0301.glb', sha256: '1'.repeat(64), byteLength: 1 },
    { role: '_role', name: 'under.glb', sha256: '2'.repeat(64), byteLength: 2 },
    { role: 'A', name: 'upper.glb', sha256: '3'.repeat(64), byteLength: 3 },
    { role: 'é', name: 'unicode.glb', sha256: '4'.repeat(64), byteLength: 4 },
  ];
  try {
    const leftFiles = fixture();
    leftFiles.inputs = inputs;
    const rightFiles = fixture();
    rightFiles.inputs = [...inputs].reverse();
    const left = await publishGameReadyGeneration(leftFiles, { generationRoot: leftRoot });
    const right = await publishGameReadyGeneration(rightFiles, { generationRoot: rightRoot });
    assert.equal(left.id, right.id);
    const manifest = JSON.parse(await readFile(left.manifest, 'utf8'));
    assert.deepEqual(manifest.inputs.map((input: { role: string }) => input.role), ['A', '_role', 'a', 'é']);
    assert.equal(manifest.inputs[2].name, 'é.glb');
  } finally {
    await rm(leftRoot, { recursive: true, force: true });
    await rm(rightRoot, { recursive: true, force: true });
  }
});

test('post-publication failures report the durable generation and pointer state truthfully', async () => {
  const publishedRoot = await mkdtemp(path.join(os.tmpdir(), 'game-ready-published-hook-'));
  const pointerRoot = await mkdtemp(path.join(os.tmpdir(), 'game-ready-pointer-hook-'));
  try {
    const publishedPointer = path.join(publishedRoot, 'current.json');
    let publishedId = '';
    await assert.rejects(
      publishGameReadyGeneration(fixture(), {
        generationRoot: publishedRoot,
        currentPointer: publishedPointer,
        afterStep(step) {
          if (step === 'published') throw new Error('injected published');
        },
      }),
      (error: Error) => {
        publishedId = error.message.match(/generation ([a-f0-9]{64})/)?.[1] ?? '';
        assert.match(error.message, /was published at .*current pointer was not updated.*injected published/);
        return true;
      },
    );
    assert.equal((await lstat(path.join(publishedRoot, publishedId))).isDirectory(), true);
    await assert.rejects(lstat(publishedPointer), { code: 'ENOENT' });

    const pointer = path.join(pointerRoot, 'current.json');
    let pointerId = '';
    await assert.rejects(
      publishGameReadyGeneration(fixture(), {
        generationRoot: pointerRoot,
        currentPointer: pointer,
        afterStep(step) {
          if (step === 'current-pointer') throw new Error('injected pointer verification');
        },
      }),
      (error: Error) => {
        pointerId = error.message.match(/generation ([a-f0-9]{64})/)?.[1] ?? '';
        assert.match(error.message, /current pointer .* were updated, but post-publication verification failed.*injected pointer verification/);
        return true;
      },
    );
    assert.equal(JSON.parse(await readFile(pointer, 'utf8')).generation, pointerId);
  } finally {
    await rm(publishedRoot, { recursive: true, force: true });
    await rm(pointerRoot, { recursive: true, force: true });
  }
});
