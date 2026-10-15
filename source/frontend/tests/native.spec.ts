import { applyTransferPreview, workspaceLocator, workspaceControl, selectWorkspace, clickSecondaryCommand, showSkinAdvanced } from './helpers/modern-shell';

import { expect, test } from '@playwright/test';
import fs from 'fs';
import {
  SAMPLE_EXTERNAL_GLTF,
  SAMPLE_EXTERNAL_GLTF_BUFFER,
  SAMPLE_EXTERNAL_GLTF_TEXTURE,
  SAMPLE_OBJ,
  SAMPLE_SMF,
  getBrowserErrors,
  getTauriMockSnapshot,
  installTauriMock,
  pausePlaybackIfRunning,
  setupBrowserDiagnostics,
  updateTauriMock,
} from './helpers/smoke-helpers';
import { createSkinnedGlbFixtureInput, createSkinnedGltfFixtureInputWithOptions } from './helpers/skinned-glb-fixture';

import { cancelPaintOnMeshInViewport } from './helpers/viewport-interactions';
import { renameSubmodel, watchJourneyErrors } from './helpers/product-journey';

function readSampleBytes(samplePath: string | null): number[] {
  if (!samplePath) return [];
  return Array.from(fs.readFileSync(samplePath));
}

test.describe('RustSMF Tauri IPC mock coverage', () => {
  test.beforeEach(async ({ page }) => {
    setupBrowserDiagnostics(page);
  });

  test('native open/read/export and save cancel stay explicit', async ({ page }) => {
    test.setTimeout(90000);

    const sampleBytes = readSampleBytes(SAMPLE_SMF);
    const savePath = 'C:\\tmp\\exported_model.smf';

    await installTauriMock(page, {
      openPath: SAMPLE_SMF,
      savePath,
      sampleBytes,
    });

    await page.goto('/');
    await page.getByTestId('open-model-btn').click();

    await expect(page.getByTestId('status-text')).toContainText(/Loaded:/i, { timeout: 15000 });
    await pausePlaybackIfRunning(page);

    let snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.calls.map((call) => call.cmd)).toEqual(
      expect.arrayContaining([
        'open_file',
        'read_file_binary',
      ]),
    );
    expect(snapshot.calls.filter((call) => call.cmd === 'read_file_binary')).toHaveLength(1);
    expect(snapshot.calls.find((call) => call.cmd === 'read_file_binary')?.args).toMatchObject({ path: SAMPLE_SMF });

    await page.getByTestId('export-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Exported \.smf/i, { timeout: 5000 });

    snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.writes).toHaveLength(1);
    expect(snapshot.writes[0].path).toBe(savePath);
    expect(snapshot.writes[0].length).toBeGreaterThan(32);

    await updateTauriMock(page, { cancelSave: true });
    await page.getByTestId('export-btn').click();
    await expect(page.getByTestId('status-text')).toContainText('Export canceled.', { timeout: 5000 });

    snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.writes).toHaveLength(1);
  });

  test('native mock bundle authorizes and reads GLTF sidecars as one bounded request', async ({ page }) => {
    const nativeConfig = JSON.parse(fs.readFileSync(new URL('../../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
    const nativeConnectPolicy = nativeConfig.app.security.csp.split(';')
      .find((directive: string) => directive.trim().startsWith('connect-src '));
    expect(nativeConnectPolicy).toBeTruthy();
    const selectedPaths = [SAMPLE_EXTERNAL_GLTF, SAMPLE_EXTERNAL_GLTF_BUFFER, SAMPLE_EXTERNAL_GLTF_TEXTURE];
    await installTauriMock(page, {
      openPath: SAMPLE_EXTERNAL_GLTF,
      openPaths: selectedPaths,
      savePath: 'C:\\tmp\\unused-native-bundle.glb',
      sampleBytes: readSampleBytes(SAMPLE_EXTERNAL_GLTF),
      resourceBytes: selectedPaths.map(readSampleBytes),
    });

    await page.goto('/');
    // Exercise the shipped native fetch policy as well as the IPC adapter.
    await page.evaluate((policy: string) => {
      const meta = document.createElement('meta');
      meta.httpEquiv = 'Content-Security-Policy';
      meta.content = policy;
      document.head.appendChild(meta);
    }, nativeConnectPolicy);
    await page.getByTestId('open-model-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Loaded: scene\.gltf/i, { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/2 sidecar resources/i);

    const snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.calls.map((call) => call.cmd)).toEqual(expect.arrayContaining(['open_file', 'read_files_binary']));
    expect(snapshot.calls.filter((call) => call.cmd === 'read_file_binary')).toHaveLength(0);
    expect(snapshot.calls.find((call) => call.cmd === 'read_files_binary')?.args).toMatchObject({ paths: selectedPaths });
  });

  test('native open uses read_binary for non-SMF desktop paths', async ({ page }) => {
    const sampleBytes = readSampleBytes(SAMPLE_OBJ);
    await installTauriMock(page, {
      openPath: SAMPLE_OBJ,
      savePath: 'C:\\tmp\\exported_obj.obj',
      sampleBytes,
    });

    await page.goto('/');
    await page.getByTestId('open-model-btn').click();

    await expect(page.getByTestId('status-text')).toContainText(/Loaded:/, { timeout: 15000 });

    const snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.calls.map((call) => call.cmd)).toEqual(
      expect.arrayContaining([
        'open_file',
        'read_file_binary',
      ]),
    );
    const readCall = snapshot.calls.find((call) => call.cmd === 'read_file_binary');
    expect(readCall?.args).toMatchObject({ path: SAMPLE_OBJ });
    expect(snapshot.writes).toHaveLength(0);
  });

  for (const selection of [
    { label: 'multiple model files', paths: [SAMPLE_OBJ, SAMPLE_EXTERNAL_GLTF], error: /Select exactly one supported model file/ },
    { label: 'sidecars without a model', paths: [SAMPLE_EXTERNAL_GLTF_BUFFER, SAMPLE_EXTERNAL_GLTF_TEXTURE], error: /No supported model file was selected/ },
  ]) {
    test(`native open rejects ${selection.label} before reading or replacing edited work`, async ({ page }) => {
      const assertErrors = watchJourneyErrors(page);
      await installTauriMock(page, {
        openPath: SAMPLE_OBJ, openPaths: selection.paths,
        savePath: 'C:\\fixtures\\unused-selection.glb',
        sampleBytes: readSampleBytes(SAMPLE_OBJ), resourceBytes: selection.paths.map(readSampleBytes),
      });
      await page.goto('/');
      await page.getByTestId('model-file-input').setInputFiles(SAMPLE_OBJ);
      await expect(page.getByTestId('status-text')).toContainText(/Loaded:/, { timeout: 15_000 });
      await renameSubmodel(page, 'Preserved_Before_Invalid_Open');
      const canvas = page.getByTestId('three-canvas');
      const root = await canvas.getAttribute('data-model-root-id');
      expect(root).toBeTruthy();
      await page.getByTestId('open-model-btn').click();
      await expect(page.getByTestId('error-banner')).toContainText(selection.error);
      await expect(page.getByTestId('replacement-dialog')).toBeHidden();
      await expect(canvas).toHaveAttribute('data-model-root-id', root!);
      const snapshot = await getTauriMockSnapshot(page);
      expect(snapshot.calls.filter(call => call.cmd.startsWith('read_file'))).toHaveLength(0);
      await renameSubmodel(page, 'Continued_After_Invalid_Open');
      await page.getByTestId('editor-undo-btn').click();
      await expect(page.getByTestId('outliner')).toContainText('Preserved_Before_Invalid_Open');
      await page.getByTestId('editor-redo-btn').click();
      await expect(page.getByTestId('outliner')).toContainText('Continued_After_Invalid_Open');
      assertErrors();
    });
  }

  for (const received of [0, 2]) {
    test(`native bundle rejects ${received} payloads for one selected file and keeps editing usable`, async ({ page }) => {
      const expectedError = new RegExp(`Native binary payload is invalid: expected 1 file payload; received ${received}`);
      const assertErrors = watchJourneyErrors(page, [expectedError]);
      const bytes = readSampleBytes(SAMPLE_OBJ);
      await installTauriMock(page, {
        openPath: SAMPLE_OBJ, openPaths: [SAMPLE_OBJ],
        savePath: 'C:\\fixtures\\unused-cardinality.glb', sampleBytes: bytes,
        resourceBytes: received === 0 ? [] : [bytes, [42]],
      });
      await page.goto('/');
      await page.getByTestId('model-file-input').setInputFiles(SAMPLE_OBJ);
      await expect(page.getByTestId('status-text')).toContainText(/Loaded:/, { timeout: 15_000 });
      await renameSubmodel(page, 'Preserved_Before_Invalid_Bundle');
      const canvas = page.getByTestId('three-canvas');
      const root = await canvas.getAttribute('data-model-root-id');
      expect(root).toBeTruthy();
      await page.getByTestId('open-model-btn').click();
      await page.getByTestId('confirm-model-replacement').click();
      await expect(page.getByTestId('error-banner')).toContainText(expectedError);
      await expect(page.getByTestId('status-text')).not.toContainText('docs/references/');
      await expect(canvas).toHaveAttribute('data-model-root-id', root!);
      const snapshot = await getTauriMockSnapshot(page);
      expect(snapshot.calls.filter(call => call.cmd === 'read_files_binary')).toHaveLength(1);
      await renameSubmodel(page, 'Continued_After_Invalid_Bundle');
      await page.getByTestId('editor-undo-btn').click();
      await expect(page.getByTestId('outliner')).toContainText('Preserved_Before_Invalid_Bundle');
      await page.getByTestId('editor-redo-btn').click();
      await expect(page.getByTestId('outliner')).toContainText('Continued_After_Invalid_Bundle');
      const autosaves = (await getTauriMockSnapshot(page)).autosaves.length;
      await expect.poll(async () => (await getTauriMockSnapshot(page)).autosaves.length).toBeGreaterThan(autosaves);
      await expect(page.getByTestId('error-banner')).toContainText(expectedError);
      await updateTauriMock(page, { resourceBytes: [bytes] });
      await page.getByTestId('open-model-btn').click();
      await page.getByTestId('confirm-model-replacement').click();
      await expect(page.getByTestId('status-text')).toContainText(/Loaded: test\.obj/, { timeout: 15_000 });
      await expect(canvas).not.toHaveAttribute('data-model-root-id', root!);
      await expect(page.getByTestId('error-banner')).toBeHidden();
      assertErrors();
    });
  }

  test('native open rejects malformed byte payloads without mounting a model', async ({ page }) => {
    const invalidPath = 'C:\\tmp\\malformed-native.glb';
    await installTauriMock(page, {
      openPath: invalidPath,
      savePath: 'C:\\tmp\\unused-malformed-native.glb',
      sampleBytes: [256],
    });

    await page.goto('/');
    await page.getByTestId('open-model-btn').click();

    await expect(page.getByTestId('status-text')).toContainText(
      /Load error: Native binary payload is invalid: byte 0 must be an integer from 0 through 255/i,
    );
    await expect(page.getByTestId('error-banner')).toContainText(/Native binary payload is invalid/i);
    await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', '');

    const snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.calls.filter((call) => call.cmd === 'read_file_binary')).toHaveLength(1);
  });

  test('newer browser load invalidates delayed native picker success and error', async ({ page }) => {
    const sampleBytes = readSampleBytes(SAMPLE_SMF);
    await installTauriMock(page, {
      openPath: SAMPLE_SMF,
      savePath: 'C:\\tmp\\unused-picker-race.smf',
      sampleBytes,
      openDelayMs: 350,
    });

    await page.goto('/');
    const input = page.getByTestId('model-file-input');
    const openButton = page.getByTestId('open-model-btn');

    for (const failOpen of [false, true]) {
      await updateTauriMock(page, { failOpen });
      await openButton.click();
      await expect(page.getByTestId('status-text')).toContainText('Opening file picker');
      const fixture = await createSkinnedGlbFixtureInput();
      const newerName = failOpen ? 'newer-after-picker-error.glb' : 'newer-after-picker-success.glb';
      await input.setInputFiles({ ...fixture, name: newerName });
      await expect(page.getByTestId('status-text')).toContainText(newerName, { timeout: 15000 });
      const canvas = page.getByTestId('three-canvas');
      const rootId = await canvas.getAttribute('data-model-root-id');
      expect(rootId).toBeTruthy();
      await page.waitForTimeout(450);
      await expect(canvas).toHaveAttribute('data-model-root-id', rootId!);
      await expect(page.getByTestId('status-text')).toContainText(newerName);
      await expect(page.getByTestId('error-banner')).toBeHidden();
    }

    await updateTauriMock(page, { failOpen: false });
    const rootBeforeFailedReplacement = await page.getByTestId('three-canvas').getAttribute('data-model-root-id');
    expect(rootBeforeFailedReplacement).toBeTruthy();
    await openButton.click();
    await expect(page.getByTestId('status-text')).toContainText('Opening file picker');
    await input.setInputFiles({
      name: 'newer-picker-invalid.glb',
      mimeType: 'model/gltf-binary',
      buffer: Buffer.from('not a glb'),
    });
    await expect(page.getByTestId('status-text')).toContainText('Load error:', { timeout: 15000 });
    const failedStatus = await page.getByTestId('status-text').textContent();
    await page.waitForTimeout(450);
    await expect(page.getByTestId('status-text')).toHaveText(failedStatus!);
    await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', rootBeforeFailedReplacement!);
    await expect(page.getByTestId('error-banner')).toBeVisible();

    const snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.calls.filter((call) => call.cmd === 'open_file')).toHaveLength(3);
    expect(snapshot.calls.find((call) => call.cmd === 'read_file_binary')).toBeUndefined();
  });

  test('newer browser result invalidates delayed native path read success and error', async ({ page }) => {
    const sampleBytes = readSampleBytes(SAMPLE_SMF);
    await installTauriMock(page, {
      openPath: SAMPLE_SMF,
      savePath: 'C:\\tmp\\unused-read-race.smf',
      sampleBytes,
      readDelayMs: 350,
    });

    await page.goto('/');
    const input = page.getByTestId('model-file-input');
    let readCount = 0;
    const startNativeRead = async (failRead: boolean): Promise<void> => {
      await updateTauriMock(page, { failRead });
      await page.getByTestId('open-model-btn').click();
      readCount += 1;
      await expect.poll(async () => (
        await getTauriMockSnapshot(page)
      ).calls.filter((call) => call.cmd === 'read_file_binary').length).toBe(readCount);
    };

    for (const failRead of [false, true]) {
      await startNativeRead(failRead);
      const fixture = await createSkinnedGlbFixtureInput();
      const newerName = failRead ? 'newer-after-read-error.glb' : 'newer-after-read-success.glb';
      await input.setInputFiles({ ...fixture, name: newerName });
      await expect(page.getByTestId('status-text')).toContainText(newerName, { timeout: 15000 });
      const rootId = await page.getByTestId('three-canvas').getAttribute('data-model-root-id');
      expect(rootId).toBeTruthy();
      await page.waitForTimeout(450);
      await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', rootId!);
      await expect(page.getByTestId('status-text')).toContainText(newerName);
      await expect(page.getByTestId('error-banner')).toBeHidden();
    }

    const rootBeforeFailedReplacement = await page.getByTestId('three-canvas').getAttribute('data-model-root-id');
    expect(rootBeforeFailedReplacement).toBeTruthy();
    await startNativeRead(false);
    await input.setInputFiles({
      name: 'newer-invalid.glb',
      mimeType: 'model/gltf-binary',
      buffer: Buffer.from('not a glb'),
    });
    await expect(page.getByTestId('status-text')).toContainText('Load error:', { timeout: 15000 });
    const failedStatus = await page.getByTestId('status-text').textContent();
    await page.waitForTimeout(450);
    await expect(page.getByTestId('status-text')).toHaveText(failedStatus!);
    await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', rootBeforeFailedReplacement!);
    await expect(page.getByTestId('error-banner')).toBeVisible();
  });

  test('stale native export success and error cannot overwrite a newer load result', async ({ page }) => {
    test.setTimeout(90000);

    const sampleBytes = readSampleBytes(SAMPLE_SMF);
    await installTauriMock(page, {
      openPath: SAMPLE_SMF,
      savePath: 'C:\\tmp\\export-load-race.smf',
      sampleBytes,
      writeDelayMs: 350,
    });

    await page.goto('/');
    await page.getByTestId('open-model-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Loaded:/i, { timeout: 15000 });

    const input = page.getByTestId('model-file-input');
    let writeCallCount = 0;
    const waitForWriteStart = async (): Promise<void> => {
      writeCallCount += 1;
      await expect.poll(async () => (
        await getTauriMockSnapshot(page)
      ).calls.filter((call) => call.cmd === 'save_file_binary').length, { timeout: 20000 }).toBe(writeCallCount);
    };
    const waitForWriteSettle = async (): Promise<void> => {
      await expect.poll(async () => (
        await getTauriMockSnapshot(page)
      ).activeWrites, { timeout: 20000 }).toBe(0);
    };

    await page.getByTestId('export-btn').click();
    await waitForWriteStart();
    let fixture = await createSkinnedGlbFixtureInput();
    await input.setInputFiles({ ...fixture, name: 'newer-after-export-success.glb' });
    await expect(page.getByTestId('status-text')).toContainText('newer-after-export-success.glb', { timeout: 15000 });
    let rootId = await page.getByTestId('three-canvas').getAttribute('data-model-root-id');
    await waitForWriteSettle();
    await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', rootId!);
    await expect(page.getByTestId('status-text')).toContainText('newer-after-export-success.glb');

    await updateTauriMock(page, { failWrite: true });
    await clickSecondaryCommand(page, 'export-glb-btn');
    await waitForWriteStart();
    fixture = await createSkinnedGlbFixtureInput();
    await input.setInputFiles({ ...fixture, name: 'newer-after-export-error.glb' });
    await expect(page.getByTestId('status-text')).toContainText('newer-after-export-error.glb', { timeout: 15000 });
    rootId = await page.getByTestId('three-canvas').getAttribute('data-model-root-id');
    await waitForWriteSettle();
    await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', rootId!);
    await expect(page.getByTestId('status-text')).toContainText('newer-after-export-error.glb');
    await expect(page.getByTestId('error-banner')).toBeHidden();

    await updateTauriMock(page, { failWrite: false });
    await clickSecondaryCommand(page, 'export-glb-btn');
    await waitForWriteStart();
    const rootBeforeFailedReplacement = await page.getByTestId('three-canvas').getAttribute('data-model-root-id');
    expect(rootBeforeFailedReplacement).toBeTruthy();
    await input.setInputFiles({
      name: 'newer-invalid-after-export.glb',
      mimeType: 'model/gltf-binary',
      buffer: Buffer.from('not a glb'),
    });
    await expect(page.getByTestId('status-text')).toContainText('Load error:', { timeout: 15000 });
    const failedStatus = await page.getByTestId('status-text').textContent();
    await waitForWriteSettle();
    await expect(page.getByTestId('status-text')).toHaveText(failedStatus!);
    await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', rootBeforeFailedReplacement!);
    await expect(page.getByTestId('error-banner')).toBeVisible();
    await expect(page.getByTestId('export-btn')).toBeEnabled();
    expect(
      getBrowserErrors(page).filter(entry => entry.includes('THREE.PropertyBinding: No target node found')),
    ).toEqual([]);
  });

  test('native rapid export clicks stay single-flight', async ({ page }) => {
    test.setTimeout(120000);

    const sampleBytes = readSampleBytes(SAMPLE_SMF);
    const savePath = 'C:\\tmp\\exported_model.smf';

    await installTauriMock(page, {
      openPath: SAMPLE_SMF,
      savePath,
      sampleBytes,
      writeDelayMs: 120,
    });

    await page.goto('/');
    await page.getByTestId('open-model-btn').click();

    await expect(page.getByTestId('status-text')).toContainText(/Loaded:/i, { timeout: 15000 });
    await pausePlaybackIfRunning(page);

    const exportButton = page.getByTestId('export-btn');
    await exportButton.click();
    await expect(page.getByTestId('status-text')).toContainText('Exporting as SMF', { timeout: 5000 });
    await expect(exportButton).toBeDisabled();

    let snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.writes.length).toBeLessThanOrEqual(1);

    await expect(page.getByTestId('status-text')).toContainText(/Exported \.smf/i, { timeout: 10000 });
    await expect(exportButton).toBeEnabled();

    snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.writes).toHaveLength(1);
    expect(snapshot.writes[0].path).toBe(savePath);

    const writesBeforeSecondExport = snapshot.writes.length;
    const savesBeforeSecondExport = snapshot.calls.filter((call) => call.cmd === 'save_file_binary').length;
    await updateTauriMock(page, { writeDelayMs: 0 });
    await expect(exportButton).toBeEnabled();
    // First export above uses a real pointer click; this repeat path targets handler recovery after mocked native save focus.
    await exportButton.dispatchEvent('click');
    await expect.poll(async () => (
      await getTauriMockSnapshot(page)
    ).calls.filter((call) => call.cmd === 'save_file_binary').length, { timeout: 30000 }).toBe(savesBeforeSecondExport + 1);
    await expect.poll(async () => (
      await getTauriMockSnapshot(page)
    ).writes.length, { timeout: 30000 }).toBe(writesBeforeSecondExport + 1);
    await expect(page.getByTestId('status-text')).toContainText(/Exported \.smf/i, { timeout: 30000 });
    snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.writes).toHaveLength(2);
  });

  test('native export waits for active autosave without requiring another click', async ({ page }) => {
    await installTauriMock(page, {
      openPath: SAMPLE_SMF,
      savePath: 'C:\\tmp\\queued-export.smf',
      sampleBytes: readSampleBytes(SAMPLE_SMF),
      writeDelayMs: 3000,
    });
    await page.goto('/');
    await page.getByTestId('open-model-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Loaded:/i);
    await pausePlaybackIfRunning(page);
    await expect.poll(async () => (await getTauriMockSnapshot(page)).activeWrites).toBe(1);
    await page.getByTestId('export-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Exported \.smf/i, { timeout: 15000 });
    const snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.writes).toHaveLength(1);
    expect(snapshot.autosaves.length).toBeGreaterThanOrEqual(1);
    expect(snapshot.maxActiveWrites).toBe(1);
  });

  test('native autosave coalesces edits and settles before model replacement', async ({ page }) => {
    test.setTimeout(90000);
    const sampleBytes = readSampleBytes(SAMPLE_SMF);
    await installTauriMock(page, {
      openPath: SAMPLE_SMF,
      savePath: 'C:\\tmp\\unused-autosave.rsproj',
      sampleBytes,
      writeDelayMs: 3000,
    });

    await page.goto('/');
    await page.getByTestId('open-model-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Loaded:/i, { timeout: 15000 });
    await pausePlaybackIfRunning(page);
    await expect.poll(async () => (
      await getTauriMockSnapshot(page)
    ).activeWrites, { timeout: 15000 }).toBe(1);

    await selectWorkspace(page, 'rig');
    const firstBone = await workspaceLocator(page, page.getByTestId('inspector').locator('li > div').filter({ hasText: /SMF_Node_/ }).first());
    await expect(firstBone).toBeVisible();
    await firstBone.click({ force: true });
    await (await workspaceControl(page, 'transform-x-btn')).click();
    await page.waitForTimeout(1400);
    await updateTauriMock(page, { writeDelayMs: 50 });

    await expect.poll(async () => (
      await getTauriMockSnapshot(page)
    ).autosaves.length, { timeout: 15000 }).toBe(2);
    const snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.maxActiveWrites).toBe(1);
    expect(snapshot.calls.filter((call) => call.cmd === 'autosave_project')).toHaveLength(2);
    await expect(page.getByTestId('error-banner')).not.toContainText('Project autosave error');

    const canvas = page.getByTestId('three-canvas');
    const previousRootId = await canvas.getAttribute('data-model-root-id');
    expect(previousRootId).toBeTruthy();
    await updateTauriMock(page, { writeDelayMs: 3000 });
    await (await workspaceControl(page, 'transform-y-btn')).click();
    await expect.poll(async () => (
      await getTauriMockSnapshot(page)
    ).activeWrites, { timeout: 15000 }).toBe(1);

    await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
    await page.getByTestId('confirm-model-replacement').click();
    await page.waitForTimeout(250);
    await expect(canvas).toHaveAttribute('data-model-root-id', previousRootId!);
    await expect.poll(async () => (
      await getTauriMockSnapshot(page)
    ).activeWrites).toBe(1);

    await updateTauriMock(page, { writeDelayMs: 50 });
    await expect.poll(async () => (
      await getTauriMockSnapshot(page)
    ).activeWrites, { timeout: 15000 }).toBe(0);
    await expect(canvas).not.toHaveAttribute('data-model-root-id', previousRootId!, { timeout: 15000 });
    await expect.poll(async () => (
      await getTauriMockSnapshot(page)
    ).autosaves.length, { timeout: 15000 }).toBe(4);
    const finalSnapshot = await getTauriMockSnapshot(page);
    expect(finalSnapshot.maxActiveWrites).toBe(1);
  });

  test('native open cancel reports no selected file', async ({ page }) => {
    const sampleBytes = readSampleBytes(SAMPLE_SMF);

    await installTauriMock(page, {
      openPath: SAMPLE_SMF,
      savePath: 'C:\\tmp\\unused.smf',
      sampleBytes,
      cancelOpen: true,
    });

    await page.goto('/');
    await page.getByTestId('open-model-btn').click();
    await expect(page.getByTestId('status-text')).toContainText('No file selected.', { timeout: 5000 });
  });

  test('native export cancel keeps edited skin state dirty status', async ({ page }) => {
    const sampleBytes = readSampleBytes(SAMPLE_SMF);
    const savePath = 'C:\\tmp\\exported_model.smf';

    await installTauriMock(page, {
      openPath: SAMPLE_SMF,
      savePath,
      sampleBytes,
      cancelSave: true,
      writeDelayMs: 150,
    });

    await page.goto('/');
    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(await createSkinnedGlbFixtureInput());

    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/generated-skinned-fixture|bones: 2|clips: 1/i);

    await selectWorkspace(page, 'skin');
    await expect(page.getByTestId('skin-workspace-panel')).toBeVisible();
    await showSkinAdvanced(page);
    const inspector = page.getByTestId('inspector');
    const bone = await workspaceLocator(page, inspector.locator('li > div').filter({ hasText: /FixtureTip/ }).first());
    await expect(bone).toBeVisible();
    await bone.click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Selected:\s*FixtureTip/i);

    await (await workspaceControl(page, 'skin-paint-mode-add')).click();
    await (await workspaceControl(page, 'skin-paint-target')).fill('1');
    await page.getByTestId('skin-paint-target').dispatchEvent('input');
    await (await workspaceControl(page, 'skin-paint-radius')).fill('1');
    await page.getByTestId('skin-paint-radius').dispatchEvent('input');
    await (await workspaceControl(page, 'skin-paint-strength')).fill('1');
    await page.getByTestId('skin-paint-strength').dispatchEvent('input');

    const canvas = page.getByTestId('three-canvas');
    const rootId = await canvas.getAttribute('data-model-root-id');
    expect(rootId).toBeTruthy();
    expect(await cancelPaintOnMeshInViewport(page, { requireDirty: true })).toBe(true);
    await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true');

    await clickSecondaryCommand(page, 'export-smf-btn');
    await expect(page.getByTestId('status-text')).toContainText('Export canceled.', { timeout: 5000 });
    await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true');
    await expect(page.getByTestId('skin-export-block')).toHaveCount(0);

    await selectWorkspace(page, 'export');
    await expect(page.getByTestId('status-text')).toContainText('Export canceled.');
    await expect(canvas).toHaveAttribute('data-model-root-id', rootId!);
    await selectWorkspace(page, 'view');
    await selectWorkspace(page, 'skin');
    await showSkinAdvanced(page);
    await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true');
    await expect(page.getByTestId('inspector-selected')).toHaveText('FixtureTip');
    await expect(page.getByTestId('status-text')).toContainText('Export canceled.');

    let snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.writes).toHaveLength(0);

    await updateTauriMock(page, { cancelSave: false });
    await clickSecondaryCommand(page, 'export-smf-btn');
    await expect(page.getByTestId('status-text')).toContainText(/Exported \.smf/i, { timeout: 5000 });
    snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.writes).toHaveLength(1);
    expect(snapshot.calls.map((call) => call.cmd)).toContain('save_file_binary');
  });

  test('native export cancel keeps edited animation state dirty status', async ({ page }) => {
    const sampleBytes = readSampleBytes(SAMPLE_SMF);
    const savePath = 'C:\\tmp\\exported_animation_model.smf';

    await installTauriMock(page, {
      openPath: SAMPLE_SMF,
      savePath,
      sampleBytes,
      cancelSave: true,
      writeDelayMs: 150,
    });

    await page.goto('/');
    await page.getByTestId('open-model-btn').click();

    await expect(page.getByTestId('status-text')).toContainText(/Loaded:/i, { timeout: 15000 });
    await pausePlaybackIfRunning(page);

    await selectWorkspace(page, 'rig');
    const rigPanel = page.getByTestId('inspector');
    const firstBone = await workspaceLocator(page, rigPanel.locator('li > div').filter({ hasText: /SMF_Node_/ }).first());
    await expect(firstBone).toBeVisible({ timeout: 8000 });
    await firstBone.click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Selected:\s*SMF_Node_\d+/i);

    await selectWorkspace(page, 'animate');
    await expect(page.getByTestId('animation-insert-key-btn')).toBeEnabled();
    await (await workspaceControl(page, 'animation-insert-key-btn')).click();
    await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');

    const rootId = await page.getByTestId('three-canvas').getAttribute('data-model-root-id');
    expect(rootId).toBeTruthy();

    await clickSecondaryCommand(page, 'export-smf-btn');
    await expect(page.getByTestId('status-text')).toContainText('Export canceled.', { timeout: 5000 });
    await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');

    await selectWorkspace(page, 'export');
    await selectWorkspace(page, 'view');
    await selectWorkspace(page, 'animate');
    await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');
    await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', rootId!);
    await expect(page.getByTestId('status-text')).toContainText('Export canceled.');

    let snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.writes).toHaveLength(0);

    await updateTauriMock(page, { cancelSave: false });
    await clickSecondaryCommand(page, 'export-smf-btn');
    await expect(page.getByTestId('status-text')).toContainText(/Exported \.smf/i, { timeout: 5000 });
    snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.writes).toHaveLength(1);
    expect(snapshot.calls.map((call) => call.cmd)).toContain('save_file_binary');
  });
});

test('native retarget IPC mock correlates cancellation and keeps clip baking in a worker', async ({page}) => {
  const mapping={ok:true,map:{FixtureRoot:'FixtureRoot',FixtureTip:'FixtureTip'},decisions:[
    {source:'FixtureRoot',target:'FixtureRoot',method:'manual',confidence:1},
    {source:'FixtureTip',target:'FixtureTip',method:'manual',confidence:1},
  ],diagnostics:[],sourceUp:null,targetUp:null,sourceLateral:null,targetLateral:null,upCorrection:null,orientationCorrection:null};
  await installTauriMock(page,{openPath:'unused.glb',savePath:'unused.glb',sampleBytes:[],retargetDelayMs:1000,
    retargetResult:{apiVersion:1,status:'ready',mapping,diagnostics:[],proportions:null}});
  const assertErrors=watchJourneyErrors(page),wasmRequests:string[]=[],workerRequests:string[]=[];
  page.on('request',request=>{if(request.url().endsWith('.wasm'))wasmRequests.push(request.url());if(request.url().includes('retargetBakeRuntime-'))workerRequests.push(request.url());});
  await page.goto('/');await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
  await expect(page.getByTestId('status-text')).toContainText('Loaded:',{timeout:15000});await selectWorkspace(page,'animate');
  const source=await createSkinnedGltfFixtureInputWithOptions({clipName:'Source Motion'});
  await (await workspaceControl(page,'animation-retarget-clips')).locator('input').setInputFiles(source);
  await expect.poll(async()=> (await getTauriMockSnapshot(page)).calls.some(call=>call.cmd==='retarget_preflight_v1')).toBe(true);
  await page.getByTestId('retarget-cancel').click();
  await expect.poll(async()=> (await getTauriMockSnapshot(page)).calls.some(call=>call.cmd==='cancel_retarget_preflight_v1')).toBe(true);
  let snapshot=await getTauriMockSnapshot(page);
  const started=snapshot.calls.find(call=>call.cmd==='retarget_preflight_v1')!.args as {jobId:number;input:{apiVersion:number;source:{bones:number[]}}};
  expect(started.input.apiVersion).toBe(1);expect(started.input.source.bones).toHaveLength(2);
  expect(snapshot.calls.find(call=>call.cmd==='cancel_retarget_preflight_v1')!.args).toEqual({jobId:started.jobId});
  await updateTauriMock(page,{retargetDelayMs:0});
  await (await workspaceControl(page,'animation-retarget-clips')).locator('input').setInputFiles(source);await applyTransferPreview(page);
  snapshot=await getTauriMockSnapshot(page);expect(snapshot.calls.filter(call=>call.cmd==='retarget_preflight_v1')).toHaveLength(2);
  expect(wasmRequests).toEqual([]);expect(workerRequests.length).toBeGreaterThan(0);assertErrors();
});