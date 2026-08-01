/**
 * Shared low-level binary helpers for SMF (and potential other binary paths).
 *
 * SMF is a legacy format with counts, offsets, strings, and byte-sized fields
 * supplied by the file. These helpers make the boundary fail closed instead
 * of allowing JavaScript coercion or unbounded scans/allocations to decide the
 * result.
 */

import { MAX_MODEL_INPUT_BYTES } from '../utils/modelFormat';

export const SMF_LIMITS = {
  maxEncodedBytes: MAX_MODEL_INPUT_BYTES,
  maxOutputBytes: MAX_MODEL_INPUT_BYTES,
  // Decoded typed arrays, frame objects, and relational payloads can expand
  // substantially beyond the encoded file. Keep this separate from the file
  // limit so declared counts fail before large allocations begin.
  maxDecodedBytes: 512 * 1024 * 1024,
  maxStringBytes: 4096,
  maxTextures: 255,
  maxTextureWidth: 8192,
  maxTextureHeight: 8192,
  maxTexturePixels: 16_777_216,
  maxMeshes: 255,
  maxMeshVertices: 5_000_000,
  maxRigNodes: 65_535,
  maxAnimations: 255,
  maxAnimationFrames: 100_000,
  maxAnimationFrameDqs: 10_000_000,
} as const;

export const SMF_DECODED_MEMORY_BUDGET_CODE = 'SMF_DECODED_MEMORY_BUDGET_EXCEEDED';

export class SmfDecodedMemoryBudget {
  private usedBytes = 0;

  constructor(private readonly limitBytes = SMF_LIMITS.maxDecodedBytes) {
    if (!Number.isSafeInteger(limitBytes) || limitBytes < 0) {
      throw new Error(`${SMF_DECODED_MEMORY_BUDGET_CODE}: invalid decoded-memory limit ${limitBytes}`);
    }
  }

  get bytesUsed(): number {
    return this.usedBytes;
  }

  reserve(bytes: number, label: string): void {
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throw new Error(`${SMF_DECODED_MEMORY_BUDGET_CODE}: ${label} estimate ${bytes} is invalid`);
    }
    const next = this.usedBytes + bytes;
    if (!Number.isSafeInteger(next) || next > this.limitBytes) {
      throw new Error(
        `${SMF_DECODED_MEMORY_BUDGET_CODE}: ${label} would use ${next} decoded bytes; maximum is ${this.limitBytes}`,
      );
    }
    this.usedBytes = next;
  }
}

function fail(message: string): never {
  throw new Error(`Invalid SMF binary: ${message}`);
}

export function checkedAdd(left: number, right: number, label: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || !Number.isSafeInteger(value)) {
    fail(`${label} exceeds the safe integer range`);
  }
  return value;
}

export function checkedMultiply(left: number, right: number, label: string): number {
  const value = left * right;
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || !Number.isSafeInteger(value)) {
    fail(`${label} exceeds the safe integer range`);
  }
  return value;
}

export function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export class BinaryReader {
  private readonly dv: DataView;
  private offset = 0;
  private limit: number;

  constructor(buffer: ArrayBuffer) {
    if (buffer.byteLength > SMF_LIMITS.maxEncodedBytes) {
      fail(`input is ${buffer.byteLength} bytes; maximum is ${SMF_LIMITS.maxEncodedBytes}`);
    }
    this.dv = new DataView(buffer);
    this.limit = buffer.byteLength;
  }

  get off(): number {
    return this.offset;
  }

  get remaining(): number {
    return this.limit - this.offset;
  }

  seek(offset: number, label = 'section'): this {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > this.dv.byteLength) {
      fail(`${label} offset ${offset} is outside the input`);
    }
    this.offset = offset;
    return this;
  }

  setLimit(limit: number, label = 'section'): this {
    if (!Number.isSafeInteger(limit) || limit < this.offset || limit > this.dv.byteLength) {
      fail(`${label} end ${limit} is outside the readable input range`);
    }
    this.limit = limit;
    return this;
  }

  clearLimit(): this {
    this.limit = this.dv.byteLength;
    return this;
  }

  private ensure(size: number, label: string): void {
    const end = this.offset + size;
    if (Number.isSafeInteger(size) && size >= 0 && end <= this.limit) return;
    throw new Error(`Unexpected end of SMF binary while reading ${label} at offset ${this.offset}`);
  }

  private read<T>(size: number, label: string, getter: (offset: number) => T): T {
    this.ensure(size, label);
    const value = getter(this.offset);
    this.offset += size;
    return value;
  }

  u8(): number { return this.read(1, 'u8', offset => this.dv.getUint8(offset)); }
  u16(): number { return this.read(2, 'u16', offset => this.dv.getUint16(offset, true)); }
  u32(): number { return this.read(4, 'u32', offset => this.dv.getUint32(offset, true)); }

  f32(): number {
    const value = this.read(4, 'f32', offset => this.dv.getFloat32(offset, true));
    if (!Number.isFinite(value)) fail(`non-finite f32 at offset ${this.offset - 4}`);
    return value;
  }

  bytes(size: number, label = 'bytes'): Uint8Array {
    if (!Number.isSafeInteger(size) || size < 0) fail(`${label} size ${size} is invalid`);
    this.ensure(size, label);
    const value = new Uint8Array(this.dv.buffer, this.dv.byteOffset + this.offset, size).slice();
    this.offset += size;
    return value;
  }

  strZ(maxBytes = SMF_LIMITS.maxStringBytes): string {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) fail(`string limit ${maxBytes} is invalid`);
    let s = '';
    for (let i = 0; i < maxBytes; i += 1) {
      const c = this.u8();
      if (c === 0) return s;
      s += String.fromCharCode(c);
    }
    fail(`unterminated string at offset ${this.offset - maxBytes}`);
  }
}

function checkedUnsigned(value: number, maximum: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    fail(`${label} value ${value} is outside 0..${maximum}`);
  }
  return value;
}

export class BinaryWriter {
  private buf: ArrayBuffer;
  private dv: DataView;
  private off = 0;
  private readonly tag: string;

  constructor(initialSize = 1024, tag = '') {
    if (!Number.isSafeInteger(initialSize) || initialSize < 0 || initialSize > SMF_LIMITS.maxOutputBytes) {
      fail(`initial ${tag || 'writer'} size ${initialSize} is invalid`);
    }
    this.buf = new ArrayBuffer(initialSize);
    this.dv = new DataView(this.buf);
    this.tag = tag || 'output';
  }

  private ensure(size: number): void {
    const required = checkedAdd(this.off, size, `${this.tag} size`);
    if (required <= this.buf.byteLength) return;
    if (required > SMF_LIMITS.maxOutputBytes) {
      fail(`${this.tag} exceeds the ${SMF_LIMITS.maxOutputBytes}-byte output limit`);
    }
    const newSize = Math.min(
      SMF_LIMITS.maxOutputBytes,
      Math.max(required, checkedAdd(this.buf.byteLength, Math.max(1024, this.buf.byteLength), `${this.tag} growth`)),
    );
    const bigger = new ArrayBuffer(newSize);
    new Uint8Array(bigger).set(new Uint8Array(this.buf));
    this.buf = bigger;
    this.dv = new DataView(this.buf);
  }

  u8(value: number): this {
    this.ensure(1);
    this.dv.setUint8(this.off, checkedUnsigned(value, 0xff, `${this.tag} u8`));
    this.off += 1;
    return this;
  }

  u16(value: number): this {
    this.ensure(2);
    this.dv.setUint16(this.off, checkedUnsigned(value, 0xffff, `${this.tag} u16`), true);
    this.off += 2;
    return this;
  }

  u32(value: number): this {
    this.ensure(4);
    this.dv.setUint32(this.off, checkedUnsigned(value, 0xffffffff, `${this.tag} u32`), true);
    this.off += 4;
    return this;
  }

  f32(value: number): this {
    if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value))) {
      fail(`${this.tag} f32 value ${value} is not finite`);
    }
    this.ensure(4);
    this.dv.setFloat32(this.off, value, true);
    this.off += 4;
    return this;
  }

  strZ(value: string): this {
    if (value.includes('\0')) fail(`${this.tag} string contains an embedded NUL`);
    if (value.length >= SMF_LIMITS.maxStringBytes) {
      fail(`${this.tag} string exceeds the ${SMF_LIMITS.maxStringBytes - 1}-byte limit`);
    }
    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i);
      if (code > 0xff) fail(`${this.tag} string contains a non-byte character at index ${i}`);
      this.u8(code);
    }
    return this.u8(0);
  }

  getBuffer(): ArrayBuffer {
    return this.buf.slice(0, this.off);
  }

  patchU32(offset: number, value: number): void {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset + 4 > this.off) {
      throw new Error(`Cannot patch u32 outside ${this.tag} output at offset ${offset}`);
    }
    this.dv.setUint32(offset, checkedUnsigned(value, 0xffffffff, `${this.tag} patched u32`), true);
  }
}
