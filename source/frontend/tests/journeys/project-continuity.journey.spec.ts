import { workspaceControl, clickSecondaryCommand, showModernPanel } from '../helpers/modern-shell';
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { getBrowserErrors, SAMPLE_OBJ, setupBrowserDiagnostics } from '../helpers/smoke-helpers';

import { expectAssetContinuity, readAssetEvidence } from '../helpers/asset-evidence';
import { exportEvidence, watchJourneyErrors } from '../helpers/product-journey';

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

test('product journey edits, saves, reopens, and continues the same project', async ({ page }) => {
  const assertErrors = watchJourneyErrors(page);
  await page.goto('/');
  await page.getByTestId('model-file-input').setInputFiles(SAMPLE_OBJ);
  await expect(page.getByTestId('status-text')).toContainText(/Loaded/i, { timeout: 15_000 });
  await showModernPanel(page, 'scene');
  await renameFirstSubmodel(page, 'Continuity_First_Edit');

  const savePromise = page.waitForEvent('download');
  await page.getByTestId('save-project-btn').click();
  const download = await savePromise;
  expect(download.suggestedFilename()).toBe('rustsmf-project.rsproj');
  const savedPath = await download.path();
  expect(savedPath).not.toBeNull();
  const projectBytes = fs.readFileSync(savedPath!);
  const project = JSON.parse(projectBytes.toString()) as { schemaVersion: number; asset: { bytesBase64: string }; state: { sourceFormat: string } };
  expect(project.schemaVersion).toBe(1);
  expect(project.state.sourceFormat).toBe('obj');
  const saved = readAssetEvidence(Buffer.from(project.asset.bytesBase64, 'base64'));
  expect(saved.primitives[0].name).toBe('Continuity_First_Edit');

  const openPromise = page.waitForEvent('filechooser');
  await clickSecondaryCommand(page, 'open-project-btn');
  await (await openPromise).setFiles({
    name: 'continuity.rsproj',
    mimeType: 'application/json',
    buffer: projectBytes,
  });
  await expect(page.getByTestId('replacement-dialog')).toBeVisible();
  await page.getByTestId('confirm-model-replacement').click();
  await expect(page.getByTestId('status-text')).toContainText(/Loaded: .*\.glb/i, { timeout: 15_000 });
  await showModernPanel(page, 'scene');
  await expect(page.getByTestId('outliner')).toContainText('Continuity_First_Edit');
  expectAssetContinuity(await exportEvidence(page), saved);

  await renameFirstSubmodel(page, 'Continuity_Second_Edit');
  await expect(page.getByTestId('outliner')).toContainText('Continuity_Second_Edit');
  await page.getByTestId('editor-undo-btn').click();
  await expect(page.getByTestId('outliner')).toContainText('Continuity_First_Edit');
  await page.getByTestId('editor-redo-btn').click();
  await expect(page.getByTestId('outliner')).toContainText('Continuity_Second_Edit');
  assertErrors();
  expect(getBrowserErrors(page).filter((message) => message.includes('ERROR'))).toEqual([]);
});
