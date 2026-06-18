import { expect, test } from '@playwright/test';
import fs from 'fs';
import {
  SAMPLE_OBJ,
  SAMPLE_SMF,
  getTauriMockSnapshot,
  installTauriMock,
  simulateGetSmfDesktopInfo,
  setupBrowserDiagnostics,
  type SmfDesktopInfo,
  updateTauriMock,
} from './helpers/smoke-helpers';

function readSampleBytes(samplePath: string | null): number[] {
  if (!samplePath) return [];
  return Array.from(fs.readFileSync(samplePath));
}

test.describe('RustSMF Tauri IPC mock coverage', () => {
  test.beforeEach(async ({ page }) => {
    setupBrowserDiagnostics(page);
  });

  test('native open/read/export and save cancel stay explicit', async ({ page }) => {
    test.skip(!SAMPLE_SMF, 'No .smf sample available for native IPC mock coverage');

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
      openPath: SAMPLE_SMF!,
      savePath,
      sampleBytes,
      desktopInfo,
    });

    await page.goto('/');
    await page.getByTestId('open-model-btn').click();

    await expect(page.getByTestId('status-text')).toContainText(/Rust validated SMF|Loaded/i, { timeout: 15000 });

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
    test.skip(!SAMPLE_OBJ, 'No .obj sample available for non-SMF native IPC mock coverage');

    const sampleBytes = readSampleBytes(SAMPLE_OBJ);
    await installTauriMock(page, {
      openPath: SAMPLE_OBJ!,
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

  test('native rapid export clicks stay single-flight', async ({ page }) => {
    test.skip(!SAMPLE_SMF, 'No .smf sample available for native IPC mock coverage');

    const sampleBytes = readSampleBytes(SAMPLE_SMF);
    const desktopInfo = simulateGetSmfDesktopInfo(new Uint8Array(sampleBytes));
    const savePath = 'C:\\tmp\\exported_model.smf';

    await installTauriMock(page, {
      openPath: SAMPLE_SMF!,
      savePath,
      sampleBytes,
      desktopInfo,
      writeDelayMs: 400,
    });

    await page.goto('/');
    await page.getByTestId('open-model-btn').click();

    await expect(page.getByTestId('status-text')).toContainText(/Rust validated SMF|Loaded/i, { timeout: 15000 });

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

    await updateTauriMock(page, { writeDelayMs: 0 });
    await exportButton.click();
    await expect(page.getByTestId('status-text')).toContainText(/Exported \.smf/i, { timeout: 5000 });
    snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.writes).toHaveLength(2);
  });

  test('native open cancel reports no selected file', async ({ page }) => {
    test.skip(!SAMPLE_SMF, 'No .smf sample available for native IPC mock coverage');

    const sampleBytes = readSampleBytes(SAMPLE_SMF);
    const desktopInfo = simulateGetSmfDesktopInfo(new Uint8Array(sampleBytes));

    await installTauriMock(page, {
      openPath: SAMPLE_SMF!,
      savePath: 'C:\\tmp\\unused.smf',
      sampleBytes,
      desktopInfo,
      cancelOpen: true,
    });

    await page.goto('/');
    await page.getByTestId('open-model-btn').click();
    await expect(page.getByTestId('status-text')).toContainText('No file selected.', { timeout: 5000 });
  });
});
