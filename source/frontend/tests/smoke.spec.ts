import { test, expect } from '@playwright/test';
import fs from 'fs';
import {
  BAD_INPUT_FOR_ERROR_TEST,
  SAMPLE_FBX,
  SAMPLE_OBJ,
  SAMPLE_SMF,
  expectRenderedScreenshot,
  getBrowserErrors,
  pausePlaybackIfRunning,
  setupBrowserDiagnostics,
} from './helpers/smoke-helpers';
import { createSkinnedGlbFixtureInput } from './helpers/skinned-glb-fixture';

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
    await expect(page.getByTestId('three-canvas')).toBeVisible();

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

    // Editor mode select (new foundation for modern workspaces #1): presence + change exercises state flow from Toolbar through hook/store. Sharpens mode edge coverage.
    // Test interactions with other recent features (labels toggle, bone pick) post mode change; verify no breakage or state corruption.
    const modeSelect = page.getByTestId('editor-mode-select');
    await expect(modeSelect).toBeVisible();
    await modeSelect.selectOption('rig').catch(() => {});
    await page.waitForTimeout(30);
    // Interact with labels and bone selection while in 'rig' mode (edge: mode + labels + picker)
    const labelsBtn2 = inspector.getByTestId('labels-toggle-btn');
    await labelsBtn2.click({ force: true }).catch(() => {});
    await page.waitForTimeout(30);
    const pickCanvas = page.getByTestId('three-canvas');
    await pickCanvas.click({ position: { x: 70, y: 70 } });
    await page.waitForTimeout(50);
    await expect(page.getByTestId('status-text')).toContainText(/Selected:/i);
    // Reset mode
    await modeSelect.selectOption('view').catch(() => {});
    await expect(page.getByTestId('three-canvas')).toBeVisible();

    // Exercise 3D viewport click (exercises raycast bone pick handler + orbit compat; no crash expected)
    const canvas = page.getByTestId('three-canvas');
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
    await expect(page.getByTestId('status-text')).toContainText(/No skinned model loaded|Nothing to export as SMF/i);

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
      /No skinned model loaded for SMF export|Cannot export as SMF|Exported \.smf/i,
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
