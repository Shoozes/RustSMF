import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { getBrowserErrors, SAMPLE_OBJ, setupBrowserDiagnostics } from '../helpers/smoke-helpers';
import { clickSecondaryCommand, showModernPanel } from '../helpers/modern-shell';

async function renameFirstSubmodel(page: import('@playwright/test').Page, nextName: string): Promise<void> {
  const row = page.getByTestId('outliner-submodel-0');
  await row.locator('.outliner-name-btn').click();
  await page.getByTestId('outliner-rename-input').fill(nextName);
  await page.getByTestId('outliner-rename-btn').click();
  await expect(row.locator('.outliner-name')).toHaveText(nextName);
}

test.beforeEach(async ({ page }) => {
  setupBrowserDiagnostics(page);
});

test('product journey edits, saves, reopens, and continues the same project', async ({ page }) => {
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

  await renameFirstSubmodel(page, 'Continuity_Second_Edit');
  await expect(page.getByTestId('outliner')).toContainText('Continuity_Second_Edit');
  expect(getBrowserErrors(page).filter((message) => message.includes('ERROR'))).toEqual([]);
});
