import { createHash, randomBytes } from 'node:crypto';
import {
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
} from 'node:fs/promises';
import path from 'node:path';

export const SKELETAL_EXPORT_MANIFEST_SCHEMA = 'gaim.skeletal-export-generation.v1';
export const SKELETAL_EXPORT_CURRENT_SCHEMA = 'gaim.skeletal-export-current.v1';

export interface SkeletalExportProducer {
  repository: string;
  revision: string;
  workingTree: 'clean' | 'dirty';
  sourceIdentitySha256: string;
  exporterIdentitySha256: string;
}

export interface SkeletalExportInput {
  role: string;
  sha256: string;
  bytes: number;
}

export interface SkeletalExportArtifacts {
  asset: Uint8Array;
  mapping: Uint8Array;
  references: Uint8Array;
  producer: SkeletalExportProducer;
  inputSetIdentitySha256: string;
  inputs: readonly SkeletalExportInput[];
  settingsIdentitySha256: string;
  semantics: Record<string, unknown>;
}

export type SkeletalExportPublicationStep = 'asset' | 'mapping' | 'references' | 'manifest' | 'published' | 'current-pointer';

export interface SkeletalExportPublicationOptions {
  generationRoot: string;
  currentPointer?: string;
  signal?: AbortSignal;
  afterStep?: (step: SkeletalExportPublicationStep) => void | Promise<void>;
}

export interface PublishedSkeletalExportGeneration {
  id: string;
  directory: string;
  manifest: string;
  asset: string;
  mapping: string;
  references: string;
  currentPointer?: string;
  hashes: { asset: string; mapping: string; references: string };
  bytes: { asset: number; mapping: number; references: number };
}

export function normalizedSkeletalJsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function inheritedConditioningRecipeInput(recipe: unknown, expectedSha256: string): SkeletalExportInput {
  const bytes = normalizedSkeletalJsonBytes(recipe);
  const digest = sha256(bytes);
  if (digest !== expectedSha256) throw new Error('Inherited conditioning recipe identity differs from its report.');
  return { role: 'conditioning-recipe', sha256: digest, bytes: bytes.byteLength };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = signal.reason instanceof Error ? signal.reason : new Error('Skeletal generation cancelled.');
  error.name = 'AbortError';
  throw error;
}

function canonicalInputs(inputs: readonly SkeletalExportInput[]): SkeletalExportInput[] {
  const result = inputs.map(input => ({ ...input }));
  result.sort((left, right) => left.role < right.role ? -1 : left.role > right.role ? 1 : 0);
  if (result.some(input => !input.role || !/^[a-f0-9]{64}$/.test(input.sha256) || !Number.isSafeInteger(input.bytes) || input.bytes < 0)) {
    throw new Error('Skeletal generation inputs must have a role, SHA-256, and non-negative byte count.');
  }
  if (new Set(result.map(input => input.role)).size !== result.length) {
    throw new Error('Skeletal generation input roles must be unique.');
  }
  return result;
}

export function skeletalInputSetIdentity(inputs: readonly SkeletalExportInput[]): string {
  return sha256(new TextEncoder().encode(JSON.stringify(canonicalInputs(inputs))));
}

export async function publishConditionedSkeletalInput(model: Uint8Array, recipe: Uint8Array, report: Uint8Array, options: SkeletalExportPublicationOptions): Promise<{ directory: string; model: string; recipe: string; report: string }> {
  if (!path.isAbsolute(options.generationRoot) || options.currentPointer) throw new Error('Conditioned inputs require an absolute immutable root and no current pointer.');
  const root = path.resolve(options.generationRoot);
  const id = sha256(normalizedSkeletalJsonBytes({ model: sha256(model), recipe: sha256(recipe), report: sha256(report) }));
  const directory = path.join(root, id), staging = path.join(root, `.rustsmf-conditioning-${id}-${process.pid}-${randomBytes(6).toString('hex')}`);
  const expected = new Map([['model.glb', model], ['recipe.json', recipe], ['report.json', report]]);
  options.signal?.throwIfAborted(); await ensureRealDirectory(root);
  const existing = await lstat(directory).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  if (existing) await verifyExistingGeneration(directory, expected);
  else {
    await mkdir(staging);
    try {
      for (const [name, bytes] of expected) {
        options.signal?.throwIfAborted(); await writeFresh(path.join(staging, name), bytes);
        await options.afterStep?.(name === 'report.json' ? 'manifest' : name === 'model.glb' ? 'asset' : 'mapping');
      }
      options.signal?.throwIfAborted(); await rename(staging, directory);
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    }
  }
  return { directory, model: path.join(directory, 'model.glb'), recipe: path.join(directory, 'recipe.json'), report: path.join(directory, 'report.json') };
}

async function ensureRealDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  const details = await lstat(directory);
  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw new Error(`Skeletal generation root must be a real directory: ${directory}`);
  }
}

async function writeFresh(filePath: string, bytes: Uint8Array): Promise<void> {
  const handle = await open(filePath, 'wx');
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function replaceCurrentPointer(filePath: string, value: unknown): Promise<void> {
  const details = await lstat(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (details?.isSymbolicLink() || (details && !details.isFile())) {
    throw new Error(`Skeletal current pointer must be a regular file or absent: ${filePath}`);
  }
  const temporary = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`,
  );
  try {
    await writeFresh(temporary, normalizedSkeletalJsonBytes(value));
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function verifyExistingGeneration(
  directory: string,
  expected: ReadonlyMap<string, Uint8Array>,
): Promise<void> {
  const details = await lstat(directory);
  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw new Error(`Immutable generation path is not a real directory: ${directory}`);
  }
  const actualNames = (await readdir(directory)).sort();
  const expectedNames = [...expected.keys()].sort();
  if (actualNames.length !== expectedNames.length || actualNames.some((name, index) => name !== expectedNames[index])) {
    throw new Error(`Immutable generation ${path.basename(directory)} contains an unexpected or missing artifact.`);
  }
  for (const [name, expectedBytes] of expected) {
    const filePath = path.join(directory, name);
    const file = await lstat(filePath);
    if (!file.isFile() || file.isSymbolicLink()) throw new Error(`Immutable generation artifact is not a regular file: ${filePath}`);
    if (file.size !== expectedBytes.byteLength) {
      throw new Error(`Immutable generation ${path.basename(directory)} already exists with different ${name} bytes.`);
    }
    const actual = await readFile(filePath);
    if (!actual.equals(Buffer.from(expectedBytes))) {
      throw new Error(`Immutable generation ${path.basename(directory)} already exists with different ${name} bytes.`);
    }
  }
}

export async function publishSkeletalExportGeneration(
  files: SkeletalExportArtifacts,
  options: SkeletalExportPublicationOptions,
): Promise<PublishedSkeletalExportGeneration> {
  throwIfAborted(options.signal);
  const generationRoot = path.resolve(options.generationRoot);
  await ensureRealDirectory(generationRoot);
  throwIfAborted(options.signal);
  const currentPointer = options.currentPointer ? path.resolve(options.currentPointer) : undefined;
  const pointerParent = currentPointer ? path.dirname(currentPointer) : undefined;
  const samePath = (left: string, right: string): boolean => process.platform === 'win32'
    ? left.toLocaleLowerCase('en-US') === right.toLocaleLowerCase('en-US')
    : left === right;
  if (currentPointer && pointerParent && !samePath(pointerParent, generationRoot)) {
    throw new Error('Skeletal current pointer must be a direct child of the generation root.');
  }

  const inputs = canonicalInputs(files.inputs);
  if (skeletalInputSetIdentity(inputs) !== files.inputSetIdentitySha256) {
    throw new Error('Skeletal input-set identity must be SHA-256 of the canonical sorted inputs JSON.');
  }
  if (!/^[a-f0-9]{64}$/.test(files.inputSetIdentitySha256)
    || !/^[a-f0-9]{64}$/.test(files.settingsIdentitySha256)
    || !/^[a-f0-9]{64}$/.test(files.producer.sourceIdentitySha256)
    || !/^[a-f0-9]{64}$/.test(files.producer.exporterIdentitySha256)) {
    throw new Error('Skeletal generation identities must be lowercase SHA-256 digests.');
  }
  const artifacts = {
    asset: { path: 'asset.json', bytes: files.asset.byteLength, sha256: sha256(files.asset) },
    mapping: { path: 'mapping.json', bytes: files.mapping.byteLength, sha256: sha256(files.mapping) },
    references: { path: 'references.json', bytes: files.references.byteLength, sha256: sha256(files.references) },
  };
  const binding = {
    schema: 'gaim.skeletal-export-generation-binding.v1',
    producer: files.producer,
    inputSetIdentitySha256: files.inputSetIdentitySha256,
    inputs,
    settingsIdentitySha256: files.settingsIdentitySha256,
    semantics: files.semantics,
    artifacts: {
      assetSha256: artifacts.asset.sha256,
      mappingSha256: artifacts.mapping.sha256,
      referencesSha256: artifacts.references.sha256,
    },
  };
  const id = sha256(new TextEncoder().encode(JSON.stringify(binding)));
  const directory = path.join(generationRoot, id);
  const staging = path.join(generationRoot, `.rustsmf-skeletal-staging-${id}-${process.pid}-${randomBytes(6).toString('hex')}`);
  const manifest = normalizedSkeletalJsonBytes({
    schema: SKELETAL_EXPORT_MANIFEST_SCHEMA,
    generationId: id,
    immutable: true,
    publication: 'manifest-last-directory-rename',
    producer: files.producer,
    inputSetIdentitySha256: files.inputSetIdentitySha256,
    inputs,
    settingsIdentitySha256: files.settingsIdentitySha256,
    semantics: files.semantics,
    artifacts,
  });
  const expected = new Map<string, Uint8Array>([
    ['asset.json', files.asset],
    ['mapping.json', files.mapping],
    ['references.json', files.references],
    ['manifest.json', manifest],
  ]);
  const generationResult = (): PublishedSkeletalExportGeneration => ({
    id,
    directory,
    manifest: path.join(directory, 'manifest.json'),
    asset: path.join(directory, 'asset.json'),
    mapping: path.join(directory, 'mapping.json'),
    references: path.join(directory, 'references.json'),
    currentPointer,
    hashes: {
      asset: artifacts.asset.sha256,
      mapping: artifacts.mapping.sha256,
      references: artifacts.references.sha256,
    },
    bytes: {
      asset: artifacts.asset.bytes,
      mapping: artifacts.mapping.bytes,
      references: artifacts.references.bytes,
    },
  });

  const existing = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing) {
    await verifyExistingGeneration(directory, expected);
    await options.afterStep?.('published');
  } else {
    await mkdir(staging, { recursive: false });
    try {
      for (const [step, name] of [
        ['asset', 'asset.json'],
        ['mapping', 'mapping.json'],
        ['references', 'references.json'],
        ['manifest', 'manifest.json'],
      ] as const) {
        throwIfAborted(options.signal);
        await writeFresh(path.join(staging, name), expected.get(name)!);
        await options.afterStep?.(step);
        throwIfAborted(options.signal);
      }
      throwIfAborted(options.signal);
      await rename(staging, directory);
    } catch (error) {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
      if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new Error(`Skeletal generation ${id} was cancelled before publication; staging was removed.`);
      }
      const detail = error instanceof Error ? ` ${error.message}` : '';
      throw new Error(`Skeletal generation ${id} was not published; staging was removed.${detail}`);
    }
    try {
      await options.afterStep?.('published');
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : '';
      throw new Error(`Skeletal generation ${id} was published at ${directory}; current pointer was not updated.${detail}`);
    }
  }

  if (currentPointer) {
    try {
      await replaceCurrentPointer(currentPointer, {
        schema: SKELETAL_EXPORT_CURRENT_SCHEMA,
        generationId: id,
        manifest: `${id}/manifest.json`,
      });
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : '';
      throw new Error(`Skeletal generation ${id} is complete at ${directory}; current pointer was not updated or verified.${detail}`);
    }
    try {
      await options.afterStep?.('current-pointer');
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : '';
      throw new Error(`Skeletal generation ${id} is complete at ${directory}; current pointer was updated, but the publication checkpoint failed.${detail}`);
    }
  }
  return generationResult();
}
