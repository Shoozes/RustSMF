import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  getBrowserErrors,
  SAMPLE_INDEPENDENT_FBX,
  setupBrowserDiagnostics,
} from '../helpers/smoke-helpers';
import { createExternalFbxFixtureInputs } from '../helpers/external-fbx-fixture';
import { clickSecondaryCommand, showAnimateTimeline, showModernPanel } from '../helpers/modern-shell';

test.beforeEach(async ({ page }) => {
  setupBrowserDiagnostics(page);
});

test('product journey resolves an FBX sidecar and preserves skinned animation through FBX roundtrip', async ({ page }) => {
  await page.goto('/');
  const input = page.getByTestId('model-file-input');
  const status = page.getByTestId('status-text');

  await input.setInputFiles(createExternalFbxFixtureInputs());
  await expect(status).toContainText(/Loaded FBX: external-textured\.fbx/i, { timeout: 15_000 });
  await expect(status).toContainText(/textures: 1/i);
  await expect(status).not.toContainText(/textures skipped/i);
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', /.+/);

  await input.setInputFiles(SAMPLE_INDEPENDENT_FBX);
  await expect(status).toContainText(/Loaded FBX: independent_skinned\.fbx/i, { timeout: 15_000 });
  await expect(status).toContainText(/bones: 2|clips: 1/i);
  await showModernPanel(page, 'properties');
  await expect(page.getByTestId('inspector')).toContainText(/IndependentRoot|IndependentTip/i);
  await showAnimateTimeline(page);

  const downloadPromise = page.waitForEvent('download');
  await clickSecondaryCommand(page, 'export-fbx-btn');
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const bytes = fs.readFileSync(downloadPath!);
  expect(bytes.toString('utf8', 0, 21)).toBe('Kaydara FBX Binary  \0');

  await input.setInputFiles({
    name: 'product-roundtrip.fbx',
    mimeType: 'application/octet-stream',
    buffer: bytes,
  });
  await expect(status).toContainText(/Loaded FBX: product-roundtrip\.fbx/i, { timeout: 15_000 });
  await expect(status).toContainText(/bones: 2|clips: 1/i);
  await showAnimateTimeline(page);
  await expect(page.getByTestId('timeline')).toBeVisible();
  expect(getBrowserErrors(page).filter((message) => message.includes('ERROR'))).toEqual([]);
});
