import { expect, test, type Page } from '@playwright/test';
import { SAMPLE_SMF, setupBrowserDiagnostics } from './helpers/smoke-helpers';

const MODES = ['view', 'rig', 'skin', 'animate', 'export'] as const;
const SECONDARY_COMMANDS = [
  'open-project-btn',
  'recover-project-btn',
  'export-glb-btn',
  'export-fbx-btn',
  'export-smf-btn',
  'ping-rust-btn',
] as const;

async function loadSample(page: Page): Promise<void> {
  await page.getByTestId('model-file-input').setInputFiles(SAMPLE_SMF);
  await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15_000 });
}

test.describe('Calm Modern shell', () => {
  test.beforeEach(async ({ page }) => {
    setupBrowserDiagnostics(page);
  });

  test('keeps every workspace and command reachable without persistent cockpit chrome', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-shell-variant', 'modern');
    await expect(page.getByTestId('modern-empty-state')).toBeVisible();
    await expect(page.getByTestId('modern-support-panel')).toHaveCount(0);
    await expect(page.getByTestId('timeline')).toHaveCount(0);

    await page.getByTestId('modern-more-menu-button').click();
    for (const testId of SECONDARY_COMMANDS) {
      await expect(page.getByTestId(testId), testId).toBeVisible();
    }
    await expect(page.getByTestId('theme-select')).toBeVisible();
    await page.getByTestId('modern-more-menu-button').click();

    await loadSample(page);
    for (const mode of MODES) {
      await page.getByTestId(`mode-tab-${mode}`).click();
      await expect(page.getByTestId(`mode-tab-${mode}`)).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByTestId('modern-support-panel')).toBeVisible();
      if (mode === 'view') {
        await expect(page.getByTestId('outliner')).toBeVisible();
        await expect(page.getByTestId('timeline')).toHaveCount(0);
      } else {
        await expect(page.getByTestId('inspector')).toBeVisible();
        if (mode === 'animate') {
          await expect(page.getByTestId('timeline')).toBeVisible();
        } else {
          await expect(page.getByTestId('timeline')).toHaveCount(0);
        }
      }
    }
  });

  test('compact drawer traps focus, closes on Escape, and restores its trigger', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto('/');
    await loadSample(page);

    const sceneTrigger = page.getByTestId('modern-scene-trigger');
    await sceneTrigger.click();
    await expect(page.getByTestId('modern-support-panel')).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByTestId('modern-panel-close')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('modern-panel-properties')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('modern-support-panel')).toHaveCount(0);
    await expect(sceneTrigger).toBeFocused();
  });

  for (const dpr of [1, 1.25, 2]) {
    test(`keeps canvas backing dimensions aligned at DPR ${dpr}`, async ({ browser }, testInfo) => {
      const baseURL = String(testInfo.project.use.baseURL ?? 'http://localhost:5173');
      const context = await browser.newContext({
        baseURL,
        viewport: { width: 1024, height: 768 },
        deviceScaleFactor: dpr,
      });
      const page = await context.newPage();
      try {
        await page.goto('/');
        const dimensions = await page.getByTestId('three-canvas').evaluate((canvas) => {
          const element = canvas as HTMLCanvasElement;
          const rect = element.getBoundingClientRect();
          return {
            cssWidth: rect.width,
            cssHeight: rect.height,
            backingWidth: element.width,
            backingHeight: element.height,
            rendererPixelRatio: element.dataset.rendererPixelRatio,
          };
        });
        expect(dimensions.rendererPixelRatio).toBe(String(dpr));
        expect(Math.abs(dimensions.backingWidth - dimensions.cssWidth * dpr)).toBeLessThanOrEqual(1);
        expect(Math.abs(dimensions.backingHeight - dimensions.cssHeight * dpr)).toBeLessThanOrEqual(1);
      } finally {
        await context.close();
      }
    });
  }

  test('coarse-pointer controls meet the 44px target floor', async ({ browser }, testInfo) => {
    const baseURL = String(testInfo.project.use.baseURL ?? 'http://localhost:5173');
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      hasTouch: true,
    });
    const page = await context.newPage();
    try {
      await page.goto('/');
      for (const locator of [
        page.getByTestId('open-model-btn'),
        page.getByTestId('export-btn'),
        page.getByTestId('modern-more-menu-button'),
        page.getByTestId('mode-tab-view'),
        page.getByTestId('viewport-layout-single'),
      ]) {
        const box = await locator.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    } finally {
      await context.close();
    }
  });
});
