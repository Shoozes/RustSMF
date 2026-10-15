import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { captureReview } from '../helpers/review-capture';
import {
  getBrowserErrors,
  SAMPLE_SMF,
  setupBrowserDiagnostics,
} from '../helpers/smoke-helpers';
import { clickSecondaryCommand, showModernPanel } from '../helpers/modern-shell';
import { expectAssetContinuity, expectMotion, readAssetEvidence } from '../helpers/asset-evidence';
import { exportEvidence, pauseJourney, watchJourneyErrors } from '../helpers/product-journey';

test.beforeEach(async ({ page }) => {
  setupBrowserDiagnostics(page);
});

test('product journey opens and inspects SMF, exports GLB, and reimports it', async ({ page }, testInfo) => {
  const assertErrors = watchJourneyErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByTestId('model-file-input').setInputFiles(SAMPLE_SMF);

  const status = page.getByTestId('status-text');
  await expect(status).toContainText(/Loaded: .*\.smf|Loaded .*\.smf|bones: \d+/i, { timeout: 15_000 });
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', /.+/);
  await pauseJourney(page);
  await showModernPanel(page, 'scene');
  await expect(page.getByTestId('outliner')).toContainText(/Scene Root|SMF_Node|Mesh/i);
  const overviewPath = await captureReview(page, testInfo, 'modern-overview.png');
  if (overviewPath) await testInfo.attach('rustsmf-modern-overview.png', { path: overviewPath, contentType: 'image/png' });
  await showModernPanel(page, 'properties');
  await expect(page.getByTestId('inspector')).toContainText(/Bones \(\d+\)|Selected bone|No bone selected/i);

  const originalRootId = await page.getByTestId('three-canvas').getAttribute('data-model-root-id');
  const downloadPromise = page.waitForEvent('download');
  await clickSecondaryCommand(page, 'export-glb-btn');
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const bytes = fs.readFileSync(downloadPath!);
  const before = readAssetEvidence(bytes);
  expect(before.joints).toHaveLength(24);
  expect(before.clips).toHaveLength(12);
  expect(before.primitives.length).toBeGreaterThan(0);
  expect(before.primitives.every(p => p.attributes.POSITION.length > 0 && p.attributes.WEIGHTS_0.length > 0)).toBe(true);
  expect(before.clips.map(c => c.name)).toEqual(['Walk', 'Run', 'Roll', 'PunchL', 'PunchR', 'Pull', 'Fall', 'Idle', 'HurtA', 'Land', 'Jump', 'Flip']);
  // The committed fixture's short Land clip is an intentional held pose.
  before.clips.filter(c => c.name !== 'Land').forEach(expectMotion);

  await page.getByTestId('model-file-input').setInputFiles({
    name: 'inspected-roundtrip.glb',
    mimeType: 'model/gltf-binary',
    buffer: bytes,
  });
  await expect(status).toContainText(/Loaded: inspected-roundtrip\.glb/i, { timeout: 15_000 });
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', /.+/);
  expect(await page.getByTestId('three-canvas').getAttribute('data-model-root-id')).not.toBe(originalRootId);
  await pauseJourney(page);
  expectAssetContinuity(await exportEvidence(page), before);
  assertErrors();
  expect(getBrowserErrors(page).filter((message) => message.includes('ERROR'))).toEqual([]);
});
