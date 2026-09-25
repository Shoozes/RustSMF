import { open } from 'node:fs/promises';

const READ_CHUNK_BYTES = 1024 * 1024;

export interface BoundedFileRequest {
  path: string;
  limit: number;
}

export interface BoundedFileRead {
  path: string;
  bytes: Uint8Array;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = signal.reason instanceof Error ? signal.reason : new Error('Game-ready job cancelled.');
  error.name = 'AbortError';
  throw error;
}

function assertLimit(limit: number, label: string): void {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

export async function readFileBounded(filePath: string, limit: number, signal?: AbortSignal): Promise<Uint8Array> {
  assertLimit(limit, 'File byte limit');
  throwIfAborted(signal);
  const handle = await open(filePath, 'r');
  try {
    throwIfAborted(signal);
    const metadata = await handle.stat();
    throwIfAborted(signal);
    if (!metadata.isFile()) throw new Error(`${filePath} is not a regular file.`);
    if (metadata.size > limit) {
      throw new Error(`${filePath} is ${metadata.size} bytes; the limit is ${limit}.`);
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      throwIfAborted(signal);
      const remaining = limit - total;
      const chunk = Buffer.allocUnsafe(Math.min(READ_CHUNK_BYTES, remaining + 1));
      const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, total);
      throwIfAborted(signal);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > limit) throw new Error(`${filePath} grew beyond the ${limit}-byte limit while it was being read.`);
      chunks.push(chunk.subarray(0, bytesRead));
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

export async function readFilesBounded(
  requests: readonly BoundedFileRequest[],
  totalLimit: number,
  pathKey: (filePath: string) => string = (filePath) => filePath,
  signal?: AbortSignal,
): Promise<BoundedFileRead[]> {
  assertLimit(totalLimit, 'Aggregate byte limit');
  throwIfAborted(signal);
  const unique = new Map<string, BoundedFileRequest>();
  for (const request of requests) {
    assertLimit(request.limit, `File byte limit for ${request.path}`);
    const key = pathKey(request.path);
    const existing = unique.get(key);
    if (!existing || request.limit < existing.limit) unique.set(key, request);
  }

  const files: BoundedFileRead[] = [];
  let total = 0;
  for (const request of unique.values()) {
    throwIfAborted(signal);
    const remaining = totalLimit - total;
    const bytes = await readFileBounded(request.path, Math.min(request.limit, remaining), signal);
    throwIfAborted(signal);
    total += bytes.byteLength;
    files.push({ path: request.path, bytes });
  }
  return files;
}
