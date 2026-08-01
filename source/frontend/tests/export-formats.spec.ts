import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { SAMPLE_FBX, SAMPLE_INDEPENDENT_FBX, SAMPLE_OBJ, SAMPLE_SMF, expectRenderedScreenshot, getBrowserErrors, pausePlaybackIfRunning, setupBrowserDiagnostics } from './helpers/smoke-helpers';
import { createSkinnedGlbFixtureInput, createSkinnedGlbFixtureInputWithOptions } from './helpers/skinned-glb-fixture';
import { readGlbJson } from './helpers/format-assertions';
import { openViewportDisplayMenu, setViewportLayout, dragRigMoveInOrthoPane, dragRigRotateInOrthoPane } from './helpers/viewport-interactions';
import { setRangeValue } from './helpers/timeline-interactions';

// Browser integration coverage is split by feature ownership.
// Native IPC and filesystem coverage lives in native.spec.ts and Rust tests.

test.describe('RustSMF export formats flow (Chromium)', () => {
  test.beforeEach(async ({ page }) => {
    setupBrowserDiagnostics(page);
  });

  test('export flow and basic visuals (smoke for roundtrip prep)', async ({ page }) => {
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(SAMPLE_SMF);

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
      await expect(page.getByTestId('status-text')).toContainText(/verified \d+ bones, \d+ clips/i);
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

  // FBX UI parity coverage: format accept/drop hint/export control presence.
    // Fixture-backed FBX coverage below exercises the loader/export dispatch; generated skinned GLB covers skinned non-SMF fidelity.
    test('FBX import happy path coverage (UI + load dispatch)', async ({ page }) => {
      await page.goto('/');

      // UI supports FBX (part of core happy-path for formats)
      const fileInput = page.getByTestId('model-file-input');
      await expect(fileInput).toHaveAttribute('accept', /.*\.fbx.*/);

      // Drop hint mentions FBX
      await expect(page.locator('text=/Drop .* here/')).toContainText(/fbx/i);

      // Dedicated FBX export is available independently of source-aware Export.
      await expect(page.getByTestId('export-fbx-btn')).toBeVisible();

      // Full FBX parsing runs when the self-authored local fixture is present.
    });

  test('FBX import happy path (self-authored static fixture)', async ({ page }) => {
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(SAMPLE_FBX);

      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await expect(page.getByTestId('status-text')).toContainText(/Loaded FBX|bones|clips/i);
      await expect(page.getByTestId('three-canvas')).toBeVisible();

      const exportBtn = page.getByTestId('export-btn');
      await exportBtn.click();
      await expect(page.getByTestId('status-text')).toContainText(/Exported \.fbx/i, { timeout: 5000 });

      await page.getByTestId('mode-tab-export').click({ force: true });
      const diagnosticsPanel = page.getByTestId('smf-diagnostics-panel');
      await expect(diagnosticsPanel).toHaveAttribute('data-smf-can-export', 'false');
      await expect(page.getByTestId('export-smf-btn')).toBeDisabled();
    });

  test('independent textured skinned FBX imports, exports, and reimports', async ({ page }) => {
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(SAMPLE_INDEPENDENT_FBX);
      await expect(page.getByTestId('status-text')).toContainText(
        /Loaded FBX: independent_skinned\.fbx/i,
        { timeout: 15000 },
      );
      await expect(page.getByTestId('status-text')).toContainText(/bones: 2|clips: 1/i);
      await expect(page.getByTestId('inspector')).toContainText(/IndependentRoot|IndependentTip/i);
      await expect(page.getByTestId('timeline')).toBeVisible();
      await expectRenderedScreenshot(page.getByTestId('three-canvas'));
      expect(getBrowserErrors(page).filter((entry) => entry.includes('ERROR'))).toEqual([]);

      await page.getByTestId('mode-tab-export').click({ force: true });
      await expect(page.getByTestId('texture-export-policy-panel')).toBeVisible();
      await expect(page.getByTestId('smf-material-texture-row')).toHaveCount(1);
      await page.getByTestId('mode-tab-view').click({ force: true });

      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('export-fbx-btn').click();
      const download = await downloadPromise;
      const downloadPath = await download.path();
      expect(downloadPath).not.toBeNull();
      const bytes = fs.readFileSync(downloadPath!);
      expect(bytes.toString('utf8', 0, 21)).toBe('Kaydara FBX Binary  \0');
      fs.mkdirSync('test-results', { recursive: true });
      await download.saveAs('test-results/independent-skinned-roundtrip.fbx');

      await input.setInputFiles({
        name: 'independent-skinned-roundtrip.fbx',
        mimeType: 'application/octet-stream',
        buffer: bytes,
      });
      await expect(page.getByTestId('status-text')).toContainText(
        /Loaded FBX: independent-skinned-roundtrip\.fbx/i,
        { timeout: 15000 },
      );
      await expect(page.getByTestId('status-text')).toContainText(/bones: 2|clips: 1/i);
      await expect(page.getByTestId('timeline')).toBeVisible();
      expect(getBrowserErrors(page).filter((entry) => entry.includes('ERROR'))).toEqual([]);
    });

  test('explicit FBX export converts a generated skinned GLB and reimports it', async ({ page }) => {
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).toContainText(
        /generated-skinned-fixture\.glb|bones: 2|clips: 1/i,
        { timeout: 15000 },
      );

      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('export-fbx-btn').click();
      const download = await downloadPromise;
      await expect(page.getByTestId('status-text')).toContainText(/Exported \.fbx \(binary FBX 7500\)/i, { timeout: 5000 });
      expect(download.suggestedFilename()).toBe('exported_model.fbx');

      const downloadPath = await download.path();
      expect(downloadPath).not.toBeNull();
      const bytes = fs.readFileSync(downloadPath!);
      expect(bytes.toString('utf8', 0, 21)).toBe('Kaydara FBX Binary  \0');

      await input.setInputFiles({
        name: 'generated-skinned-roundtrip.fbx',
        mimeType: 'application/octet-stream',
        buffer: bytes,
      });
      await expect(page.getByTestId('status-text')).toContainText(/Loaded FBX: generated-skinned-roundtrip\.fbx/i, { timeout: 15000 });
      await expect(page.getByTestId('status-text')).toContainText(/bones: 2|clips: 1/i);
      await expect(page.getByTestId('timeline')).toBeVisible();
      expect(getBrowserErrors(page).filter((entry) => entry.includes('ERROR'))).toEqual([]);
    });

  test('generated skinned GLB load, GLB export, and SMF conversion', async ({ page }) => {
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
      await expect(page.getByTestId('smf-roundtrip-check-btn')).toBeEnabled();
      await page.getByTestId('smf-roundtrip-check-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/SMF roundtrip check passed/i, { timeout: 15000 });
      await expect(page.getByTestId('smf-roundtrip-result')).toHaveAttribute('data-smf-roundtrip-ok', 'true');
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

      await expect(page.getByTestId('export-smf-btn')).toBeEnabled();

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

      await openViewportDisplayMenu(page);
      await page.getByTestId('viewport-texture-toggle').click();
      await page.getByTestId('viewport-texture-repeat-toggle').click();
      await page.getByTestId('viewport-texture-filter-toggle').click();
      await page.getByTestId('viewport-texture-filter-toggle').click();
      await page.getByTestId('viewport-shader-toggle').click();
      await page.getByTestId('viewport-model-opacity-toggle').click();
      const canvas = page.getByTestId('three-canvas');
      await expect(canvas).toHaveAttribute('data-texture-enabled', 'false');
      await expect(canvas).toHaveAttribute('data-texture-repeat-preview', 'true');
      await expect(canvas).toHaveAttribute('data-texture-filter-preview', 'linear');
      await expect(canvas).toHaveAttribute('data-shader-enabled', 'true');
      await expect(canvas).toHaveAttribute('data-model-opacity', '0.35');

      await page.getByTestId('mode-tab-export').click({ force: true });
      const policyPanel = page.getByTestId('texture-export-policy-panel');
      await expect(policyPanel).toBeVisible();
      await expect(policyPanel.getByTestId('texture-export-policy-row')).toHaveCount(4);
      await expect(policyPanel.locator('[data-export-action="export"]')).toHaveAttribute('data-export-format', 'glb');
      await expect(policyPanel.locator('[data-export-action="glb"]')).toHaveAttribute('data-texture-policy', 'embedded');
      await expect(policyPanel.locator('[data-export-action="fbx"]')).toHaveAttribute('data-texture-policy', 'embedded');
      await expect(policyPanel.locator('[data-export-action="smf"]')).toHaveAttribute('data-texture-policy', 'omitted');
      await expect(page.getByTestId('legacy-material-policy-row')).toHaveCount(3);
      await expect(page.getByTestId('legacy-material-policy-panel')).toContainText(/workspace snap|Preflight only|Resolved by format/i);
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
      await expect(page.getByTestId('duplicate-texture-groups-empty')).toBeVisible();

      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('export-glb-btn').click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('exported_model.glb');
      const downloadPath = await download.path();
      expect(downloadPath).not.toBeNull();
      const exportedGlb = readGlbJson(fs.readFileSync(downloadPath!));
      expect(exportedGlb.images?.length).toBe(1);
      expect(exportedGlb.textures?.length).toBe(1);
      await expect(page.getByTestId('status-text')).toContainText(/Exported \.glb/i, { timeout: 5000 });
      await expect(canvas).toHaveAttribute('data-texture-enabled', 'false');
      await expect(canvas).toHaveAttribute('data-texture-repeat-preview', 'true');
      await expect(canvas).toHaveAttribute('data-texture-filter-preview', 'linear');
      await expect(canvas).toHaveAttribute('data-shader-enabled', 'true');

      await expect(page.getByTestId('export-smf-btn')).toBeEnabled();
    });

  // OBJ static load parity (per P4 and edge case search).
    // Exercises loadOBJ (static mesh, no skeleton) + status + outliner/inspector (no bones list) + render.
    // Export uses GLB path (intentional limit). Complements SMF/FBX fixture coverage.
    test('OBJ static load parity (full load if sample)', async ({ page }) => {
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(SAMPLE_OBJ);

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
      await expect(page.getByTestId('export-smf-btn')).toBeDisabled();

      // Sharper error catching: no critical browser errors during static OBJ load (loader now avoids failed tangent computes on minimal static meshes).
      const objErrors = getBrowserErrors(page);
      const objCritical = objErrors.filter((e: string) => e.includes('ERROR'));
      expect(objCritical.length).toBe(0);

      // Optional strict visual for OBJ static state (committed reference for parity).
      // (Run with --update-snapshots to refresh if render changes.)
      // await expectRenderedScreenshot(page.getByTestId('viewport-container'), 3000, { strict: true, name: 'obj-static-parity' });
    });
});
