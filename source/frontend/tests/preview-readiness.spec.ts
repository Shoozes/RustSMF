import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { readAssetEvidence, expectMotion } from './helpers/asset-evidence';
import { expectRenderedScreenshot, pausePlaybackIfRunning } from './helpers/smoke-helpers';
import { watchJourneyErrors } from './helpers/product-journey';

const demo = fileURLToPath(new URL('../../../examples/rustsmf-demo.glb', import.meta.url));
const sizes = [[1920, 1080], [1440, 900], [1280, 800], [1024, 768], [800, 900], [390, 844]];

test('distributed sample independently preserves its known rig, materials, raw weights and motion', () => {
  const asset = readAssetEvidence(readFileSync(demo));
  expect(asset.joints).toEqual(['Base', 'Shoulder', 'Elbow', 'Wrist', 'Head']);
  expect(asset.clips.map(clip => [clip.name, clip.duration])).toEqual([['Wave', 2], ['Turn', 2]]);
  expect(asset.primitives).toHaveLength(10);
  expect([...new Set(asset.primitives.map(primitive => (primitive.material as { name: string }).name))].sort()).toEqual(['Brass', 'Ceramic', 'Graphite']);
  for (const primitive of asset.primitives) {
    expect(primitive.attributes.POSITION).toHaveLength(720);
    expect(primitive.attributes.JOINTS_0.every(value => Number.isInteger(value) && value >= 0 && value < 5)).toBe(true);
    const weights = primitive.attributes.WEIGHTS_0;
    for (let i = 0; i < weights.length; i += 4) expect(weights.slice(i, i + 4).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 6);
  }
  expect(asset.images).toHaveLength(0);
  asset.clips.forEach(expectMotion);
});

for (const [width, height] of sizes) {
  test.describe(`0.2.1 preview ${width}x${height}`, () => {
    test.use({ viewport: { width, height }, deviceScaleFactor: width === 1440 ? 1.25 : 1 });
    test('model pixels and offline Help remain useful with tools closed', async ({ page }, testInfo) => {
      const assertErrors = watchJourneyErrors(page);
      await page.goto('/');
      await page.getByTestId('model-file-input').setInputFiles(demo);
      await expect(page.getByTestId('status-text')).toHaveText(`Loaded: ${path.basename(demo)}`, { timeout: 15_000 });
      await expect(page.getByTestId('status-text')).toHaveAttribute('title', /bones: 5.*clips: 2.*verts: 240/);
      await pausePlaybackIfRunning(page);
      await page.getByTestId('viewport-display-menu-button').click();
      await page.getByTestId('viewport-grid-toggle').click();
      await page.getByTestId('viewport-axes-toggle').click();
      await page.getByTestId('viewport-rig-visibility-toggle').click();
      await page.getByTestId('viewport-display-menu-button').click();
      const canvas = page.getByTestId('three-canvas');
      await expect(canvas).toHaveAttribute('data-grid-enabled', 'false');
      await expect(canvas).toHaveAttribute('data-axes-enabled', 'false');
      await expect(canvas).toHaveAttribute('data-rig-opacity', '0');
      await expectRenderedScreenshot(canvas);
      await expect(page.getByTestId('modern-support-panel')).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`preview-model-${width}x${height}.png`) });
      const more = page.getByTestId('modern-more-menu-button');
      await more.click();
      await page.getByTestId('help-open').click();
      const help = page.getByTestId('help-dialog');
      await expect(help).toBeVisible();
      await expect(help).toContainText('0.2.1 preview');
      await expect(help).toContainText('Save Project');
      await expect(help).toContainText('MIT');
      await expect(page.getByTestId('modern-more-menu-panel')).toBeHidden();
      await help.getByTestId('help-status-details').locator('summary').click();
      await expect(help).toContainText(/bones: 5.*clips: 2/);
      await expect(page.getByTestId('help-close')).toBeInViewport();
      expect(await help.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.querySelector('[data-testid="help-dialog"]')?.contains(document.activeElement))).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`preview-help-${width}x${height}.png`) });
      await page.keyboard.press('Escape');
      await expect(help).toBeHidden();
      await expect(more).toBeFocused();
      await more.click(); await page.getByTestId('help-open').click();
      await page.getByTestId('help-close').click();
      await expect(more).toBeFocused();
      await expect(canvas).not.toHaveAttribute('data-model-root-id', '');
      await expectRenderedScreenshot(canvas);
      assertErrors();
    });
  });
}
