import test from 'node:test';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { installNodeThreeRuntime } from '../../scripts/node-three-runtime';

function asymmetricPixels(width: number, height: number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const quadrants = [
    [240, 20, 20, 255],
    [20, 240, 20, 255],
    [20, 20, 240, 255],
    [240, 220, 20, 255],
  ];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = quadrants[(y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1)];
      pixels.set(color, (y * width + x) * 4);
    }
  }
  return pixels;
}

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const data = new DataView(bytes.buffer);
  data.setUint32(16, width, false);
  data.setUint32(20, height, false);
  return bytes;
}

function blobPart(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

test('Node Three canvas encodes the requested PNG or JPEG MIME and matching payload', async () => {
  installNodeThreeRuntime();
  const width = 16;
  const height = 16;
  const canvas = document.createElement('canvas') as HTMLCanvasElement & {
    convertToBlob(options?: BlobPropertyBag & { quality?: number }): Promise<Blob>;
  };
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.putImageData(new ImageData(asymmetricPixels(width, height), width, height), 0, 0);

  const pngBlob = await canvas.convertToBlob({ type: 'image/png' });
  const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
  assert.equal(pngBlob.type, 'image/png');
  assert.deepEqual(Array.from(pngBytes.subarray(0, 8)), [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const decodedPng = PNG.sync.read(Buffer.from(pngBytes));
  assert.equal(decodedPng.width, width);
  assert.equal(decodedPng.height, height);
  assert.deepEqual(Array.from(decodedPng.data.subarray((3 * width + 3) * 4, (3 * width + 3) * 4 + 4)), [240, 20, 20, 255]);

  const jpegBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
  assert.equal(jpegBlob.type, 'image/jpeg');
  assert.deepEqual(Array.from(jpegBytes.subarray(0, 2)), [0xff, 0xd8]);
  const decodedJpeg = jpeg.decode(Buffer.from(jpegBytes), { useTArray: true, formatAsRGBA: true, tolerantDecoding: false });
  assert.equal(decodedJpeg.width, width);
  assert.equal(decodedJpeg.height, height);
  const topLeft = Array.from(decodedJpeg.data.subarray((3 * width + 3) * 4, (3 * width + 3) * 4 + 3));
  assert.ok(topLeft[0] > topLeft[1] * 2 && topLeft[0] > topLeft[2] * 2, `unexpected JPEG top-left pixel ${topLeft}`);

  const dataUrl = canvas.toDataURL('image/jpeg');
  assert.match(dataUrl, /^data:image\/jpeg;base64,/);
  assert.deepEqual(Array.from(Buffer.from(dataUrl.split(',')[1], 'base64').subarray(0, 2)), [0xff, 0xd8]);
  await assert.rejects(canvas.convertToBlob({ type: 'image/webp' }), /unsupported MIME type image\/webp/);
});

test('Node Three rejects oversized and MIME-mismatched images before image allocation', async () => {
  installNodeThreeRuntime();
  assert.throws(() => new ImageData(new Uint8ClampedArray(0), 8193, 1), /edge limit/);
  const oversizedPng = new Blob([blobPart(pngHeader(8193, 1))], { type: 'image/png' });
  await assert.rejects(createImageBitmap(oversizedPng), /edge limit/);
  const mismatched = new Blob([blobPart(pngHeader(1, 1))], { type: 'image/jpeg' });
  await assert.rejects(createImageBitmap(mismatched), /does not match declared MIME type/);
});
