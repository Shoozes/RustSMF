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

  test('loaded SMF visual state keeps viewport, timeline, and skeleton panels coherent', async ({ page }) => {
    test.skip(!SAMPLE_SMF, 'No .smf test model available for loaded visual confirmation');

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.getByTestId('model-file-input').setInputFiles(SAMPLE_SMF!);

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

  test('loaded Display menu and single Ortho view stay visually coherent', async ({ page }) => {
    test.skip(!SAMPLE_SMF, 'No .smf test model available for loaded viewport controls confirmation');

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.getByTestId('model-file-input').setInputFiles(SAMPLE_SMF!);

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
    test.skip(!SAMPLE_SMF, 'No .smf test model available for narrow quad overlay confirmation');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByTestId('model-file-input').setInputFiles(SAMPLE_SMF!);

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
