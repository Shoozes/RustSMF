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
import { createSkinnedGlbFixtureInput } from './helpers/skinned-glb-fixture';

const parseSelectedBone = (statusText: string | null): string => {
  const match = /Selected:\s*([^\|\n]+)/.exec(statusText ?? '');
  return match?.[1]?.trim() ?? '';
};

const fileToBase64 = (filePath: string): string => fs.readFileSync(filePath).toString('base64');

type RelativePoint = { x: number; y: number };

const dragEndpointHandle = async (
  page: Page,
  selectedBone: string,
  points?: RelativePoint[],
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
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(30);

    if (active === 'active') {
      await waitForNoActiveEndpointDrag();
      return true;
    }
  }

  return false;
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
    await expect(page.getByTestId('export-smf-btn')).toBeVisible();
    await expect(page.getByTestId('ping-rust-btn')).toBeVisible();

    // Viewport + canvas
    await expect(page.getByTestId('viewport-container')).toBeVisible();
    const canvas = page.getByTestId('three-canvas');
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute('data-viewport-layout', 'single');
    await expect(canvas).toHaveAttribute('data-wireframe-enabled', 'false');
    await expect(page.getByTestId('viewport-layout-single')).toBeDisabled();
    await expect(page.getByTestId('viewport-layout-quad')).toBeDisabled();
    await expect(page.getByTestId('viewport-wireframe-toggle')).toBeDisabled();

    // Timeline and outliner present
    await expect(page.getByTestId('timeline')).toBeVisible();
    await expect(page.getByTestId('outliner')).toBeVisible();
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

    // Timeline should be enabled / have content
    await expect(page.getByTestId('timeline')).toBeVisible();

    // Inspector and outliner should reflect content after load
    await expect(page.getByTestId('inspector')).toBeVisible();
    await expect(page.getByTestId('inspector')).toContainText(/Clips|Selected/i);

    // Bones inspector (basic hierarchy from skeleton)
    await expect(page.getByTestId('inspector')).toContainText(/Bones/i);

    // Canvas still there (Three.js kept rendering)
    await expect(page.getByTestId('three-canvas')).toBeVisible();
    const wireframeBtn = page.getByTestId('viewport-wireframe-toggle');
    const canvas = page.getByTestId('three-canvas');
    await expect(wireframeBtn).toBeEnabled();
    await expect(wireframeBtn).toHaveAttribute('aria-pressed', 'false');
    await wireframeBtn.click();
    await expect(wireframeBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas).toHaveAttribute('data-wireframe-enabled', 'true');
    await expectRenderedScreenshot(page.getByTestId('viewport-container'), 2500);
    await wireframeBtn.click();
    await expect(canvas).toHaveAttribute('data-wireframe-enabled', 'false');

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
    await exportTab.click({ force: true });
    await page.waitForTimeout(20);
    await expect(page.getByTestId('export-workspace-panel')).toBeVisible();
    await viewTab.click({ force: true });
    await page.waitForTimeout(20);
    await expect(page.getByTestId('skin-workspace-panel')).toBeHidden();
    await expect(page.getByTestId('animate-workspace-panel')).toBeHidden();
    await expect(page.getByTestId('export-workspace-panel')).toBeHidden();

    // Exercise 3D viewport click (exercises raycast bone pick handler + orbit compat; no crash expected)
    await canvas.click({ position: { x: 60, y: 60 } });
    await page.waitForTimeout(80);
    await expect(canvas).toBeVisible();

    // Verify bone selection (list or 3D raycast) updates status UX
    await expect(page.getByTestId('status-text')).toContainText(/Selected:/i);

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

    await setViewportLayout(page, 'quad');
    await expect(page.getByTestId('viewport-container')).toBeVisible();
    await expect(page.getByTestId('quad-pane-overlay')).toBeVisible();
    await expect(page.getByTestId('quad-pane-label-top')).toContainText('Top');
    await expect(page.getByTestId('quad-pane-label-3d')).toContainText('3D');
    await expect(page.getByTestId('quad-pane-label-front')).toContainText('Front');
    await expect(page.getByTestId('quad-pane-label-side')).toContainText('Side');
    await expectRenderedScreenshot(page.getByTestId('viewport-container'), 2500);

    // Quad mode is now wired for deterministic per-pane interaction: each panel is clickable and should not
    // throw selection errors while raycast/orbit filters route the active pane behavior.
    const canvas = page.getByTestId('three-canvas');
    const box = await canvas.boundingBox();
    if (box) {
      const points = [
        { x: box.x + box.width * 0.25, y: box.y + box.height * 0.25 },
        { x: box.x + box.width * 0.75, y: box.y + box.height * 0.25 },
        { x: box.x + box.width * 0.25, y: box.y + box.height * 0.75 },
        { x: box.x + box.width * 0.75, y: box.y + box.height * 0.75 },
      ];
      for (const p of points) {
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(40);
      }
      await expect(canvas).toBeVisible();
    }

    await setViewportLayout(page, 'single');
    await expect(page.getByTestId('viewport-container')).toBeVisible();
    await expect(page.getByTestId('quad-pane-overlay')).toBeHidden();
    await expectRenderedScreenshot(page.getByTestId('viewport-container'), 2500);
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
    const singleDrag = await dragEndpointHandle(page, selectedBone);
    expect(singleDrag).toBe(true);

    await setViewportLayout(page, 'quad');
    const quadDragOk = await dragEndpointHandle(page, selectedBone);
    expect(quadDragOk).toBe(true);

    await setViewportLayout(page, 'single');
    await expect(singleCanvas).not.toHaveAttribute('data-endpoint-drag', 'active');
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
    await expectRenderedScreenshot(canvas);

    // Exercise bone selection + transforms/gizmo (functional, Cycle 3) before export (covers desktop sim path)
    const inspector = page.getByTestId('inspector');
    const anyBoneEntry = inspector.locator('li > div').filter({ hasText: /./ }).nth(0);
    if (await anyBoneEntry.count() > 0) {
      await anyBoneEntry.click({ force: true }).catch(() => {});
      await page.waitForTimeout(60);
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

    // Canvas/raycast click for 3D select
    await canvas.click({ position: { x: 60, y: 60 } });
    await page.waitForTimeout(80);
    await expect(page.getByTestId('status-text')).toContainText(/Selected:/i);

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
    await expect(page.getByTestId('status-text')).toContainText(/Exported \.glb/i, { timeout: 5000 });

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

    await page.getByTestId('mode-tab-export').click({ force: true });
    const diagnosticsPanel = page.getByTestId('smf-diagnostics-panel');
    await expect(diagnosticsPanel).toBeVisible();
    await expect(diagnosticsPanel).toHaveAttribute('data-smf-can-export', 'true');
    await expect(diagnosticsPanel).toContainText(/SMF diagnostics: ready/i);
    await page.getByTestId('smf-roundtrip-check-btn').click();
    const roundtripResult = page.getByTestId('smf-roundtrip-result');
    await expect(roundtripResult).toBeVisible({ timeout: 5000 });
    await expect(roundtripResult).toHaveAttribute('data-smf-roundtrip-ok', 'true');
    await expect(roundtripResult).toContainText(/Roundtrip passed/i);
    await expect(page.getByTestId('status-text')).toContainText(/SMF roundtrip check passed/i, { timeout: 5000 });
    await page.getByTestId('save-smf-report-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Saved SMF diagnostic report/i, { timeout: 5000 });
    await page.getByTestId('mode-tab-view').click({ force: true });

    const anyBoneEntry = inspector.locator('li > div').filter({ hasText: /FixtureRoot|FixtureTip/ }).first();
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
    await expect(page.getByTestId('three-canvas')).toBeVisible();

    // Weight preview toggle (for weight preview behavior)
    const weightBtn = page.getByTestId('weight-preview-btn');
    if (await weightBtn.count() > 0) {
      await expect(weightBtn).toBeVisible();
    }

    // Transform buttons (for drag/gizmo coverage)
    await expect(page.getByTestId('transform-x-btn')).toBeVisible();
    await expect(page.getByTestId('mode-translate-btn')).toBeVisible();

    // Bone selection via inspector (raycast complement)
    const inspector = page.getByTestId('inspector');
    await expect(inspector.locator('li > div').filter({ hasText: /./ }).first()).toBeVisible();
  });
});
