import { workspaceControl, showModernPanel, clickSecondaryCommand } from '../helpers/modern-shell';
import { expect, test } from '@playwright/test';
import {
  SAMPLE_EXTERNAL_GLTF,
  SAMPLE_EXTERNAL_GLTF_TEXTURE,
  SAMPLE_OBJ,
  setupBrowserDiagnostics,
} from '../helpers/smoke-helpers';

import { exportEvidence, watchJourneyErrors } from '../helpers/product-journey';
import { expectAssetContinuity } from '../helpers/asset-evidence';

async function renameFirstSubmodel(page: import('@playwright/test').Page, nextName: string): Promise<void> {
  const row = (await workspaceControl(page, 'outliner-submodel-0'));
  await row.locator('.outliner-name-btn').click();
  await (await workspaceControl(page, 'outliner-rename-input')).fill(nextName);
  await (await workspaceControl(page, 'outliner-rename-btn')).click();
  await expect(row.locator('.outliner-name')).toHaveText(nextName);
}

test.beforeEach(async ({ page }) => {
  setupBrowserDiagnostics(page);
});

test('product journey preserves dirty work through cancel and failed missing-resource replacement', async ({ page }) => {
  const assertErrors = watchJourneyErrors(page, [/Resource URI .*mesh\.bin.*not found/]);
  await page.goto('/');
  const input = page.getByTestId('model-file-input');
  const status = page.getByTestId('status-text');
  await input.setInputFiles(SAMPLE_OBJ);
  await expect(status).toContainText(/Loaded/i, { timeout: 15_000 });
  await showModernPanel(page, 'scene');
  await renameFirstSubmodel(page, 'Dirty_Work_Preserved');
  const mountedRootId = await page.getByTestId('three-canvas').getAttribute('data-model-root-id');
  const authored = await exportEvidence(page);

  await input.setInputFiles([SAMPLE_EXTERNAL_GLTF, SAMPLE_EXTERNAL_GLTF_TEXTURE]);
  await expect(page.getByTestId('replacement-dialog')).toBeVisible();
  await page.getByTestId('cancel-model-replacement').click();
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', mountedRootId!);
  await expect(page.getByTestId('outliner')).toContainText('Dirty_Work_Preserved');
  await expect(status).toContainText(/replacement canceled/i);
  expectAssetContinuity(await exportEvidence(page), authored);

  await input.setInputFiles([SAMPLE_EXTERNAL_GLTF, SAMPLE_EXTERNAL_GLTF_TEXTURE]);
  await expect(page.getByTestId('replacement-dialog')).toBeVisible();
  await page.getByTestId('confirm-model-replacement').click();
  await expect(status).toContainText(/Resource URI .*mesh\.bin.*not found/i, { timeout: 15_000 });
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', mountedRootId!);
  await expect(page.getByTestId('outliner')).toContainText('Dirty_Work_Preserved');

  await renameFirstSubmodel(page, 'Work_Continued_After_Failure');
  await expect(page.getByTestId('outliner')).toContainText('Work_Continued_After_Failure');
  assertErrors();
});

test('product journey rejects malformed project and recovery without losing editable work', async ({ page }) => {
  const assertErrors = watchJourneyErrors(page);
  await page.goto('/');
  await page.getByTestId('model-file-input').setInputFiles(SAMPLE_OBJ);
  await expect(page.getByTestId('status-text')).toContainText(/Loaded/, { timeout: 15_000 });
  await showModernPanel(page, 'scene');
  await renameFirstSubmodel(page, 'Malformed_Project_Survivor');
  const root = await page.getByTestId('three-canvas').getAttribute('data-model-root-id');
  const before = await exportEvidence(page);
  const pending = page.waitForEvent('filechooser');
  await clickSecondaryCommand(page, 'open-project-btn');
  await (await pending).setFiles({ name: 'malformed.rsproj', mimeType: 'application/json', buffer: Buffer.from('{"kind":"broken"}') });
  await expect(page.getByTestId('status-text')).toContainText(/PROJECT_INVALID/, { timeout: 15_000 });
  await expect(page.getByTestId('replacement-dialog')).toHaveCount(0);
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', root!);
  expectAssetContinuity(await exportEvidence(page), before);
  // Corrupt the persisted input, without changing the mounted editor state.
  await page.evaluate(() => localStorage.setItem('rustsmf.project.autosave.0', '{"kind":"broken"}'));
  await clickSecondaryCommand(page, 'recover-project-btn');
  await expect(page.getByTestId('status-text')).toContainText(/Project recovery error: PROJECT_INVALID/);
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', root!);
  await renameFirstSubmodel(page, 'Still_Editable');
  await page.getByTestId('editor-undo-btn').click();
  await expect(page.getByTestId('outliner')).toContainText('Malformed_Project_Survivor');
  assertErrors();
});
