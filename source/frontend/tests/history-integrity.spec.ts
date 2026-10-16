import { test, expect } from '@playwright/test';
import { createSkinnedGltfFixtureInputWithOptions } from './helpers/skinned-glb-fixture';
import { clickEditorHistory, selectWorkspace, workspaceControl } from './helpers/modern-shell';
import { exportEvidence, selectBone, watchJourneyErrors } from './helpers/product-journey';
import { paintOnMeshInViewport } from './helpers/viewport-interactions';

test('first animation undo restores an empty stopped workspace, then redo restores the clip', async ({ page }) => {
  const assertErrors = watchJourneyErrors(page);
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('open-model-btn').click();
  await (await chooser).setFiles(await createSkinnedGltfFixtureInputWithOptions({ withoutAnimation: true }));
  await expect(page.getByTestId('status-text')).toContainText('Loaded:');
  expect((await exportEvidence(page)).clips).toHaveLength(0);
  await selectWorkspace(page, 'animate');
  await (await workspaceControl(page, 'animation-new-name-input')).fill('First');
  await (await workspaceControl(page, 'animation-create-btn')).click();
  await expect(page.getByTestId('status-text')).toContainText('Created animation clip First');
  expect((await exportEvidence(page)).clips.map(clip => clip.name)).toEqual(['First']);
  await clickEditorHistory(page, 'undo');
  await expect(page.getByTestId('status-text')).toContainText('Undid create animation clip First');
  expect((await exportEvidence(page)).clips).toHaveLength(0);
  await expect(page.getByTestId('editor-undo-btn')).toBeDisabled();
  await expect(page.getByTestId('editor-redo-btn')).toBeEnabled();
  await clickEditorHistory(page, 'redo');
  await expect(page.getByTestId('status-text')).toContainText('Redid create animation clip First');
  expect((await exportEvidence(page)).clips.map(clip => clip.name)).toEqual(['First']);
  assertErrors();
});

test('paint undo then bone deletion invalidates skin redo and retains valid exported influences', async ({ page }) => {
  const assertErrors = watchJourneyErrors(page);
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('open-model-btn').click();
  await (await chooser).setFiles(await createSkinnedGltfFixtureInputWithOptions({ withoutAnimation: true, rootOnlyWeights: true }));
  await expect(page.getByTestId('status-text')).toContainText('Loaded:');
  await selectWorkspace(page, 'skin');
  await selectBone(page, 'FixtureTip');
  await (await workspaceControl(page, 'skin-paint-mode-set')).click();
  for (const id of ['skin-paint-target', 'skin-paint-radius', 'skin-paint-strength']) {
    await (await workspaceControl(page, id)).focus();
    await page.keyboard.press('End');
  }
  const panel = page.getByTestId('modern-support-panel');
  if (await panel.isVisible()) await page.getByRole('button', { name: 'Close supporting panel', exact: true }).click();
  expect(await paintOnMeshInViewport(page, { requireDirty: true })).toBe(true);
  await expect(page.getByTestId('modern-skin-float')).toContainText('Unsaved weights');
  const painted = await exportEvidence(page);
  expect(painted.primitives[0].attributes.JOINTS_0.some((joint, index) => joint === 1 && painted.primitives[0].attributes.WEIGHTS_0[index] > 0)).toBe(true);
  await clickEditorHistory(page, 'undo');
  await expect(page.getByTestId('status-text')).toContainText('Undid skin edit');
  await expect(page.getByTestId('editor-redo-btn')).toBeEnabled();
  await selectWorkspace(page, 'rig');
  await selectBone(page, 'FixtureTip');
  await (await workspaceControl(page, 'rig-delete-bone-btn')).click();
  await expect(page.getByTestId('status-text')).toContainText('Deleted bone FixtureTip');
  await expect(page.getByTestId('editor-redo-btn')).toBeDisabled();
  const deleted = await exportEvidence(page);
  expect(deleted.joints).toEqual(['FixtureRoot']);
  for (const primitive of deleted.primitives) for (let i = 0; i < primitive.attributes.JOINTS_0.length; i++) {
    if (primitive.attributes.WEIGHTS_0[i] > 0) expect(primitive.attributes.JOINTS_0[i]).toBe(0);
  }
  await clickEditorHistory(page, 'undo');
  expect((await exportEvidence(page)).joints).toEqual(['FixtureRoot', 'FixtureTip']);
  await clickEditorHistory(page, 'redo');
  expect((await exportEvidence(page)).joints).toEqual(['FixtureRoot']);
  assertErrors();
});
