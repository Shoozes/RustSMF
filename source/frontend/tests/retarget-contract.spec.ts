import { test, expect } from '@playwright/test';
import { createSkinnedGltfFixtureInputWithOptions } from './helpers/skinned-glb-fixture';
import { workspaceControl, applyTransferPreview, clickEditorHistory } from './helpers/modern-shell';
import { exportEvidence, downloadBytes, reopenProject, pauseJourney, watchJourneyErrors } from './helpers/product-journey';
import { expectAssetContinuity, expectMotion } from './helpers/asset-evidence';

async function choose(page: import('@playwright/test').Page, testId: string, files: Awaited<ReturnType<typeof createSkinnedGltfFixtureInputWithOptions>>) {
  const pending = page.waitForEvent('filechooser');
  await (await workspaceControl(page, testId)).getByRole('button').click();
  await (await pending).setFiles(files);
}
test('unnamed helper ancestry and one-frame source/target reference poses retain ordinary profile continuity', async ({page}) => {
  const errors = watchJourneyErrors(page);
  const target = await createSkinnedGltfFixtureInputWithOptions({unnamedHelpers: true, withReferencePose: true});
  const source = await createSkinnedGltfFixtureInputWithOptions({unnamedHelpers: true, withReferencePose: true, clipName: 'Source Motion'});
  await page.goto('/');
  const opening = page.waitForEvent('filechooser'); await page.getByTestId('open-model-btn').click(); await (await opening).setFiles(target);
  await expect(page.getByTestId('status-text')).toContainText('Loaded:'); await pauseJourney(page);
  const before = await exportEvidence(page);
  const profile = {$schema: 'rustsmf.retarget-profile.v1', retarget: {manualMap: {FixtureRoot: 'FixtureRoot', FixtureTip: 'FixtureTip'},
    clips: ['Source Motion'], sourceReferencePose: 'clip', sourceReferenceClip: 'Neutral', targetReferenceClip: 'Neutral'}};
  await (await workspaceControl(page, 'retarget-profile-json')).fill(JSON.stringify(profile));
  const pending = page.waitForEvent('filechooser');
  await page.getByRole('button', {name: 'Retarget with profile', exact: true}).click(); await (await pending).setFiles(source);
  await expect(page.getByTestId('retarget-apply')).toBeVisible({timeout: 15000});
  expectAssetContinuity(await exportEvidence(page), before);
  await applyTransferPreview(page);
  const applied = await exportEvidence(page); expectMotion(applied.clips.find(c => c.name === 'Source Motion')!);
  await clickEditorHistory(page, 'undo'); expectAssetContinuity(await exportEvidence(page), before);
  await clickEditorHistory(page, 'redo'); expectAssetContinuity(await exportEvidence(page), applied);
  await reopenProject(page, await downloadBytes(page, 'save-project-btn')); await pauseJourney(page);
  expectAssetContinuity(await exportEvidence(page), applied); errors();
});

for (const oversized of ['source', 'target'] as const) test(`${oversized} rig over 512 bones fails early and leaves editable clips`, async ({page}) => {
  const errors = watchJourneyErrors(page);
  const target = await createSkinnedGltfFixtureInputWithOptions({boneCount: oversized === 'target' ? 513 : 2});
  const source = await createSkinnedGltfFixtureInputWithOptions({boneCount: oversized === 'source' ? 513 : 2, clipName: 'Source Motion'});
  await page.goto('/'); const opening = page.waitForEvent('filechooser');
  await page.getByTestId('open-model-btn').click(); await (await opening).setFiles(target);
  await expect(page.getByTestId('status-text')).toContainText('Loaded:'); await pauseJourney(page);
  const before = await exportEvidence(page);
  await choose(page, 'animation-retarget-clips', source);
  await expect(page.getByTestId('retarget-transfer').getByRole('alert')).toContainText(/512 bones.*513/, {timeout: 15000});
  await expect(page.getByTestId('retarget-apply')).toHaveCount(0);
  expectAssetContinuity(await exportEvidence(page), before);
  await page.getByTestId('retarget-discard').click();
  await (await workspaceControl(page, 'animation-clip-name-input')).fill('Still editable');
  await (await workspaceControl(page, 'animation-rename-clip-btn')).click();
  expect((await exportEvidence(page)).clips[0].name).toBe('Still editable'); errors();
});
