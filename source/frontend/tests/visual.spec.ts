import { selectWorkspace, showModernPanel } from './helpers/modern-shell';
import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  SAMPLE_SMF,
  expectRenderedScreenshot,
  getBrowserErrors,
  pausePlaybackIfRunning,
  setupBrowserDiagnostics,
} from './helpers/smoke-helpers';
import { dragRigIkTarget } from './helpers/viewport-interactions';

const MODERN_MODES = ['view', 'rig', 'skin', 'animate', 'export'] as const;

type ViewportCase = {
  name: string;
  width: number;
  height: number;
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
  { name: 'full-hd', width: 1920, height: 1080 },
  { name: 'scaled-desktop', width: 1440, height: 900 },
  { name: 'compact-desktop', width: 1280, height: 800 },
  { name: 'small-desktop', width: 1024, height: 768 },
  { name: 'portrait-desktop', width: 800, height: 900 },
  { name: 'narrow', width: 390, height: 844 },
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
  const metrics = await page.evaluate(() => {
    const scoped = document.querySelector('[data-shell-variant="modern"]')
      ? ['.toolbar', '.modern-appbar', '.mode-tablist']
      .map((selector) => document.querySelector<HTMLElement>(selector))
      .filter((element): element is HTMLElement => element !== null)
      .filter(element => element.checkVisibility())
      .map((element) => ({
        className: element.className,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }))
      : [];
    const overlay = document.querySelector<HTMLElement>('.viewport-controls-overlay')?.getBoundingClientRect();
    return {
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      viewport: window.innerWidth,
      scoped,
      overlay: overlay ? { left: overlay.left, right: overlay.right } : null,
    };
  });
  expect(Math.max(metrics.doc, metrics.body)).toBeLessThanOrEqual(metrics.viewport + 2);
  for (const region of metrics.scoped) {
    expect(region.scrollWidth, region.className).toBeLessThanOrEqual(region.clientWidth + 2);
  }
  if (metrics.overlay) {
    expect(metrics.overlay.left).toBeGreaterThanOrEqual(-2);
    expect(metrics.overlay.right).toBeLessThanOrEqual(metrics.viewport + 2);
  }
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
    test(`app shell renders primary surfaces without overflow (${viewport.name})`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');

      await expect(page).toHaveTitle(/RustSMF/i);
      await expect(page.getByTestId('status-text')).toContainText('Ready');
      await expect(page.getByTestId('app-shell')).toHaveAttribute('data-ui-theme', 'lumen-alloy');
      await expect(page.getByTestId('open-model-btn')).toBeVisible();
      await expect(page.getByTestId('export-btn')).toBeVisible();
      const appbar = page.locator('.modern-appbar');
      const appbarRect = await getRequiredRect(appbar);
      const workspace = page.getByTestId('modern-workspace-button');
      const workspaceRect = await getRequiredRect(workspace);
      expect(workspaceRect.top).toBeGreaterThanOrEqual(appbarRect.top);
      expect(workspaceRect.bottom).toBeLessThanOrEqual(appbarRect.bottom + 1);
      expect((await getRequiredRect(page.locator('.modern-toolbar'))).height).toBeLessThanOrEqual(48);
      await workspace.click();
      for (const mode of MODERN_MODES) {
        await expect(page.getByTestId(`mode-tab-${mode}`)).toBeVisible();
      }
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press('Escape');
      await expect(workspace).toBeFocused();
      await expect(page.getByTestId('mode-tab-rig')).toBeHidden();
      for (const commandId of ['open-model-btn', 'save-project-btn', 'editor-undo-btn', 'editor-redo-btn', 'export-btn']) {
        const command = page.getByTestId(commandId);
        if (viewport.width <= 720 && commandId === 'editor-redo-btn') {
          await expect(command).toBeHidden();
          continue;
        }
        await expect(command, commandId).toBeVisible();
        const rect = await getRequiredRect(command);
        expect(rect.left).toBeGreaterThanOrEqual(appbarRect.left - 1);
        expect(rect.right).toBeLessThanOrEqual(appbarRect.right + 1);
      }
      const viewportControls = page.getByTestId('viewport-controls-overlay');
      await expect(viewportControls).toBeVisible();
      expect(await viewportControls.evaluate((element) => element.closest('.viewport-container') !== null)).toBe(true);
      for (const controlId of ['viewport-layout-single', 'viewport-layout-quad', 'viewport-perspective-toggle', 'viewport-display-menu-button']) {
        await expect(page.getByTestId(controlId), controlId).toBeVisible();
      }
      await expect(page.getByTestId('viewport-container')).toBeVisible();
      await expect(page.getByTestId('three-canvas')).toBeVisible();
      await expect(page.getByTestId('modern-empty-state')).toBeVisible();
      await expect(page.getByTestId('timeline')).toHaveCount(0);
      await expect(page.getByTestId('outliner')).toHaveCount(0);
      await expect(page.getByTestId('inspector')).toHaveCount(0);

      await page.getByTestId('modern-more-menu-button').click();
      await expect(page.getByTestId('export-smf-btn')).toBeVisible();
      await expect(page.getByTestId('open-project-btn')).toBeVisible();
      await expect(page.getByTestId('recover-project-btn')).toBeVisible();
      await expect(page.getByTestId('export-dae-btn')).toBeVisible();
      await expect(page.getByTestId('ping-rust-btn')).toBeVisible();
      await page.getByTestId('modern-more-menu-button').click();

      await page.getByTestId('viewport-display-menu-button').click();
      await expect(page.getByTestId('viewport-display-menu-panel')).toBeVisible();
      await expect(page.getByTestId('viewport-wireframe-toggle')).toBeVisible();
      await page.getByTestId('viewport-display-menu-button').click();

      const status = await getRequiredRect(page.getByTestId('status-text'));
      expect(status.height).toBeLessThanOrEqual(28);
      await expect(page.getByTestId('status-text')).toHaveCSS('white-space', 'nowrap');

      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`modern-shell-${viewport.name}.png`),
        fullPage: true,
      });
      // Empty-shell captures establish layout; loaded-scene checks require canvas pixels.
      await expectNoCriticalBrowserErrors(page);
    });
  }

  test('Original SMF theme restores the compact tool-shelf layout and persists', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    const appShell = page.getByTestId('app-shell');
    await expect(appShell).toHaveAttribute('data-theme', 'modern');
    await page.getByTestId('modern-more-menu-button').click();
    const themeSelect = page.getByTestId('theme-select');
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

    await selectWorkspace(page, 'animate');
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
    await expectRenderedScreenshot(appShell, 5000, { strict: true, name: 'original-smf-theme' });
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

  test('loaded SMF visual state keeps one supporting panel and an Animate-only timeline', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.getByTestId('model-file-input').setInputFiles(SAMPLE_SMF);

    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/Loaded|bones|clips/i);
    await expect(page.getByTestId('modern-support-panel')).toHaveCount(0);
    await showModernPanel(page, 'scene');
    await expect(page.getByTestId('outliner')).toContainText(/Scene Root|Bone|Mesh/i);
    await expect(page.getByTestId('inspector')).toHaveCount(0);
    await expect(page.getByTestId('timeline')).toHaveCount(0);

    await page.getByTestId('modern-panel-properties').click();
    await expect(page.getByTestId('inspector')).toContainText(/Bones \(\d+\)/i);
    await expect(page.getByTestId('outliner')).toHaveCount(0);
    await selectWorkspace(page, 'animate');
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
    await selectWorkspace(page, 'rig');

    const childBone = page.getByTestId('inspector').locator('li li > div').filter({ hasText: /SMF_Node_\d+/ }).first();
    await expect(childBone).toBeVisible({ timeout: 8000 });
    await childBone.click({ force: true });
    await page.getByTestId('rig-tool-ik').click();
    await page.getByTestId('rig-ik-chain-length').selectOption('1');
    await expect(page.getByTestId('rig-ik-settings')).toBeVisible();

    expect(await dragRigIkTarget(page)).toBe(true);
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
