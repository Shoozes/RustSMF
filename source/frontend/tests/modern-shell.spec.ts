import { workspaceControl, selectWorkspace, showModernPanel } from './helpers/modern-shell';
import { expect, test, type Page } from '@playwright/test';
import { SAMPLE_SMF, pausePlaybackIfRunning, setupBrowserDiagnostics } from './helpers/smoke-helpers';
import { createSkinnedGlbFixtureInput } from './helpers/skinned-glb-fixture';

test('Modern bone hierarchy and clip selection work from the keyboard with visible focus', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
  await expect(page.getByTestId('status-text')).toContainText(/Loaded:/, { timeout: 15_000 });
  await selectWorkspace(page, 'rig');
  await showModernPanel(page, 'properties');
  const root = (await workspaceControl(page, 'bone-tree-item-FixtureRoot'));
  await root.focus();
  await root.press('Enter');
  await expect(page.getByTestId('inspector-selected')).toHaveText('FixtureRoot');
  await root.press('ArrowLeft');
  await expect(page.getByTestId('bone-tree-item-FixtureTip')).toHaveCount(0);
  await root.press('ArrowRight');
  const tip = (await workspaceControl(page, 'bone-tree-item-FixtureTip'));
  await tip.focus();
  await tip.press('Space');
  await expect(page.getByTestId('inspector-selected')).toHaveText('FixtureTip');
  await expect(tip).toHaveCSS('outline-style', 'solid');
  await selectWorkspace(page, 'animate');
  await (await workspaceControl(page, 'animation-duplicate-clip-btn')).click();
  const original = page.getByTestId('clip-item-0');
  await original.focus();
  await original.press('Enter');
  await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend');
});

const MODES = ['view', 'rig', 'skin', 'animate', 'export'] as const;
const SECONDARY_COMMANDS = [
  'open-project-btn',
  'recover-project-btn',
  'export-glb-btn',
  'export-fbx-btn',
  'export-dae-btn',
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

  test('workspace chooser and More are reachable through the ordinary Tab path', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('open-model-btn')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('modern-workspace-button')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('mode-tab-rig')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('mode-tab-view')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('mode-tab-rig')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-editor-mode', 'rig');
    await expect(page.getByTestId('mode-tab-rig')).toBeHidden();
    await expect(page.getByTestId('modern-workspace-button')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('modern-more-menu-button')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('open-project-btn')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('open-project-btn')).toBeHidden();
    await expect(page.getByTestId('modern-more-menu-button')).toBeFocused();
  });

  test('keeps every workspace and command reachable without persistent cockpit chrome', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-shell-variant', 'modern');
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-ui-theme', 'lumen-alloy');
    await expect(page.getByTestId('modern-empty-state')).toBeVisible();
    await expect(page.getByTestId('modern-support-panel')).toHaveCount(0);
    await expect(page.getByTestId('timeline')).toHaveCount(0);

    const appbar = page.locator('.modern-appbar');
    const appbarRect = await appbar.boundingBox();
    expect(appbarRect).not.toBeNull();
    expect((await page.locator('.modern-toolbar').boundingBox())!.height).toBeLessThanOrEqual(48);
    await expect(page.getByTestId('modern-workspace-button')).toHaveText('Model');
    await expect(page.getByTestId('mode-tab-rig')).toBeHidden();
    const visibleButtons = await appbar.locator('button').evaluateAll(buttons => buttons.filter(button => button.checkVisibility()).length);
    expect(visibleButtons).toBe(6);
    for (const testId of ['open-model-btn', 'save-project-btn', 'editor-undo-btn', 'editor-redo-btn', 'export-btn']) {
      const command = page.getByTestId(testId);
      await expect(command, testId).toBeVisible();
      const rect = await command.boundingBox();
      expect(rect, testId).not.toBeNull();
      expect(rect!.x).toBeGreaterThanOrEqual(appbarRect!.x - 1);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(appbarRect!.x + appbarRect!.width + 1);
    }
    const viewportControls = page.getByTestId('viewport-controls-overlay');
    await expect(viewportControls).toBeVisible();
    expect(await viewportControls.evaluate((element) => element.closest('.viewport-container') !== null)).toBe(true);
    for (const testId of ['viewport-layout-single', 'viewport-layout-quad', 'viewport-perspective-toggle', 'viewport-display-menu-button']) {
      await expect(page.getByTestId(testId), testId).toBeVisible();
    }
    const statusRect = await page.getByTestId('status-text').boundingBox();
    expect(statusRect).not.toBeNull();
    expect(statusRect!.height).toBeLessThanOrEqual(28);
    await expect(page.getByTestId('status-text')).toHaveCSS('white-space', 'nowrap');

    await page.getByTestId('modern-more-menu-button').click();
    for (const testId of SECONDARY_COMMANDS) {
      await expect(page.getByTestId(testId), testId).toBeVisible();
    }
    await expect(page.getByTestId('theme-select')).toBeVisible();
    await page.getByTestId('modern-more-menu-button').click();

    await loadSample(page);
    await expect(page.getByTestId('modern-support-panel')).toHaveCount(0);
    await pausePlaybackIfRunning(page);
    await page.screenshot({ path: testInfo.outputPath('modern-model-overview.png') });
    for (const mode of MODES) {
      await selectWorkspace(page, mode);
      await expect(page.getByTestId(`mode-tab-${mode}`)).toHaveAttribute('aria-selected', 'true');
      if (mode === 'skin') {
        await expect(page.getByTestId('modern-support-panel')).toHaveCount(0);
        await expect(page.getByTestId('skin-workspace-panel')).toBeVisible();
        await expect(page.getByTestId('modern-skin-advanced')).toBeVisible();
        await expect(page.locator('.modern-skin-rail button')).toHaveCount(4);
        await expect(page.getByTestId('modern-skin-float').locator('button')).toHaveCount(0);
        await page.screenshot({ path: testInfo.outputPath('modern-skin-quiet.png') });
        await expect(page.getByTestId('timeline')).toHaveCount(0);
      } else if (mode === 'view') {
        await expect(page.getByTestId('modern-support-panel')).toBeVisible();
        await expect(page.getByTestId('outliner')).toBeVisible();
        await expect(page.getByTestId('timeline')).toHaveCount(0);
      } else {
        await expect(page.getByTestId('modern-support-panel')).toBeVisible();
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

    const sceneTrigger = page.getByTestId('modern-tools-button');
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
      const viewport = dpr === 1.25
        ? { width: 1440, height: 900 }
        : { width: 1024, height: 768 };
      const context = await browser.newContext({
        baseURL,
        viewport,
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
        if (dpr === 1.25) {
          await page.screenshot({
            path: testInfo.outputPath('modern-shell-scaled-desktop-dpr-1.25.png'),
            fullPage: true,
          });
        }
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
        page.getByTestId('modern-workspace-button'),
        page.getByTestId('viewport-layout-single'),
      ]) {
        const box = await locator.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
      }
      await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).toContainText(/Loaded:/, { timeout: 15_000 });
      await selectWorkspace(page, 'rig');
      await showModernPanel(page, 'properties');
      await (await workspaceControl(page, 'bone-tree-item-FixtureTip')).click();
      await selectWorkspace(page, 'skin');
      for (const id of ['modern-skin-radius', 'modern-skin-strength']) {
        expect((await page.getByTestId(id).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      for (const tool of ['pick', 'paint', 'erase', 'smooth']) {
        const box = (await page.getByTestId(`modern-skin-tool-${tool}`).boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      await showModernPanel(page, 'properties');
      const close = (await page.getByTestId('modern-panel-close').boundingBox())!;
      expect(close.height).toBeGreaterThanOrEqual(44);
      expect(close.width).toBeGreaterThanOrEqual(44);
    } finally {
      await context.close();
    }
  });
});
