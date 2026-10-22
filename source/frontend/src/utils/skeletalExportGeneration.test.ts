import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  publishSkeletalExportGeneration,
  publishConditionedSkeletalInput,
  skeletalInputSetIdentity,
  type SkeletalExportArtifacts,
  type SkeletalExportPublicationStep,
} from './skeletalExportGeneration';

test('conditioned input publication is immutable, repeatable and cleans its interrupted staging', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'conditioned-publication-'));
  const model = new Uint8Array([1, 2, 3]), recipe = new TextEncoder().encode('{}'), report = new TextEncoder().encode('{"ok":true}');
  try {
    await assert.rejects(publishConditionedSkeletalInput(model, recipe, report, { generationRoot: root, afterStep: step => { if (step === 'mapping') throw new Error('interrupted'); } }), /interrupted/);
    assert.deepEqual(await readdir(root), []);
    const first = await publishConditionedSkeletalInput(model, recipe, report, { generationRoot: root });
    const second = await publishConditionedSkeletalInput(model, recipe, report, { generationRoot: root });
    assert.deepEqual(second, first);
    assert.deepEqual(await readdir(root), [path.basename(first.directory)]);
    await writeFile(first.model, new Uint8Array([4, 5, 6]));
    await assert.rejects(publishConditionedSkeletalInput(model, recipe, report, { generationRoot: root }), /different model.glb/);
    assert.deepEqual(new Uint8Array(await readFile(first.model)), new Uint8Array([4, 5, 6]));
  } finally { await rm(root, { recursive: true, force: true }); }
});

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function fixture(marker = 'baseline'): SkeletalExportArtifacts {
  const asset = new TextEncoder().encode(`{"schema":"gaim.skeletal-asset.v1","marker":"${marker}"}\n`);
  const mapping = new TextEncoder().encode(`{"schema":"gaim.skeletal-export-mapping.v1","marker":"${marker}"}\n`);
  const references = new TextEncoder().encode(`{"schema":"gaim.skeletal-reference-samples.v1","marker":"${marker}"}\n`);
  const input = new TextEncoder().encode('source');
  const inputs = [{ role: 'source-skinned-model', sha256: digest(input), bytes: input.byteLength }];
  return {
    asset,
    mapping,
    references,
    producer: {
      repository: 'Shoozes/RustSMF',
      revision: 'a'.repeat(40),
      workingTree: 'dirty',
      sourceIdentitySha256: 'b'.repeat(64),
      exporterIdentitySha256: 'c'.repeat(64),
    },
    inputSetIdentitySha256: skeletalInputSetIdentity(inputs),
    inputs,
    settingsIdentitySha256: 'e'.repeat(64),
    semantics: { units: 'meters', ticksPerSecond: 60, rootMotion: 'separate-track' },
  };
}

test('skeletal generation is hash-bound, immutable, repeatable, and current is replaced last', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skeletal-generation-'));
  const currentPointer = path.join(root, 'current.json');
  try {
    const files = fixture();
    const first = await publishSkeletalExportGeneration(files, { generationRoot: root, currentPointer });
    const manifestBytes = await readFile(first.manifest);
    const manifest = JSON.parse(manifestBytes.toString('utf8')) as {
      schema: string;
      generationId: string;
      immutable: boolean;
      publication: string;
      producer: SkeletalExportArtifacts['producer'];
      inputSetIdentitySha256: string;
      settingsIdentitySha256: string;
      artifacts: Record<string, { path: string; bytes: number; sha256: string }>;
    };
    assert.equal(manifest.schema, 'gaim.skeletal-export-generation.v1');
    assert.equal(manifest.generationId, first.id);
    assert.equal(manifest.immutable, true);
    assert.equal(manifest.publication, 'manifest-last-directory-rename');
    assert.deepEqual(Object.keys(manifest.artifacts).sort(), ['asset', 'mapping', 'references']);
    for (const [role, descriptor] of Object.entries(manifest.artifacts)) {
      assert.equal(path.isAbsolute(descriptor.path), false);
      assert.equal(descriptor.path.includes('..'), false);
      const bytes = await readFile(path.join(first.directory, descriptor.path));
      assert.equal(bytes.byteLength, descriptor.bytes, role);
      assert.equal(digest(bytes), descriptor.sha256, role);
    }
    const pointerBefore = await readFile(currentPointer);
    const second = await publishSkeletalExportGeneration(files, { generationRoot: root, currentPointer });
    assert.equal(second.id, first.id);
    assert.deepEqual(await readFile(first.manifest), manifestBytes);
    assert.deepEqual(await readFile(currentPointer), pointerBefore);
    assert.equal(JSON.parse(pointerBefore.toString('utf8')).generationId, first.id);
    assert.equal((await readdir(root)).some(name => name.startsWith('.rustsmf-skeletal-staging-')), false);
    const extra = path.join(first.directory, 'owner-note.txt');
    await writeFile(extra, 'preserve this file');
    await assert.rejects(
      publishSkeletalExportGeneration(files, { generationRoot: root, currentPointer }),
      /unexpected or missing artifact/,
    );
    assert.equal(await readFile(extra, 'utf8'), 'preserve this file');
    assert.deepEqual(await readFile(currentPointer), pointerBefore);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a failure after generation commit leaves the previous current pointer accepted', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skeletal-generation-postcommit-'));
  const currentPointer = path.join(root, 'current.json');
  try {
    const baseline = await publishSkeletalExportGeneration(fixture(), { generationRoot: root, currentPointer });
    const pointerBefore = await readFile(currentPointer);
    const next = fixture('post-commit');
    await assert.rejects(
      publishSkeletalExportGeneration(next, {
        generationRoot: root,
        currentPointer,
        afterStep(step) { if (step === 'published') throw new Error('injected post-commit failure'); },
      }),
      /was published at .* current pointer was not updated/,
    );
    assert.deepEqual(await readFile(currentPointer), pointerBefore);
    await lstat(baseline.directory);
    const generationIds = (await readdir(root)).filter(name => /^[a-f0-9]{64}$/.test(name));
    assert.equal(generationIds.length, 2);
    assert.ok(generationIds.includes(baseline.id));
    for (const id of generationIds) await lstat(path.join(root, id));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('input-set identity must match SHA-256 of canonical sorted role-tagged inputs', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skeletal-generation-input-identity-'));
  try {
    const files = fixture();
    const input = new TextEncoder().encode('source');
    const unsorted = [
      { role: 'z-source', sha256: digest(input), bytes: input.byteLength },
      { role: 'a-source', sha256: digest(input), bytes: input.byteLength },
    ];
    files.inputs = unsorted;
    files.inputSetIdentitySha256 = skeletalInputSetIdentity(unsorted);
    await publishSkeletalExportGeneration(files, { generationRoot: root });
    const expected = createHash('sha256')
      .update(JSON.stringify([...unsorted].sort((left, right) => left.role.localeCompare(right.role))))
      .digest('hex');
    assert.equal(files.inputSetIdentitySha256, expected);
    await assert.rejects(
      publishSkeletalExportGeneration({
        ...files,
        inputSetIdentitySha256: 'd'.repeat(64),
      }, { generationRoot: root }),
      /SHA-256 of the canonical sorted inputs JSON/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('failed and cancelled pre-commit writes preserve the prior accepted generation and pointer', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skeletal-generation-rollback-'));
  const currentPointer = path.join(root, 'current.json');
  try {
    const baseline = await publishSkeletalExportGeneration(fixture(), { generationRoot: root, currentPointer });
    const baselineManifest = await readFile(baseline.manifest);
    const pointerBefore = await readFile(currentPointer);
    const steps: SkeletalExportPublicationStep[] = ['asset', 'mapping', 'references', 'manifest'];
    for (const step of steps) {
      await assert.rejects(
        publishSkeletalExportGeneration(fixture(step), {
          generationRoot: root,
          currentPointer,
          afterStep(actual) { if (actual === step) throw new Error(`injected ${step}`); },
        }),
        /was not published; staging was removed/,
      );
      assert.deepEqual(await readFile(baseline.manifest), baselineManifest);
      assert.deepEqual(await readFile(currentPointer), pointerBefore);
      const ids = (await readdir(root)).filter(name => /^[a-f0-9]{64}$/.test(name));
      assert.deepEqual(ids, [baseline.id]);
      assert.equal((await readdir(root)).some(name => name.startsWith('.rustsmf-skeletal-staging-')), false);
    }

    const controller = new AbortController();
    await assert.rejects(
      publishSkeletalExportGeneration(fixture('cancel'), {
        generationRoot: root,
        currentPointer,
        signal: controller.signal,
        afterStep(step) { if (step === 'references') controller.abort(new Error('cancel test')); },
      }),
      /cancelled before publication; staging was removed/,
    );
    assert.deepEqual(await readFile(currentPointer), pointerBefore);
    assert.deepEqual(await readFile(baseline.manifest), baselineManifest);
    assert.deepEqual((await readdir(root)).filter(name => /^[a-f0-9]{64}$/.test(name)), [baseline.id]);
    await lstat(baseline.directory);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
