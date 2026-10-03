import test from 'node:test';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import {
  ImageByteBudget,
  inspectImagePayload,
  resolveImageMimeType,
} from './imagePayload';

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const data = new DataView(bytes.buffer);
  data.setUint32(16, width, false);
  data.setUint32(20, height, false);
  return bytes;
}

function jpegImage(width = 2, height = 2): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index += 4) data.set([200, 40, 80, 255], index);
  return jpeg.encode({ data, width, height }, 90).data;
}

test('image payload inspection resolves matching PNG and JPEG signatures and dimensions', () => {
  const png = pngHeader(32, 16);
  const jpegBytes = jpegImage();
  assert.equal(resolveImageMimeType(png, 'image/png'), 'image/png');
  assert.equal(resolveImageMimeType(jpegBytes, 'image/jpeg; charset=binary'), 'image/jpeg');
  assert.deepEqual(inspectImagePayload(png, 'image/png'), {
    width: 32,
    height: 16,
    pixelCount: 512,
    decodedByteLength: 2048,
  });
  assert.deepEqual(inspectImagePayload(jpegBytes, 'image/jpeg'), {
    width: 2,
    height: 2,
    pixelCount: 4,
    decodedByteLength: 16,
  });
});

test('image payload inspection rejects unsupported, mismatched, and truncated formats', () => {
  const png = pngHeader(2, 2);
  const jpegBytes = jpegImage();
  assert.throws(() => resolveImageMimeType(png, 'image/jpeg'), /does not match declared MIME type/);
  assert.throws(() => inspectImagePayload(jpegBytes, 'image/png'), /does not match declared MIME type/);
  assert.throws(() => resolveImageMimeType(new Uint8Array([1, 2, 3]), 'application/octet-stream'), /not a supported PNG or JPEG/);
  assert.throws(() => inspectImagePayload(png.subarray(0, 24), 'image/png'), /truncated PNG header/);
  assert.throws(() => inspectImagePayload(new Uint8Array([0xff, 0xd8, 0xff, 0xda]), 'image/jpeg'), /missing a JPEG frame header/);
});

test('image payload dimensions are bounded before a decoder allocates pixels', () => {
  assert.throws(() => inspectImagePayload(pngHeader(8193, 1), 'image/png'), /edge limit/);
  assert.throws(() => inspectImagePayload(pngHeader(8192, 2049), 'image/png'), /pixel limit/);
});

test('decoded image byte budgets enforce an aggregate allocation ceiling', () => {
  const budget = new ImageByteBudget('test images', 16);
  const dimensions = inspectImagePayload(pngHeader(1, 1), 'image/png');
  for (let image = 0; image < 4; image += 1) budget.reserve(dimensions, `image ${image}`);
  assert.equal(budget.totalBytes, 16);
  assert.throws(() => budget.reserve(dimensions, 'fifth image'), /aggregate limit of 16 bytes/);
});
