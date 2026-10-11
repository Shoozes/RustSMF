import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BinaryPayloadError, normalizeBinaryBundlePayload, normalizeBinaryPayload } from './binaryPayload';

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

  it('decodes exactly one payload per selected file in selection order', () => {
    const value = [new Uint8Array([1]), new Uint8Array([2]).buffer, [3]];
    assert.deepEqual(normalizeBinaryBundlePayload(value, ['scene.gltf', 'mesh.bin', 'texture.png']),
      [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])]);
  });

  it('rejects non-array, short and extra bundle payloads before decoding any entry', () => {
    for (const value of [null, new ArrayBuffer(1), [], [[1]], [[1], [2], [3]]]) {
      assert.throws(() => normalizeBinaryBundlePayload(value, ['scene.gltf', 'mesh.bin']), BinaryPayloadError);
    }
    assert.throws(() => normalizeBinaryBundlePayload([[256], [2]], ['scene.gltf']), /expected 1 file payload; received 2/);
  });

  it('retains byte validation after the bundle count matches', () => {
    assert.throws(() => normalizeBinaryBundlePayload([[1], [256]], ['scene.gltf', 'mesh.bin']),
      /byte 0 must be an integer from 0 through 255/);
  });
});
