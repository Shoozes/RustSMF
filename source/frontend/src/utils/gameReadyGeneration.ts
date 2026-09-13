import { createHash, randomBytes } from 'node:crypto';
import {
  lstat,
  mkdir,
  open,
  rename,
  rm,
} from 'node:fs/promises';
import path from 'node:path';

export const GAME_READY_MANIFEST_SCHEMA = 'rustsmf.game-ready-manifest.v2';
export const GAME_READY_GENERATION_BINDING_SCHEMA = 'rustsmf.game-ready-generation-binding.v1';

export interface GameReadyProducer {
  repository: string;
  revision: string;
  workingTree: 'clean' | 'dirty';
  sourceIdentitySha256: string;
  tool: { name: string; version: string };
}

export interface GameReadyGenerationInput {
  role: string;
  name: string;
  sha256: string;
  byteLength: number;
}

export interface GameReadyGenerationFiles {
  model: Uint8Array;
  job: unknown;
  mapping: unknown;
  report: unknown;
  manifest: Record<string, unknown>;
  producer: GameReadyProducer;
  inputs: readonly GameReadyGenerationInput[];
}

export type GameReadyPublicationStep =
  | 'model'
  | 'job'
  | 'mapping'
  | 'report'
  | 'manifest'
  | 'published'
  | 'current-pointer';

export interface GameReadyPublicationOptions {
  generationRoot: string;
  currentPointer?: string;
  afterStep?: (step: GameReadyPublicationStep) => void | Promise<void>;
}

export interface GameReadyPublishedGeneration {
  id: string;
  directory: string;
  model: string;
  job: string;
  mapping: string;
  report: string;
  manifest: string;
  currentPointer?: string;
  sha256: string;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function normalizedJsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function canonicalInputs(inputs: readonly GameReadyGenerationInput[]): GameReadyGenerationInput[] {
  const result = inputs.map((input) => ({
    role: input.role,
    name: input.name.normalize('NFC'),
    sha256: input.sha256,
    byteLength: input.byteLength,
  }));
  const ordinal = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
  result.sort((left, right) => ordinal(left.role, right.role)
    || ordinal(left.name, right.name)
    || ordinal(left.sha256, right.sha256));
  return result;
}

async function ensureRealDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  const details = await lstat(directory);
  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw new Error(`Generation root must be a real directory: ${directory}`);
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

async function updateCurrentPointer(filePath: string, value: unknown): Promise<void> {
  const details = await lstat(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (details?.isSymbolicLink() || (details && !details.isFile())) {
    throw new Error(`Current pointer must be a regular file or absent: ${filePath}`);
  }
  const temporary = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`,
  );
  try {
    await writeFresh(temporary, normalizedJsonBytes(value));
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function publishGameReadyGeneration(
  files: GameReadyGenerationFiles,
  options: GameReadyPublicationOptions,
): Promise<GameReadyPublishedGeneration> {
  const generationRoot = path.resolve(options.generationRoot);
  await ensureRealDirectory(generationRoot);
  const currentPointer = options.currentPointer ? path.resolve(options.currentPointer) : undefined;
  if (currentPointer && path.dirname(currentPointer) !== generationRoot) {
    throw new Error('Current pointer must be a direct child of the generation root.');
  }

  const jobBytes = normalizedJsonBytes(files.job);
  const mappingBytes = normalizedJsonBytes(files.mapping);
  const reportBytes = normalizedJsonBytes(files.report);
  const inputs = canonicalInputs(files.inputs);
  const hashes = {
    assetSha256: sha256(files.model),
    reportSha256: sha256(reportBytes),
    jobSha256: sha256(jobBytes),
    mappingSha256: sha256(mappingBytes),
  };
  const binding = {
    schema: GAME_READY_GENERATION_BINDING_SCHEMA,
    producer: files.producer,
    artifacts: hashes,
    inputs,
  };
  const id = sha256(new TextEncoder().encode(JSON.stringify(binding)));
  const directory = path.join(generationRoot, id);
  const staging = path.join(generationRoot, `.rustsmf-staging-${id}-${process.pid}-${randomBytes(6).toString('hex')}`);
  await mkdir(staging, { recursive: false });
  const artifact = (name: string, bytes: Uint8Array) => ({
    path: name,
    sha256: sha256(bytes),
    byteLength: bytes.byteLength,
  });
  const manifest = {
    ...files.manifest,
    $schema: GAME_READY_MANIFEST_SCHEMA,
    asset: {
      ...((files.manifest.asset && typeof files.manifest.asset === 'object')
        ? files.manifest.asset as Record<string, unknown>
        : {}),
      glb: 'model.glb',
      sha256: hashes.assetSha256,
      byteLength: files.model.byteLength,
    },
    generation: { id, immutable: true, publication: 'manifest-last-directory-rename' },
    producer: files.producer,
    artifacts: {
      asset: artifact('model.glb', files.model),
      report: artifact('report.json', reportBytes),
      job: artifact('job.json', jobBytes),
      mapping: artifact('mapping.json', mappingBytes),
    },
    inputs,
    report: 'report.json',
  };

  try {
    for (const [step, name, bytes] of [
      ['model', 'model.glb', files.model],
      ['job', 'job.json', jobBytes],
      ['mapping', 'mapping.json', mappingBytes],
      ['report', 'report.json', reportBytes],
      ['manifest', 'manifest.json', normalizedJsonBytes(manifest)],
    ] as const) {
      await writeFresh(path.join(staging, name), bytes);
      await options.afterStep?.(step);
    }
    await rename(staging, directory);
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : '';
    throw new Error(`Game-ready generation ${id} was not published; staging remains at ${staging}.${detail}`);
  }

  try {
    await options.afterStep?.('published');
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : '';
    throw new Error(`Game-ready generation ${id} was published at ${directory}; current pointer was not updated.${detail}`);
  }

  if (currentPointer) {
    try {
      await updateCurrentPointer(currentPointer, {
        $schema: 'rustsmf.game-ready-current.v1',
        generation: id,
        manifest: `${id}/manifest.json`,
      });
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : '';
      throw new Error(`Game-ready generation ${id} was published at ${directory}; current pointer was not updated.${detail}`);
    }
    try {
      await options.afterStep?.('current-pointer');
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : '';
      throw new Error(`Game-ready generation ${id} and current pointer ${currentPointer} were updated, but post-publication verification failed.${detail}`);
    }
  }
  return {
    id,
    directory,
    model: path.join(directory, 'model.glb'),
    job: path.join(directory, 'job.json'),
    mapping: path.join(directory, 'mapping.json'),
    report: path.join(directory, 'report.json'),
    manifest: path.join(directory, 'manifest.json'),
    currentPointer,
    sha256: hashes.assetSha256,
  };
}
