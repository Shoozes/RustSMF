import { expect, test } from '@playwright/test';
import {
  SAMPLE_EXTERNAL_GLTF,
  SAMPLE_EXTERNAL_GLTF_TEXTURE,
  SAMPLE_OBJ,
  setupBrowserDiagnostics,
} from '../helpers/smoke-helpers';
import { showModernPanel } from '../helpers/modern-shell';

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

test('product journey preserves dirty work through cancel and failed missing-resource replacement', async ({ page }) => {
  await page.goto('/');
  const input = page.getByTestId('model-file-input');
  const status = page.getByTestId('status-text');
  await input.setInputFiles(SAMPLE_OBJ);
  await expect(status).toContainText(/Loaded/i, { timeout: 15_000 });
  await showModernPanel(page, 'scene');
  await renameFirstSubmodel(page, 'Dirty_Work_Preserved');
  const mountedRootId = await page.getByTestId('three-canvas').getAttribute('data-model-root-id');

  await input.setInputFiles([SAMPLE_EXTERNAL_GLTF, SAMPLE_EXTERNAL_GLTF_TEXTURE]);
  await expect(page.getByTestId('replacement-dialog')).toBeVisible();
  await page.getByTestId('cancel-model-replacement').click();
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', mountedRootId!);
  await expect(page.getByTestId('outliner')).toContainText('Dirty_Work_Preserved');
  await expect(status).toContainText(/replacement canceled/i);

  await input.setInputFiles([SAMPLE_EXTERNAL_GLTF, SAMPLE_EXTERNAL_GLTF_TEXTURE]);
  await expect(page.getByTestId('replacement-dialog')).toBeVisible();
  await page.getByTestId('confirm-model-replacement').click();
  await expect(status).toContainText(/Resource URI .*mesh\.bin.*not found/i, { timeout: 15_000 });
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', mountedRootId!);
  await expect(page.getByTestId('outliner')).toContainText('Dirty_Work_Preserved');

  await renameFirstSubmodel(page, 'Work_Continued_After_Failure');
  await expect(page.getByTestId('outliner')).toContainText('Work_Continued_After_Failure');
});
