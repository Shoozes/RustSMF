import { workspaceLocator, workspaceControl, selectWorkspace, clickSecondaryCommand, showModernPanel, showSkinAdvanced } from './helpers/modern-shell';

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { SAMPLE_FBX, SAMPLE_SMF, SyntheticDropFile, dispatchSyntheticDrop, restoreBrowserFileArrayBuffer, withBrowserFileArrayBufferDelay, getBrowserErrors, pausePlaybackIfRunning, setupBrowserDiagnostics } from './helpers/smoke-helpers';
import { createSkinnedGlbFixtureInput } from './helpers/skinned-glb-fixture';
import { createSmfStressFixtureInput } from './helpers/smf-stress-fixture';
import { startSmfCodecProbe, stopSmfCodecProbe } from './helpers/smf-codec-probe';
import { parseSelectedBone, fileToBase64 } from './helpers/format-assertions';
import { paintOnMeshInViewport } from './helpers/viewport-interactions';
import { setRangeValue } from './helpers/timeline-interactions';

// Browser integration coverage is split by feature ownership.
// Native IPC and filesystem coverage lives in native.spec.ts and Rust tests.

test.describe('RustSMF lifecycle flow (Chromium)', () => {
  test.beforeEach(async ({ page }) => {
    setupBrowserDiagnostics(page);
  });

  test('latest async load wins between file input and drop', async ({ page }) => {
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      const inputDropTarget = page.getByTestId('viewport-container');
      const fbxBase64 = fileToBase64(SAMPLE_FBX);
      const dropFileSpec: SyntheticDropFile = {
        name: 'sample-fbx.fbx',
        mimeType: 'application/x-fbx',
        base64: fbxBase64,
      };

      await withBrowserFileArrayBufferDelay(page, {
        delayedFileName: path.basename(SAMPLE_SMF),
        delayMs: 450,
      });

      try {
        await input.setInputFiles(SAMPLE_SMF);
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

  test('stale browser read error cannot overwrite a newer successful drop', async ({ page }) => {
      await page.goto('/');

      const fixture = await createSkinnedGlbFixtureInput();
      const staleName = 'stale-read-error.glb';
      const input = page.getByTestId('model-file-input');
      await withBrowserFileArrayBufferDelay(page, {
        delayedFileName: staleName,
        delayMs: 350,
        rejectMessage: 'delayed stale read failed',
      });

      try {
        await input.setInputFiles({ ...fixture, name: staleName });
        await dispatchSyntheticDrop(page.getByTestId('viewport-container'), {
          name: 'newer-success.glb',
          mimeType: fixture.mimeType,
          base64: fixture.buffer.toString('base64'),
        });

        await expect(page.getByTestId('status-text')).toContainText('newer-success.glb', { timeout: 15000 });
        const canvas = page.getByTestId('three-canvas');
        const rootId = await canvas.getAttribute('data-model-root-id');
        expect(rootId).toBeTruthy();
        await page.waitForTimeout(450);
        await expect(canvas).toHaveAttribute('data-model-root-id', rootId!);
        await expect(page.getByTestId('status-text')).toContainText('newer-success.glb');
        await expect(page.getByTestId('error-banner')).toBeHidden();
      } finally {
        await restoreBrowserFileArrayBuffer(page);
      }
    });

  test('browser Open reports a selected-file read failure instead of a cancel', async ({ page }) => {
      await page.goto('/');

      const fixture = await createSkinnedGlbFixtureInput();
      const failedName = 'unreadable-selection.glb';
      await withBrowserFileArrayBufferDelay(page, {
        delayedFileName: failedName,
        delayMs: 25,
        rejectMessage: 'simulated browser read failure',
      });

      try {
        const chooserPromise = page.waitForEvent('filechooser');
        await page.getByTestId('open-model-btn').click();
        const chooser = await chooserPromise;
        await chooser.setFiles({ ...fixture, name: failedName });

        await expect(page.getByTestId('status-text')).toContainText(
          /Open error: Could not read model bundle "unreadable-selection\.glb": simulated browser read failure/i,
        );
        await expect(page.getByTestId('error-banner')).toContainText(/simulated browser read failure/i);
        await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', '');
      } finally {
        await restoreBrowserFileArrayBuffer(page);
      }
    });

  test('stale browser read success cannot overwrite a newer load error', async ({ page }) => {
      await page.goto('/');

      const fixture = await createSkinnedGlbFixtureInput();
      const staleName = 'stale-read-success.glb';
      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(fixture);
      await expect(page.getByTestId('status-text')).toContainText(fixture.name, { timeout: 15000 });
      const originalRootId = await page.getByTestId('three-canvas').getAttribute('data-model-root-id');
      expect(originalRootId).toBeTruthy();
      await selectWorkspace(page, 'rig');
      await page.getByTestId('inspector').locator('li > div').filter({ hasText: /FixtureTip/ }).first().click({ force: true });
      await (await workspaceControl(page, 'transform-x-btn')).click();
      await selectWorkspace(page, 'animate');
      await pausePlaybackIfRunning(page);
      await (await workspaceControl(page, 'animation-insert-key-btn')).click();
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');
      await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');
      await withBrowserFileArrayBufferDelay(page, {
        delayedFileName: staleName,
        delayMs: 350,
      });

      try {
        await input.setInputFiles({ ...fixture, name: staleName });
        await expect(page.getByTestId('replacement-dialog')).toBeVisible();
        await page.getByTestId('confirm-model-replacement').click();
        await dispatchSyntheticDrop(page.getByTestId('viewport-container'), {
          name: 'newer-invalid.glb',
          mimeType: 'model/gltf-binary',
          base64: Buffer.from('not a glb').toString('base64'),
        });
        await expect(page.getByTestId('replacement-dialog')).toBeVisible();
        await page.getByTestId('confirm-model-replacement').click();

        await expect(page.getByTestId('status-text')).toContainText('Load error:', { timeout: 15000 });
        const failedStatus = await page.getByTestId('status-text').textContent();
        await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', originalRootId!);
        await page.waitForTimeout(450);
        await expect(page.getByTestId('status-text')).toHaveText(failedStatus!);
        await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', originalRootId!);
        await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');
        await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');
        await expect(page.getByTestId('inspector-selected')).toHaveText('FixtureTip');
        await expect(page.getByTestId('error-banner')).toBeVisible();
      } finally {
        await restoreBrowserFileArrayBuffer(page);
      }
    });

  test('browser diagnostic and model exports share one save flight', async ({ page }) => {
      await page.goto('/');
      await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await selectWorkspace(page, 'export');
      await expect(page.getByTestId('save-smf-report-btn')).toBeVisible();

      const downloadNames: string[] = [];
      page.on('download', (download) => downloadNames.push(download.suggestedFilename()));
      const firstDownload = page.waitForEvent('download');
      await page.evaluate(() => {
        for (const testId of ['save-smf-report-btn', 'export-btn', 'export-glb-btn', 'export-fbx-btn', 'export-smf-btn']) {
          document.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)?.click();
        }
      });
      await firstDownload;
      await expect(page.getByTestId('status-text')).toContainText('Saved SMF diagnostic report.', { timeout: 5000 });
      await page.waitForTimeout(250);
      expect(downloadNames).toEqual(['rustsmf-smf-report.json']);
    });

  test('skin dirty state resets when stale overlapped load wins from drop', async ({ page }) => {
      await page.goto('/');

      const skinnedFixtureInput = await createSkinnedGlbFixtureInput();
      const input = page.getByTestId('model-file-input');
      const inputDropTarget = page.getByTestId('viewport-container');
      const fbxBase64 = fileToBase64(SAMPLE_FBX);
      const dropFileSpec: SyntheticDropFile = {
        name: 'sample-fbx.fbx',
        mimeType: 'application/x-fbx',
        base64: fbxBase64,
      };

      await input.setInputFiles(skinnedFixtureInput);
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await expect(page.getByTestId('status-text')).toContainText(/generated-skinned-fixture|bones: 2|clips: 1/i);
      await selectWorkspace(page, 'rig');
      await expect(page.getByTestId('rig-workspace-panel')).toBeVisible();
      await expect(page.getByTestId('rig-validation-status')).toContainText(/pass/i);
      await expect(page.getByTestId('rig-bone-count')).toContainText('2');
      await selectWorkspace(page, 'skin');
      await expect(page.getByTestId('skin-workspace-panel')).toBeVisible();
      await showSkinAdvanced(page);
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
      const fixtureBone = await workspaceLocator(page, inspector.locator('li > div').filter({ hasText: /FixtureRoot/ }).first());
      await fixtureBone.click({ force: true });
      await page.waitForTimeout(60);
      const selectedBefore = parseSelectedBone(await page.getByTestId('status-text').textContent());
      expect(selectedBefore).toBe('FixtureRoot');

      await (await workspaceControl(page, 'skin-paint-mode-add')).click();
      await setRangeValue(page, 'skin-paint-target', 1);
      await setRangeValue(page, 'skin-paint-radius', 1);
      await setRangeValue(page, 'skin-paint-strength', 1);
      expect(await paintOnMeshInViewport(page, { requireDirty: true })).toBe(true);
      await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true');

      await withBrowserFileArrayBufferDelay(page, {
        delayedFileName: path.basename(SAMPLE_SMF),
        delayMs: 450,
      });

      try {
        await input.setInputFiles(SAMPLE_SMF);
        await expect(page.getByTestId('replacement-dialog')).toBeVisible();
        await page.getByTestId('confirm-model-replacement').click();
        await dispatchSyntheticDrop(inputDropTarget, dropFileSpec);
        await expect(page.getByTestId('replacement-dialog')).toBeVisible();
        await page.getByTestId('confirm-model-replacement').click();

        await expect(page.getByTestId('status-text')).toContainText('Loaded FBX', { timeout: 15000 });
        await expect(page.getByTestId('status-text')).not.toContainText(/Loaded:.*\.smf|mixamo|FixtureRoot|FixtureTip/i);
        await selectWorkspace(page, 'skin');
        await showSkinAdvanced(page);
        await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: false');
        await expect(page.getByTestId('skin-export-block')).toHaveCount(0);
      } finally {
        await restoreBrowserFileArrayBuffer(page);
      }
    });

  test('pose edit dirty state resets when stale overlapped load wins from drop', async ({ page }) => {
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      const inputDropTarget = page.getByTestId('viewport-container');
      const fbxBase64 = fileToBase64(SAMPLE_FBX);
      const dropFileSpec: SyntheticDropFile = {
        name: 'sample-fbx.fbx',
        mimeType: 'application/x-fbx',
        base64: fbxBase64,
      };

      await input.setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await expect(page.getByTestId('status-text')).toContainText(/generated-skinned-fixture|bones: 2|clips: 1/i);
      await selectWorkspace(page, 'rig');
      await expect(page.getByTestId('inspector')).toBeVisible();
      const firstBone = await workspaceLocator(page, page.getByTestId('inspector').locator('li > div').filter({ hasText: /FixtureTip/ }).first());
      await expect(firstBone).toBeVisible();
      await firstBone.click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Selected:\s*FixtureTip/i);
      await (await workspaceControl(page, 'transform-x-btn')).click();
      await selectWorkspace(page, 'animate');
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');
      await pausePlaybackIfRunning(page);
      await (await workspaceControl(page, 'animation-insert-key-btn')).click();
      await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');

      await withBrowserFileArrayBufferDelay(page, {
        delayedFileName: path.basename(SAMPLE_SMF),
        delayMs: 450,
      });

      try {
        await input.setInputFiles(SAMPLE_SMF);
        await expect(page.getByTestId('replacement-dialog')).toBeVisible();
        await page.getByTestId('confirm-model-replacement').click();
        await dispatchSyntheticDrop(inputDropTarget, dropFileSpec);
        await expect(page.getByTestId('replacement-dialog')).toBeVisible();
        await page.getByTestId('confirm-model-replacement').click();

        await expect(page.getByTestId('status-text')).toContainText('Loaded FBX', { timeout: 15000 });
        await expect(page.getByTestId('status-text')).not.toContainText(/Loaded:.*\.smf|mixamo|FixtureTip|Pose edit dirty/i);

        await selectWorkspace(page, 'animate');
        await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: false');
        await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: false');
      } finally {
        await restoreBrowserFileArrayBuffer(page);
      }
    });

  test('dirty replacement can be canceled or explicitly discarded', async ({ page }) => {
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      const originalRootId = await page.getByTestId('three-canvas').getAttribute('data-model-root-id');
      expect(originalRootId).toBeTruthy();

      await selectWorkspace(page, 'rig');
      await page.getByTestId('inspector').locator('li > div').filter({ hasText: /FixtureTip/ }).first().click({ force: true });
      await (await workspaceControl(page, 'transform-x-btn')).click();
      await selectWorkspace(page, 'animate');
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');

      await input.setInputFiles(SAMPLE_SMF);
      await expect(page.getByTestId('replacement-dialog')).toBeVisible();
      await page.getByTestId('cancel-model-replacement').click();
      await expect(page.getByTestId('replacement-dialog')).toHaveCount(0);
      await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', originalRootId!);
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');
      await expect(page.getByTestId('status-text')).toContainText('replacement canceled', { ignoreCase: true });

      await input.setInputFiles(SAMPLE_SMF);
      await expect(page.getByTestId('replacement-dialog')).toBeVisible();
      await page.getByTestId('confirm-model-replacement').click();
      await expect(page.getByTestId('status-text')).toContainText(/Loaded:.*\.smf/i, { timeout: 15000 });
      await expect(page.getByTestId('three-canvas')).not.toHaveAttribute('data-model-root-id', originalRootId!);
      await selectWorkspace(page, 'animate');
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: false');
    });

  test('global undo and redo follow chronology across outliner and pose edits', async ({ page }) => {
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await expect(page.getByTestId('status-text')).toContainText(/generated-skinned-fixture|bones: 2|clips: 1/i);

      await showModernPanel(page, 'scene');

      const firstSubmodel = (await workspaceControl(page, 'outliner-submodel-0'));
      await showModernPanel(page, 'scene');
      const firstVisibilityToggle = (await workspaceControl(page, 'outliner-visibility-toggle-0'));
      await expect(firstSubmodel).toHaveAttribute('data-visible', 'true');
      await firstVisibilityToggle.click();
      await expect(firstSubmodel).toHaveAttribute('data-visible', 'false');

      await selectWorkspace(page, 'rig');
      const inspector = page.getByTestId('inspector');
      const boneEntry = await workspaceLocator(page, inspector.locator('li > div').filter({ hasText: /FixtureTip/ }).first());
      await expect(boneEntry).toBeVisible();
      await boneEntry.click({ force: true });
      await (await workspaceControl(page, 'transform-x-btn')).click();

      await selectWorkspace(page, 'animate');
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');

      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid Nudge FixtureTip/i);
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: false');
      await showModernPanel(page, 'scene');
      await expect(firstSubmodel).toHaveAttribute('data-visible', 'false');

      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid outliner visibility toggle/i);
      await expect(firstSubmodel).toHaveAttribute('data-visible', 'true');

      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid outliner visibility toggle/i);
      await expect(firstSubmodel).toHaveAttribute('data-visible', 'false');
      await showModernPanel(page, 'properties');
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: false');

      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid Nudge FixtureTip/i);
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');
    });

  test('large SMF import and export stay responsive with worker progress', async ({ page }) => {
      test.setTimeout(90_000);
      await page.goto('/');

      const fixture = createSmfStressFixtureInput();
      await startSmfCodecProbe(page);
      await page.getByTestId('model-file-input').setInputFiles(fixture);
      await expect(page.getByTestId('status-text')).toContainText(/Loaded: worker-stress\.smf/i, {
        timeout: 45_000,
      });
      await expect(page.getByTestId('smf-codec-progress')).toBeHidden();

      const importProbe = await stopSmfCodecProbe(page);
      const importSamples = importProbe.samples.filter((sample) => sample.operation === 'import');
      expect(importSamples.length).toBeGreaterThan(1);
      expect(importSamples.every((sample) => sample.execution === 'worker')).toBe(true);
      expect(importSamples.every((sample, index) => (
        index === 0 || sample.percent >= importSamples[index - 1].percent
      ))).toBe(true);
      expect(Math.max(...importSamples.map((sample) => sample.percent))).toBeGreaterThan(0);
      expect(importProbe.activeHeartbeats).toBeGreaterThan(0);

      await startSmfCodecProbe(page);
      const downloadPromise = page.waitForEvent('download');
      await clickSecondaryCommand(page, 'export-smf-btn');
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('exported_model.smf');
      await expect(page.getByTestId('status-text')).toContainText(/Exported \.smf/i, {
        timeout: 45_000,
      });
      await expect(page.getByTestId('smf-codec-progress')).toBeHidden();

      const exportProbe = await stopSmfCodecProbe(page);
      const exportSamples = exportProbe.samples.filter((sample) => sample.operation === 'export');
      expect(exportSamples.length).toBeGreaterThan(1);
      expect(exportSamples.every((sample) => sample.execution === 'worker')).toBe(true);
      expect(exportSamples.every((sample, index) => (
        index === 0 || sample.percent >= exportSamples[index - 1].percent
      ))).toBe(true);
      expect(Math.max(...exportSamples.map((sample) => sample.percent))).toBeGreaterThan(0);
      expect(exportProbe.activeHeartbeats).toBeGreaterThan(0);
      expect(getBrowserErrors(page).filter((entry) => entry.includes('ERROR'))).toEqual([]);
    });
});
