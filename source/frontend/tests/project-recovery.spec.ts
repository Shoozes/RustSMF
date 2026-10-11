import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { createSkinnedGlbFixtureInput } from './helpers/skinned-glb-fixture';
import { getTauriMockSnapshot, installTauriMock, SAMPLE_OBJ } from './helpers/smoke-helpers';
import { selectWorkspace, clickSecondaryCommand, showModernPanel  } from './helpers/modern-shell';
import { readAssetEvidence, expectMotion } from './helpers/asset-evidence';
import { downloadBytes, renameSubmodel, watchJourneyErrors } from './helpers/product-journey';

test('IPC recovery cancel preserves edits, discard restores serialized state, and continued work saves', async ({ page }) => {
  const assertErrors = watchJourneyErrors(page);
  const fixture = await createSkinnedGlbFixtureInput();
  const project = Buffer.from(JSON.stringify({
    kind: 'rustsmf-project', schemaVersion: 1, name: 'Recovered',
    asset: { format: 'glb', bytesBase64: fixture.buffer.toString('base64') },
    state: { selected: 'FixtureTip', currentClipName: 'FixtureBend', currentTime: 0.25,
      playbackSpeed: 0.5, isPlaying: false, sourceFormat: 'glb',
      rigMetadata: { schemaVersion: 1, bones: { FixtureTip: { primaryAxis: 'x', locked: true, pinned: false } } } },
  }));
  await installTauriMock(page, { openPath: SAMPLE_OBJ, savePath: 'C:\\fixtures\\continued.rsproj',
    sampleBytes: Array.from(fs.readFileSync(SAMPLE_OBJ)), recoveryBytes: Array.from(project) });
  await page.goto('/');
  await page.getByTestId('open-model-btn').click();
  await expect(page.getByTestId('status-text')).toContainText(/Loaded:/, { timeout: 15_000 });
  await renameSubmodel(page, 'Unsaved_Before_Recovery');
  const originalRoot = await page.getByTestId('three-canvas').getAttribute('data-model-root-id');
  await clickSecondaryCommand(page, 'recover-project-btn');
  await expect(page.getByTestId('replacement-dialog')).toBeVisible();
  await page.getByTestId('cancel-model-replacement').click();
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', originalRoot!);
  await expect(page.getByTestId('outliner')).toContainText('Unsaved_Before_Recovery');
  await clickSecondaryCommand(page, 'recover-project-btn');
  await page.getByTestId('confirm-model-replacement').click();
  await expect(page.getByTestId('status-text')).toContainText(/Loaded: Recovered\.glb/, { timeout: 15_000 });
  await expect(page.getByTestId('three-canvas')).not.toHaveAttribute('data-model-root-id', originalRoot!);
  await selectWorkspace(page, 'animate');
  await showModernPanel(page, 'properties');
  await expect(page.getByTestId('inspector-selected')).toHaveText('FixtureTip');
  await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend');
  await expect(page.getByTestId('timeline-speed-select')).toHaveValue('0.5');
  await expect(page.getByTestId('scrub-slider')).toHaveValue('0.25');
  await expect(page.getByTestId('timeline-play-btn')).toContainText('Play');
  await selectWorkspace(page, 'rig');
  await expect(page.getByTestId('rig-primary-axis')).toHaveValue('x');
  await expect(page.getByTestId('rig-lock-toggle')).toBeChecked();
  await selectWorkspace(page, 'animate');
  await page.getByTestId('animation-clip-name-input').fill('Continued Recovery');
  await page.getByTestId('animation-rename-clip-btn').click();
  await page.getByTestId('save-project-btn').click();
  await expect(page.getByTestId('status-text')).toContainText(/Saved.*project/i);
  const snapshot = await getTauriMockSnapshot(page);
  expect(snapshot.calls.map(c => c.cmd)).toEqual(expect.arrayContaining(['discover_project_recovery', 'read_project_recovery', 'save_project_atomic']));
  expect(snapshot.maxActiveWrites).toBe(1);
  const args = snapshot.calls.find(c => c.cmd === 'save_project_atomic')!.args as { data: Record<string, number> };
  const saved = JSON.parse(Buffer.from(Object.values(args.data)).toString());
  const asset = readAssetEvidence(Buffer.from(saved.asset.bytesBase64, 'base64'));
  expect(asset.primitives[0].name).toBe('FixtureSkinnedMesh');
  expect(asset.clips[0].name).toBe('Continued Recovery');
  expectMotion(asset.clips[0]);
  await page.getByTestId('editor-undo-btn').click();
  await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend');
  assertErrors();
});

test('browser autosave refusal is visible, preserves recovery, and permits manual save and retry', async ({ page }) => {
  const assertErrors = watchJourneyErrors(page);
  const recoveryKey = 'rustsmf.project.autosave.0';
  await page.addInitScript(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (this === localStorage && name === key && Reflect.get(window, '__RUSTSMF_TEST_QUOTA_FULL__')) {
        throw new DOMException('Test recovery quota exceeded', 'QuotaExceededError');
      }
      return original.call(this, name, value);
    };
  }, recoveryKey);
  await page.goto('/');
  await page.getByTestId('model-file-input').setInputFiles(SAMPLE_OBJ);
  await expect(page.getByTestId('status-text')).toContainText(/Loaded:/, { timeout: 15_000 });
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), recoveryKey)).not.toBeNull();
  const priorRecovery = await page.evaluate(key => localStorage.getItem(key), recoveryKey);
  const canvas = page.getByTestId('three-canvas');
  const root = await canvas.getAttribute('data-model-root-id');
  expect(root).toBeTruthy();
  await page.evaluate(() => Reflect.set(window, '__RUSTSMF_TEST_QUOTA_FULL__', true));
  await renameSubmodel(page, 'Manual_Save_After_Quota');
  await expect(page.getByTestId('error-banner')).toContainText(/Project autosave error:.*Save Project/i);
  await expect(canvas).toHaveAttribute('data-model-root-id', root!);
  expect(await page.evaluate(key => localStorage.getItem(key), recoveryKey)).toBe(priorRecovery);
  const project = JSON.parse((await downloadBytes(page, 'save-project-btn')).toString());
  const saved = readAssetEvidence(Buffer.from(project.asset.bytesBase64, 'base64'));
  expect(saved.primitives[0].name).toBe('Manual_Save_After_Quota');
  await page.getByTestId('editor-undo-btn').click();
  await expect(page.getByTestId('outliner')).not.toContainText('Manual_Save_After_Quota');
  await page.getByTestId('editor-redo-btn').click();
  await expect(page.getByTestId('outliner')).toContainText('Manual_Save_After_Quota');
  await page.evaluate(() => Reflect.set(window, '__RUSTSMF_TEST_QUOTA_FULL__', false));
  await renameSubmodel(page, 'Recovery_Resumed');
  await expect.poll(async () => {
    const stored = await page.evaluate(key => localStorage.getItem(key), recoveryKey);
    const asset = readAssetEvidence(Buffer.from(JSON.parse(stored!).asset.bytesBase64, 'base64'));
    return asset.primitives[0].name;
  }).toBe('Recovery_Resumed');
  await expect(page.getByTestId('error-banner')).toBeHidden();
  assertErrors();
});
