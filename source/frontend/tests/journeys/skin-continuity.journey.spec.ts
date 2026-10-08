import { test, expect, downloadBytes, exportEvidence, pauseJourney, reopenProject, selectBone, watchJourneyErrors } from '../helpers/product-journey';
import { createSkinnedGlbFixtureInput } from '../helpers/skinned-glb-fixture';
import { selectWorkspace, showSkinAdvanced  } from '../helpers/modern-shell';
import { paintOnMeshInViewport, cancelPaintOnMeshInViewport } from '../helpers/viewport-interactions';
import { setRangeValue } from '../helpers/timeline-interactions';
import { expectAssetContinuity, expectNumbersClose } from '../helpers/asset-evidence';

test('product journey authors skin weights and preserves raw influences through project and SMF files', async ({ page }) => {
  test.setTimeout(60_000);
  const assertErrors = watchJourneyErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
  await expect(page.getByTestId('status-text')).toContainText(/Loaded:/, { timeout: 15_000 });
  await pauseJourney(page);
  const baseline = await exportEvidence(page);
  await selectBone(page, 'FixtureTip');
  await selectWorkspace(page, 'skin');
  await showSkinAdvanced(page);
  for (const mode of ['rest', 'frozen', 'live', 'rest']) {
    await page.getByTestId('skin-paint-pose').selectOption(mode);
    await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-skin-paint-pose', mode);
    await expect(page.getByTestId('skin-paint-pose-warning')).toHaveCount(mode === 'live' ? 1 : 0);
  }
  await page.getByTestId('skin-paint-mode-set').click();
  await setRangeValue(page, 'skin-paint-radius', 0.5);
  await setRangeValue(page, 'skin-paint-target', 0.35);
  await setRangeValue(page, 'skin-paint-strength', 1);
  // Close the drawer so the user's brush path reaches the model surface.
  await page.getByTestId('modern-panel-close').click();
  expect(await paintOnMeshInViewport(page)).toBe(true);
  const painted = await exportEvidence(page);
  expect(painted.primitives[0].attributes.WEIGHTS_0).not.toEqual(baseline.primitives[0].attributes.WEIGHTS_0);
  await showSkinAdvanced(page);
  await page.getByTestId('skin-paint-undo-btn').click();
  expectNumbersClose((await exportEvidence(page)).primitives[0].attributes.WEIGHTS_0, baseline.primitives[0].attributes.WEIGHTS_0);
  await page.getByTestId('skin-paint-redo-btn').click();
  expectNumbersClose((await exportEvidence(page)).primitives[0].attributes.WEIGHTS_0, painted.primitives[0].attributes.WEIGHTS_0);
  await page.getByTestId('skin-paint-mode-add').click();
  await page.getByTestId('modern-panel-close').click();
  expect(await cancelPaintOnMeshInViewport(page)).toBe(true);
  await expect(page.getByTestId('three-canvas')).not.toHaveAttribute('data-skin-paint-active', 'active');
  const canceled = await exportEvidence(page);
  expect(canceled.primitives[0].attributes.WEIGHTS_0).not.toEqual(painted.primitives[0].attributes.WEIGHTS_0);
  await showSkinAdvanced(page);
  await page.getByTestId('skin-paint-undo-btn').click();
  expectNumbersClose((await exportEvidence(page)).primitives[0].attributes.WEIGHTS_0, painted.primitives[0].attributes.WEIGHTS_0);
  await page.getByTestId('skin-paint-mode-smooth').click();
  await page.getByTestId('modern-panel-close').click();
  expect(await paintOnMeshInViewport(page)).toBe(true);
  await showSkinAdvanced(page);
  await page.getByTestId('skin-normalize-btn').click();
  for (const algorithm of ['segment-distance-normal', 'nearest-bone-origin', 'closest-two-segments', 'selected-branch']) {
    await page.getByTestId('skin-autoskin-algorithm').selectOption(algorithm);
    await page.getByTestId('skin-autoskin-btn').click();
    const weights = (await exportEvidence(page)).primitives[0].attributes.WEIGHTS_0;
    for (let i = 0; i < weights.length; i += 4) expect(weights.slice(i, i + 4).reduce((sum, w) => sum + w, 0)).toBeCloseTo(1, 5);
  }
  await page.getByTestId('skin-autoskin-algorithm').selectOption('nearest-segment');
  await expect(page.getByTestId('skin-autoskin-max-influences')).toBeDisabled();
  await page.getByTestId('skin-autoskin-btn').click();
  await page.getByTestId('skin-autoskin-algorithm').selectOption('segment-inverse-distance');
  await setRangeValue(page, 'skin-autoskin-max-influences', 2);
  await page.getByTestId('skin-autoskin-btn').click();
  await expect(page.getByTestId('skin-dirty-state')).toContainText(/true/i);
  const authored = await exportEvidence(page);
  const attrs = authored.primitives[0].attributes;
  for (let i = 0; i < attrs.WEIGHTS_0.length; i += 4) {
    expect(attrs.WEIGHTS_0.slice(i, i + 4).reduce((sum, w) => sum + w, 0)).toBeCloseTo(1, 5);
    expect(attrs.JOINTS_0.slice(i, i + 4).every(j => j >= 0 && j < 2)).toBe(true);
  }
  const project = await downloadBytes(page, 'save-project-btn');
  await reopenProject(page, project);
  await pauseJourney(page);
  expectAssetContinuity(await exportEvidence(page), authored);
  const smf = await downloadBytes(page, 'export-smf-btn', true);
  await page.getByTestId('model-file-input').setInputFiles({ name: 'skin.smf', mimeType: 'application/octet-stream', buffer: smf });
  await expect(page.getByTestId('status-text')).toContainText('skin.smf', { timeout: 15_000 });
  const converted = await exportEvidence(page);
  expect(converted.joints).toHaveLength(2);
  const expectedWeights = authored.primitives[0].indices.flatMap(index => attrs.WEIGHTS_0.slice(index * 4, index * 4 + 4));
  // SMF stores four uint8 weights, then normalizes their decoded sum.
  const quantized = expectedWeights.map(w => Math.round(w * 255) / 255);
  for (let i = 0; i < quantized.length; i += 4) {
    const sum = quantized.slice(i, i + 4).reduce((total, w) => total + w, 0);
    for (let j = 0; j < 4; j++) quantized[i + j] /= sum;
  }
  expectNumbersClose(converted.primitives[0].attributes.WEIGHTS_0, quantized);
  const expectedJoints = authored.primitives[0].indices.flatMap(index => attrs.JOINTS_0.slice(index * 4, index * 4 + 4));
  expect(converted.primitives[0].attributes.JOINTS_0).toEqual(expectedJoints);
  assertErrors();
});
