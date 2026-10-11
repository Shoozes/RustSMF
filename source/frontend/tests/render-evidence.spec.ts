import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { measureCanvasPixels } from './helpers/render-evidence';

function image(withModel: boolean, withChrome: boolean) {
  const png = new PNG({ width: 160, height: 120 });
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const content = withModel && x >= 60 && x < 100 && y >= 35 && y < 95;
    const chrome = withChrome && (y < 25 || y >= 105);
    const offset = (y * png.width + x) * 4;
    png.data.set(content ? [200, 180, 130, 255] : chrome ? [(x * 37 + y * 19) % 256, (x * y * 3) % 256, (x * 11 + y * 23) % 256, 255] : [16, 17, 17, 255], offset);
  }
  return PNG.sync.write(png);
}

test('decoded canvas evidence accepts actual model pixels', () => {
  expect(measureCanvasPixels(image(true, false)).contentPixels).toBe(2400);
});

test('blank canvas is rejected even when surrounding controls are visible', () => {
  const chrome = [{ x: 0, y: 0, width: 160, height: 25 }, { x: 0, y: 105, width: 160, height: 15 }];
  expect(image(false, true).byteLength).toBeGreaterThan(3000);
  expect(measureCanvasPixels(image(false, true), chrome).contentPixels).toBe(0);
  expect(measureCanvasPixels(image(true, true), chrome).contentPixels).toBe(2400);
  expect(measureCanvasPixels(image(false, false)).contentPixels).toBe(0);
});

test('malformed PNG cannot establish render evidence', () => {
  expect(() => measureCanvasPixels(image(true, false).subarray(0, 40))).toThrow();
});
