import { PNG } from 'pngjs';

export interface PixelRect { x: number; y: number; width: number; height: number }

export function measureCanvasPixels(bytes: Buffer, excluded: PixelRect[] = []) {
  const { width, height, data } = PNG.sync.read(bytes);
  const mask = new Uint8Array(width * height);
  for (const rect of excluded) {
    const left = Math.min(width, Math.max(0, Math.floor(rect.x)));
    const right = Math.min(width, Math.ceil(rect.x + rect.width));
    const top = Math.max(0, Math.floor(rect.y));
    const bottom = Math.min(height, Math.ceil(rect.y + rect.height));
    if (right <= left || bottom <= top) continue;
    for (let y = top; y < bottom; y++) mask.fill(1, y * width + left, y * width + right);
  }
  const histogram = new Uint32Array(32768);
  const colors = new Uint32Array(32768);
  let dominant = 0;
  let sampledPixels = 0;
  for (let pixel = 0; pixel < mask.length; pixel++) {
    if (mask[pixel]) continue;
    const offset = pixel * 4;
    const r = data[offset], g = data[offset + 1], b = data[offset + 2];
    const bucket = (r >> 3) << 10 | (g >> 3) << 5 | b >> 3;
    if (!histogram[bucket]) colors[bucket] = r << 16 | g << 8 | b;
    histogram[bucket]++;
    if (histogram[bucket] > histogram[dominant]) dominant = bucket;
    sampledPixels++;
  }
  const background = colors[dominant];
  const r = background >> 16, g = background >> 8 & 255, b = background & 255;
  let contentPixels = 0;
  for (let pixel = 0; pixel < mask.length; pixel++) {
    if (mask[pixel]) continue;
    const offset = pixel * 4;
    if (Math.max(Math.abs(data[offset] - r), Math.abs(data[offset + 1] - g), Math.abs(data[offset + 2] - b)) >= 16) contentPixels++;
  }
  return { width, height, sampledPixels, contentPixels, background: [r, g, b] };
}
