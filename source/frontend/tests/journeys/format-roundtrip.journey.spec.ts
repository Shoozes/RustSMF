import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  getBrowserErrors,
  SAMPLE_INDEPENDENT_FBX,
  setupBrowserDiagnostics,
} from '../helpers/smoke-helpers';
import { createExternalFbxFixtureInputs } from '../helpers/external-fbx-fixture';
import { clickSecondaryCommand, showAnimateTimeline, showModernPanel } from '../helpers/modern-shell';
import { expectAssetContinuity, expectMotion, expectNumbersClose, sampleTrack } from '../helpers/asset-evidence';
import { exportEvidence, pauseJourney, watchJourneyErrors } from '../helpers/product-journey';

test.beforeEach(async ({ page }) => {
  setupBrowserDiagnostics(page);
});

test('product journey resolves an FBX sidecar and preserves skinned animation through FBX roundtrip', async ({ page }) => {
  const assertErrors = watchJourneyErrors(page);
  await page.goto('/');
  const input = page.getByTestId('model-file-input');
  const status = page.getByTestId('status-text');

  await input.setInputFiles(createExternalFbxFixtureInputs());
  await expect(status).toContainText(/Loaded FBX: external-textured\.fbx/i, { timeout: 15_000 });
  await expect(status).toContainText(/textures: 1/i);
  await expect(status).not.toContainText(/textures skipped/i);
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', /.+/);
  const sidecar = await exportEvidence(page);
  expect(sidecar.images).toHaveLength(1);
  expect(sidecar.images[0]).toMatchObject({ mime: 'image/png', width: 1, height: 1 });

  await input.setInputFiles(SAMPLE_INDEPENDENT_FBX);
  await expect(status).toContainText(/Loaded FBX: independent_skinned\.fbx/i, { timeout: 15_000 });
  await expect(status).toContainText(/bones: 2/i);
  await expect(status).toContainText(/clips: 1/i);
  await showModernPanel(page, 'properties');
  await expect(page.getByTestId('inspector')).toContainText(/IndependentRoot|IndependentTip/i);
  await showAnimateTimeline(page);
  await pauseJourney(page);
  const before = await exportEvidence(page);
  expect(before.joints).toEqual(['IndependentRoot', 'IndependentTip']);
  expect(before.hierarchy).toContainEqual({ name: 'IndependentTip', parent: 'IndependentRoot' });
  expect(before.clips).toHaveLength(1);
  expectMotion(before.clips[0]);

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
  await expect(status).toContainText(/bones: 2/i);
  await expect(status).toContainText(/clips: 1/i);
  await showAnimateTimeline(page);
  await expect(page.getByTestId('timeline')).toBeVisible();
  await pauseJourney(page);
  const after = await exportEvidence(page);
  // FBX may omit held object channels. Prove their values equal the retained static transform.
  for (const track of before.clips[0].tracks.filter(t => !before.joints.includes(t.bone))) {
    const pose = after.poses.find(p => p.name === track.bone)!;
    expect(pose).toBeDefined();
    for (const time of track.times) {
      expectNumbersClose(sampleTrack(track, time), pose[track.path as 'translation' | 'rotation' | 'scale'], 1e-4);
    }
  }
  expectAssetContinuity(after, { ...before, clips: before.clips.map(c => ({ ...c, tracks: c.tracks.filter(t => before.joints.includes(t.bone)) })) }, 1e-4);
  assertErrors();
  expect(getBrowserErrors(page).filter((message) => message.includes('ERROR'))).toEqual([]);
});
