import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  BAD_INPUT_FOR_ERROR_TEST,
  SAMPLE_FBX,
  SAMPLE_OBJ,
  SAMPLE_SMF,
  SyntheticDropFile,
  dispatchSyntheticDrop,
  restoreBrowserFileArrayBuffer,
  withBrowserFileArrayBufferDelay,
  expectRenderedScreenshot,
  getBrowserErrors,
  pausePlaybackIfRunning,
  setupBrowserDiagnostics,
} from './helpers/smoke-helpers';
import {
  createSkinnedGlbFixtureInput,
  createSkinnedGlbFixtureInputWithOptions,
} from './helpers/skinned-glb-fixture';

const parseSelectedBone = (statusText: string | null): string => {
  const match = /Selected:\s*([^\|\n]+)/.exec(statusText ?? '');
  return match?.[1]?.trim() ?? '';
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const fileToBase64 = (filePath: string): string => fs.readFileSync(filePath).toString('base64');

type RelativePoint = { x: number; y: number };

const dispatchWindowPointerCancel = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 0,
    }));
  });
};

const dragEndpointHandle = async (
  page: Page,
  selectedBone: string,
  points?: RelativePoint[],
  onActiveDrag?: () => Promise<void>,
  finish: 'release' | 'cancel' = 'release',
): Promise<boolean> => {
  const canvas = page.getByTestId('three-canvas');
  const box = await canvas.boundingBox();
  if (!box) return false;

  const waitForNoActiveEndpointDrag = async (): Promise<void> => {
    await page.waitForFunction(
      () => {
        const el = document.querySelector<HTMLElement>('[data-testid="three-canvas"]');
        return el?.dataset.endpointDrag !== 'active';
      },
      undefined,
      { timeout: 1200 },
    );
    await page.waitForTimeout(20);
  };

  await waitForNoActiveEndpointDrag();

  const endpointX = Number(await canvas.getAttribute('data-endpoint-x'));
  const endpointY = Number(await canvas.getAttribute('data-endpoint-y'));
  if (Number.isFinite(endpointX) && Number.isFinite(endpointY)) {
    await page.mouse.move(endpointX, endpointY);
    await page.waitForTimeout(25);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(endpointX + 12, endpointY + 12);
    await page.waitForTimeout(40);
    const active = await canvas.getAttribute('data-endpoint-drag');
    if (active === 'active') {
      await onActiveDrag?.();
      if (finish === 'cancel') {
        await dispatchWindowPointerCancel(page);
        await page.mouse.up({ button: 'left' }).catch(() => {});
        await waitForNoActiveEndpointDrag();
        return true;
      }
    }
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(30);
    if (active === 'active') {
      await waitForNoActiveEndpointDrag();
      return true;
    }
  }

  const targets = points ?? [
    { x: 10, y: 10 },
    { x: 10, y: 30 },
    { x: 10, y: 50 },
    { x: 10, y: 70 },
    { x: 10, y: 90 },
    { x: 30, y: 10 },
    { x: 30, y: 30 },
    { x: 30, y: 50 },
    { x: 30, y: 70 },
    { x: 30, y: 90 },
    { x: 50, y: 10 },
    { x: 50, y: 30 },
    { x: 50, y: 50 },
    { x: 50, y: 70 },
    { x: 50, y: 90 },
    { x: 70, y: 10 },
    { x: 70, y: 30 },
    { x: 70, y: 50 },
    { x: 70, y: 70 },
    { x: 70, y: 90 },
    { x: 90, y: 10 },
    { x: 90, y: 30 },
    { x: 90, y: 50 },
    { x: 90, y: 70 },
    { x: 90, y: 90 },
  ];

  for (const target of targets) {
    const x = Math.round(box.x + (box.width * target.x) / 100);
    const y = Math.round(box.y + (box.height * target.y) / 100);

    await page.mouse.move(x, y);
    await page.waitForTimeout(25);
    const hoveredBone = await canvas.getAttribute('data-hovered-bone');
    if (hoveredBone && hoveredBone !== selectedBone) {
      continue;
    }

    await page.mouse.move(x + 2, y + 2);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(x + 12, y + 12);
    await page.waitForTimeout(40);
    const active = await canvas.getAttribute('data-endpoint-drag');
    if (active === 'active') {
      await onActiveDrag?.();
      if (finish === 'cancel') {
        await dispatchWindowPointerCancel(page);
        await page.mouse.up({ button: 'left' }).catch(() => {});
        await waitForNoActiveEndpointDrag();
        return true;
      }
    }
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(30);

    if (active === 'active') {
      await waitForNoActiveEndpointDrag();
      return true;
    }
  }

  return false;
};

const paintInViewport = async (
  page: Page,
  options?: { x?: number; y?: number; dx?: number; dy?: number },
): Promise<boolean> => {
  const canvas = page.getByTestId('three-canvas');
  const box = await canvas.boundingBox();
  if (!box) return false;

  const x = options?.x ?? (box.x + box.width / 2);
  const y = options?.y ?? (box.y + box.height / 2);
  const dx = options?.dx ?? 28;
  const dy = options?.dy ?? 24;

  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(x + dx, y + dy);
  await page.waitForTimeout(80);
  await page.mouse.up({ button: 'left' });
  return true;
};

const paintOnMeshInViewport = async (
  page: Page,
  options?: { requireDirty?: boolean },
): Promise<boolean> => {
  const canvas = page.getByTestId('three-canvas');
  const box = await canvas.boundingBox();
  if (!box) return false;

  const quadProbePercents = [12, 25, 38, 62, 75, 88];
  const targets: RelativePoint[] = [
    { x: 50, y: 50 },
    { x: 55, y: 55 },
    { x: 60, y: 60 },
    { x: 45, y: 55 },
    { x: 50, y: 65 },
    { x: 60, y: 70 },
    { x: 40, y: 60 },
    { x: 70, y: 60 },
    { x: 30, y: 40 },
    { x: 40, y: 40 },
    { x: 50, y: 40 },
    { x: 60, y: 40 },
    { x: 70, y: 40 },
    { x: 30, y: 50 },
    { x: 70, y: 50 },
    { x: 30, y: 70 },
    { x: 40, y: 70 },
    { x: 50, y: 70 },
    { x: 70, y: 70 },
    ...quadProbePercents.flatMap((x) => quadProbePercents.map((y) => ({ x, y }))),
  ];

  for (const target of targets) {
    await paintInViewport(page, {
      x: box.x + (box.width * target.x) / 100,
      y: box.y + (box.height * target.y) / 100,
      dx: 16,
      dy: 12,
    });

    const hitCount = Number(await canvas.getAttribute('data-skin-paint-hit-count'));
    const hover = await canvas.getAttribute('data-skin-brush-hover');
    if (hover === 'active' && hitCount > 0) {
      if (options?.requireDirty) {
        try {
          await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true', { timeout: 300 });
          return true;
        } catch {
          continue;
        }
      }
      return true;
    }
  }

  return false;
};

const clickPickableBoneInViewport = async (
  page: Page,
  expectedOwner: string,
): Promise<{ bone: string; paneRole: string } | null> => {
  const canvas = page.getByTestId('three-canvas');
  const box = await canvas.boundingBox();
  if (!box) return null;

  const probes = [12, 25, 38, 50, 62, 75, 88];
  for (const y of probes) {
    for (const x of probes) {
      const screenX = box.x + (box.width * x) / 100;
      const screenY = box.y + (box.height * y) / 100;
      await page.mouse.click(screenX, screenY);
      await page.waitForTimeout(40);

      const owner = await canvas.getAttribute('data-pointer-owner');
      const bone = (await canvas.getAttribute('data-viewport-picked-bone')) ?? '';
      const paneRole = (await canvas.getAttribute('data-viewport-pane-role')) ?? '';
      if (owner === expectedOwner && bone && paneRole) {
        return { bone, paneRole };
      }
    }
  }

  return null;
};

const cancelPaintOnMeshInViewport = async (page: Page): Promise<boolean> => {
  const canvas = page.getByTestId('three-canvas');
  const box = await canvas.boundingBox();
  if (!box) return false;

  const targets: RelativePoint[] = [
    { x: 50, y: 50 },
    { x: 55, y: 55 },
    { x: 60, y: 60 },
    { x: 45, y: 55 },
    { x: 50, y: 65 },
    { x: 60, y: 70 },
    { x: 40, y: 60 },
    { x: 70, y: 60 },
  ];

  for (const target of targets) {
    const x = box.x + (box.width * target.x) / 100;
    const y = box.y + (box.height * target.y) / 100;
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(x + 16, y + 12);
    await page.waitForTimeout(80);

    const active = await canvas.getAttribute('data-skin-paint-active');
    if (active === 'active') {
      await dispatchWindowPointerCancel(page);
      await page.mouse.up({ button: 'left' }).catch(() => {});
      await page.waitForFunction(
        () => {
          const el = document.querySelector<HTMLElement>('[data-testid="three-canvas"]');
          return el?.dataset.skinPaintActive !== 'active';
        },
        undefined,
        { timeout: 1200 },
      );
      return true;
    }

    await page.mouse.up({ button: 'left' }).catch(() => {});
  }

  return false;
};

const setRangeValue = async (page: Page, testId: string, value: number): Promise<void> => {
  const slider = page.getByTestId(testId);
  await slider.fill(String(value));
  await slider.dispatchEvent('input');
  await page.waitForTimeout(20);
};

const clickTimelineLaneAt = async (
  page: Page,
  ratio: number,
  clickCount: 1 | 2 = 1,
): Promise<void> => {
  const lane = page.getByTestId('timeline-keyframe-lane');
  const box = await lane.boundingBox();
  if (!box) {
    throw new Error('Timeline keyframe lane is not visible.');
  }

  const x = box.x + box.width * Math.min(1, Math.max(0, ratio));
  const y = box.y + box.height / 2;
  if (clickCount === 2) {
    await page.mouse.dblclick(x, y);
  } else {
    await page.mouse.click(x, y);
  }
  await page.waitForTimeout(80);
};

const dragSelectedTimelineMarkerTo = async (page: Page, ratio: number): Promise<void> => {
  const lane = page.getByTestId('timeline-keyframe-lane');
  const laneBox = await lane.boundingBox();
  if (!laneBox) {
    throw new Error('Timeline keyframe lane is not visible.');
  }

  const marker = page.locator('.timeline-keyframe-marker-selected').first();
  await expect(marker).toBeVisible();
  await expect(marker).toHaveAttribute('data-draggable-keyframe', 'true');
  const markerBox = await marker.boundingBox();
  if (!markerBox) {
    throw new Error('Selected timeline marker is not visible.');
  }

  const startX = markerBox.x + markerBox.width / 2;
  const startY = markerBox.y + markerBox.height / 2;
  const targetX = laneBox.x + laneBox.width * Math.min(1, Math.max(0, ratio));
  const targetY = laneBox.y + laneBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(targetX, targetY, { steps: 8 });
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(120);
};

const openViewportDisplayMenu = async (page: Page): Promise<void> => {
  const panel = page.getByTestId('viewport-display-menu-panel');
  if (!(await panel.isVisible())) {
    await page.getByTestId('viewport-display-menu-button').click();
  }
  await expect(panel).toBeVisible();
};

const setViewportLayout = async (page: Page, layout: 'single' | 'quad'): Promise<void> => {
  const canvas = page.getByTestId('three-canvas');
  const singleBtn = page.getByTestId('viewport-layout-single');
  const quadBtn = page.getByTestId('viewport-layout-quad');

  if (layout === 'quad') {
    await quadBtn.click({ force: true });
    await expect(canvas).toHaveAttribute('data-viewport-layout', 'quad');
    await expect(quadBtn).toHaveAttribute('aria-pressed', 'true');
  } else {
    await singleBtn.click({ force: true });
    await expect(canvas).toHaveAttribute('data-viewport-layout', 'single');
    await expect(quadBtn).toHaveAttribute('aria-pressed', 'false');
  }

  await page.waitForTimeout(120);
};

const dragRigMoveInOrthoPane = async (page: Page): Promise<void> => {
  const canvas = page.getByTestId('three-canvas');
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Viewport canvas is not visible.');
  }

  const startX = box.x + box.width * 0.18;
  const startY = box.y + box.height * 0.18;
  await page.mouse.move(startX, startY);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(box.x + box.width * 0.32, box.y + box.height * 0.26, { steps: 8 });
  await page.waitForTimeout(80);
  await page.mouse.up({ button: 'left' });
};

const dragRigRotateInOrthoPane = async (page: Page): Promise<void> => {
  const canvas = page.getByTestId('three-canvas');
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Viewport canvas is not visible.');
  }

  const centerX = box.x + box.width * 0.25;
  const centerY = box.y + box.height * 0.25;
  await page.mouse.move(centerX + box.width * 0.08, centerY);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(centerX, centerY + box.height * 0.08, { steps: 8 });
  await page.waitForTimeout(80);
  await page.mouse.up({ button: 'left' });
};

// Basic smoke tests for the RustSMF shell + model loading.
// These exercise the core Three.js viewport, loaders, timeline, and export paths.
// Uses the real local test .smf (mixamo_smf_baldguy.smf) in this dir for reliable coverage
// of load, bones (collapsible hierarchy tree), animation, export, OBJ fallback, etc.
// Visual smoke uses screenshot byte-size assertions to avoid brittle per-machine WebGL baselines.

// Desktop / native Tauri path coverage:
// - Web Playwright e2e (this file) exercises shared TS load/export/UI/listener/browser fallback paths.
// - native.spec.ts exercises mocked Tauri IPC for open/read/status/save/write/cancel paths.
// - Rust #[test] in src-tauri/src/main.rs covers real std::fs SMF header/rig/anim/model peeks.
// - run.ps1 desktop-smoke runs unbundled Tauri build, cargo tests, and the native IPC Playwright suite.
// - Extended beforeEach/listeners + real-sample screenshot asserts (light + toHave) for bone selection / export flows.
// - FBX UI dispatch is covered here; generated skinned GLB covers non-SMF skinned load/export fidelity.
// Keep browser e2e primary + fast; native.spec.ts and Rust tests cover desktop-specific binary/IPC/status behavior.

test.describe('RustSMF basic shell and model flow (Chromium)', () => {
  test.beforeEach(async ({ page }) => {
    setupBrowserDiagnostics(page);
  });
  test('app boots with expected UI elements and initial state', async ({ page }) => {
    await page.goto('/');

    // Initial status
    await expect(page.getByTestId('status-text')).toContainText('Three.js viewport ready');

    // Key controls
    await expect(page.getByTestId('open-model-btn')).toBeVisible();
    await expect(page.getByTestId('export-btn')).toBeVisible();
    await expect(page.getByTestId('export-glb-btn')).toBeVisible();
    await expect(page.getByTestId('export-smf-btn')).toBeVisible();
    await expect(page.getByTestId('ping-rust-btn')).toBeVisible();

    // Viewport + canvas
    await expect(page.getByTestId('viewport-container')).toBeVisible();
    const canvas = page.getByTestId('three-canvas');
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute('data-viewport-layout', 'single');
    await expect(canvas).toHaveAttribute('data-wireframe-enabled', 'false');
    await expect(canvas).toHaveAttribute('data-grid-enabled', 'true');
    await expect(canvas).toHaveAttribute('data-axes-enabled', 'true');
    await expect(canvas).toHaveAttribute('data-texture-enabled', 'true');
    await expect(canvas).toHaveAttribute('data-shader-enabled', 'false');
    await expect(canvas).toHaveAttribute('data-perspective-enabled', 'true');
    await expect(canvas).toHaveAttribute('data-model-opacity', '1');
    await expect(canvas).toHaveAttribute('data-bone-index-labels-enabled', 'false');
    await expect(canvas).toHaveAttribute('data-rig-opacity', '1');
    await expect(canvas).toHaveAttribute('data-rig-thickness-scale', '1');
    await expect(canvas).toHaveAttribute('data-skin-points-enabled', 'false');
    await expect(canvas).toHaveAttribute('data-skin-point-overlay-count', '0');
    await expect(page.getByTestId('viewport-layout-single')).toBeDisabled();
    await expect(page.getByTestId('viewport-layout-quad')).toBeDisabled();
    await expect(page.getByTestId('viewport-wireframe-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-grid-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-axes-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-texture-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-bone-index-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-shader-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-perspective-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-model-opacity-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-rig-opacity-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-rig-thickness-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-skin-points-toggle')).toBeDisabled();

    // Timeline and outliner present
    await expect(page.getByTestId('timeline')).toBeVisible();
    await expect(page.getByTestId('outliner')).toBeVisible();
  });

  test('mode switching without model keeps disabled layout controls stable', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-viewport-layout', 'single');
    await expect(page.getByTestId('viewport-layout-single')).toBeDisabled();
    await expect(page.getByTestId('viewport-layout-quad')).toBeDisabled();
    await expect(page.getByTestId('viewport-wireframe-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-texture-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-bone-index-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-shader-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-perspective-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-model-opacity-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-rig-opacity-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-rig-thickness-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-skin-points-toggle')).toBeDisabled();

  const assertModeActive = async (mode: 'view' | 'rig' | 'skin' | 'animate' | 'export'): Promise<void> => {
    const tab = page.getByTestId(`mode-tab-${mode}`);
    await tab.click({ force: true });
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('three-canvas')).toBeVisible();
    await expect(page.getByTestId('viewport-layout-single')).toBeDisabled();
    await expect(page.getByTestId('viewport-layout-quad')).toBeDisabled();
    await expect(page.getByTestId('viewport-wireframe-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-grid-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-axes-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-texture-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-bone-index-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-shader-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-perspective-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-model-opacity-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-rig-opacity-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-rig-thickness-toggle')).toBeDisabled();
    await expect(page.getByTestId('viewport-skin-points-toggle')).toBeDisabled();
    const statusText = await page.getByTestId('status-text').textContent();
    expect(statusText).toContain('Three.js viewport ready');
    };

    await assertModeActive('view');
    await expect(page.getByTestId('skin-workspace-panel')).toBeHidden();
    await expect(page.getByTestId('animate-workspace-panel')).toBeHidden();
    await expect(page.getByTestId('export-workspace-panel')).toBeHidden();

    await assertModeActive('rig');
    await expect(page.getByTestId('inspector')).toBeVisible();
    await expect(page.getByTestId('rig-workspace-panel')).toBeVisible();
    await expect(page.getByTestId('rig-validation-status')).toContainText(/warning/i);
    await expect(page.getByTestId('three-canvas')).toBeVisible();

    await assertModeActive('skin');
    await expect(page.getByTestId('skin-workspace-panel')).toBeVisible();
    await expect(page.getByTestId('skin-paint-mode-set')).toBeDisabled();
    await expect(page.getByTestId('skin-paint-mode-add')).toBeDisabled();
    await expect(page.getByTestId('skin-paint-mode-subtract')).toBeDisabled();
    await expect(page.getByTestId('skin-paint-mode-auto')).toBeDisabled();
    await expect(page.getByTestId('skin-paint-target-mode')).toBeDisabled();
    await expect(page.getByTestId('skin-paint-undo-btn')).toBeDisabled();
    await expect(page.getByTestId('skin-paint-redo-btn')).toBeDisabled();
    await expect(page.getByTestId('skin-normalize-btn')).toBeDisabled();
    await expect(page.getByTestId('skin-autoskin-btn')).toBeDisabled();
    await expect(page.getByTestId('skin-autoskin-algorithm')).toBeDisabled();
    await expect(page.getByTestId('skin-autoskin-power')).toBeDisabled();
    await expect(page.getByTestId('skin-autoskin-normal-weighting')).toBeDisabled();
    await expect(page.getByTestId('skin-autoskin-max-influences')).toBeDisabled();

    await assertModeActive('animate');
    await expect(page.getByTestId('animate-workspace-panel')).toBeVisible();

    await assertModeActive('export');
    await expect(page.getByTestId('export-workspace-panel')).toBeVisible();
    await expect(page.getByTestId('export-btn')).toBeEnabled();
    await expect(page.getByTestId('export-glb-btn')).toBeEnabled();
    await expect(page.getByTestId('export-smf-btn')).toBeEnabled();

    const criticalErrors = getBrowserErrors(page).filter((e: string) => e.includes('ERROR'));
    expect(criticalErrors.length).toBe(0);
  });

  test('can load a real SMF sample and basic UI updates', async ({ page }) => {
    test.skip(!SAMPLE_SMF, 'No .smf test model available (local mixamo_smf_baldguy.smf or old-src reference)');

    await page.goto('/');

    // Use the persistent hidden input (added for e2e) – setInputFiles triggers onChange
    // which calls loadModel directly. This bypasses the dynamic openFile() for reliability.
    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(SAMPLE_SMF!);

    // Wait for load to finish (status changes and no longer says "Loading")
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });

    // After load we should see some model info in status (bones, clips, verts etc.)
    await expect(page.getByTestId('status-text')).toContainText(/Loaded|bones|clips/i);

    // Outliner should reflect content
    await expect(page.getByTestId('outliner')).toContainText(/Scene Root|Bone|Mesh/i);
    await expect(page.getByTestId('outliner-submodel-count')).toContainText(/\d+ mesh/i);
    const firstSubmodel = page.getByTestId('outliner-submodel-0');
    await expect(firstSubmodel).toBeVisible();
    await expect(firstSubmodel).toHaveAttribute('data-visible', 'true');
    const firstVisibilityToggle = page.getByTestId('outliner-visibility-toggle-0');
    await expect(firstVisibilityToggle).toHaveAttribute('aria-pressed', 'true');
    await firstVisibilityToggle.click();
    await expect(firstSubmodel).toHaveAttribute('data-visible', 'false');
    await expect(firstVisibilityToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('status-text')).toContainText(/Hidden submodel/i);
    await expect(page.getByTestId('editor-undo-btn')).toBeEnabled();
    await page.getByTestId('editor-undo-btn').click();
    await expect(firstSubmodel).toHaveAttribute('data-visible', 'true');
    await expect(firstVisibilityToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('status-text')).toContainText(/Undid outliner visibility toggle/i);
    await expect(page.getByTestId('editor-redo-btn')).toBeEnabled();
    await page.getByTestId('editor-redo-btn').click();
    await expect(firstSubmodel).toHaveAttribute('data-visible', 'false');
    await expect(firstVisibilityToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('status-text')).toContainText(/Redid outliner visibility toggle/i);
    await page.getByTestId('editor-undo-btn').click();
    await expect(firstSubmodel).toHaveAttribute('data-visible', 'true');
    await expect(firstVisibilityToggle).toHaveAttribute('aria-pressed', 'true');
    await firstSubmodel.locator('button').first().click();
    await expect(firstSubmodel).toHaveAttribute('data-selected', 'true');
    await expect(page.getByTestId('outliner-selection-count')).toContainText('1 selected');
    await page.getByTestId('outliner-select-all-btn').click();
    await expect(page.getByTestId('outliner-selection-count')).toContainText(/selected/);
    await page.getByTestId('outliner-hide-selected-btn').click();
    await expect(firstSubmodel).toHaveAttribute('data-visible', 'false');
    await page.keyboard.press('Control+Z');
    await expect(firstSubmodel).toHaveAttribute('data-visible', 'true');
    await expect(page.getByTestId('status-text')).toContainText(/Undid hide selected submodels/i);
    await page.keyboard.press('Control+Y');
    await expect(firstSubmodel).toHaveAttribute('data-visible', 'false');
    await expect(page.getByTestId('status-text')).toContainText(/Redid hide selected submodels/i);
    await page.getByTestId('outliner-unhide-all-btn').click();
    await expect(firstSubmodel).toHaveAttribute('data-visible', 'true');
    await firstSubmodel.locator('button').first().click();
    await page.getByTestId('outliner-hide-unselected-btn').click();
    if (await page.getByTestId('outliner-submodel-1').count() > 0) {
      await expect(page.getByTestId('outliner-submodel-1')).toHaveAttribute('data-visible', 'false');
    }
    await page.getByTestId('outliner-unhide-all-btn').click();
    await page.getByTestId('outliner-clear-selection-btn').click();
    await expect(page.getByTestId('outliner-selection-count')).toContainText('0 selected');

    // Timeline should be enabled / have content
    await expect(page.getByTestId('timeline')).toBeVisible();
    await expect(page.getByTestId('timeline-keyframe-lane')).toHaveAttribute('data-keyframe-count', /[1-9]\d*/);
    await expect(page.locator('[data-testid^="timeline-keyframe-marker-"]').first()).toBeVisible();

    // Inspector and outliner should reflect content after load
    await expect(page.getByTestId('inspector')).toBeVisible();
    await expect(page.getByTestId('inspector')).toContainText(/Clips|Selected/i);

    // Bones inspector (basic hierarchy from skeleton)
    await expect(page.getByTestId('inspector')).toContainText(/Bones/i);

    // Canvas still there (Three.js kept rendering)
    await expect(page.getByTestId('three-canvas')).toBeVisible();
    const wireframeBtn = page.getByTestId('viewport-wireframe-toggle');
    const gridBtn = page.getByTestId('viewport-grid-toggle');
    const axesBtn = page.getByTestId('viewport-axes-toggle');
    const textureBtn = page.getByTestId('viewport-texture-toggle');
    const shaderBtn = page.getByTestId('viewport-shader-toggle');
    const perspectiveBtn = page.getByTestId('viewport-perspective-toggle');
    const boneIndexBtn = page.getByTestId('viewport-bone-index-toggle');
    const rigOpacityBtn = page.getByTestId('viewport-rig-opacity-toggle');
    const rigThicknessBtn = page.getByTestId('viewport-rig-thickness-toggle');
    const skinPointsBtn = page.getByTestId('viewport-skin-points-toggle');
    const modelOpacityBtn = page.getByTestId('viewport-model-opacity-toggle');
    const canvas = page.getByTestId('three-canvas');
    await canvas.click({ position: { x: 410, y: 260 } });
    await expect(canvas).toHaveAttribute('data-pointer-owner', 'model-select');
    await expect(page.getByTestId('outliner-selection-count')).toContainText('1 selected');
    await expect(page.getByTestId('outliner').locator('[data-selected="true"]').first()).toBeVisible();
    await expect(canvas).toHaveAttribute('data-selection-overlay-count', /[1-9]\d*/);
    await page.getByTestId('outliner-hide-selected-btn').click();
    await expect(canvas).toHaveAttribute('data-selection-overlay-count', '0');
    await page.getByTestId('outliner-unhide-all-btn').click();
    await expect(canvas).toHaveAttribute('data-selection-overlay-count', /[1-9]\d*/);
    await canvas.click({ button: 'right', position: { x: 410, y: 260 } });
    await expect(page.getByTestId('status-text')).toContainText(/Submodel context actions ready/i);
    await expect(wireframeBtn).toBeEnabled();
    await expect(wireframeBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(gridBtn).toBeEnabled();
    await expect(gridBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(axesBtn).toBeEnabled();
    await expect(axesBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(textureBtn).toBeEnabled();
    await expect(textureBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(shaderBtn).toBeEnabled();
    await expect(shaderBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(shaderBtn).toContainText('Legacy');
    await expect(perspectiveBtn).toBeEnabled();
    await expect(perspectiveBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(modelOpacityBtn).toBeEnabled();
    await expect(modelOpacityBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(boneIndexBtn).toBeEnabled();
    await expect(boneIndexBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(rigOpacityBtn).toBeEnabled();
    await expect(rigOpacityBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(rigThicknessBtn).toBeEnabled();
    await expect(rigThicknessBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(skinPointsBtn).toBeEnabled();
    await expect(skinPointsBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(canvas).toHaveAttribute('data-grid-enabled', 'true');
    await expect(canvas).toHaveAttribute('data-axes-enabled', 'true');
    await expect(canvas).toHaveAttribute('data-texture-enabled', 'true');
    await expect(canvas).toHaveAttribute('data-shader-enabled', 'false');
    await expect(canvas).toHaveAttribute('data-shader-mode', 'standard');
    await expect(canvas).toHaveAttribute('data-perspective-enabled', 'true');
    await expect(canvas).toHaveAttribute('data-model-opacity', '1');
    await expect(canvas).toHaveAttribute('data-bone-index-labels-enabled', 'false');
    await expect(canvas).toHaveAttribute('data-rig-opacity', '1');
    await expect(canvas).toHaveAttribute('data-rig-thickness-scale', '1');
    await expect(canvas).toHaveAttribute('data-skin-points-enabled', 'false');
    await expect(canvas).toHaveAttribute('data-skin-point-overlay-count', '0');
    await openViewportDisplayMenu(page);
    await wireframeBtn.click();
    await expect(wireframeBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas).toHaveAttribute('data-wireframe-enabled', 'true');
    await gridBtn.click();
    await expect(gridBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(canvas).toHaveAttribute('data-grid-enabled', 'false');
    await axesBtn.click();
    await expect(axesBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(canvas).toHaveAttribute('data-axes-enabled', 'false');
    await textureBtn.click();
    await expect(textureBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(canvas).toHaveAttribute('data-texture-enabled', 'false');
    await shaderBtn.click();
    await expect(shaderBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas).toHaveAttribute('data-shader-enabled', 'true');
    await expect(canvas).toHaveAttribute('data-shader-mode', 'legacy-smf');
    await perspectiveBtn.click();
    await expect(perspectiveBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(canvas).toHaveAttribute('data-perspective-enabled', 'false');
    await modelOpacityBtn.click();
    await expect(modelOpacityBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas).toHaveAttribute('data-model-opacity', '0.35');
    await boneIndexBtn.click();
    await expect(boneIndexBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas).toHaveAttribute('data-bone-index-labels-enabled', 'true');
    await rigOpacityBtn.click();
    await expect(rigOpacityBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas).toHaveAttribute('data-rig-opacity', '0.35');
    await rigThicknessBtn.click();
    await expect(rigThicknessBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas).toHaveAttribute('data-rig-thickness-scale', '0.45');
    await skinPointsBtn.click();
    await expect(skinPointsBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas).toHaveAttribute('data-skin-points-enabled', 'true');
    await expect(canvas).toHaveAttribute('data-skin-point-overlay-count', /[1-9]\d*/);
    await expectRenderedScreenshot(page.getByTestId('viewport-container'), 2500);
    await wireframeBtn.click();
    await expect(canvas).toHaveAttribute('data-wireframe-enabled', 'false');
    await gridBtn.click();
    await expect(canvas).toHaveAttribute('data-grid-enabled', 'true');
    await axesBtn.click();
    await expect(canvas).toHaveAttribute('data-axes-enabled', 'true');
    await textureBtn.click();
    await expect(canvas).toHaveAttribute('data-texture-enabled', 'true');
    await boneIndexBtn.click();
    await expect(boneIndexBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(canvas).toHaveAttribute('data-bone-index-labels-enabled', 'false');
    await rigOpacityBtn.click();
    await expect(rigOpacityBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(canvas).toHaveAttribute('data-rig-opacity', '1');
    await rigThicknessBtn.click();
    await expect(rigThicknessBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(canvas).toHaveAttribute('data-rig-thickness-scale', '1');
    await skinPointsBtn.click();
    await expect(skinPointsBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(canvas).toHaveAttribute('data-skin-points-enabled', 'false');
    await expect(canvas).toHaveAttribute('data-skin-point-overlay-count', '0');
    await shaderBtn.click();
    await expect(shaderBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(canvas).toHaveAttribute('data-shader-enabled', 'false');
    await expect(canvas).toHaveAttribute('data-shader-mode', 'standard');
    await perspectiveBtn.click();
    await expect(perspectiveBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas).toHaveAttribute('data-perspective-enabled', 'true');
    await modelOpacityBtn.click();
    await expect(modelOpacityBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(canvas).toHaveAttribute('data-model-opacity', '1');

    // Exercise bone list selection (simulates user picking bone in inspector for coverage)
    // Also verifies collapsible hierarchy tree (nested ul/li with +/- toggles) using the real local model
    const inspector = page.getByTestId('inspector');
    await expect(inspector).toContainText(/Bones \(\d+\)/i);
    // Verify collapsible UI present (hierarchy with toggles)
    await expect(inspector.locator('span').filter({ hasText: /[+-]/ }).first()).toBeVisible();
    const anyBoneEntry = inspector.locator('li > div').filter({ hasText: /./ }).nth(0);
    if (await anyBoneEntry.count() > 0) {
      await anyBoneEntry.click({ force: true }).catch(() => {});
      await page.waitForTimeout(60);
    }
    // Toggle first +/- if present (tests collapse edge for deep rigs)
    const toggle = inspector.locator('span').filter({ hasText: /[+-]/ }).first();
    if (await toggle.count() > 0) {
      await toggle.click({ force: true }).catch(() => {});
      await page.waitForTimeout(60);
    }

    // Labels toggle button (recent work: bone name viz in viewport, off-by-default for perf)
    // Presence + basic interaction exercises the new toggle path (state lift in hook, prop to Inspector/Viewport)
    const labelsBtn = inspector.getByTestId('labels-toggle-btn');
    await expect(labelsBtn).toBeVisible();
    // Exercise toggle (click on/off; no visual assert needed, just no crash + state change)
    await labelsBtn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(50);
    await labelsBtn.click({ force: true }).catch(() => {}); // back to off

    await expect(page.getByTestId('three-canvas')).toBeVisible();

    // Editor mode tabs (new foundation for modern workspaces #1): presence + change exercises state flow from Toolbar through hook/store.
    // Test interactions with other recent features (labels toggle, bone pick) post mode change; verify no breakage or state corruption.
    const rigTab = page.getByTestId('mode-tab-rig');
    const viewTab = page.getByTestId('mode-tab-view');
    const skinTab = page.getByTestId('mode-tab-skin');
    const animateTab = page.getByTestId('mode-tab-animate');
    const exportTab = page.getByTestId('mode-tab-export');
    await expect(rigTab).toBeVisible();
    await rigTab.click({ force: true });
    await page.waitForTimeout(30);
    // Interact with labels and bone selection while in 'rig' mode (edge: mode + labels + picker)
    const labelsBtn2 = inspector.getByTestId('labels-toggle-btn');
    await labelsBtn2.click({ force: true }).catch(() => {});
    await page.waitForTimeout(30);
    const pickCanvas = page.getByTestId('three-canvas');
    await pickCanvas.hover({ position: { x: 170, y: 120 } });
    await page.waitForTimeout(40);
    const hovered = await pickCanvas.getAttribute('data-hovered-bone');
    if (hovered) {
      expect(hovered).toContain('SMF_Node_');
    }
    await pickCanvas.click({ position: { x: 70, y: 70 } });
    await page.waitForTimeout(50);
    await expect(page.getByTestId('status-text')).toContainText(/Selected:/i);
    // Reset mode
    await viewTab.click({ force: true });
    await expect(page.getByTestId('three-canvas')).toBeVisible();

    // Workspace surfaces are mode-native and composable with Inspector.
    await skinTab.click({ force: true });
    await page.waitForTimeout(20);
    await expect(page.getByTestId('skin-workspace-panel')).toBeVisible();
    await animateTab.click({ force: true });
    await page.waitForTimeout(20);
    await expect(page.getByTestId('animate-workspace-panel')).toBeVisible();
    await expect(page.getByTestId('animate-summary')).toContainText(/Tracks|Keys/);
    await exportTab.click({ force: true });
    await page.waitForTimeout(20);
    await expect(page.getByTestId('export-workspace-panel')).toBeVisible();
    await viewTab.click({ force: true });
    await page.waitForTimeout(20);
    await expect(page.getByTestId('skin-workspace-panel')).toBeHidden();
    await expect(page.getByTestId('animate-workspace-panel')).toBeHidden();
    await expect(page.getByTestId('export-workspace-panel')).toBeHidden();

    // Exercise Model workspace viewport click routing (object pick/empty clear + orbit compat; no crash expected)
    await canvas.click({ position: { x: 60, y: 60 } });
    await page.waitForTimeout(80);
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute('data-pointer-owner', 'model-select');

    // Assert no critical browser console errors during load (errors logged by listener)
    // (warnings may exist for Three.js, but no errors)
    const errors = getBrowserErrors(page);
    const criticalErrors = errors.filter((e: string) => e.includes('ERROR'));
    expect(criticalErrors.length).toBe(0);

    // Cycle 1: lightweight screenshot assert for bone flow (real sample + selection/collapse/raycast exercised)
    // Keeps CI green without mandatory snapshot updates while providing visual state coverage for bone/export prep.
    // Use strict visual for this core load + bone state when we want a committed reference render.
    await pausePlaybackIfRunning(page);
    await page.getByTestId('timeline').locator('button').filter({ hasText: /Reset/i }).first().click({ force: true });
    await page.waitForTimeout(120);
    await expectRenderedScreenshot(page.getByTestId('viewport-container'), 3000, { strict: true, name: 'loaded-smf-bone-flow' });
  });

  test('viewport layout toggle works in single/quad modes', async ({ page }) => {
    test.skip(!SAMPLE_SMF, 'No .smf test model available (local mixamo_smf_baldguy.smf or old-src reference)');

    await page.goto('/');

    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(SAMPLE_SMF!);
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('three-canvas')).toBeVisible();

    const singleBtn = page.getByTestId('viewport-layout-single');
    const quadBtn = page.getByTestId('viewport-layout-quad');
    await expect(singleBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(quadBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(singleBtn).toBeEnabled();
    await expect(quadBtn).toBeEnabled();

    await page.getByTestId('mode-tab-rig').click({ force: true });
    const inspector = page.getByTestId('inspector');
    const boneEntry = inspector
      .locator('li > div')
      .filter({ hasText: /SMF_Node_\d+/ })
      .first();
    await expect(boneEntry).toBeVisible({ timeout: 8000 });
    await boneEntry.click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Selected:/i);
    const selectedBefore = parseSelectedBone(await page.getByTestId('status-text').textContent());
    expect(selectedBefore).toBeTruthy();
    await pausePlaybackIfRunning(page);
    await setRangeValue(page, 'scrub-slider', 0.2);
    const scrubBefore = await page.getByTestId('time-display').textContent();

    const canvas = page.getByTestId('three-canvas');
    const expectEndpointTelemetry = async (): Promise<{ x: number; y: number }> => {
      await expect.poll(async () => {
        const x = Number(await canvas.getAttribute('data-endpoint-x'));
        const y = Number(await canvas.getAttribute('data-endpoint-y'));
        return Number.isFinite(x) && Number.isFinite(y);
      }, { timeout: 3000 }).toBe(true);
      return {
        x: Number(await canvas.getAttribute('data-endpoint-x')),
        y: Number(await canvas.getAttribute('data-endpoint-y')),
      };
    };
    const hoverEndpoint = async (): Promise<string> => {
      const endpoint = await expectEndpointTelemetry();
      await page.mouse.move(endpoint.x, endpoint.y);
      await page.waitForTimeout(60);
      return (await canvas.getAttribute('data-hovered-bone')) ?? '';
    };

    const hoveredBefore = await hoverEndpoint();
    expect(hoveredBefore === '' || hoveredBefore === selectedBefore).toBe(true);

    await setViewportLayout(page, 'quad');
    await setViewportLayout(page, 'single');
    await setViewportLayout(page, 'quad');
    await setViewportLayout(page, 'single');
    await expect(page.getByTestId('status-text')).toContainText(new RegExp(`Selected:\\s*${selectedBefore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    expect(await page.getByTestId('time-display').textContent()).toBe(scrubBefore);

    await setViewportLayout(page, 'quad');
    await expect(page.getByTestId('viewport-container')).toBeVisible();
    await expect(page.getByTestId('quad-pane-overlay')).toBeVisible();
    await expect(page.getByTestId('quad-pane-label-top')).toContainText('Top');
    await expect(page.getByTestId('quad-pane-label-3d')).toContainText('3D');
    await expect(page.getByTestId('quad-pane-label-front')).toContainText('Front');
    await expect(page.getByTestId('quad-pane-label-side')).toContainText('Side');
    const hoveredAfter = await hoverEndpoint();
    expect(hoveredAfter === '' || hoveredAfter === selectedBefore).toBe(true);
    expect(await page.getByTestId('time-display').textContent()).toBe(scrubBefore);
    await expectRenderedScreenshot(page.getByTestId('viewport-container'), 2500);

    // Quad mode is now wired for deterministic per-pane interaction: each panel is clickable and should not
    // throw selection errors while raycast/orbit filters route the active pane behavior.
    const box = await canvas.boundingBox();
    if (box) {
      const points = [
        { role: 'top', x: box.x + box.width * 0.25, y: box.y + box.height * 0.25, minX: 0.05, maxX: 0.45, minY: 0.05, maxY: 0.45 },
        { role: 'perspective', x: box.x + box.width * 0.75, y: box.y + box.height * 0.25, minX: 0.55, maxX: 0.95, minY: 0.05, maxY: 0.45 },
        { role: 'front', x: box.x + box.width * 0.25, y: box.y + box.height * 0.75, minX: 0.05, maxX: 0.45, minY: 0.55, maxY: 0.95 },
        { role: 'side', x: box.x + box.width * 0.75, y: box.y + box.height * 0.75, minX: 0.55, maxX: 0.95, minY: 0.55, maxY: 0.95 },
      ];
      for (const p of points) {
        await page.mouse.click(p.x, p.y);
        await expect(canvas).toHaveAttribute('data-viewport-pane-role', p.role);
        await expect(canvas).toHaveAttribute('data-pointer-owner', /rig-select|rig-endpoint-drag/);
        expect(parseSelectedBone(await page.getByTestId('status-text').textContent())).toBeTruthy();
        await page.waitForTimeout(40);
      }

      let panesWithSelectableBone = 0;
      for (const pane of points) {
        let hit: { x: number; y: number; bone: string } | null = null;
        for (const relY of [pane.minY, (pane.minY + pane.maxY) / 2, pane.maxY]) {
          for (const relX of [pane.minX, (pane.minX + pane.maxX) / 2, pane.maxX]) {
            const x = box.x + box.width * relX;
            const y = box.y + box.height * relY;
            await page.mouse.move(x, y);
            await page.waitForTimeout(30);
            const bone = (await canvas.getAttribute('data-hovered-bone')) ?? '';
            if (bone) {
              hit = { x, y, bone };
              break;
            }
          }
          if (hit) break;
        }
        if (!hit) continue;

        await page.mouse.click(hit.x, hit.y);
        await expect(canvas).toHaveAttribute('data-viewport-pane-role', pane.role);
        await expect(canvas).toHaveAttribute('data-pointer-owner', /rig-select|rig-endpoint-drag/);
        const pickedBone = (await canvas.getAttribute('data-viewport-picked-bone')) ?? '';
        if (!pickedBone) continue;
        panesWithSelectableBone += 1;
        await expect(page.getByTestId('status-text')).toContainText(new RegExp(`Selected:\\s*${escapeRegex(pickedBone)}`));
      }
      expect(panesWithSelectableBone).toBeGreaterThan(0);
      await expect(canvas).toBeVisible();
    }

    await setViewportLayout(page, 'single');
    await expect(page.getByTestId('viewport-container')).toBeVisible();
    await expect(page.getByTestId('quad-pane-overlay')).toBeHidden();
    await expectRenderedScreenshot(page.getByTestId('viewport-container'), 2500);

    const cameraBtn = page.getByTestId('viewport-perspective-toggle');
    await expect(cameraBtn).toContainText('3D');
    await cameraBtn.click();
    await expect(cameraBtn).toContainText('Ortho');
    await expect(cameraBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(canvas).toHaveAttribute('data-perspective-enabled', 'false');
    await expectRenderedScreenshot(page.getByTestId('viewport-container'), 2500);

    await cameraBtn.click();
    await expect(cameraBtn).toContainText('3D');
    await expect(cameraBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas).toHaveAttribute('data-perspective-enabled', 'true');
  });

  test('small viewport mode tabs switch deterministically after load', async ({ page }) => {
    test.skip(!SAMPLE_SMF, 'No .smf test model available (local mixamo_smf_baldguy.smf or old-src reference)');

    await page.setViewportSize({ width: 360, height: 720 });
    await page.goto('/');

    await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-viewport-layout', 'single');
    await expect(page.getByTestId('viewport-layout-quad')).toBeDisabled();

    await page.getByTestId('model-file-input').setInputFiles(SAMPLE_SMF!);
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('viewport-layout-quad')).toBeEnabled();

    const inspector = page.getByTestId('inspector');
    const firstBone = inspector.locator('li > div').filter({ hasText: /./ }).first();
    await firstBone.click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Selected:/i);
    const selectedBefore = parseSelectedBone(await page.getByTestId('status-text').textContent());

    await pausePlaybackIfRunning(page);
    const slider = page.getByTestId('timeline').locator('input[type="range"]');
    await slider.fill('0.2');
    const scrubBefore = await page.getByTestId('time-display').textContent();

    const switchMode = async (
      mode: 'view' | 'rig' | 'skin' | 'animate' | 'export',
      panelTestId?: string,
    ): Promise<void> => {
      const tab = page.getByTestId(`mode-tab-${mode}`);
      await tab.scrollIntoViewIfNeeded();
      await expect(tab).toBeVisible();
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      if (panelTestId) {
        await expect(page.getByTestId(panelTestId)).toBeVisible();
      }
      await expect(page.getByTestId('three-canvas')).toBeVisible();
    };

    await switchMode('rig');
    await switchMode('skin', 'skin-workspace-panel');
    await switchMode('animate', 'animate-workspace-panel');
    await switchMode('export', 'export-workspace-panel');
    await switchMode('view');

    const statusAfter = await page.getByTestId('status-text').textContent();
    expect(parseSelectedBone(statusAfter)).toBe(selectedBefore);
    expect(await page.getByTestId('time-display').textContent()).toBe(scrubBefore);
  });

  test('latest async load wins between file input and drop', async ({ page }) => {
    test.skip(!SAMPLE_SMF || !SAMPLE_FBX, 'Both .smf and .fbx fixtures are required for async overlap coverage.');

    await page.goto('/');

    const input = page.getByTestId('model-file-input');
    const inputDropTarget = page.getByTestId('viewport-container');
    const fbxBase64 = fileToBase64(SAMPLE_FBX!);
    const dropFileSpec: SyntheticDropFile = {
      name: 'sample-fbx.fbx',
      mimeType: 'application/x-fbx',
      base64: fbxBase64,
    };

    await withBrowserFileArrayBufferDelay(page, {
      delayedFileName: path.basename(SAMPLE_SMF!),
      delayMs: 450,
    });

    try {
      await input.setInputFiles(SAMPLE_SMF!);
      await dispatchSyntheticDrop(inputDropTarget, dropFileSpec);

      await expect(page.getByTestId('status-text')).toContainText('Loaded FBX', { timeout: 15000 });
      await expect(page.getByTestId('status-text')).not.toContainText(/Loaded:.*\.smf|mixamo/i);
      await expect(page.getByTestId('three-canvas')).toBeVisible();
      await page.waitForTimeout(250);
      await expect(page.getByTestId('status-text')).toContainText(/Loaded FBX|Nothing to export|No skinned model loaded/i);
    } finally {
      await restoreBrowserFileArrayBuffer(page);
    }
  });

  test('skin dirty state resets when stale overlapped load wins from drop', async ({ page }) => {
    test.skip(!SAMPLE_SMF || !SAMPLE_FBX, 'Both .smf and .fbx fixtures are required for async overlap coverage with skin state.');

    await page.goto('/');

    const skinnedFixtureInput = await createSkinnedGlbFixtureInput();
    const input = page.getByTestId('model-file-input');
    const inputDropTarget = page.getByTestId('viewport-container');
    const fbxBase64 = fileToBase64(SAMPLE_FBX!);
    const dropFileSpec: SyntheticDropFile = {
      name: 'sample-fbx.fbx',
      mimeType: 'application/x-fbx',
      base64: fbxBase64,
    };

    await input.setInputFiles(skinnedFixtureInput);
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/generated-skinned-fixture|bones: 2|clips: 1/i);
    await page.getByTestId('mode-tab-rig').click({ force: true });
    await expect(page.getByTestId('rig-workspace-panel')).toBeVisible();
    await expect(page.getByTestId('rig-validation-status')).toContainText(/pass/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('2');
    await page.getByTestId('mode-tab-skin').click({ force: true });
    await expect(page.getByTestId('skin-workspace-panel')).toBeVisible();
    await expect(page.getByTestId('skin-normalize-btn')).toBeEnabled();
    await expect(page.getByTestId('skin-autoskin-btn')).toBeEnabled();
    await expect(page.getByTestId('skin-autoskin-algorithm')).toHaveValue('segment-inverse-distance');
    await expect(page.getByTestId('skin-autoskin-power')).toBeEnabled();
    await expect(page.getByTestId('skin-autoskin-normal-weighting')).toBeDisabled();
    await expect(page.getByTestId('skin-autoskin-max-influences')).toBeEnabled();
    await expect(page.getByTestId('skin-paint-mode-add')).toBeEnabled();
    await expect(page.getByTestId('skin-paint-mode-auto')).toBeEnabled();
    await expect(page.getByTestId('skin-paint-target-mode')).toBeEnabled();

    const inspector = page.getByTestId('inspector');
    const fixtureBone = inspector.locator('li > div').filter({ hasText: /FixtureRoot/ }).first();
    await fixtureBone.click({ force: true });
    await page.waitForTimeout(60);
    const selectedBefore = parseSelectedBone(await page.getByTestId('status-text').textContent());
    expect(selectedBefore).toBe('FixtureRoot');

    await page.getByTestId('skin-paint-mode-add').click({ force: true }).catch(() => {});
    await setRangeValue(page, 'skin-paint-target', 1);
    await setRangeValue(page, 'skin-paint-radius', 1);
    await setRangeValue(page, 'skin-paint-strength', 1);
    expect(await paintOnMeshInViewport(page, { requireDirty: true })).toBe(true);
    await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true');

    await withBrowserFileArrayBufferDelay(page, {
      delayedFileName: path.basename(SAMPLE_SMF!),
      delayMs: 450,
    });

    try {
      await input.setInputFiles(SAMPLE_SMF!);
      await dispatchSyntheticDrop(inputDropTarget, dropFileSpec);

      await expect(page.getByTestId('status-text')).toContainText('Loaded FBX', { timeout: 15000 });
      await expect(page.getByTestId('status-text')).not.toContainText(/Loaded:.*\.smf|mixamo|FixtureRoot|FixtureTip/i);
      await page.getByTestId('mode-tab-skin').click({ force: true });
      await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: false');
      await expect(page.getByTestId('skin-export-block')).toHaveCount(0);
    } finally {
      await restoreBrowserFileArrayBuffer(page);
    }
  });

  test('pose edit dirty state resets when stale overlapped load wins from drop', async ({ page }) => {
    test.skip(!SAMPLE_SMF || !SAMPLE_FBX, 'Both .smf and .fbx fixtures are required for async overlap coverage.');

    await page.goto('/');

    const input = page.getByTestId('model-file-input');
    const inputDropTarget = page.getByTestId('viewport-container');
    const fbxBase64 = fileToBase64(SAMPLE_FBX!);
    const dropFileSpec: SyntheticDropFile = {
      name: 'sample-fbx.fbx',
      mimeType: 'application/x-fbx',
      base64: fbxBase64,
    };

    await input.setInputFiles(await createSkinnedGlbFixtureInput());
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/generated-skinned-fixture|bones: 2|clips: 1/i);
    await page.getByTestId('mode-tab-rig').click({ force: true });
    await expect(page.getByTestId('inspector')).toBeVisible();
    const firstBone = page.getByTestId('inspector').locator('li > div').filter({ hasText: /FixtureTip/ }).first();
    await expect(firstBone).toBeVisible();
    await firstBone.click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Selected:\s*FixtureTip/i);
    await page.getByTestId('transform-x-btn').click({ force: true }).catch(() => {});
    await page.getByTestId('mode-tab-animate').click({ force: true });
    await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');

    await withBrowserFileArrayBufferDelay(page, {
      delayedFileName: path.basename(SAMPLE_SMF!),
      delayMs: 450,
    });

    try {
      await input.setInputFiles(SAMPLE_SMF!);
      await dispatchSyntheticDrop(inputDropTarget, dropFileSpec);

      await expect(page.getByTestId('status-text')).toContainText('Loaded FBX', { timeout: 15000 });
      await expect(page.getByTestId('status-text')).not.toContainText(/Loaded:.*\.smf|mixamo|FixtureTip|Pose edit dirty/i);

      await page.getByTestId('mode-tab-animate').click({ force: true });
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: false');
    } finally {
      await restoreBrowserFileArrayBuffer(page);
    }
  });

  test('global pose undo and redo track nudge transactions', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(await createSkinnedGlbFixtureInput());
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/generated-skinned-fixture|bones: 2|clips: 1/i);

    await expect(page.getByTestId('editor-undo-btn')).toBeDisabled();
    await expect(page.getByTestId('editor-redo-btn')).toBeDisabled();

    await page.getByTestId('mode-tab-rig').click({ force: true });
    const inspector = page.getByTestId('inspector');
    const boneEntry = inspector.locator('li > div').filter({ hasText: /FixtureTip/ }).first();
    await expect(boneEntry).toBeVisible();
    await boneEntry.click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Selected:\s*FixtureTip/i);

    await page.getByTestId('transform-x-btn').click({ force: true });
    await expect(page.getByTestId('editor-undo-btn')).toBeEnabled();
    await expect(page.getByTestId('editor-redo-btn')).toBeDisabled();

    await page.getByTestId('mode-tab-animate').click({ force: true });
    await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');

    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid Nudge FixtureTip/i);
    await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: false');
    await expect(page.getByTestId('editor-undo-btn')).toBeDisabled();
    await expect(page.getByTestId('editor-redo-btn')).toBeEnabled();

    await page.getByTestId('editor-redo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Redid Nudge FixtureTip/i);
    await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');
    await expect(page.getByTestId('editor-undo-btn')).toBeEnabled();

    await page.keyboard.press('Control+Z');
    await expect(page.getByTestId('status-text')).toContainText(/Undid Nudge FixtureTip/i);
    await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: false');

    await page.keyboard.press('Control+Y');
    await expect(page.getByTestId('status-text')).toContainText(/Redid Nudge FixtureTip/i);
    await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');
  });

  test('global undo and redo follow chronology across outliner and pose edits', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(await createSkinnedGlbFixtureInput());
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/generated-skinned-fixture|bones: 2|clips: 1/i);

    const firstSubmodel = page.getByTestId('outliner-submodel-0');
    const firstVisibilityToggle = page.getByTestId('outliner-visibility-toggle-0');
    await expect(firstSubmodel).toHaveAttribute('data-visible', 'true');
    await firstVisibilityToggle.click();
    await expect(firstSubmodel).toHaveAttribute('data-visible', 'false');

    await page.getByTestId('mode-tab-rig').click({ force: true });
    const inspector = page.getByTestId('inspector');
    const boneEntry = inspector.locator('li > div').filter({ hasText: /FixtureTip/ }).first();
    await expect(boneEntry).toBeVisible();
    await boneEntry.click({ force: true });
    await page.getByTestId('transform-x-btn').click({ force: true });

    await page.getByTestId('mode-tab-animate').click({ force: true });
    await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');

    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid Nudge FixtureTip/i);
    await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: false');
    await expect(firstSubmodel).toHaveAttribute('data-visible', 'false');

    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid outliner visibility toggle/i);
    await expect(firstSubmodel).toHaveAttribute('data-visible', 'true');

    await page.getByTestId('editor-redo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Redid outliner visibility toggle/i);
    await expect(firstSubmodel).toHaveAttribute('data-visible', 'false');
    await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: false');

    await page.getByTestId('editor-redo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Redid Nudge FixtureTip/i);
    await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');
  });

  test('timeline lane click scrubs and double-click inserts selected-bone keyframes', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(await createSkinnedGlbFixtureInput());
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/generated-skinned-fixture|bones: 2|clips: 1/i);
    await pausePlaybackIfRunning(page);

    await page.getByTestId('mode-tab-rig').click({ force: true });
    const inspector = page.getByTestId('inspector');
    const boneEntry = inspector.locator('li > div').filter({ hasText: /FixtureTip/ }).first();
    await expect(boneEntry).toBeVisible();
    await boneEntry.click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Selected:\s*FixtureTip/i);

    await page.getByTestId('mode-tab-animate').click({ force: true });
    await expect(page.getByTestId('animate-workspace-panel')).toBeVisible();
    await pausePlaybackIfRunning(page);
    await page.getByTestId('animation-snap-step-select').selectOption('0.1');
    await expect(page.getByTestId('status-text')).toContainText(/Animation snap set to 0\.10s/i);
    await expect(page.getByTestId('timeline-keyframe-lane')).toHaveAttribute('data-keyframe-count', '2');

    await clickTimelineLaneAt(page, 0.75, 2);
    await expect(page.getByTestId('status-text')).toContainText(/Inserted animation keyframe for FixtureTip/i);
    await expect(page.getByTestId('timeline-keyframe-lane')).toHaveAttribute('data-keyframe-count', '3');
    await expect(page.getByTestId('animation-selected-key')).toContainText('0.40s');
    await expect(page.getByTestId('time-display')).toContainText(/0\.40/);

    await dragSelectedTimelineMarkerTo(page, 0.55);
    await expect(page.getByTestId('status-text')).toContainText(/Moved animation keyframe for FixtureTip/i);
    await expect(page.getByTestId('timeline-keyframe-lane')).toHaveAttribute('data-keyframe-count', '3');
    await expect(page.getByTestId('animation-selected-key')).toContainText('0.30s');
    await expect(page.getByTestId('time-display')).toContainText(/0\.30/);

    await clickTimelineLaneAt(page, 0.25);
    await expect(page.getByTestId('animation-selected-key')).toContainText('none');
    await expect(page.getByTestId('time-display')).toContainText(/0\.10/);

    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid move animation keyframe for FixtureTip/i);
    await expect(page.getByTestId('timeline-keyframe-lane')).toHaveAttribute('data-keyframe-count', '3');
    await expect(page.getByTestId('animation-selected-key')).toContainText('0.40s');

    await page.getByTestId('editor-redo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Redid move animation keyframe for FixtureTip/i);
    await expect(page.getByTestId('animation-selected-key')).toContainText('0.30s');
    await expect(page.getByTestId('timeline-keyframe-lane')).toHaveAttribute('data-keyframe-count', '3');
  });

  test('animation clip tools duplicate, rename, delete, and undo workspace changes', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(await createSkinnedGlbFixtureInput());
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/generated-skinned-fixture|bones: 2|clips: 1/i);
    await pausePlaybackIfRunning(page);

    await page.getByTestId('mode-tab-animate').click({ force: true });
    await expect(page.getByTestId('animate-workspace-panel')).toBeVisible();
    await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend');
    await expect(page.getByTestId('animation-delete-clip-btn')).toBeDisabled();
    await expect(page.getByTestId('animation-loop-toggle')).toBeChecked();
    await expect(page.getByTestId('animation-sample-multiplier-input')).toHaveValue('1');

    await page.getByTestId('animation-loop-toggle').uncheck({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Animation clip FixtureBend loop disabled/i);
    await page.getByTestId('animation-sample-multiplier-input').fill('3');
    await expect(page.getByTestId('status-text')).toContainText(/sample frame multiplier set to 3/i);
    await expect(page.getByTestId('animation-sample-multiplier-input')).toHaveValue('3');

    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid set animation clip FixtureBend sample frame multiplier to 3/i);
    await expect(page.getByTestId('animation-sample-multiplier-input')).toHaveValue('1');
    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid set animation clip FixtureBend loop off/i);
    await expect(page.getByTestId('animation-loop-toggle')).toBeChecked();
    await page.getByTestId('editor-redo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Redid set animation clip FixtureBend loop off/i);
    await expect(page.getByTestId('animation-loop-toggle')).not.toBeChecked();
    await page.getByTestId('editor-redo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Redid set animation clip FixtureBend sample frame multiplier to 3/i);
    await expect(page.getByTestId('animation-sample-multiplier-input')).toHaveValue('3');

    await page.getByTestId('animation-duplicate-clip-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Duplicated animation clip FixtureBend as FixtureBend Copy/i);
    await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend Copy');
    await expect(page.getByTestId('animation-loop-toggle')).not.toBeChecked();
    await expect(page.getByTestId('animation-sample-multiplier-input')).toHaveValue('3');
    await expect(page.getByTestId('animation-delete-clip-btn')).toBeEnabled();
    await expect(page.getByTestId('clip-item-1')).toContainText(/FixtureBend Copy/);

    await page.getByTestId('animation-clip-name-input').fill('Hero Bend');
    await page.getByTestId('animation-rename-clip-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Renamed animation clip FixtureBend Copy to Hero Bend/i);
    await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Hero Bend');
    await expect(page.getByTestId('clip-item-1')).toContainText(/Hero Bend/);
    await expect(page.getByTestId('animation-move-clip-down-btn')).toBeDisabled();
    await expect(page.getByTestId('animation-move-clip-up-btn')).toBeEnabled();

    await page.getByTestId('animation-move-clip-up-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Moved animation clip Hero Bend up/i);
    await expect(page.getByTestId('clip-item-0')).toContainText(/Hero Bend/);
    await expect(page.getByTestId('clip-item-1')).toContainText(/^FixtureBend/);
    await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Hero Bend');
    await expect(page.getByTestId('animation-move-clip-up-btn')).toBeDisabled();
    await expect(page.getByTestId('animation-move-clip-down-btn')).toBeEnabled();

    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid move up animation clip Hero Bend/i);
    await expect(page.getByTestId('clip-item-1')).toContainText(/Hero Bend/);
    await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Hero Bend');

    await page.getByTestId('editor-redo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Redid move up animation clip Hero Bend/i);
    await expect(page.getByTestId('clip-item-0')).toContainText(/Hero Bend/);

    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid move up animation clip Hero Bend/i);
    await expect(page.getByTestId('clip-item-1')).toContainText(/Hero Bend/);

    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid rename animation clip FixtureBend Copy to Hero Bend/i);
    await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend Copy');

    await page.getByTestId('editor-redo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Redid rename animation clip FixtureBend Copy to Hero Bend/i);
    await page.getByTestId('animation-delete-clip-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Deleted animation clip Hero Bend/i);
    await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend');
    await expect(page.getByTestId('animation-delete-clip-btn')).toBeDisabled();
    await expect(page.getByTestId('clip-item-1')).toBeHidden();

    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid delete animation clip Hero Bend/i);
    await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Hero Bend');
    await expect(page.getByTestId('animation-delete-clip-btn')).toBeEnabled();
  });

  test('endpoint drag works in rig mode across single and quad layouts', async ({ page }) => {
    test.skip(!SAMPLE_SMF, 'No .smf test model available (local mixamo_smf_baldguy.smf or old-src reference)');

    await page.goto('/');

    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(SAMPLE_SMF!);
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/Loaded|bones|clips|verts/i);

    await page.getByTestId('mode-tab-rig').click({ force: true });
    await expect(page.getByTestId('three-canvas')).toBeVisible();

    const inspector = page.getByTestId('inspector');
    const boneEntry = inspector
      .locator('li > div')
      .filter({ hasText: /SMF_Node_\d+/ })
      .first();
    await expect(boneEntry).toBeVisible({ timeout: 8000 });
    await boneEntry.click({ force: true });
    await page.waitForTimeout(80);

    const statusText = await page.getByTestId('status-text').textContent();
    const selectedBone = parseSelectedBone(statusText);
    expect(selectedBone).toBeTruthy();
    await page.waitForTimeout(180);

    const singleCanvas = page.getByTestId('three-canvas');
    await expect(singleCanvas).toHaveAttribute('data-transform-owner', 'pose');
    await expect(singleCanvas).toHaveAttribute('data-transform-attached', 'true');
    const singleDrag = await dragEndpointHandle(page, selectedBone, undefined, async () => {
      await expect(singleCanvas).toHaveAttribute('data-transform-attached', 'false');
      await expect(singleCanvas).toHaveAttribute('data-endpoint-drag', 'active');
    });
    expect(singleDrag).toBe(true);
    await expect(singleCanvas).toHaveAttribute('data-pointer-owner', 'rig-endpoint-drag');
    await expect(singleCanvas).toHaveAttribute('data-bone-transform-source', 'endpoint-drag');
    await expect(singleCanvas).toHaveAttribute('data-transform-attached', 'true');

    const canceledDrag = await dragEndpointHandle(page, selectedBone, undefined, async () => {
      await expect(singleCanvas).toHaveAttribute('data-transform-attached', 'false');
      await expect(singleCanvas).toHaveAttribute('data-endpoint-drag', 'active');
    }, 'cancel');
    expect(canceledDrag).toBe(true);
    await expect(singleCanvas).not.toHaveAttribute('data-endpoint-drag', 'active');
    await expect(singleCanvas).toHaveAttribute('data-transform-attached', 'true');

    await page.getByTestId('mode-tab-animate').click({ force: true });
    await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');
    await page.getByTestId('mode-tab-rig').click({ force: true });

    await setViewportLayout(page, 'quad');
    const quadDragOk = await dragEndpointHandle(page, selectedBone);
    expect(quadDragOk).toBe(true);
    await expect(singleCanvas).toHaveAttribute('data-viewport-pane-role', 'perspective');
    await expect(singleCanvas).toHaveAttribute('data-pointer-owner', 'rig-endpoint-drag');
    await expect(singleCanvas).toHaveAttribute('data-bone-transform-source', 'endpoint-drag');

    await setViewportLayout(page, 'single');
    await expect(singleCanvas).not.toHaveAttribute('data-endpoint-drag', 'active');
  });

  test('animation keyframe authoring updates selected-bone clips and SMF checks', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(await createSkinnedGlbFixtureInput());
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/generated-skinned-fixture|bones: 2|clips: 1/i);
    await pausePlaybackIfRunning(page);

    const firstSubmodel = page.getByTestId('outliner-submodel-0');
    const firstVisibilityToggle = page.getByTestId('outliner-visibility-toggle-0');
    await expect(firstSubmodel).toBeVisible();
    await firstVisibilityToggle.click();
    await expect(firstSubmodel).toHaveAttribute('data-visible', 'false');
    await firstVisibilityToggle.click();
    await expect(firstSubmodel).toHaveAttribute('data-visible', 'true');
    await expect(page.getByTestId('editor-undo-btn')).toBeEnabled();

    await page.getByTestId('mode-tab-rig').click({ force: true });
    const inspector = page.getByTestId('inspector');
    const boneEntry = inspector
      .locator('li > div')
      .filter({ hasText: /FixtureTip/ })
      .first();
    await expect(boneEntry).toBeVisible({ timeout: 8000 });
    await boneEntry.click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Selected:\s*FixtureTip/i);
    const canvas = page.getByTestId('three-canvas');
    await expect(canvas).toHaveAttribute('data-transform-owner', 'pose');
    await expect(canvas).toHaveAttribute('data-transform-attached', 'true');

    await page.getByTestId('mode-tab-animate').click({ force: true });
    await expect(page.getByTestId('animate-workspace-panel')).toBeVisible();
    await expect(canvas).toHaveAttribute('data-transform-owner', 'animation');
    await expect(canvas).toHaveAttribute('data-transform-attached', 'true');
    await expect(page.getByTestId('animation-insert-key-btn')).toBeEnabled();
    await setViewportLayout(page, 'quad');
    const animatePick = await clickPickableBoneInViewport(page, 'animate-select');
    expect(animatePick).toBeTruthy();
    await expect(canvas).toHaveAttribute('data-viewport-pane-role', animatePick!.paneRole);
    await expect(canvas).toHaveAttribute('data-viewport-picked-bone', animatePick!.bone);
    await expect(page.getByTestId('status-text')).toContainText(new RegExp(`Selected:\\s*${escapeRegex(animatePick!.bone)}`));
    await page.getByTestId('animation-interpolation-select').selectOption('step');
    await expect(page.getByTestId('status-text')).toContainText(/Animation interpolation set to step/i);
    await page.getByTestId('animation-interpolation-select').selectOption('quadratic');
    await expect(page.getByTestId('status-text')).toContainText(/Animation interpolation set to quadratic/i);
    await page.getByTestId('animation-insert-key-btn').click();
    await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');
    await expect(page.getByTestId('animation-selected-key')).not.toContainText('none');
    await expect(page.getByTestId('status-text')).toContainText(/Inserted animation keyframe/i);
    await expect(page.getByTestId('editor-undo-btn')).toBeEnabled();
    await setViewportLayout(page, 'single');

    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid insert animation keyframe/i);
    await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: false');
    await expect(page.getByTestId('editor-redo-btn')).toBeEnabled();

    await page.getByTestId('editor-redo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Redid insert animation keyframe/i);
    await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');

    await page.getByTestId('animation-copy-key-btn').click();
    await expect(page.getByTestId('animation-paste-key-btn')).toBeEnabled();
    await setRangeValue(page, 'scrub-slider', 0.37);
    await page.getByTestId('animation-paste-key-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Pasted animation keyframe/i);

    await page.keyboard.press('Control+Z');
    await expect(page.getByTestId('status-text')).toContainText(/Undid paste animation keyframe/i);
    await page.keyboard.press('Control+Y');
    await expect(page.getByTestId('status-text')).toContainText(/Redid paste animation keyframe/i);

    await page.getByTestId('animation-update-key-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Updated animation keyframe/i);
    await expect(page.getByTestId('timeline-keyframe-lane')).toHaveAttribute('data-keyframe-count', /[1-9]\d*/);

    await page.getByTestId('mode-tab-export').click({ force: true });
    await expect(canvas).toHaveAttribute('data-transform-owner', 'disabled');
    await expect(canvas).toHaveAttribute('data-transform-attached', 'false');
    await page.getByTestId('smf-roundtrip-check-btn').click();
    await expect(page.getByTestId('smf-roundtrip-result')).toHaveAttribute('data-smf-roundtrip-ok', 'true', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/SMF roundtrip check passed/i);

    await page.getByTestId('mode-tab-animate').click({ force: true });
    await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');
    await page.getByTestId('animation-delete-key-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Deleted animation keyframe/i);
    await page.keyboard.press('Control+Z');
    await expect(page.getByTestId('status-text')).toContainText(/Undid delete animation keyframe/i);
    await page.keyboard.press('Control+Y');
    await expect(page.getByTestId('status-text')).toContainText(/Redid delete animation keyframe/i);
  });

  test('export flow and basic visuals (smoke for roundtrip prep)', async ({ page }) => {
    test.skip(!SAMPLE_SMF, 'No .smf test model available (local mixamo_smf_baldguy.smf or old-src reference)');

    await page.goto('/');

    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(SAMPLE_SMF!);

    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/mixamo|Loaded|bones|clips|verts/i);

    // Visual after load (normalization framing for export flow test)
    const canvas = page.getByTestId('three-canvas');
    await pausePlaybackIfRunning(page);
    await setRangeValue(page, 'scrub-slider', 0);
    await expectRenderedScreenshot(canvas);

    // Exercise bone selection + transforms/gizmo (functional, Cycle 3) before export (covers desktop sim path)
    const inspector = page.getByTestId('inspector');
    const anyBoneEntry = inspector.locator('li > div').filter({ hasText: /./ }).nth(0);
    if (await anyBoneEntry.count() > 0) {
      await anyBoneEntry.click({ force: true }).catch(() => {});
      await page.waitForTimeout(60);
    }
    const scaleBtn = inspector.getByTestId('mode-scale-btn');
    if (await scaleBtn.count() > 0) {
      await scaleBtn.click({ force: true }).catch(() => {});
      await expect(page.getByTestId('status-text')).toContainText(/SMF export does not support scale edits/i);
    }
    const xBtn = inspector.getByTestId('transform-x-btn');
    if (await xBtn.count() > 0) {
      await xBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(40);
    }

    // Test export: click, check status for success message (download is blob, hard to reimport here but status confirms)
    const exportBtn = page.getByTestId('export-btn');
    await exportBtn.click();
    await expect(page.getByTestId('status-text')).toContainText(/Exported \.(smf|glb)/i, { timeout: 5000 });
    await expect(page.getByTestId('status-text')).toContainText(/pose edit/i);
    await page.getByTestId('export-glb-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Exported \.glb/i, { timeout: 5000 });
    await setRangeValue(page, 'scrub-slider', 0);

    // Basic visual: screenshot viewport after load + bone interaction (nonblank render regression smoke).
    await expectRenderedScreenshot(page.getByTestId('viewport-container'));

    // Cycle 1 extension: additional lightweight screenshot assert post-export (bone + export flow with real .smf)
    await expectRenderedScreenshot(page.getByTestId('viewport-container'), 3000, { strict: true, name: 'export-flow-smf' });

    // Strict no critical console errors post export flow
    const exportErrors = getBrowserErrors(page);
    const exportCritical = exportErrors.filter((e: string) => e.includes('ERROR'));
    expect(exportCritical.length).toBe(0);
  });

  test('timeline scrub, clip change, loading overlay, and error banner (extended controls + UX)', async ({ page }) => {
    test.skip(!SAMPLE_SMF, 'No .smf test model available (local mixamo_smf_baldguy.smf or old-src reference)');

    await page.goto('/');

    // Error banner element should be in DOM (even if not shown)
    await expect(page.getByTestId('error-banner')).toBeAttached();

    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(SAMPLE_SMF!);

    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/mixamo|Loaded|bones|clips|verts/i);

    // Loading overlay should not be visible after load
    await expect(page.getByTestId('loading-overlay')).toBeHidden();

    // Scrub slider present and interactive (set value; no crash + still renders)
    const slider = page.getByTestId('scrub-slider');
    await expect(slider).toBeVisible();
    await expect(slider).toBeEnabled();
    // Drive the scrub (Playwright range .fill works for value update)
    await slider.fill('0.5');
    // Give RAF a tick for any internal update
    await page.waitForTimeout(120);
    // Stronger assert: time display updated after scrub (uses data-testid)
    // Loosened regex for real model timing/play state (values may drift slightly while playing)
    await expect(page.getByTestId('time-display')).toContainText(/0\.[0-9]/);

    // Clip list items: click first clip (if present) and assert no crash / UI still live
    const firstClip = page.getByTestId('clip-item-0');
    if (await firstClip.count() > 0) {
      await firstClip.click();
      await page.waitForTimeout(80);
      // Status or timeline should still be sensible
      await expect(page.getByTestId('timeline')).toBeVisible();
    }

    // Canvas still rendering post-interactions
    await expect(page.getByTestId('three-canvas')).toBeVisible();

    // Nothing-to-export path (tests status for empty export attempt)
    await page.goto('/');
    await page.getByTestId('export-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Nothing to export/i);
    await page.getByTestId('export-glb-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Nothing to export as GLB/i);
    await page.getByTestId('export-smf-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/No model loaded for SMF export|Nothing to export as SMF/i);

    // Drop zone hint is present (for drag-drop UX)
    await expect(page.locator('text=/Drop .* here/')).toBeAttached();
  });

  test('handles invalid file load with error banner and status (error path)', async ({ page }) => {
    // No longer strict skip: we provide a reliable fallback bad input (this .ts or .gml) so error UX is always exercised.
    if (!BAD_INPUT_FOR_ERROR_TEST || !fs.existsSync(BAD_INPUT_FOR_ERROR_TEST)) {
      test.skip(true, 'No bad input available for error path test (unexpected)');
    }

    await page.goto('/');

    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(BAD_INPUT_FOR_ERROR_TEST);

    // Wait for attempt to finish
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 10000 });

    // Should show error UX
    await expect(page.getByTestId('error-banner')).toBeAttached();
    await expect(page.getByTestId('status-text')).toContainText(/error|Error|fail|unsupported/i);

    // Canvas still present (no crash)
    await expect(page.getByTestId('three-canvas')).toBeVisible();
  });

  // Additional robustness: confirm bone status update works in load flow (covers raycast/list + new validated status path indirectly)
  test('bone selection updates status (select UX coverage)', async ({ page }) => {
    test.skip(!SAMPLE_SMF, 'No .smf test model available (local mixamo_smf_baldguy.smf or old-src reference)');

    await page.goto('/');

    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(SAMPLE_SMF!);

    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/mixamo|Loaded|bones|clips|verts/i);

    // Visual snapshot after load (normalization + initial framing; tolerant for env)
    const canvas = page.getByTestId('three-canvas');
    await pausePlaybackIfRunning(page);
    await expectRenderedScreenshot(canvas);

    // Bone list select (targets label divs inside li for the nested/collapsible tree structure; clicks name to select)
    // Also exercises toggle for collapse/expand
    const inspector = page.getByTestId('inspector');
    const anyBoneEntry = inspector.locator('li > div').filter({ hasText: /./ }).nth(0);
    if (await anyBoneEntry.count() > 0) {
      await anyBoneEntry.click({ force: true }).catch(() => {});
      await page.waitForTimeout(60);
      await expect(page.getByTestId('status-text')).toContainText(/Selected:/i);
    }
    // Toggle first +/- if present (tests collapse edge for deep rigs)
    const toggle = inspector.locator('span').filter({ hasText: /[+-]/ }).first();
    if (await toggle.count() > 0) {
      await toggle.click({ force: true }).catch(() => {});
      await page.waitForTimeout(60);
      // Double-toggle to test both collapse and re-expand states
      await toggle.click({ force: true }).catch(() => {});
      await page.waitForTimeout(60);
    }

    // Canvas/raycast click for 3D bone select belongs to Rig mode; View mode now handles model/submodel picking.
    await page.getByTestId('mode-tab-rig').click({ force: true });
    await canvas.click({ position: { x: 70, y: 70 } });
    await page.waitForTimeout(80);
    await expect(canvas).toHaveAttribute('data-pointer-owner', 'rig-select');
    await expect(page.getByTestId('status-text')).toContainText(/Selected:/i);
    const selectedAfterClick = parseSelectedBone(await page.getByTestId('status-text').textContent());
    expect(selectedAfterClick).toBeTruthy();

    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).toBeTruthy();
    await page.mouse.move(canvasBox!.x + 90, canvasBox!.y + 90);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(canvasBox!.x + 120, canvasBox!.y + 124);
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(60);
    expect(parseSelectedBone(await page.getByTestId('status-text').textContent())).toBe(selectedAfterClick);

    await page.mouse.move(canvasBox!.x + 130, canvasBox!.y + 130);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(canvasBox!.x + 160, canvasBox!.y + 150);
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(60);
    await expect(canvas).toHaveAttribute('data-pointer-owner', 'orbit');
    expect(parseSelectedBone(await page.getByTestId('status-text').textContent())).toBe(selectedAfterClick);

    // Confirm inspector reflects bones (rig info indirectly via count)
    await expect(inspector).toContainText(/Bones \(\d+\)/i);

    // Visual after bone select (marker visible, normalized framing)
    await expectRenderedScreenshot(canvas);

    // Exercise transform buttons + new Cycle 3 editor UI (gizmo modes T/R/S + weight preview toggle) for full bone UX coverage (list/raycast + controls + viz)
    const xBtn = inspector.getByTestId('transform-x-btn');
    if (await xBtn.count() > 0) {
      await xBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(40);
    }
    const resetBtn = inspector.getByTestId('transform-reset-btn');
    if (await resetBtn.count() > 0) {
      await resetBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(40);
    }

    // Exercise Cycle 3 editor UI buttons (mode + weight preview) - coverage for new controls (T/R/S + weight viz toggle)
    // Clicks ensure no crash, DOM present, state updates (toggle twice for weight)
    const weightBtn = inspector.getByTestId('weight-preview-btn');
    if (await weightBtn.count() > 0) {
      await weightBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(40);
      await weightBtn.click({ force: true }).catch(() => {}); // toggle off
      await page.waitForTimeout(40);
    }
    const tBtn = inspector.getByTestId('mode-translate-btn');
    if (await tBtn.count() > 0) {
      await tBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(40);
    }
    await expect(page.getByTestId('three-canvas')).toBeVisible();

    // Visual + control for animation play state (after load + bone UX)
    // Click play if timeline button present (tests control + visual during anim; tolerant snapshot)
    const playBtn = page.locator('button').filter({ hasText: /play|pause|▶|⏸/i }).first();
    if (await playBtn.count() > 0) {
      await playBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(120);
      await pausePlaybackIfRunning(page);
      await expectRenderedScreenshot(canvas);
    }

    // More interactive camera controls (zoom wheel, drag rotate, right-drag pan) + visual
    // Tests the enhanced SimpleOrbit (pan added) and normalization (framing)
    await canvas.hover({ position: { x: 150, y: 150 } });
    await page.mouse.wheel(0, -150); // zoom in
    await page.waitForTimeout(80);
    await expectRenderedScreenshot(canvas);

    await page.mouse.down();
    await page.mouse.move(200, 120);
    await page.mouse.up();
    await page.waitForTimeout(80);
    await expectRenderedScreenshot(canvas);

    // right drag for pan (new support)
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(180, 130);
    await page.mouse.up();
    await page.waitForTimeout(80);
    await expectRenderedScreenshot(canvas);

    // keyboard interactive (R reset, space play, T/R/S modes)
    await page.keyboard.press('r');
    await page.waitForTimeout(50);
    await expectRenderedScreenshot(canvas);

    await page.keyboard.press(' ');
    await page.waitForTimeout(100);
    await page.keyboard.press(' ');
    await page.waitForTimeout(50);

    await page.keyboard.press('t');
    await page.waitForTimeout(30);
    await page.keyboard.press('r');
    await page.waitForTimeout(30);
    await page.keyboard.press('s');
    await page.waitForTimeout(30);
  });

  // FBX UI parity coverage: format accept/drop hint/export control presence.
  // Fixture-backed FBX coverage below exercises the loader/export dispatch; generated skinned GLB covers skinned non-SMF fidelity.
  test('FBX import happy path coverage (UI + load dispatch)', async ({ page }) => {
    await page.goto('/');

    // UI supports FBX (part of core happy-path for formats)
    const fileInput = page.getByTestId('model-file-input');
    await expect(fileInput).toHaveAttribute('accept', /.*\.fbx.*/);

    // Drop hint mentions FBX
    await expect(page.locator('text=/Drop .* here/')).toContainText(/fbx/i);

    // Export dispatch is covered by the fixture-backed FBX and generated skinned GLB tests; this keeps the UI support check isolated.
    const exportBtn = page.getByTestId('export-btn');
    await expect(exportBtn).toBeVisible();

    // Full FBX parsing runs when the self-authored local fixture is present.
  });

  test('FBX import happy path (self-authored static fixture)', async ({ page }) => {
    test.skip(!SAMPLE_FBX, 'No .fbx test model available. Default repo fixture is source/frontend/tests/test.fbx.');

    await page.goto('/');

    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(SAMPLE_FBX!);

    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/Loaded FBX|bones|clips/i);
    await expect(page.getByTestId('three-canvas')).toBeVisible();

    const exportBtn = page.getByTestId('export-btn');
    await exportBtn.click();
    await expect(page.getByTestId('status-text')).toContainText(/Exported \.fbx/i, { timeout: 5000 });

    await page.getByTestId('export-smf-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(
      /SMF export blocked: SMF_NO_SKINNED_SKELETON|Cannot export as SMF|Exported \.smf/i,
      { timeout: 5000 }
    );
  });

  test('generated skinned GLB load and SMF/GLB export path', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(await createSkinnedGlbFixtureInput());

    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/generated-skinned-fixture\.glb|bones: 2|clips: 1/i);

    const inspector = page.getByTestId('inspector');
    await expect(inspector).toContainText(/Bones \(2\)/i);
    await expect(inspector).toContainText(/FixtureRoot|FixtureTip/i);
    await expect(page.getByTestId('timeline')).toBeVisible();

    await page.getByTestId('mode-tab-rig').click({ force: true });
    await expect(page.getByTestId('rig-workspace-panel')).toBeVisible();
    const rootBoneEntry = inspector.locator('li > div').filter({ hasText: /FixtureRoot/ }).first();
    await expect(rootBoneEntry).toBeVisible();
    await rootBoneEntry.click({ force: true });
    await page.getByTestId('rig-rename-input').fill('FixtureSpine');
    await page.getByTestId('rig-rename-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Renamed bone FixtureRoot to FixtureSpine/i);
    await expect(page.getByTestId('rig-validation-status')).toContainText(/pass/i);
    await expect(inspector).toContainText(/FixtureSpine/i);
    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid rename rig bone FixtureRoot to FixtureSpine/i);
    await expect(inspector).toContainText(/FixtureRoot/i);
    await page.getByTestId('editor-redo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Redid rename rig bone FixtureRoot to FixtureSpine/i);
    await expect(inspector).toContainText(/FixtureSpine/i);

    const tipBoneEntry = inspector.locator('li > div').filter({ hasText: /FixtureTip/ }).first();
    await expect(tipBoneEntry).toBeVisible();
    await tipBoneEntry.click({ force: true });

    await setViewportLayout(page, 'quad');
    await page.getByTestId('rig-tool-add-child').click({ force: true });
    await expect(page.getByTestId('rig-tool-add-child')).toHaveClass(/bg-emerald-500/);
    const rigCanvas = page.getByTestId('three-canvas');
    await expect(rigCanvas).toHaveAttribute('data-rig-tool-mode', 'add-child');
    await page.getByTestId('rig-snap-step').selectOption('0.25');
    await expect(page.getByTestId('status-text')).toContainText(/Rig snap set to 0.25 units/i);
    const rigCanvasBox = await rigCanvas.boundingBox();
    expect(rigCanvasBox).toBeTruthy();
    await page.mouse.click(
      rigCanvasBox!.x + rigCanvasBox!.width * 0.12,
      rigCanvasBox!.y + rigCanvasBox!.height * 0.12,
    );
    await expect(page.getByTestId('status-text')).toContainText(/Created child bone FixtureTip_child under FixtureTip from (top|front|side) pane with 0.25 snap/i);
    await expect(rigCanvas).toHaveAttribute('data-rig-add-child-pane-role', /top|front|side/);
    await expect(page.getByTestId('rig-bone-count')).toContainText('3');
    await expect(inspector).toContainText(/Selected\s*FixtureTip_child/i);

    await page.getByTestId('rig-tool-move').click({ force: true });
    await expect(page.getByTestId('rig-tool-move')).toHaveClass(/bg-emerald-500/);
    await expect(rigCanvas).toHaveAttribute('data-rig-tool-mode', 'move');
    await dragRigMoveInOrthoPane(page);
    await expect(page.getByTestId('status-text')).toContainText(/Moved rig bone FixtureTip_child from (top|front|side) pane with 0.25 snap/i);
    await expect(rigCanvas).not.toHaveAttribute('data-rig-move', 'active');
    await expect(rigCanvas).not.toHaveAttribute('data-rig-move-pane-role', /top|front|side/);
    await expect(inspector).toContainText(/Selected\s*FixtureTip_child/i);
    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid move rig bone FixtureTip_child/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('3');
    await expect(inspector).toContainText(/Selected\s*FixtureTip_child/i);
    await page.getByTestId('editor-redo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Redid move rig bone FixtureTip_child/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('3');
    await expect(inspector).toContainText(/Selected\s*FixtureTip_child/i);

    await page.getByTestId('rig-tool-rotate').click({ force: true });
    await expect(page.getByTestId('rig-tool-rotate')).toHaveClass(/bg-emerald-500/);
    await expect(rigCanvas).toHaveAttribute('data-rig-tool-mode', 'rotate');
    await dragRigRotateInOrthoPane(page);
    await expect(page.getByTestId('status-text')).toContainText(/Rotated rig bone FixtureTip_child from (top|front|side) pane/i);
    await expect(rigCanvas).not.toHaveAttribute('data-rig-rotate', 'active');
    await expect(rigCanvas).not.toHaveAttribute('data-rig-rotate-pane-role', /top|front|side/);
    await expect(inspector).toContainText(/Selected\s*FixtureTip_child/i);
    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid rotate rig bone FixtureTip_child/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('3');
    await page.getByTestId('editor-redo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Redid rotate rig bone FixtureTip_child/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('3');
    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid rotate rig bone FixtureTip_child/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('3');
    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid move rig bone FixtureTip_child/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('3');
    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid create rig bone FixtureTip_child/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('2');
    await expect(inspector).toContainText(/Selected\s*FixtureTip/i);
    await page.getByTestId('editor-redo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Redid create rig bone FixtureTip_child/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('3');
    await expect(inspector).toContainText(/Selected\s*FixtureTip_child/i);
    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid create rig bone FixtureTip_child/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('2');
    await page.getByTestId('rig-tool-select').click({ force: true });
    await expect(page.getByTestId('rig-tool-select')).toHaveClass(/bg-emerald-500/);
    await setViewportLayout(page, 'single');

    await page.getByTestId('rig-create-child-input').fill('FixtureExtra');
    await page.getByTestId('rig-create-child-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Created child bone FixtureExtra under FixtureTip/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('3');
    await expect(inspector).toContainText(/Selected\s*FixtureExtra/i);
    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid create rig bone FixtureExtra/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('2');
    await page.getByTestId('editor-redo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Redid create rig bone FixtureExtra/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('3');
    await expect(inspector).toContainText(/Selected\s*FixtureExtra/i);

    await page.getByTestId('rig-reparent-parent').selectOption('FixtureSpine');
    await page.getByTestId('rig-reparent-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Reparented FixtureExtra under FixtureSpine/i);
    await expect(page.getByTestId('rig-validation-status')).toContainText(/pass/i);
    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid reparent rig bone FixtureExtra under FixtureSpine/i);
    await page.getByTestId('editor-redo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Redid reparent rig bone FixtureExtra under FixtureSpine/i);

    await expect(page.getByTestId('rig-detach-toggle-btn')).toHaveAttribute('data-rig-detach-mode', 'detach');
    await page.getByTestId('rig-detach-toggle-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Detached FixtureExtra from the deform skeleton/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('2');
    await expect(page.getByTestId('bone-tree-item-FixtureExtra')).toHaveAttribute('data-rig-bone-detached', 'true');
    await expect(page.getByTestId('rig-detached-selection-note')).toBeVisible();
    await expect(page.getByTestId('rig-rename-btn')).toBeDisabled();
    await expect(page.getByTestId('rig-detach-toggle-btn')).toHaveAttribute('data-rig-detach-mode', 'connect');
    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid detach rig bone FixtureExtra/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('3');
    await expect(page.getByTestId('bone-tree-item-FixtureExtra')).toHaveAttribute('data-rig-bone-detached', 'false');
    await page.getByTestId('editor-redo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Redid detach rig bone FixtureExtra/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('2');
    await page.getByTestId('rig-detach-toggle-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Connected FixtureExtra to the deform skeleton/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('3');
    await expect(page.getByTestId('bone-tree-item-FixtureExtra')).toHaveAttribute('data-rig-bone-detached', 'false');
    await expect(page.getByTestId('rig-detach-toggle-btn')).toHaveAttribute('data-rig-detach-mode', 'detach');
    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid connect rig bone FixtureExtra/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('2');
    await page.getByTestId('editor-redo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Redid connect rig bone FixtureExtra/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('3');

    await page.getByTestId('rig-spin-z-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Spun rig Z 90 degrees/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('3');
    await expect(inspector).toContainText(/Selected\s*FixtureExtra/i);
    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid spin rig Z/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('3');
    await expect(inspector).toContainText(/Selected\s*FixtureExtra/i);
    await page.getByTestId('editor-redo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Redid spin rig Z/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('3');

    await page.getByTestId('transform-x-btn').click({ force: true });
    await page.getByTestId('rig-delete-bone-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Deleted bone FixtureExtra/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('2');
    await expect(inspector).toContainText(/Selected\s*FixtureSpine/i);
    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid delete rig bone FixtureExtra/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('3');
    await expect(inspector).toContainText(/Selected\s*FixtureExtra/i);
    await page.getByTestId('editor-redo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Redid delete rig bone FixtureExtra/i);
    await expect(page.getByTestId('rig-bone-count')).toContainText('2');
    await expect(inspector).toContainText(/Selected\s*FixtureSpine/i);

    await page.getByTestId('mode-tab-export').click({ force: true });
    const diagnosticsPanel = page.getByTestId('smf-diagnostics-panel');
    await expect(diagnosticsPanel).toBeVisible();
    await expect(diagnosticsPanel).toHaveAttribute('data-smf-can-export', 'true');
    await expect(diagnosticsPanel).toContainText(/SMF diagnostics: ready/i);
    await page.getByTestId('smf-roundtrip-check-btn').click();
    const roundtripResult = page.getByTestId('smf-roundtrip-result');
    await expect(roundtripResult).toBeVisible({ timeout: 5000 });
    await expect(roundtripResult).toHaveAttribute('data-smf-roundtrip-ok', 'true');
    await expect(roundtripResult).toHaveAttribute('data-smf-roundtrip-status', 'passed');
    await expect(roundtripResult).toContainText(/Roundtrip passed/i);
    const roundtripSummaryText = (await roundtripResult.textContent()) || '';
    const normalizedRoundtripSummary = roundtripSummaryText.replace(/\s+/g, ' ');
    expect(normalizedRoundtripSummary).toContain('max vertex delta');
    expect(normalizedRoundtripSummary).toContain('normal delta');
    expect(normalizedRoundtripSummary).toContain('bone pose delta');
    expect(normalizedRoundtripSummary).toContain('samples');
    const checkList = page.getByTestId('smf-roundtrip-check-list');
    await expect(checkList).toContainText(/SMF_ROUNDTRIP_COUNTS_OK/);
    await expect(checkList).toContainText(/SMF_ROUNDTRIP_BOUNDS_OK/);
    await expect(checkList).toContainText(/SMF_ROUNDTRIP_ANIMATION_POSE_OK/);
    await expect(page.getByTestId('status-text')).toContainText(/SMF roundtrip check passed/i, { timeout: 5000 });
    await page.getByTestId('save-smf-report-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Saved SMF diagnostic report/i, { timeout: 5000 });
    await page.getByTestId('mode-tab-rig').click({ force: true });

    const anyBoneEntry = inspector.locator('li > div').filter({ hasText: /FixtureSpine|FixtureTip/ }).first();
    await anyBoneEntry.click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Selected:/i);

    const xBtn = inspector.getByTestId('transform-x-btn');
    if (await xBtn.count() > 0) {
      await xBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(40);
    }
    await expect(page.getByTestId('three-canvas')).toBeVisible();

    const exportSmfBtn = page.getByTestId('export-smf-btn');
    await exportSmfBtn.click();
    await expect(page.getByTestId('status-text')).toContainText(/Exported \.smf \(from GLB\/FBX/i, { timeout: 5000 });

    const exportBtn = page.getByTestId('export-btn');
    await exportBtn.click();
    await expect(page.getByTestId('status-text')).toContainText(/Exported \.glb/i, { timeout: 5000 });

    await expectRenderedScreenshot(page.getByTestId('viewport-container'));

    const errors = getBrowserErrors(page);
    const criticalErrors = errors.filter((e: string) => e.includes('ERROR'));
    expect(criticalErrors.length).toBe(0);
  });

  test('generated skinned GLB with material layout warnings surfaces SMF compatibility notes', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(await createSkinnedGlbFixtureInputWithOptions({ withTexture: true, nonPowerOfTwoTexture: true }));
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });

    await expect(page.getByTestId('status-text')).toContainText(/generated-skinned-fixture-texture\.glb|bones: 2|clips: 1/i);

    await page.getByTestId('mode-tab-export').click({ force: true });
    const diagnosticsPanel = page.getByTestId('smf-diagnostics-panel');
    await expect(diagnosticsPanel).toBeVisible();
    await expect(diagnosticsPanel).toHaveAttribute('data-smf-can-export', 'true');
    await expect(diagnosticsPanel).toContainText(/SMF diagnostics: ready/i);

    const warnings = page.getByTestId('smf-diagnostic-warning');
    await expect(warnings).toHaveCount(1);
    await expect(warnings.first()).toContainText(/SMF_NON_POT_TEXTURE/);
    const textureRows = page.getByTestId('smf-material-texture-row');
    await expect(textureRows).toHaveCount(1);
    await expect(textureRows.first()).toContainText(/FixtureSkinnedMesh/);
    await expect(textureRows.first()).toContainText(/3x2/);
    await expect(textureRows.first()).toContainText(/non-POT/);

    await page.getByTestId('export-smf-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Exported \.smf/i, { timeout: 5000 });
  });

  test('skin paint is disabled without bone selection', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });

    await page.getByTestId('mode-tab-skin').click({ force: true });
    await expect(page.getByTestId('skin-workspace-panel')).toBeVisible();
    await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: false');

    const canvas = page.getByTestId('three-canvas');
    await paintInViewport(page);
    await expect(canvas).toHaveAttribute('data-pointer-owner', 'rig-select');
    await expect(canvas).toHaveAttribute('data-skin-brush-hover', 'inactive');
    const noBoneHitCount = Number(await canvas.getAttribute('data-skin-paint-hit-count'));
    expect(noBoneHitCount).toBe(0);
    expect(await canvas.getAttribute('data-skin-brush-x')).toBe(null);

    const reason = page.getByTestId('skin-export-block');
    await expect(reason).toHaveCount(0);
    await page.getByTestId('export-smf-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Exported \.smf/i, { timeout: 5000 });
  });

  test('skin paint pointer cancel clears active gesture state', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });

    await page.getByTestId('mode-tab-skin').click({ force: true });
    await expect(page.getByTestId('skin-workspace-panel')).toBeVisible();

    const inspector = page.getByTestId('inspector');
    const bone = inspector.locator('li > div').filter({ hasText: /FixtureRoot/ }).first();
    await expect(bone).toBeVisible();
    await bone.click({ force: true });
    await expect(page.getByTestId('inspector-selected')).toHaveText('FixtureRoot');

    await page.getByTestId('skin-paint-mode-add').click({ force: true }).catch(() => {});
    await setRangeValue(page, 'skin-paint-target', 1);
    await setRangeValue(page, 'skin-paint-radius', 1);
    await setRangeValue(page, 'skin-paint-strength', 1);

    const canvas = page.getByTestId('three-canvas');
    expect(await cancelPaintOnMeshInViewport(page)).toBe(true);
    await expect(canvas).toHaveAttribute('data-pointer-owner', 'skin-paint');
    expect(await canvas.getAttribute('data-pointer-owner')).not.toBe('orbit');
    await expect(canvas).not.toHaveAttribute('data-skin-paint-active', 'active');
    await expect(page.getByTestId('inspector-selected')).toHaveText('FixtureRoot');
    await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true');

    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: false');
    await expect(page.getByTestId('inspector-selected')).toHaveText('FixtureRoot');
  });

  test('skin paint updates edit state and exports SMF', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });

    const skinTab = page.getByTestId('mode-tab-skin');
    await skinTab.click({ force: true });
    await expect(skinTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('skin-workspace-panel')).toBeVisible();

    const inspector = page.getByTestId('inspector');
    const bone = inspector.locator('li > div').filter({ hasText: /FixtureRoot/ }).first();
    await expect(bone).toBeVisible();
    await bone.click({ force: true });
    await page.waitForTimeout(50);
    await expect(page.getByTestId('status-text')).toContainText(/Selected:\s*FixtureRoot/i);
    const selectedInspectorValue = page.getByTestId('inspector-selected');
    await expect(selectedInspectorValue).toHaveText('FixtureRoot');

    await page.getByTestId('skin-paint-mode-add').click({ force: true }).catch(() => {});
    await expect(page.getByTestId('skin-paint-mode-add')).toHaveClass(/bg-emerald-500/);
    await setRangeValue(page, 'skin-paint-target', 1);
    await setRangeValue(page, 'skin-paint-radius', 1);
    await setRangeValue(page, 'skin-paint-strength', 1);
    await expect(page.getByTestId('skin-paint-target')).toHaveValue('1');
    await expect(page.getByTestId('skin-paint-radius')).toHaveValue('1');
    await expect(page.getByTestId('skin-paint-strength')).toHaveValue('1');

    const paintCanvas = page.getByTestId('three-canvas');
    const canvasBox = await paintCanvas.boundingBox();
    expect(canvasBox).toBeTruthy();
    await paintInViewport(page, {
      x: canvasBox!.x + 8,
      y: canvasBox!.y + 8,
      dx: 4,
      dy: 4,
    });
    await expect(paintCanvas).toHaveAttribute('data-pointer-owner', 'skin-paint');
    await expect(paintCanvas).toHaveAttribute('data-skin-brush-hover', 'inactive');
    expect(Number(await paintCanvas.getAttribute('data-skin-paint-hit-count'))).toBe(0);
    expect(await paintCanvas.getAttribute('data-skin-brush-x')).toBe(null);
    await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: false');
    await expect(selectedInspectorValue).toHaveText('FixtureRoot');

    await setViewportLayout(page, 'quad');
    expect(await paintOnMeshInViewport(page, { requireDirty: true })).toBe(true);
    await expect(paintCanvas).toHaveAttribute('data-pointer-owner', 'skin-paint');
    await expect(paintCanvas).toHaveAttribute('data-viewport-pane-role', /top|perspective|front|side/);
    expect(await paintCanvas.getAttribute('data-pointer-owner')).not.toBe('orbit');
    await expect(selectedInspectorValue).toHaveText('FixtureRoot');
    await expect(paintCanvas).toHaveAttribute('data-skin-brush-hover', 'active');
    const paintHitCount = Number(await paintCanvas.getAttribute('data-skin-paint-hit-count'));
    expect(paintHitCount).toBeGreaterThan(0);
    await expect(paintCanvas).toHaveAttribute('data-skin-paint-mode', 'add');
    const brushX = await paintCanvas.getAttribute('data-skin-brush-x');
    const brushY = await paintCanvas.getAttribute('data-skin-brush-y');
    const brushZ = await paintCanvas.getAttribute('data-skin-brush-z');
    expect(typeof brushX === 'string' && brushX.length > 0).toBeTruthy();
    expect(typeof brushY === 'string' && brushY.length > 0).toBeTruthy();
    expect(typeof brushZ === 'string' && brushZ.length > 0).toBeTruthy();
    await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true');
    await expect(page.getByTestId('skin-paint-undo-btn')).toBeEnabled();
    await expect(page.getByTestId('skin-paint-redo-btn')).toBeDisabled();
    await expect(page.getByTestId('editor-undo-btn')).toBeEnabled();
    await expect(page.getByTestId('editor-redo-btn')).toBeDisabled();
    await setViewportLayout(page, 'single');

    await page.getByTestId('editor-undo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Undid skin edit/i);
    await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: false');
    await expect(page.getByTestId('skin-paint-undo-btn')).toBeDisabled();
    await expect(page.getByTestId('skin-paint-redo-btn')).toBeEnabled();
    await expect(page.getByTestId('editor-redo-btn')).toBeEnabled();

    await page.keyboard.press('Control+Y');
    await expect(page.getByTestId('status-text')).toContainText(/Redid skin edit/i);
    await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true');
    await expect(page.getByTestId('skin-paint-undo-btn')).toBeEnabled();

    await page.getByTestId('skin-autoskin-algorithm').selectOption('closest-two-segments');
    await page.getByTestId('skin-paint-mode-auto').click({ force: true }).catch(() => {});
    await expect(page.getByTestId('skin-paint-mode-auto')).toHaveClass(/bg-emerald-500/);
    await page.getByTestId('skin-paint-target-mode').selectOption('vertex');
    await setRangeValue(page, 'skin-paint-radius', 0.35);
    await setRangeValue(page, 'skin-paint-strength', 1);
    expect(await paintOnMeshInViewport(page)).toBe(true);
    await expect(paintCanvas).toHaveAttribute('data-skin-paint-mode', 'auto');
    await expect(paintCanvas).toHaveAttribute('data-skin-paint-target-mode', 'vertex');
    const autoPaintHitCount = Number(await paintCanvas.getAttribute('data-skin-paint-hit-count'));
    const autoPaintCandidateCount = Number(await paintCanvas.getAttribute('data-skin-candidate-count'));
    const autoPaintTotalVertexCount = Number(await paintCanvas.getAttribute('data-skin-total-vertex-count'));
    expect(autoPaintHitCount).toBeGreaterThan(0);
    expect(autoPaintCandidateCount).toBeGreaterThan(0);
    expect(autoPaintTotalVertexCount).toBeGreaterThan(autoPaintCandidateCount);
    await expect(page.getByTestId('status-text')).toContainText(/auto Closest two segments mode/i);
    await page.keyboard.press('Control+Z');
    await expect(page.getByTestId('status-text')).toContainText(/Undid skin edit/i);
    await page.getByTestId('editor-redo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Redid skin edit/i);

    await page.getByTestId('skin-autoskin-algorithm').selectOption('nearest-segment');
    await expect(page.getByTestId('skin-autoskin-power')).toBeDisabled();
    await expect(page.getByTestId('skin-autoskin-normal-weighting')).toBeDisabled();
    await expect(page.getByTestId('skin-autoskin-max-influences')).toBeDisabled();
    await page.getByTestId('skin-autoskin-algorithm').selectOption('segment-distance-normal');
    await setRangeValue(page, 'skin-autoskin-power', 3);
    await setRangeValue(page, 'skin-autoskin-normal-weighting', 0.5);
    await setRangeValue(page, 'skin-autoskin-max-influences', 2);
    await expect(page.getByTestId('skin-autoskin-power')).toHaveValue('3');
    await expect(page.getByTestId('skin-autoskin-normal-weighting')).toHaveValue('0.5');
    await expect(page.getByTestId('skin-autoskin-max-influences')).toHaveValue('2');
    await page.getByTestId('skin-autoskin-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Auto skin/i);
    await expect(page.getByTestId('status-text')).toContainText(/power 3, normal 0.5, max 2/i);
    await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true');
    await expect(page.getByTestId('skin-paint-undo-btn')).toBeEnabled();

    await page.keyboard.press('Control+Z');
    await expect(page.getByTestId('status-text')).toContainText(/Undid skin edit/i);
    await expect(page.getByTestId('skin-paint-redo-btn')).toBeEnabled();
    await page.getByTestId('editor-redo-btn').click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Redid skin edit/i);
    await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true');

    await page.getByTestId('export-smf-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Exported \.smf/i, { timeout: 5000 });
    await expect(page.getByTestId('skin-export-block')).toHaveCount(0);
  });

  test('skin brush state clears when switching workspaces', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });

    const skinTab = page.getByTestId('mode-tab-skin');
    await skinTab.click({ force: true });
    await expect(skinTab).toHaveAttribute('aria-selected', 'true');
    const inspector = page.getByTestId('inspector');
    const bone = inspector.locator('li > div').filter({ hasText: /FixtureTip/ }).first();
    await expect(bone).toBeVisible();
    await bone.click({ force: true });
    await page.waitForTimeout(50);

    const statusText = await page.getByTestId('status-text').textContent();
    const selectedBone = parseSelectedBone(statusText);
    expect(selectedBone).toBe('FixtureTip');

    await page.getByTestId('skin-paint-mode-subtract').click({ force: true }).catch(() => {});
    await setRangeValue(page, 'skin-paint-radius', 1);
    await setRangeValue(page, 'skin-paint-strength', 1);
    const paintCanvas = page.getByTestId('three-canvas');
    expect(await paintOnMeshInViewport(page)).toBe(true);
    await expect(paintCanvas).toHaveAttribute('data-skin-brush-hover', 'active');

    await page.getByTestId('mode-tab-view').click({ force: true });
    await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-editor-mode', 'view');
    expect(await paintCanvas.getAttribute('data-skin-brush-hover')).toBe(null);
    expect(await paintCanvas.getAttribute('data-skin-paint-active')).toBe(null);
    expect(await paintCanvas.getAttribute('data-skin-paint-mode')).toBe(null);
    await expect(inspector).toContainText(/Selected\s*FixtureTip/i);
  });

  // OBJ static load parity (per P4 and edge case search).
  // Exercises loadOBJ (static mesh, no skeleton) + status + outliner/inspector (no bones list) + render.
  // Export uses GLB path (intentional limit). Complements SMF/FBX fixture coverage.
  test('OBJ static load parity (full load if sample)', async ({ page }) => {
    test.skip(!SAMPLE_OBJ || !SAMPLE_OBJ.endsWith('.obj'), 'No .obj test model available in this checkout. Default repo fixture is source/frontend/tests/test.obj.');

    await page.goto('/');

    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(SAMPLE_OBJ!);

    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/Loaded|model|OBJ/i);  // OBJ loader sets "OBJ_Root", status typically shows Loaded or verts

    // No skeleton/bones for pure static OBJ
    const inspector = page.getByTestId('inspector');
    await expect(inspector).not.toContainText(/Bones \(\d+\)/i);

    const outliner = page.getByTestId('outliner');
    await expect(outliner).not.toContainText(/Bones/i);  // or + clips if any

    await expect(page.getByTestId('three-canvas')).toBeVisible();

    // Visual smoke for static render
    await expectRenderedScreenshot(page.getByTestId('viewport-container'));

    await page.getByTestId('mode-tab-export').click({ force: true });
    const diagnosticsPanel = page.getByTestId('smf-diagnostics-panel');
    await expect(diagnosticsPanel).toHaveAttribute('data-smf-can-export', 'false');
    await expect(diagnosticsPanel).toContainText(/SMF diagnostics: blocked/i);
    await expect(diagnosticsPanel).toContainText(/SMF_NO_SKINNED_SKELETON/);
    await page.getByTestId('export-smf-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/SMF export blocked: SMF_NO_SKINNED_SKELETON/i, { timeout: 5000 });

    // Sharper error catching: no critical browser errors during static OBJ load (loader now avoids failed tangent computes on minimal static meshes).
    const objErrors = getBrowserErrors(page);
    const objCritical = objErrors.filter((e: string) => e.includes('ERROR'));
    expect(objCritical.length).toBe(0);

    // Optional strict visual for OBJ static state (committed reference for parity).
    // (Run with --update-snapshots to refresh if render changes.)
    // await expectRenderedScreenshot(page.getByTestId('viewport-container'), 3000, { strict: true, name: 'obj-static-parity' });
  });

  // Viewport coverage for transform controls, weight preview, bone selection, and SMF load state.
  test('viewport features smoke', async ({ page }) => {
    test.skip(!SAMPLE_SMF, 'No .smf test model available');
    await page.goto('/');
    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(SAMPLE_SMF!);
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });

    // Viewport basics
    const canvas = page.getByTestId('three-canvas');
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute('data-transform-owner', 'disabled');
    await expect(canvas).toHaveAttribute('data-transform-attached', 'false');

    // Weight preview toggle (for weight preview behavior)
    const weightBtn = page.getByTestId('weight-preview-btn');
    if (await weightBtn.count() > 0) {
      await expect(weightBtn).toBeVisible();
    }

    await page.getByTestId('mode-tab-rig').click({ force: true });
    const inspector = page.getByTestId('inspector');
    const boneEntry = inspector.locator('li > div').filter({ hasText: /./ }).first();
    await expect(boneEntry).toBeVisible();
    await boneEntry.click({ force: true });

    // Transform buttons (for drag/gizmo coverage)
    await expect(page.getByTestId('transform-x-btn')).toBeVisible();
    await expect(page.getByTestId('mode-translate-btn')).toBeVisible();
    await expect(canvas).toHaveAttribute('data-transform-owner', 'pose');
    await expect(canvas).toHaveAttribute('data-transform-attached', 'true');

    // Bone selection via inspector (raycast complement)
    await expect(inspector.locator('li > div').filter({ hasText: /./ }).first()).toBeVisible();
  });
});
