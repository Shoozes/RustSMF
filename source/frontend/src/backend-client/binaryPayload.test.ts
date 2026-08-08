import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BinaryPayloadError, normalizeBinaryPayload } from './binaryPayload';

describe('native binary payload validation', () => {
  it('accepts the supported binary payload representations', () => {
    const view = new Uint8Array([0, 127, 255]);
    assert.equal(normalizeBinaryPayload(view, 'view.glb'), view);
    assert.deepEqual(normalizeBinaryPayload(view.buffer, 'buffer.glb'), view);
    assert.deepEqual(normalizeBinaryPayload([0, 127, 255], 'array.glb'), view);
  });

  it('rejects values that Uint8Array would otherwise coerce or wrap', () => {
    for (const value of [[-1], [256], [1.5], [Number.NaN], [undefined], 'bytes', null]) {
      assert.throws(
        () => normalizeBinaryPayload(value, 'invalid.glb'),
        (error: unknown) => error instanceof BinaryPayloadError
          && error.code === 'INVALID_BINARY_PAYLOAD',
      );
    }
  });
});
