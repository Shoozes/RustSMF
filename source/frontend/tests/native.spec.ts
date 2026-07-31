import { expect, test } from '@playwright/test';
import fs from 'fs';
import {
  SAMPLE_OBJ,
  SAMPLE_SMF,
  getBrowserErrors,
  getTauriMockSnapshot,
  installTauriMock,
  pausePlaybackIfRunning,
  simulateGetSmfDesktopInfo,
  setupBrowserDiagnostics,
  type SmfDesktopInfo,
  updateTauriMock,
} from './helpers/smoke-helpers';
import { createSkinnedGlbFixtureInput } from './helpers/skinned-glb-fixture';

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
    const desktopInfo = simulateGetSmfDesktopInfo(new Uint8Array(sampleBytes));
    const expectedDesktopInfo: SmfDesktopInfo = {
      valid: desktopInfo.valid,
      version: desktopInfo.version,
      size: desktopInfo.size,
      off_tex: desktopInfo.off_tex,
      off_model: desktopInfo.off_model,
      off_rig: desktopInfo.off_rig,
      off_anim: desktopInfo.off_anim,
      model_count: desktopInfo.model_count,
      rig_bone_count: desktopInfo.rig_bone_count,
      anim_clip_count: desktopInfo.anim_clip_count,
      error: desktopInfo.error,
    };
    const savePath = 'C:\\tmp\\exported_model.smf';

    await installTauriMock(page, {
      openPath: SAMPLE_SMF,
      savePath,
      sampleBytes,
      desktopInfo,
    });

    await page.goto('/');
    await page.getByTestId('open-model-btn').click();

    await expect(page.getByTestId('status-text')).toContainText(/Rust validated SMF|Loaded/i, { timeout: 15000 });
    await pausePlaybackIfRunning(page);

    let snapshot = await getTauriMockSnapshot(page);
    const desktopInfoCall = snapshot.calls.find((call) => call.cmd === 'get_smf_desktop_info');
    expect(desktopInfoCall).toBeDefined();
    expect((desktopInfoCall?.args as Record<string, unknown>)?.path).toBe(SAMPLE_SMF);
    expect(snapshot.calls.map((call) => call.cmd)).toEqual(
      expect.arrayContaining([
        'plugin:dialog|open',
        'get_smf_desktop_info',
        'read_file_binary',
      ]),
    );
    expect(expectedDesktopInfo.valid).toBe(true);
    expect(expectedDesktopInfo.version).toMatch(/^SMF_v\d+_by_Snidr_and_Bart$/);
    expect(expectedDesktopInfo.off_tex).toBeGreaterThan(0);
    expect(expectedDesktopInfo.off_model).toBeGreaterThan(expectedDesktopInfo.off_tex);
    expect(expectedDesktopInfo.off_rig).toBeGreaterThan(expectedDesktopInfo.off_model);
    expect(expectedDesktopInfo.off_anim).toBeGreaterThan(expectedDesktopInfo.off_rig);
    if (expectedDesktopInfo.model_count !== undefined) {
      await expect(page.getByTestId('status-text')).toContainText(`model ~${expectedDesktopInfo.model_count}`);
    }
    if (expectedDesktopInfo.rig_bone_count !== undefined) {
      await expect(page.getByTestId('status-text')).toContainText(`rig ~${expectedDesktopInfo.rig_bone_count}`);
    }
    if (expectedDesktopInfo.anim_clip_count !== undefined) {
      await expect(page.getByTestId('status-text')).toContainText(`anim ~${expectedDesktopInfo.anim_clip_count}`);
    }

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

  test('native open uses read_binary for non-SMF desktop paths', async ({ page }) => {
    const sampleBytes = readSampleBytes(SAMPLE_OBJ);
    await installTauriMock(page, {
      openPath: SAMPLE_OBJ,
      savePath: 'C:\\tmp\\exported_obj.obj',
      sampleBytes,
      desktopInfo: simulateGetSmfDesktopInfo(new Uint8Array([])),
    });

    await page.goto('/');
    await page.getByTestId('open-model-btn').click();

    await expect(page.getByTestId('status-text')).toContainText(/Loaded:/, { timeout: 15000 });

    const snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.calls.map((call) => call.cmd)).toEqual(
      expect.arrayContaining([
        'plugin:dialog|open',
        'read_file_binary',
      ]),
    );
    expect(snapshot.calls.find((call) => call.cmd === 'get_smf_desktop_info')).toBeUndefined();
    const readCall = snapshot.calls.find((call) => call.cmd === 'read_file_binary');
    expect(readCall?.args).toMatchObject({ path: SAMPLE_OBJ });
    expect(snapshot.writes).toHaveLength(0);
  });

  test('newer browser load invalidates delayed native picker success and error', async ({ page }) => {
    const sampleBytes = readSampleBytes(SAMPLE_SMF);
    await installTauriMock(page, {
      openPath: SAMPLE_SMF,
      savePath: 'C:\\tmp\\unused-picker-race.smf',
      sampleBytes,
      desktopInfo: simulateGetSmfDesktopInfo(new Uint8Array(sampleBytes)),
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
    expect(snapshot.calls.filter((call) => call.cmd === 'plugin:dialog|open')).toHaveLength(3);
    expect(snapshot.calls.find((call) => call.cmd === 'read_file_binary')).toBeUndefined();
  });

  test('newer browser result invalidates delayed native path read success and error', async ({ page }) => {
    const sampleBytes = readSampleBytes(SAMPLE_SMF);
    await installTauriMock(page, {
      openPath: SAMPLE_SMF,
      savePath: 'C:\\tmp\\unused-read-race.smf',
      sampleBytes,
      desktopInfo: simulateGetSmfDesktopInfo(new Uint8Array(sampleBytes)),
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
      desktopInfo: simulateGetSmfDesktopInfo(new Uint8Array(sampleBytes)),
      writeDelayMs: 350,
    });

    await page.goto('/');
    await page.getByTestId('open-model-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Rust validated SMF|Loaded/i, { timeout: 15000 });

    const input = page.getByTestId('model-file-input');
    let writeCallCount = 0;
    const waitForWriteStart = async (): Promise<void> => {
      writeCallCount += 1;
      await expect.poll(async () => (
        await getTauriMockSnapshot(page)
      ).calls.filter((call) => call.cmd === 'write_file_binary').length, { timeout: 20000 }).toBe(writeCallCount);
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
    await page.getByTestId('export-glb-btn').click();
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
    await page.getByTestId('export-glb-btn').click();
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
    const desktopInfo = simulateGetSmfDesktopInfo(new Uint8Array(sampleBytes));
    const savePath = 'C:\\tmp\\exported_model.smf';

    await installTauriMock(page, {
      openPath: SAMPLE_SMF,
      savePath,
      sampleBytes,
      desktopInfo,
      writeDelayMs: 120,
    });

    await page.goto('/');
    await page.getByTestId('open-model-btn').click();

    await expect(page.getByTestId('status-text')).toContainText(/Rust validated SMF|Loaded/i, { timeout: 15000 });
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
    const savesBeforeSecondExport = snapshot.calls.filter((call) => call.cmd === 'plugin:dialog|save').length;
    await updateTauriMock(page, { writeDelayMs: 0 });
    await expect(exportButton).toBeEnabled();
    // First export above uses a real pointer click; this repeat path targets handler recovery after mocked native save focus.
    await exportButton.dispatchEvent('click');
    await expect.poll(async () => (
      await getTauriMockSnapshot(page)
    ).calls.filter((call) => call.cmd === 'plugin:dialog|save').length, { timeout: 30000 }).toBe(savesBeforeSecondExport + 1);
    await expect.poll(async () => (
      await getTauriMockSnapshot(page)
    ).writes.length, { timeout: 30000 }).toBe(writesBeforeSecondExport + 1);
    await expect(page.getByTestId('status-text')).toContainText(/Exported \.smf/i, { timeout: 30000 });
    snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.writes).toHaveLength(2);
  });

  test('native open cancel reports no selected file', async ({ page }) => {
    const sampleBytes = readSampleBytes(SAMPLE_SMF);
    const desktopInfo = simulateGetSmfDesktopInfo(new Uint8Array(sampleBytes));

    await installTauriMock(page, {
      openPath: SAMPLE_SMF,
      savePath: 'C:\\tmp\\unused.smf',
      sampleBytes,
      desktopInfo,
      cancelOpen: true,
    });

    await page.goto('/');
    await page.getByTestId('open-model-btn').click();
    await expect(page.getByTestId('status-text')).toContainText('No file selected.', { timeout: 5000 });
  });

  test('native export cancel keeps edited skin state dirty status', async ({ page }) => {
    const sampleBytes = readSampleBytes(SAMPLE_SMF);
    const desktopInfo = simulateGetSmfDesktopInfo(new Uint8Array(sampleBytes));
    const savePath = 'C:\\tmp\\exported_model.smf';

    await installTauriMock(page, {
      openPath: SAMPLE_SMF,
      savePath,
      sampleBytes,
      desktopInfo,
      cancelSave: true,
      writeDelayMs: 150,
    });

    await page.goto('/');
    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(await createSkinnedGlbFixtureInput());

    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/generated-skinned-fixture|bones: 2|clips: 1/i);

    await page.getByTestId('mode-tab-skin').click({ force: true });
    await expect(page.getByTestId('skin-workspace-panel')).toBeVisible();
    const inspector = page.getByTestId('inspector');
    const bone = inspector.locator('li > div').filter({ hasText: /FixtureRoot/ }).first();
    await expect(bone).toBeVisible();
    await bone.click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Selected:\s*FixtureRoot/i);

    await page.getByTestId('skin-paint-mode-add').click({ force: true }).catch(() => {});
    await page.getByTestId('skin-paint-target').fill('1');
    await page.getByTestId('skin-paint-target').dispatchEvent('input');
    await page.getByTestId('skin-paint-radius').fill('1');
    await page.getByTestId('skin-paint-radius').dispatchEvent('input');
    await page.getByTestId('skin-paint-strength').fill('1');
    await page.getByTestId('skin-paint-strength').dispatchEvent('input');

    const canvas = page.getByTestId('three-canvas');
    const rootId = await canvas.getAttribute('data-model-root-id');
    expect(rootId).toBeTruthy();
    const box = await canvas.boundingBox();
    if (box) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down({ button: 'left' });
      await page.mouse.move(x + 28, y + 24);
      await page.waitForTimeout(60);
      await page.mouse.up({ button: 'left' });
    }
    await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true');

    await page.getByTestId('export-smf-btn').click();
    await expect(page.getByTestId('status-text')).toContainText('Export canceled.', { timeout: 5000 });
    await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true');
    await expect(page.getByTestId('skin-export-block')).toHaveCount(0);

    await page.getByTestId('mode-tab-export').click();
    await expect(page.getByTestId('status-text')).toContainText('Export canceled.');
    await expect(canvas).toHaveAttribute('data-model-root-id', rootId!);
    await page.getByTestId('mode-tab-view').click();
    await page.getByTestId('mode-tab-skin').click();
    await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true');
    await expect(page.getByTestId('inspector-selected')).toHaveText('FixtureRoot');
    await expect(page.getByTestId('status-text')).toContainText('Export canceled.');

    let snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.writes).toHaveLength(0);

    await updateTauriMock(page, { cancelSave: false });
    await page.getByTestId('export-smf-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Exported \.smf/i, { timeout: 5000 });
    snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.writes).toHaveLength(1);
    expect(snapshot.calls.map((call) => call.cmd)).toContain('write_file_binary');
  });

  test('native export cancel keeps edited animation state dirty status', async ({ page }) => {
    const sampleBytes = readSampleBytes(SAMPLE_SMF);
    const desktopInfo = simulateGetSmfDesktopInfo(new Uint8Array(sampleBytes));
    const savePath = 'C:\\tmp\\exported_animation_model.smf';

    await installTauriMock(page, {
      openPath: SAMPLE_SMF,
      savePath,
      sampleBytes,
      desktopInfo,
      cancelSave: true,
      writeDelayMs: 150,
    });

    await page.goto('/');
    await page.getByTestId('open-model-btn').click();

    await expect(page.getByTestId('status-text')).toContainText(/Rust validated SMF|Loaded/i, { timeout: 15000 });
    await pausePlaybackIfRunning(page);

    await page.getByTestId('mode-tab-rig').click({ force: true });
    const rigPanel = page.getByTestId('inspector');
    const firstBone = rigPanel.locator('li > div').filter({ hasText: /SMF_Node_/ }).first();
    await expect(firstBone).toBeVisible({ timeout: 8000 });
    await firstBone.click({ force: true });
    await expect(page.getByTestId('status-text')).toContainText(/Selected:\s*SMF_Node_\d+/i);

    await page.getByTestId('mode-tab-animate').click({ force: true });
    await expect(page.getByTestId('animation-insert-key-btn')).toBeEnabled();
    await page.getByTestId('animation-insert-key-btn').click();
    await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');

    const rootId = await page.getByTestId('three-canvas').getAttribute('data-model-root-id');
    expect(rootId).toBeTruthy();

    await page.getByTestId('export-smf-btn').click();
    await expect(page.getByTestId('status-text')).toContainText('Export canceled.', { timeout: 5000 });
    await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');

    await page.getByTestId('mode-tab-export').click();
    await page.getByTestId('mode-tab-view').click();
    await page.getByTestId('mode-tab-animate').click();
    await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');
    await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', rootId!);
    await expect(page.getByTestId('status-text')).toContainText('Export canceled.');

    let snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.writes).toHaveLength(0);

    await updateTauriMock(page, { cancelSave: false });
    await page.getByTestId('export-smf-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Exported \.smf/i, { timeout: 5000 });
    snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.writes).toHaveLength(1);
    expect(snapshot.calls.map((call) => call.cmd)).toContain('write_file_binary');
  });
});
