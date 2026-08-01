import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BinaryReader, BinaryWriter, SMF_LIMITS } from './smfBinary';

describe('SMF binary boundary helpers', () => {
  it('rejects numeric coercion that would silently wrap on export', () => {
    const writer = new BinaryWriter(0, 'test');
    assert.throws(() => writer.u8(256), /outside 0\.\.255/);
    assert.throws(() => writer.u16(-1), /outside 0\.\.65535/);
    assert.throws(() => writer.f32(Number.NaN), /not finite/);
  });

  it('rejects ambiguous strings instead of truncating or scanning forever', () => {
    const writer = new BinaryWriter(0, 'test');
    assert.throws(() => writer.strZ('a\0b'), /embedded NUL/);
    assert.throws(() => writer.strZ('Ω'), /non-byte character/);

    const bytes = new Uint8Array(SMF_LIMITS.maxStringBytes);
    bytes.fill(1);
    assert.throws(() => new BinaryReader(bytes.buffer).strZ(), /unterminated string/);
  });

  it('keeps section reads inside their declared range', () => {
    const writer = new BinaryWriter(16, 'test');
    writer.u8(7).u8(8).u8(9);
    const reader = new BinaryReader(writer.getBuffer()).seek(0).setLimit(2);
    assert.equal(reader.u8(), 7);
    assert.equal(reader.u8(), 8);
    assert.throws(() => reader.u8(), /Unexpected end of SMF binary/);
  });

  it('rejects input larger than the codec boundary before parsing', () => {
    const oversized = new ArrayBuffer(SMF_LIMITS.maxEncodedBytes + 1);
    assert.throws(() => new BinaryReader(oversized), /maximum is/);
  });
});
