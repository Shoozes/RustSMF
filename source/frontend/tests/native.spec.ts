import { test, expect } from '@playwright/test';
import fs from 'fs';
import {
  SAMPLE_SMF,
  getTauriMockSnapshot,
  installTauriMock,
  setupBrowserDiagnostics,
  simulateGetSmfDesktopInfo,
  updateTauriMock,
} from './helpers/smoke-helpers';

function readSampleBytes(): number[] {
  if (!SAMPLE_SMF) return [];
  return Array.from(fs.readFileSync(SAMPLE_SMF));
}

test.describe('RustSMF Tauri IPC mock coverage', () => {
  test.beforeEach(async ({ page }) => {
    setupBrowserDiagnostics(page);
  });

  test('native open/read/export and save cancel stay explicit', async ({ page }) => {
    test.skip(!SAMPLE_SMF, 'No .smf sample available for native IPC mock coverage');

    const sampleBytes = readSampleBytes();
    const desktopInfo = simulateGetSmfDesktopInfo(new Uint8Array(sampleBytes));
    const savePath = 'C:\\tmp\\exported_model.smf';

    await installTauriMock(page, {
      openPath: SAMPLE_SMF!,
      savePath,
      sampleBytes,
      desktopInfo,
      modelInfo: 'SMF model basic: mock model',
    });

    await page.goto('/');
    await page.getByTestId('open-model-btn').click();

    await expect(page.getByTestId('status-text')).toContainText(/Rust validated SMF|Loaded/i, { timeout: 15000 });

    let snapshot = await getTauriMockSnapshot(page);
    expect(snapshot.calls.map(call => call.cmd)).toEqual(expect.arrayContaining([
      'plugin:dialog|open',
      'get_smf_desktop_info',
      'peek_smf_model_basic',
      'read_file_binary',
    ]));

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

  test('native open cancel reports no selected file', async ({ page }) => {
    test.skip(!SAMPLE_SMF, 'No .smf sample available for native IPC mock coverage');

    await installTauriMock(page, {
      openPath: SAMPLE_SMF!,
      savePath: 'C:\\tmp\\unused.smf',
      sampleBytes: readSampleBytes(),
      desktopInfo: 'valid SMF | rig ~0 | anim ~0',
      modelInfo: 'SMF model basic: mock model',
      cancelOpen: true,
    });

    await page.goto('/');
    await page.getByTestId('open-model-btn').click();
    await expect(page.getByTestId('status-text')).toContainText('No file selected.', { timeout: 5000 });
  });
});
