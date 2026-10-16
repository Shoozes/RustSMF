import { test, expect, downloadBytes, exportEvidence, pauseJourney, reopenProject, watchJourneyErrors } from '../helpers/product-journey';
import { animalRetargetFixture, animalSourceChains, animalTargetChains } from '../helpers/animal-retarget-fixture';
import { applyTransferPreview, clickEditorHistory, selectWorkspace, workspaceControl } from '../helpers/modern-shell';
import { expectAssetContinuity, expectMotion, readAssetEvidence, sampleTrack } from '../helpers/asset-evidence';
import { captureReview } from '../helpers/review-capture';

test('animal suggestions remain reviewed explicit maps through preview, history, project and queued GLB', async ({ page }, testInfo) => {
  const errors = watchJourneyErrors(page);
  await page.goto('/');
  const target = await animalRetargetFixture(false), source = await animalRetargetFixture(true);
  const original = readAssetEvidence(target.buffer);
  expect(original.joints).toHaveLength(23);
  expect(original.primitives[0].attributes.WEIGHTS_0.filter((_, i) => i % 4 === 0).every(n => n === 1)).toBe(true);
  await page.getByTestId('model-file-input').setInputFiles(target);
  await expect(page.getByTestId('status-text')).toContainText('Loaded: animal-target.glb');
  await pauseJourney(page);
  await page.getByTestId('workspace-task-transfer').click();
  const canonical = await exportEvidence(page);
  const choose = async () => {
    const chooser = page.waitForEvent('filechooser');
    await (await workspaceControl(page, 'animation-retarget-clips')).getByRole('button', { name: 'Retarget clips', exact: true }).click();
    await (await chooser).setFiles(source);
    await expect(page.getByTestId('retarget-apply')).toBeVisible({ timeout: 15000 });
  };
  await choose();
  expectAssetContinuity(await exportEvidence(page), canonical);
  await page.getByTestId('retarget-mapping-details').locator(':scope > summary').click();
  await expect(page.getByTestId('retarget-mapping-details')).toContainText('RIG_MAP_ANIMAL_REVIEW');
  for (const [width,height] of [[1920,1080],[1440,900],[1280,800],[1024,768],[800,900],[390,844]]) {
    await page.setViewportSize({width,height});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (width===1280 || width===390) await captureReview(page,testInfo,`animal-mapping-${width}.png`);
  }
  await page.setViewportSize({width:1280,height:800});
  const profile = JSON.parse((await downloadBytes(page, 'retarget-mapping-export')).toString());
  for (let c = 0; c < animalSourceChains.length; c++) for (let s = 0; s < 3; s++) {
    expect(profile.retarget.manualMap[animalSourceChains[c][s]]).toBe(animalTargetChains[c][s]);
  }
  // An ordinary correction invalidates the preview, then the reviewed choice restores it.
  await page.getByRole('combobox', { name: 'Map ForeUpper_L', exact: true }).selectOption('FrontUpper_L');
  await page.getByTestId('retarget-review').click();
  await expect(page.getByTestId('retarget-apply')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('retarget-discard').click();
  expectAssetContinuity(await exportEvidence(page), canonical);
  await (await workspaceControl(page, 'retarget-profile-controls')).locator('summary').click();
  await (await workspaceControl(page, 'retarget-profile-import')).setInputFiles({ name: 'animal-profile.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(profile)) });
  await choose(); await applyTransferPreview(page);
  const applied = await exportEvidence(page);
  const motion = applied.clips.find(c => c.name === 'Animal Motion')!; expectMotion(motion);
  for (const bone of ['FrontUpper_L', 'Tail003', 'RightWingElbow']) {
    const track = motion.tracks.find(t => t.bone === bone && t.path === 'rotation')!;
    const middle = sampleTrack(track, 0.5);
    expect(Math.abs(middle[2])).toBeCloseTo(Math.sin(Math.PI / 12), 5);
    expect(Math.abs(middle[3])).toBeCloseTo(Math.cos(Math.PI / 12), 5);
  }
  expect(applied.primitives[0].attributes.WEIGHTS_0).toEqual(original.primitives[0].attributes.WEIGHTS_0);
  await clickEditorHistory(page, 'undo'); expectAssetContinuity(await exportEvidence(page), canonical);
  await clickEditorHistory(page, 'redo'); expectAssetContinuity(await exportEvidence(page), applied);
  await reopenProject(page, await downloadBytes(page, 'save-project-btn')); await pauseJourney(page);
  expectAssetContinuity(await exportEvidence(page), applied);
  await selectWorkspace(page, 'export');
  await (await workspaceControl(page, 'export-queue-add')).click();
  const download = page.waitForEvent('download'); await page.getByTestId('export-queue-run').click();
  const saved = await download; const file = await saved.path(); expect(file).not.toBeNull();
  const { readFileSync } = await import('node:fs'); const glb = readFileSync(file!);
  expectAssetContinuity(readAssetEvidence(glb), applied);
  await page.getByTestId('model-file-input').setInputFiles({ name: 'animal-roundtrip.glb', mimeType: 'model/gltf-binary', buffer: glb });
  await expect(page.getByTestId('status-text')).toContainText('Loaded: animal-roundtrip.glb'); await pauseJourney(page);
  expectAssetContinuity(await exportEvidence(page), applied);
  errors();
});
