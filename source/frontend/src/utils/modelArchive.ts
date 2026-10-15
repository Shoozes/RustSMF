import type { ModelResourceFile } from './modelResourceBundle';
import { MAX_MODEL_RESOURCE_FILES, MAX_MODEL_RESOURCE_FILE_BYTES, MAX_MODEL_RESOURCE_BUNDLE_BYTES } from './modelResourceBundle';
import { SUPPORTED_MODEL_EXTENSIONS, MAX_MODEL_INPUT_BYTES } from './modelFormat';

export const MAX_MODEL_ARCHIVE_BYTES = MAX_MODEL_INPUT_BYTES;

const MAX_ENTRIES = MAX_MODEL_RESOURCE_FILES;
const MAX_FILE_BYTES = MAX_MODEL_RESOURCE_FILE_BYTES;
const MAX_TOTAL_BYTES = MAX_MODEL_RESOURCE_BUNDLE_BYTES;
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const utf8 = new TextDecoder('utf-8', { fatal: true });

type Entry = {
  name: string;
  directory: boolean;
  flags: number;
  method: number;
  crc: number;
  compressed: number;
  size: number;
  localOffset: number;
};

function fail(message: string): never {
  throw new Error(`Cannot open model archive: ${message}`);
}

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function checkRange(bytes: Uint8Array, offset: number, length: number, boundary = bytes.length): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > boundary) {
    fail('the ZIP directory or file records are truncated or inconsistent.');
  }
}

function decodeName(bytes: Uint8Array): string {
  try {
    return utf8.decode(bytes);
  } catch {
    return fail('file names must be valid UTF-8.');
  }
}

function validateName(name: string): { path: string; directory: boolean } {
  const directory = name.endsWith('/');
  const path = directory ? name.slice(0, -1) : name;
  if (!path || path.trim() !== path || path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.includes(':') ||
      path.includes('?') || path.includes('#') ||
      /[\u0000-\u001f\u007f]/.test(path) || /%(?:2e|2f|5c)/i.test(path)) {
    fail(`unsafe path "${name}" is refused.`);
  }
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) fail(`unsafe path "${name}" is refused.`);
  // Resource resolution percent-decodes names. Refuse percent escapes so archive names
  // cannot acquire a different path after entering the resource bundle.
  if (path.includes('%')) fail(`percent-encoded path "${name}" is refused.`);
  if (/\.(?:zip|7z|rar|tar|tgz|gz|bz2|xz|zst|lz4)$/i.test(path)) fail(`nested archive "${name}" is refused.`);
  return { path, directory };
}

function findDirectory(bytes: Uint8Array): { offset: number; size: number; count: number; end: number } {
  const min = Math.max(0, bytes.length - 22 - 0xffff);
  for (let at = bytes.length - 22; at >= min; at -= 1) {
    if (u32(bytes, at) !== EOCD_SIGNATURE) continue;
    const commentLength = u16(bytes, at + 20);
    if (at + 22 + commentLength !== bytes.length) continue;
    if (u16(bytes, at + 4) || u16(bytes, at + 6) || u16(bytes, at + 8) !== u16(bytes, at + 10)) {
      fail('multi-disk ZIP archives are refused.');
    }
    const count = u16(bytes, at + 10);
    const size = u32(bytes, at + 12);
    const offset = u32(bytes, at + 16);
    if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) fail('ZIP64 archives are refused.');
    if (count > MAX_ENTRIES) fail(`archives may contain at most ${MAX_ENTRIES} entries.`);
    if (offset + size !== at) fail('the central directory has an inconsistent location or trailing records.');
    return { offset, size, count, end: at };
  }
  return fail('the ZIP end-of-directory record is missing or malformed.');
}

function rejectZip64Extra(bytes: Uint8Array, start: number, length: number): void {
  let at = start;
  const end = start + length;
  while (at < end) {
    checkRange(bytes, at, 4, end);
    const id = u16(bytes, at);
    const size = u16(bytes, at + 2);
    at += 4;
    checkRange(bytes, at, size, end);
    if (id === 1) fail('ZIP64 extra fields are refused.');
    at += size;
  }
}

function parseEntries(bytes: Uint8Array): { entries: Entry[]; centralOffset: number } {
  const directory = findDirectory(bytes);
  const entries: Entry[] = [];
  let at = directory.offset;
  for (let i = 0; i < directory.count; i += 1) {
    checkRange(bytes, at, 46, directory.end);
    if (u32(bytes, at) !== CENTRAL_SIGNATURE) fail('a central directory entry is malformed.');
    const madeBy = u16(bytes, at + 4);
    const flags = u16(bytes, at + 8);
    const method = u16(bytes, at + 10);
    const crc = u32(bytes, at + 16);
    const compressed = u32(bytes, at + 20);
    const size = u32(bytes, at + 24);
    const nameLength = u16(bytes, at + 28);
    const extraLength = u16(bytes, at + 30);
    const commentLength = u16(bytes, at + 32);
    const disk = u16(bytes, at + 34);
    const external = u32(bytes, at + 38);
    const localOffset = u32(bytes, at + 42);
    const recordLength = 46 + nameLength + extraLength + commentLength;
    checkRange(bytes, at, recordLength, directory.end);
    if (disk !== 0) fail('split or multi-disk entries are refused.');
    if (flags & 1) fail('encrypted ZIP entries are refused.');
    // Only UTF-8 names, with only the deflate option/data-descriptor bits permitted.
    if ((flags & ~(0x0800 | 0x0006 | 0x0008)) !== 0) fail('unsupported ZIP flags (including patched or masked entries) are refused.');
    if (method !== 0 && method !== 8) fail(`compression method ${method} is unsupported; use stored or deflate entries.`);
    if (compressed === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) fail('ZIP64 entries are refused.');
    rejectZip64Extra(bytes, at + 46 + nameLength, extraLength);
    const name = decodeName(bytes.subarray(at + 46, at + 46 + nameLength));
    const safe = validateName(name);
    const host = madeBy >>> 8;
    const unixMode = host === 3 || host === 19 ? (external >>> 16) & 0xffff : 0;
    const fileType = unixMode & 0xf000;
    const dosAttributes = external & 0xffff;
    if (dosAttributes & (0x0008 | 0x0400)) fail(`volume labels and reparse-point entries such as "${name}" are refused.`);
    if (Boolean(dosAttributes & 0x0010) !== safe.directory) fail(`DOS directory attributes disagree for "${name}".`);
    if (fileType && fileType !== 0x8000 && fileType !== 0x4000) fail(`special file "${name}" is refused.`);
    if (fileType === 0x4000 && !safe.directory) fail(`directory attributes disagree for "${name}".`);
    if (safe.directory && fileType === 0x8000) fail(`file attributes disagree for directory "${name}".`);
    if (safe.directory && (size !== 0 || crc !== 0 || (method === 0 ? compressed !== 0 : compressed > 64 * 1024))) {
      fail(`directory entry "${name}" must be empty; only a small empty deflate stream is accepted.`);
    }
    const extension = `.${safe.path.split('/').pop()?.split('.').pop()?.toLowerCase() ?? ''}`;
    const fileLimit = SUPPORTED_MODEL_EXTENSIONS.includes(extension) ? MAX_MODEL_ARCHIVE_BYTES : MAX_FILE_BYTES;
    if (!safe.directory && size > fileLimit) fail(`file "${name}" exceeds the ${fileLimit}-byte per-file limit.`);
    if (compressed > MAX_MODEL_ARCHIVE_BYTES) fail(`compressed file "${name}" exceeds the archive limit.`);
    entries.push({ name: safe.path, directory: safe.directory, flags, method, crc, compressed, size, localOffset });
    at += recordLength;
  }
  if (at !== directory.end) fail('the central directory contains unaccounted records.');
  const names = new Set<string>();
  const fileNames = new Set<string>();
  let total = 0;
  for (const entry of entries) {
    const folded = entry.name.toLocaleLowerCase('en-US');
    if (names.has(folded)) fail(`duplicate or case-ambiguous path "${entry.name}" is refused.`);
    names.add(folded);
    if (!entry.directory) {
      fileNames.add(folded);
      total += entry.size;
      if (total > MAX_TOTAL_BYTES) fail(`expanded files exceed the ${MAX_TOTAL_BYTES}-byte aggregate limit.`);
    }
  }
  for (const entry of entries) {
    const parts = entry.name.toLocaleLowerCase('en-US').split('/');
    for (let i = 1; i < parts.length; i += 1) {
      if (fileNames.has(parts.slice(0, i).join('/'))) fail(`file path conflicts with parent path for "${entry.name}".`);
    }
  }
  return { entries, centralOffset: directory.offset };
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function inflateBounded(input: Uint8Array, expectedSize: number, signal?: AbortSignal): Promise<Uint8Array> {
  if (signal?.aborted) throw new DOMException('Archive processing was cancelled.', 'AbortError');
  if (typeof DecompressionStream === 'undefined') return fail('this runtime lacks ZIP deflate support; use a browser with DecompressionStream or update the app runtime.');
  let stream: ReadableStream<Uint8Array>;
  try {
    const ownedInput = new Uint8Array(input.byteLength);
    ownedInput.set(input);
    stream = new Blob([ownedInput.buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat));
  } catch {
    return fail('this runtime does not support raw ZIP deflate; use a newer browser or app runtime.');
  }
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let abortHandler: (() => void) | undefined;
  let abortPromise: Promise<never> | undefined;
  if (signal) {
    abortPromise = new Promise<never>((_resolve, reject) => {
      abortHandler = () => {
        void reader.cancel().catch(() => undefined);
        reject(new DOMException('Archive processing was cancelled.', 'AbortError'));
      };
      signal.addEventListener('abort', abortHandler, { once: true });
      if (signal.aborted) abortHandler();
    });
  }
  try {
    while (true) {
      const read = reader.read();
      const { done, value } = await (abortPromise ? Promise.race([read, abortPromise]) : read);
      if (done) break;
      total += value.byteLength;
      if (total > expectedSize) fail('deflate output exceeded the declared file size.');
      chunks.push(value);
    }
    if (signal?.aborted) throw new DOMException('Archive processing was cancelled.', 'AbortError');
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
    reader.releaseLock();
  }
  if (total !== expectedSize) fail(`deflate output was ${total} bytes; the directory declares ${expectedSize}.`);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

/** Parse an untrusted, bounded ZIP into in-memory model resources. */
export async function unpackModelArchive(
  bytes: Uint8Array,
  options: { signal?: AbortSignal; onProgress?: (completed: number, total: number) => void } = {},
): Promise<ModelResourceFile[]> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_MODEL_ARCHIVE_BYTES) fail(`archive must be a Uint8Array no larger than ${MAX_MODEL_ARCHIVE_BYTES} bytes.`);
  if (options.signal?.aborted) throw new DOMException('Archive processing was cancelled.', 'AbortError');
  const { entries, centralOffset } = parseEntries(bytes);
  const files: ModelResourceFile[] = [];
  const ranges: Array<{ start: number; end: number; name: string }> = [];
  const prepared: Array<{ entry: Entry; dataStart: number; dataEnd: number }> = [];
  for (const entry of entries) {
    checkRange(bytes, entry.localOffset, 30, centralOffset);
    const at = entry.localOffset;
    if (u32(bytes, at) !== LOCAL_SIGNATURE) fail(`local record for "${entry.name}" is malformed.`);
    const flags = u16(bytes, at + 6);
    const method = u16(bytes, at + 8);
    const localCrc = u32(bytes, at + 14);
    const localCompressed = u32(bytes, at + 18);
    const localSize = u32(bytes, at + 22);
    const nameLength = u16(bytes, at + 26);
    const extraLength = u16(bytes, at + 28);
    checkRange(bytes, at, 30 + nameLength + extraLength, centralOffset);
    rejectZip64Extra(bytes, at + 30 + nameLength, extraLength);
    if (decodeName(bytes.subarray(at + 30, at + 30 + nameLength)) !== (entry.directory ? `${entry.name}/` : entry.name)) fail(`local and central names disagree for "${entry.name}".`);
    if (flags !== entry.flags || method !== entry.method) fail(`local and central flags or methods disagree for "${entry.name}".`);
    if (!(flags & 8) && (localCrc !== entry.crc || localCompressed !== entry.compressed || localSize !== entry.size)) fail(`local and central sizes or CRC disagree for "${entry.name}".`);
    if ((flags & 8) && ((localCrc && localCrc !== entry.crc) || (localCompressed && localCompressed !== entry.compressed) || (localSize && localSize !== entry.size))) fail(`data descriptor metadata disagrees for "${entry.name}".`);
    const dataStart = at + 30 + nameLength + extraLength;
    const dataEnd = dataStart + entry.compressed;
    checkRange(bytes, dataStart, entry.compressed, centralOffset);
    let recordEnd = dataEnd;
    if (flags & 8) {
      if (u32(bytes, recordEnd) === 0x08074b50) recordEnd += 4;
      checkRange(bytes, recordEnd, 12, centralOffset);
      const descriptorCrc = u32(bytes, recordEnd);
      const descriptorCompressed = u32(bytes, recordEnd + 4);
      const descriptorSize = u32(bytes, recordEnd + 8);
      if (descriptorCrc !== entry.crc || descriptorCompressed !== entry.compressed || descriptorSize !== entry.size) fail(`data descriptor disagrees for "${entry.name}".`);
      recordEnd += 12;
    }
    ranges.push({ start: at, end: recordEnd, name: entry.name });
    prepared.push({ entry, dataStart, dataEnd });
  }
  ranges.sort((a, b) => a.start - b.start);
  if ((ranges.length === 0 && centralOffset !== 0) || (ranges.length > 0 && ranges[0].start !== 0)) {
    fail('prepended data or unreferenced local records are refused.');
  }
  for (let i = 1; i < ranges.length; i += 1) {
    if (ranges[i].start !== ranges[i - 1].end) fail(`local records overlap or leave unexplained data between "${ranges[i - 1].name}" and "${ranges[i].name}".`);
  }
  if (ranges.length > 0 && ranges[ranges.length - 1].end !== centralOffset) fail('unreferenced data appears before the central directory.');

  const fileCount = prepared.length;
  for (const { entry, dataStart, dataEnd } of prepared) {
    if (options.signal?.aborted) throw new DOMException('Archive processing was cancelled.', 'AbortError');
    const compressed = bytes.subarray(dataStart, dataEnd);
    let data: Uint8Array;
    if (entry.method === 0) {
      if (entry.compressed !== entry.size) fail(`stored file "${entry.name}" has inconsistent sizes.`);
      data = compressed.slice();
    } else {
      data = await inflateBounded(compressed, entry.size, options.signal);
    }
    if (crc32(data) !== entry.crc) fail(`CRC check failed for "${entry.name}".`);
    if (!entry.directory) {
      files.push({ name: entry.name, data });
      options.onProgress?.(files.length, fileCount);
    }
  }
  return files;
}
