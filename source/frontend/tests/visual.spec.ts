import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  SAMPLE_SMF,
  expectRenderedScreenshot,
  getBrowserErrors,
  pausePlaybackIfRunning,
  setupBrowserDiagnostics,
} from './helpers/smoke-helpers';

type ViewportCase = {
  name: string;
  width: number;
  height: number;
  screenshotMinBytes: number;
};

type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

const VIEWPORTS: ViewportCase[] = [
  { name: 'desktop', width: 1280, height: 720, screenshotMinBytes: 3000 },
  { name: 'narrow', width: 390, height: 844, screenshotMinBytes: 2200 },
];

async function getRequiredRect(locator: Locator): Promise<Rect> {
  const rect = await locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      left: bounds.left,
      top: bounds.top,
      right: bounds.right,
      bottom: bounds.bottom,
      width: bounds.width,
      height: bounds.height,
    };
  });
  expect(rect.width).toBeGreaterThan(0);
  expect(rect.height).toBeGreaterThan(0);
  return rect;
}

function rectsOverlap(a: Rect, b: Rect, padding = 0): boolean {
  return !(
    a.right <= b.left + padding
    || a.left >= b.right - padding
    || a.bottom <= b.top + padding
    || a.top >= b.bottom - padding
  );
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(Math.max(metrics.doc, metrics.body)).toBeLessThanOrEqual(metrics.viewport + 2);
}

async function expectNoCriticalBrowserErrors(page: Page): Promise<void> {
  const critical = getBrowserErrors(page).filter((entry) => entry.includes('ERROR'));
  expect(critical).toEqual([]);
}

async function expectQuadLabelsClearOfOverlays(page: Page): Promise<void> {
  const viewport = await getRequiredRect(page.getByTestId('viewport-container'));
  const displayPanel = await getRequiredRect(page.getByTestId('viewport-display-menu-panel'));
  const verticalDivider = await getRequiredRect(page.locator('.quad-pane-line-v'));
  const horizontalDivider = await getRequiredRect(page.locator('.quad-pane-line-h'));

  const labels = [
    page.getByTestId('quad-pane-label-top'),
    page.getByTestId('quad-pane-label-3d'),
    page.getByTestId('quad-pane-label-front'),
    page.getByTestId('quad-pane-label-side'),
  ];

  for (const label of labels) {
    const rect = await getRequiredRect(label);
    expect(rect.left).toBeGreaterThanOrEqual(viewport.left);
    expect(rect.right).toBeLessThanOrEqual(viewport.right);
    expect(rect.top).toBeGreaterThanOrEqual(viewport.top);
    expect(rect.bottom).toBeLessThanOrEqual(viewport.bottom);
    expect(rectsOverlap(rect, displayPanel)).toBe(false);
    expect(rectsOverlap(rect, verticalDivider, 2)).toBe(false);
    expect(rectsOverlap(rect, horizontalDivider, 2)).toBe(false);
  }
}

test.describe('RustSMF visual confirmations', () => {
  test.beforeEach(async ({ page }) => {
    setupBrowserDiagnostics(page);
  });

  for (const viewport of VIEWPORTS) {
    test(`app shell renders primary surfaces without overflow (${viewport.name})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');

      await expect(page).toHaveTitle(/RustSMF/i);
      await expect(page.getByTestId('status-text')).toContainText('Three.js viewport ready');
      await expect(page.getByTestId('open-model-btn')).toBeVisible();
      await expect(page.getByTestId('export-btn')).toBeVisible();
      await expect(page.getByTestId('export-smf-btn')).toBeVisible();
      await expect(page.getByTestId('viewport-container')).toBeVisible();
      await expect(page.getByTestId('three-canvas')).toBeVisible();
      await expect(page.getByTestId('timeline')).toBeVisible();
      await expect(page.getByTestId('outliner')).toBeVisible();
      await expect(page.getByTestId('inspector')).toBeVisible();

      await expectNoHorizontalOverflow(page);
      await expectRenderedScreenshot(page.getByTestId('viewport-container'), viewport.screenshotMinBytes);
      await expectNoCriticalBrowserErrors(page);
    });
  }

  test('Original SMF theme restores the compact tool-shelf layout and persists', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    const appShell = page.getByTestId('app-shell');
    const themeSelect = page.getByTestId('theme-select');
    await expect(appShell).toHaveAttribute('data-theme', 'modern');
    await themeSelect.selectOption('original');
    await expect(appShell).toHaveAttribute('data-theme', 'original');
    await expect(page.getByTestId('theme-description')).toContainText(/dense original editor format/i);
    await expect(page.getByTestId('mode-tab-view')).toHaveText('Model [1]');
    await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-theme', 'original');
    await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-viewport-layout', 'quad');
    await expect(page.getByTestId('inspector').locator('.panel-title').first()).toHaveText('Settings');
    await expect(page.getByTestId('outliner').locator('.panel-title').first()).toHaveText('Submodels');
    await expect(page.getByTestId('timeline')).toBeHidden();

    const tools = await getRequiredRect(page.locator('.inspector-stack'));
    const viewport = await getRequiredRect(page.getByTestId('viewport-container'));
    const submodels = await getRequiredRect(page.getByTestId('outliner'));
    const toolbar = await getRequiredRect(page.locator('.toolbar'));
    const modeTabs = await getRequiredRect(page.locator('.mode-tablist'));
    expect(tools.width).toBeGreaterThanOrEqual(134);
    expect(tools.width).toBeLessThanOrEqual(138);
    expect(submodels.width).toBeGreaterThanOrEqual(126);
    expect(submodels.width).toBeLessThanOrEqual(130);
    expect(toolbar.height).toBeGreaterThanOrEqual(79);
    expect(toolbar.height).toBeLessThanOrEqual(81);
    expect(modeTabs.left).toBeGreaterThanOrEqual(tools.right - 2);
    expect(modeTabs.width).toBeLessThanOrEqual(644);
    expect(tools.right).toBeLessThanOrEqual(viewport.left + 2);
    expect(viewport.right).toBeLessThanOrEqual(submodels.left + 2);

    await page.getByTestId('model-file-input').setInputFiles(SAMPLE_SMF);
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-viewport-layout', 'quad');
    const texturePreviews = page.locator('.outliner-color[data-preview-kind="texture"]');
    await expect(texturePreviews.first()).toBeVisible();
    await expect.poll(async () => texturePreviews.evaluateAll((canvases) => (
      canvases.some((canvas) => {
        if (!(canvas instanceof HTMLCanvasElement)) return false;
        const context = canvas.getContext('2d');
        if (!context) return false;
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let index = 0; index < pixels.length; index += 4) {
          if (
            pixels[index] !== 255
            || pixels[index + 1] !== 255
            || pixels[index + 2] !== 255
          ) {
            return true;
          }
        }
        return false;
      })
    ))).toBe(true);
    await pausePlaybackIfRunning(page);

    await page.getByTestId('mode-tab-animate').click();
    await expect(page.getByTestId('timeline')).toBeVisible();
    const timeline = await getRequiredRect(page.getByTestId('timeline'));
    const timelineControls = await getRequiredRect(page.locator('.timeline-controls'));
    const timelineRuler = await getRequiredRect(page.locator('.timeline-ruler'));
    const keyframeLane = page.getByTestId('timeline-keyframe-lane');
    const keyframeLaneRect = await getRequiredRect(keyframeLane);
    const keyframeMarker = await getRequiredRect(page.locator('.timeline-keyframe-marker').first());
    const mainArea = await getRequiredRect(page.locator('.main-area'));
    expect(timeline.bottom).toBeLessThanOrEqual(mainArea.top + 2);
    expect(timelineControls.width).toBeGreaterThanOrEqual(126);
    expect(timelineControls.width).toBeLessThanOrEqual(130);
    expect(Math.abs(timelineRuler.left - timelineControls.right)).toBeLessThanOrEqual(2);
    expect(Math.abs(keyframeLaneRect.left - timelineRuler.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(keyframeLaneRect.top - timelineRuler.bottom)).toBeLessThanOrEqual(1);
    expect(keyframeLaneRect.height).toBeGreaterThanOrEqual(31);
    expect(keyframeLaneRect.height).toBeLessThanOrEqual(33);
    expect(timeline.right - keyframeLaneRect.right).toBeGreaterThanOrEqual(14);
    expect(timeline.right - keyframeLaneRect.right).toBeLessThanOrEqual(18);
    expect(keyframeMarker.width).toBeGreaterThanOrEqual(9);
    expect(keyframeMarker.width).toBeLessThanOrEqual(11);
    expect(keyframeMarker.height).toBeGreaterThanOrEqual(29);
    expect(keyframeMarker.height).toBeLessThanOrEqual(31);
    const keyframeCount = Number(await keyframeLane.getAttribute('data-keyframe-count'));
    const sampleFrameCount = Number(await keyframeLane.getAttribute('data-sample-frame-count'));
    expect(sampleFrameCount).toBeGreaterThanOrEqual(keyframeCount);

    await expectNoHorizontalOverflow(page);
    await expectRenderedScreenshot(appShell, 5000);
    await page.screenshot({ path: testInfo.outputPath('original-smf-theme.png'), fullPage: true });
    await expectNoCriticalBrowserErrors(page);

    await page.reload();
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-theme', 'original');
    await expect(page.getByTestId('theme-select')).toHaveValue('original');
    await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-viewport-layout', 'quad');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('viewport-container')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('original-smf-theme-narrow.png'), fullPage: true });
    await expectNoCriticalBrowserErrors(page);
  });

  test('loaded SMF visual state keeps viewport, timeline, and skeleton panels coherent', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.getByTestId('model-file-input').setInputFiles(SAMPLE_SMF);

    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/Loaded|bones|clips/i);
    await expect(page.getByTestId('inspector')).toContainText(/Bones \(\d+\)/i);
    await expect(page.getByTestId('outliner')).toContainText(/Scene Root|Bone|Mesh/i);
    await expect(page.getByTestId('timeline')).toBeVisible();

    await pausePlaybackIfRunning(page);
    await expectRenderedScreenshot(page.getByTestId('viewport-container'), 3000);
    await expectNoHorizontalOverflow(page);
    await expectNoCriticalBrowserErrors(page);
  });

  test('SMF IK tool keeps its target, settings, and posed model visually legible', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.getByTestId('model-file-input').setInputFiles(SAMPLE_SMF);
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await pausePlaybackIfRunning(page);
    await page.getByTestId('mode-tab-rig').click({ force: true });

    const childBone = page.getByTestId('inspector').locator('li li > div').filter({ hasText: /SMF_Node_\d+/ }).first();
    await expect(childBone).toBeVisible({ timeout: 8000 });
    await childBone.click({ force: true });
    await page.getByTestId('rig-tool-ik').click();
    await page.getByTestId('rig-ik-chain-length').selectOption('1');
    await expect(page.getByTestId('rig-ik-settings')).toBeVisible();

    const canvas = page.getByTestId('three-canvas');
    await expect.poll(async () => Number.isFinite(Number(await canvas.getAttribute('data-rig-ik-target-screen-x')))).toBe(true);
    const x = Number(await canvas.getAttribute('data-rig-ik-target-screen-x'));
    const y = Number(await canvas.getAttribute('data-rig-ik-target-screen-y'));
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 32, y + 20, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByTestId('rig-ik-result')).toBeVisible();
    await expectRenderedScreenshot(page.getByTestId('viewport-container'), 3000);
    await page.screenshot({ path: testInfo.outputPath('ik-pose-tool.png'), fullPage: true });
    await expectNoHorizontalOverflow(page);
    await expectNoCriticalBrowserErrors(page);
  });

  test('loaded Display menu and single Ortho view stay visually coherent', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.getByTestId('model-file-input').setInputFiles(SAMPLE_SMF);

    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/Loaded|bones|clips/i);
    await pausePlaybackIfRunning(page);

    await page.getByTestId('viewport-display-menu-button').click();
    await expect(page.getByTestId('viewport-display-menu-panel')).toBeVisible();
    await expect(page.getByTestId('viewport-wireframe-toggle')).toBeVisible();
    await expect(page.getByTestId('viewport-rig-thickness-toggle')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByTestId('viewport-display-menu-button').click();
    const cameraBtn = page.getByTestId('viewport-perspective-toggle');
    await expect(cameraBtn).toContainText('3D');
    await cameraBtn.click();
    await expect(cameraBtn).toContainText('Ortho');
    await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-perspective-enabled', 'false');
    await expectRenderedScreenshot(page.getByTestId('viewport-container'), 3000);

    await expectNoHorizontalOverflow(page);
    await expectNoCriticalBrowserErrors(page);
  });

  test('narrow quad pane labels stay clear of display overlay controls', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByTestId('model-file-input').setInputFiles(SAMPLE_SMF);

    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/Loaded|bones|clips/i);
    await pausePlaybackIfRunning(page);

    await page.getByTestId('viewport-layout-quad').click();
    await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-viewport-layout', 'quad');
    await expect(page.getByTestId('quad-pane-overlay')).toBeVisible();

    await page.getByTestId('viewport-display-menu-button').click();
    await expect(page.getByTestId('viewport-display-menu-panel')).toBeVisible();

    await expectQuadLabelsClearOfOverlays(page);
    await expectRenderedScreenshot(page.getByTestId('viewport-container'), 2200);
    await expectNoHorizontalOverflow(page);
    await expectNoCriticalBrowserErrors(page);
  });
});
