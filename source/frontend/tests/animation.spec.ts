import { applyTransferPreview, clickEditorHistory, workspaceLocator, workspaceControl, selectWorkspace, clickSecondaryCommand, showAnimateTimeline, showModernPanel } from './helpers/modern-shell';

import { test, expect, type Page } from '@playwright/test';
import { SAMPLE_SMF, pausePlaybackIfRunning, setupBrowserDiagnostics } from './helpers/smoke-helpers';
import {
  createSkinnedGlbFixtureInput,
  createSkinnedGltfFixtureInputWithOptions,
} from './helpers/skinned-glb-fixture';
import { escapeRegex } from './helpers/format-assertions';
import { clickPickableBoneInViewport, setViewportLayout } from './helpers/viewport-interactions';
import { setRangeValue, clickTimelineLaneAt, dragSelectedTimelineMarkerTo } from './helpers/timeline-interactions';
import { createCubicRetargetFixtureInput } from './helpers/cubic-retarget-fixture';
import { downloadBytes, exportEvidence, pauseJourney, reopenProject, watchJourneyErrors } from './helpers/product-journey';
import { expectAssetContinuity, expectNumbersClose, readAssetEvidence, sampleTrack, type AssetEvidence } from './helpers/asset-evidence';

async function openCubicAsset(page: Page, linearRotation = false): Promise<void> {
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('open-model-btn').click();
  await (await chooser).setFiles(await createCubicRetargetFixtureInput({ linearRotation }));
  await expect(page.getByTestId('status-text')).toContainText('Loaded:', { timeout: 15000 });
  await pauseJourney(page);
}

function expectCubicMotion(asset: AssetEvidence, sourceStart: number, timeScale: number, duration: number): void {
  expect(asset.clips).toHaveLength(1);
  const clip = asset.clips[0];
  expect(clip.duration).toBeCloseTo(duration, 6);
  const position = clip.tracks.find(t => t.bone === 'FixtureRoot' && t.path === 'translation')!;
  const scale = clip.tracks.find(t => t.bone === 'FixtureTip' && t.path === 'scale')!;
  expect(position.interpolation).toBe('CUBICSPLINE');
  expect(scale.interpolation).toBe('CUBICSPLINE');
  expect(position.values).toHaveLength(position.times.length * 9);
  for (const fraction of [0,.125,.25,.5,.75,1]) {
    const time = duration * fraction, sourceTime = sourceStart + time / timeScale;
    // Independently derived fixture polynomials, rather than the application's sampler.
    expectNumbersClose(sampleTrack(position,time),[sourceTime + .5*sourceTime**2 - .25*sourceTime**3,0,0],2e-6);
    expectNumbersClose(sampleTrack(scale,time),[1 + sourceTime/4 + sourceTime**2/8 - sourceTime**3/16,1,1],2e-6);
  }
}

async function reimportCubicExport(page: Page): Promise<AssetEvidence> {
  const bytes = await downloadBytes(page,'export-glb-btn',true);
  const drawer = page.getByTestId('modern-support-panel');
  if (await drawer.isVisible()) await page.getByRole('button',{name:'Close supporting panel',exact:true}).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('open-model-btn').click();
  await (await chooser).setFiles({ name:'edited-cubic.glb',mimeType:'model/gltf-binary',buffer:bytes });
  await expect.poll(async () => await page.getByTestId('replacement-dialog').isVisible()
    || (await page.getByTestId('status-text').textContent() ?? '').includes('Loaded: edited-cubic.glb')).toBe(true);
  if (await page.getByTestId('replacement-dialog').isVisible()) await page.getByTestId('confirm-model-replacement').click();
  await expect(page.getByTestId('status-text')).toContainText('Loaded: edited-cubic.glb',{timeout:15000});
  await pauseJourney(page);
  return readAssetEvidence(await downloadBytes(page,'export-glb-btn',true));
}

// Browser integration coverage is split by feature ownership.
// Native IPC and filesystem coverage lives in native.spec.ts and Rust tests.

test.describe('RustSMF animation flow (Chromium)', () => {
  test.beforeEach(async ({ page }) => {
    setupBrowserDiagnostics(page);
  });

  test('raw cubic trim and retime retain motion through history, project reopen and GLB re-import', async ({page}) => {
    const assertErrors = watchJourneyErrors(page);
    await openCubicAsset(page,true);
    const original = await exportEvidence(page);
    expect(original.joints).toEqual(['FixtureRoot','FixtureTip']);
    expect(original.primitives[0].attributes.POSITION).toHaveLength(12);
    expect(original.primitives[0].attributes.WEIGHTS_0).toHaveLength(16);
    expectCubicMotion(original,0,1,2);

    await (await workspaceControl(page,'animation-trim-start-input')).fill('0.5');
    await (await workspaceControl(page,'animation-trim-end-input')).fill('1.5');
    await (await workspaceControl(page,'animation-trim-btn')).click();
    await expect(page.getByTestId('status-text')).toContainText('Trimmed animation clip Cubic Motion to 1.00s');
    const trimmed = await exportEvidence(page);
    expectCubicMotion(trimmed,.5,1,1);
    expectAssetContinuity({...trimmed,clips:original.clips},original);
    await clickEditorHistory(page,'undo');
    expectAssetContinuity(await exportEvidence(page),original);
    await clickEditorHistory(page,'redo');
    expectAssetContinuity(await exportEvidence(page),trimmed);

    await (await workspaceControl(page,'animation-retime-input')).fill('2');
    await expect(page.getByTestId('status-text')).toContainText('Retimed animation clip Cubic Motion from 1.00s to 2.00s');
    const retimed = await exportEvidence(page);
    expectCubicMotion(retimed,.5,2,2);
    await clickEditorHistory(page,'undo');
    expectAssetContinuity(await exportEvidence(page),trimmed);
    await clickEditorHistory(page,'redo');
    expectAssetContinuity(await exportEvidence(page),retimed);
    await reopenProject(page,await downloadBytes(page,'save-project-btn'));
    await pauseJourney(page);
    expectAssetContinuity(await exportEvidence(page),retimed);
    const reimported = await reimportCubicExport(page);
    expectCubicMotion(reimported,.5,2,2);
    expectAssetContinuity(reimported,retimed);
    await (await workspaceControl(page,'animation-clip-name-input')).fill('Continued cubic edit');
    await page.getByTestId('animation-clip-name-input').press('Enter');
    await expect(page.getByTestId('status-text')).toContainText('Continued cubic edit');
    expect((await exportEvidence(page)).clips[0].name).toBe('Continued cubic edit');
    assertErrors();
  });

  test('cubic rotation trim refusal preserves dirty work and one undoable retime with project/export continuity', async ({page}) => {
    const assertErrors = watchJourneyErrors(page);
    await openCubicAsset(page);
    const original = await exportEvidence(page);
    await (await workspaceControl(page,'animation-clip-name-input')).fill('Keep cubic');
    await page.getByTestId('animation-clip-name-input').press('Enter');
    await expect(page.getByTestId('status-text')).toContainText('Keep cubic');
    const renamed = await exportEvidence(page);
    await (await workspaceControl(page,'animation-trim-start-input')).fill('0.5');
    await (await workspaceControl(page,'animation-trim-end-input')).fill('1.5');
    await (await workspaceControl(page,'animation-trim-btn')).click();
    await expect(page.getByTestId('status-text')).toContainText('Choose bounds at existing rotation keys, or use Retime');
    expectAssetContinuity(await exportEvidence(page),renamed);
    await clickEditorHistory(page,'undo');
    expectAssetContinuity(await exportEvidence(page),original);
    await clickEditorHistory(page,'redo');
    await (await workspaceControl(page,'animation-retime-input')).fill('4');
    await expect(page.getByTestId('status-text')).toContainText('Retimed animation clip Keep cubic from 2.00s to 4.00s');
    const retimed = await exportEvidence(page);
    const check = (asset: AssetEvidence) => {
      expectCubicMotion(asset,0,2,4);
      const rotation = asset.clips[0].tracks.find(t => t.path === 'rotation')!;
      expect(rotation.interpolation).toBe('CUBICSPLINE');
      const z = Math.SQRT1_2/2 + .15, w = (1+Math.SQRT1_2)/2, norm = Math.hypot(z,w);
      expectNumbersClose(sampleTrack(rotation,2),[0,0,z/norm,w/norm],2e-6);
    };
    check(retimed);
    await clickEditorHistory(page,'undo');
    expectAssetContinuity(await exportEvidence(page),renamed);
    await clickEditorHistory(page,'redo');
    expectAssetContinuity(await exportEvidence(page),retimed);
    await reopenProject(page,await downloadBytes(page,'save-project-btn'));
    await pauseJourney(page);
    check(await exportEvidence(page));
    const reimported = await reimportCubicExport(page);
    check(reimported);
    expectAssetContinuity(reimported,retimed);
    assertErrors();
  });

  test('timeline lane click scrubs and double-click inserts selected-bone keyframes', async ({ page }) => {
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await expect(page.getByTestId('status-text')).toContainText(/generated-skinned-fixture|bones: 2|clips: 1/i);
      await pausePlaybackIfRunning(page);

      await selectWorkspace(page, 'rig');
      const inspector = page.getByTestId('inspector');
      const boneEntry = await workspaceLocator(page, inspector.locator('li > div').filter({ hasText: /FixtureTip/ }).first());
      await expect(boneEntry).toBeVisible();
      await boneEntry.click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Selected:\s*FixtureTip/i);

      await selectWorkspace(page, 'animate');
      await expect(page.getByTestId('animate-workspace-panel')).toBeVisible();
      await expect(page.getByTestId('animation-workflow-hint')).toContainText(/Select a bone.*pose it.*Insert/i);
      await (await workspaceControl(page, 'transform-rot-negative-btn')).scrollIntoViewIfNeeded();
      await expect(page.getByTestId('transform-rot-negative-btn')).toBeVisible();
      await pausePlaybackIfRunning(page);
      await (await workspaceControl(page, 'animation-snap-step-select')).selectOption('0.1');
      await expect(page.getByTestId('status-text')).toContainText(/Animation snap set to 0\.10s/i);
      await expect(page.getByTestId('timeline-keyframe-lane')).toHaveAttribute('data-keyframe-count', '2');

      await clickTimelineLaneAt(page, 0.75, 2);
      await expect(page.getByTestId('status-text')).toContainText(/Inserted animation keyframe for FixtureTip/i);
      await expect(page.getByTestId('timeline-keyframe-lane')).toHaveAttribute('data-keyframe-count', '3');
      await expect(page.getByTestId('animation-selected-key')).toContainText('0.40s');
      await expect(page.getByTestId('time-display')).toContainText(/0\.40/);

      await dragSelectedTimelineMarkerTo(page, 0.55);
      await expect(page.getByTestId('status-text')).toContainText(/Moved animation keyframe for FixtureTip/i);
      await expect(page.getByTestId('timeline-keyframe-lane')).toHaveAttribute('data-keyframe-count', '3');
      await expect(page.getByTestId('animation-selected-key')).toContainText('0.30s');
      await expect(page.getByTestId('time-display')).toContainText(/0\.30/);

      await clickTimelineLaneAt(page, 0.25);
      await expect(page.getByTestId('animation-selected-key')).toContainText('none');
      await expect(page.getByTestId('time-display')).toContainText(/0\.10/);

      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid move animation keyframe for FixtureTip/i);
      await expect(page.getByTestId('timeline-keyframe-lane')).toHaveAttribute('data-keyframe-count', '3');
      await expect(page.getByTestId('animation-selected-key')).toContainText('0.40s');

      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid move animation keyframe for FixtureTip/i);
      await expect(page.getByTestId('animation-selected-key')).toContainText('0.30s');
      await expect(page.getByTestId('timeline-keyframe-lane')).toHaveAttribute('data-keyframe-count', '3');
    });

  test('animation clip tools duplicate, rename, delete, and undo workspace changes', async ({ page }) => {
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await expect(page.getByTestId('status-text')).toContainText(/generated-skinned-fixture|bones: 2|clips: 1/i);
      await pausePlaybackIfRunning(page);

      await selectWorkspace(page, 'animate');
      await expect(page.getByTestId('animate-workspace-panel')).toBeVisible();
      await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend');
      await expect(page.getByTestId('animation-delete-clip-btn')).toBeDisabled();
      await expect(page.getByTestId('animation-loop-toggle')).toBeChecked();
      await expect(page.getByTestId('animation-sample-multiplier-input')).toHaveValue('1');

      await (await workspaceControl(page, 'animation-loop-toggle')).uncheck({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Animation clip FixtureBend loop disabled/i);
      await (await workspaceControl(page, 'animation-sample-multiplier-input')).fill('3');
      await expect(page.getByTestId('status-text')).toContainText(/sample frame multiplier set to 3/i);
      await expect(page.getByTestId('animation-sample-multiplier-input')).toHaveValue('3');

      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid set animation clip FixtureBend sample frame multiplier to 3/i);
      await expect(page.getByTestId('animation-sample-multiplier-input')).toHaveValue('1');
      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid set animation clip FixtureBend loop off/i);
      await expect(page.getByTestId('animation-loop-toggle')).toBeChecked();
      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid set animation clip FixtureBend loop off/i);
      await expect(page.getByTestId('animation-loop-toggle')).not.toBeChecked();
      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid set animation clip FixtureBend sample frame multiplier to 3/i);
      await expect(page.getByTestId('animation-sample-multiplier-input')).toHaveValue('3');

      await (await workspaceControl(page, 'animation-duplicate-clip-btn')).click();
      await expect(page.getByTestId('status-text')).toContainText(/Duplicated animation clip FixtureBend as FixtureBend Copy/i);
      await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend Copy');
      await expect(page.getByTestId('animation-loop-toggle')).not.toBeChecked();
      await expect(page.getByTestId('animation-sample-multiplier-input')).toHaveValue('3');
      await expect(page.getByTestId('animation-delete-clip-btn')).toBeEnabled();
      await expect(page.getByTestId('clip-item-1')).toContainText(/FixtureBend Copy/);

      await (await workspaceControl(page, 'animation-clip-name-input')).fill('Hero Bend');
      await (await workspaceControl(page, 'animation-rename-clip-btn')).click();
      await expect(page.getByTestId('status-text')).toContainText(/Renamed animation clip FixtureBend Copy to Hero Bend/i);
      await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Hero Bend');
      await expect(page.getByTestId('clip-item-1')).toContainText(/Hero Bend/);
      await expect(page.getByTestId('animation-move-clip-down-btn')).toBeDisabled();
      await expect(page.getByTestId('animation-move-clip-up-btn')).toBeEnabled();

      await (await workspaceControl(page, 'animation-move-clip-up-btn')).click();
      await expect(page.getByTestId('status-text')).toContainText(/Moved animation clip Hero Bend up/i);
      await expect(page.getByTestId('clip-item-0')).toContainText(/Hero Bend/);
      await expect(page.getByTestId('clip-item-1')).toContainText(/^FixtureBend/);
      await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Hero Bend');
      await expect(page.getByTestId('animation-move-clip-up-btn')).toBeDisabled();
      await expect(page.getByTestId('animation-move-clip-down-btn')).toBeEnabled();

      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid move up animation clip Hero Bend/i);
      await expect(page.getByTestId('clip-item-1')).toContainText(/Hero Bend/);
      await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Hero Bend');

      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid move up animation clip Hero Bend/i);
      await expect(page.getByTestId('clip-item-0')).toContainText(/Hero Bend/);

      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid move up animation clip Hero Bend/i);
      await expect(page.getByTestId('clip-item-1')).toContainText(/Hero Bend/);

      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid rename animation clip FixtureBend Copy to Hero Bend/i);
      await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend Copy');

      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid rename animation clip FixtureBend Copy to Hero Bend/i);
      await (await workspaceControl(page, 'animation-delete-clip-btn')).click();
      await expect(page.getByTestId('status-text')).toContainText(/Deleted animation clip Hero Bend/i);
      await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend');
      await expect(page.getByTestId('animation-delete-clip-btn')).toBeDisabled();
      await expect(page.getByTestId('clip-item-1')).toBeHidden();

      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid delete animation clip Hero Bend/i);
      await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Hero Bend');
      await expect(page.getByTestId('animation-delete-clip-btn')).toBeEnabled();

      await expect(page.getByTestId('animation-duration-input')).toHaveValue('0.5');
      await (await workspaceControl(page, 'animation-duration-input')).fill('1.5');
      await expect(page.getByTestId('status-text')).toContainText(/Set animation clip Hero Bend duration to 1\.50s/i);
      await expect(page.getByTestId('animation-duration-input')).toHaveValue('1.5');
      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid set animation clip Hero Bend duration to 1\.50s/i);
      await expect(page.getByTestId('animation-duration-input')).toHaveValue('0.5');
      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid set animation clip Hero Bend duration to 1\.50s/i);
      await expect(page.getByTestId('animation-duration-input')).toHaveValue('1.5');

      await (await workspaceControl(page, 'animation-retime-input')).fill('0.75');
      await expect(page.getByTestId('status-text')).toContainText(/Retimed animation clip Hero Bend from 1\.50s to 0\.75s/i);
      await expect(page.getByTestId('animation-retime-input')).toHaveValue('0.75');
      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid retime animation clip Hero Bend from 1\.50s to 0\.75s/i);
      await expect(page.getByTestId('animation-retime-input')).toHaveValue('1.5');
      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid retime animation clip Hero Bend from 1\.50s to 0\.75s/i);
      await expect(page.getByTestId('animation-retime-input')).toHaveValue('0.75');
    });

  test('creates a pose-based animation and undoes the whole workspace transaction', async ({ page }) => {
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await expect(page.getByTestId('status-text')).toContainText(/generated-skinned-fixture|bones: 2|clips: 1/i);
      await pausePlaybackIfRunning(page);

      await selectWorkspace(page, 'animate');
      await expect(page.getByTestId('animation-create-btn')).toBeEnabled();
      await (await workspaceControl(page, 'animation-new-name-input')).fill('Rest Pose Start');
      await (await workspaceControl(page, 'animation-new-duration-input')).fill('1.25');
      await (await workspaceControl(page, 'animation-new-pose-select')).selectOption('rest');
      await (await workspaceControl(page, 'animation-create-btn')).click();

      await expect(page.getByTestId('status-text')).toContainText(/Created animation clip Rest Pose Start from the rest pose/i);
      await expect(page.getByTestId('animate-summary').locator('div').first().locator('strong')).toHaveText('2');
      await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Rest Pose Start');
      await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');

      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid create animation clip Rest Pose Start/i);
      await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend');
      await expect(page.getByTestId('animate-summary').locator('div').first().locator('strong')).toHaveText('1');

      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid create animation clip Rest Pose Start/i);
      await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Rest Pose Start');
      await expect(page.getByTestId('animate-summary').locator('div').first().locator('strong')).toHaveText('2');
    });

  test('retargets named-rig GLTF clips as one undoable animation workspace transaction', async ({ page }) => {
      await page.goto('/');

      await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await selectWorkspace(page, 'animate');

      const source = await createSkinnedGltfFixtureInputWithOptions({ clipName: 'Source Motion' });
      await (await workspaceControl(page, 'animation-retarget-clips')).locator('input').setInputFiles(source);

      await applyTransferPreview(page);
      await expect(page.getByTestId('status-text')).toContainText(/Retargeted 1 clip/i, { timeout: 15000 });
      await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Source Motion');
      await expect(page.getByTestId('animate-summary').locator('div').first().locator('strong')).toHaveText('2');

      await clickEditorHistory(page,'undo');
      await expect(page.getByTestId('status-text')).toContainText(/Undid transfer animation clips/i);
      await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend');
      await expect(page.getByTestId('animate-summary').locator('div').first().locator('strong')).toHaveText('1');
    });

  test('animation trim and locked-bone policy are visible and undoable', async ({ page }) => {
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await pausePlaybackIfRunning(page);

      await selectWorkspace(page, 'rig');
      const inspector = page.getByTestId('inspector');
      await inspector.locator('li > div').filter({ hasText: /FixtureTip/ }).first().click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Selected:\s*FixtureTip/i);

      await selectWorkspace(page, 'animate');
      await (await workspaceControl(page, 'animation-trim-start-input')).fill('0.10');
      await (await workspaceControl(page, 'animation-trim-end-input')).fill('0.40');
      await (await workspaceControl(page, 'animation-trim-btn')).click();
      await expect(page.getByTestId('status-text')).toContainText(/Trimmed animation clip FixtureBend to 0\.30s/i);
      await expect(page.getByTestId('animation-duration-input')).toHaveValue('0.3');

      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid trim animation clip FixtureBend/i);
      await expect(page.getByTestId('animation-duration-input')).toHaveValue('0.5');
      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid trim animation clip FixtureBend/i);

      await (await workspaceControl(page, 'animation-lock-bone-btn')).click();
      await expect(page.getByTestId('animation-lock-state')).toContainText('Locked bones: 1');
      await (await workspaceControl(page, 'animation-insert-key-btn')).click();
      await expect(page.getByTestId('status-text')).toContainText(/all bones.*locked/i);
      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('animation-lock-state')).toContainText('Locked bones: 0');
    });

  test('animation keyframe authoring updates selected-bone clips and SMF checks', async ({ page }) => {
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await expect(page.getByTestId('status-text')).toContainText(/generated-skinned-fixture|bones: 2|clips: 1/i);
      await pausePlaybackIfRunning(page);

      await showModernPanel(page, 'scene');

      const firstSubmodel = (await workspaceControl(page, 'outliner-submodel-0'));
      await showModernPanel(page, 'scene');
      const firstVisibilityToggle = (await workspaceControl(page, 'outliner-visibility-toggle-0'));
      await expect(firstSubmodel).toBeVisible();
      await firstVisibilityToggle.click();
      await expect(firstSubmodel).toHaveAttribute('data-visible', 'false');
      await firstVisibilityToggle.click();
      await expect(firstSubmodel).toHaveAttribute('data-visible', 'true');
      await expect(page.getByTestId('editor-undo-btn')).toBeEnabled();

      await selectWorkspace(page, 'rig');
      const inspector = page.getByTestId('inspector');
      const boneEntry = await workspaceLocator(page, inspector
        .locator('li > div')
        .filter({ hasText: /FixtureTip/ })
        .first());
      await expect(boneEntry).toBeVisible({ timeout: 8000 });
      await boneEntry.click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Selected:\s*FixtureTip/i);
      const canvas = page.getByTestId('three-canvas');
      await expect(canvas).toHaveAttribute('data-transform-owner', 'pose');
      await expect(canvas).toHaveAttribute('data-transform-attached', 'true');

      await selectWorkspace(page, 'animate');
      await expect(page.getByTestId('animate-workspace-panel')).toBeVisible();
      await expect(canvas).toHaveAttribute('data-transform-owner', 'animation');
      await expect(canvas).toHaveAttribute('data-transform-attached', 'true');
      await expect(page.getByTestId('animation-insert-key-btn')).toBeEnabled();
      await setViewportLayout(page, 'quad');
      const animatePick = await clickPickableBoneInViewport(page, 'animate-select');
      expect(animatePick).toBeTruthy();
      await expect(canvas).toHaveAttribute('data-viewport-pane-role', animatePick!.paneRole);
      await expect(canvas).toHaveAttribute('data-viewport-picked-bone', animatePick!.bone);
      await expect(page.getByTestId('status-text')).toContainText(new RegExp(`Selected:\\s*${escapeRegex(animatePick!.bone)}`));
      await (await workspaceControl(page, 'animation-interpolation-select')).selectOption('step');
      await expect(page.getByTestId('status-text')).toContainText(/Animation interpolation set to step/i);
      await (await workspaceControl(page, 'animation-interpolation-select')).selectOption('quadratic');
      await expect(page.getByTestId('status-text')).toContainText(/Animation interpolation set to quadratic/i);
      await expect(page.getByTestId('animation-interpolation-note')).toContainText(/SMF metadata.*live preview uses linear/i);
      await (await workspaceControl(page, 'animation-insert-key-btn')).click();
      await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');
      await expect(page.getByTestId('animation-selected-key')).not.toContainText('none');
      await expect(page.getByTestId('status-text')).toContainText(/Inserted animation keyframe/i);
      await expect(page.getByTestId('editor-undo-btn')).toBeEnabled();
      await setViewportLayout(page, 'single');

      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid insert animation keyframe/i);
      await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: false');
      await expect(page.getByTestId('editor-redo-btn')).toBeEnabled();

      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid insert animation keyframe/i);
      await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');

      await (await workspaceControl(page, 'animation-copy-key-btn')).click();
      await expect(page.getByTestId('animation-paste-key-btn')).toBeEnabled();
      await setRangeValue(page, 'scrub-slider', 0.37);
      await (await workspaceControl(page, 'animation-paste-key-btn')).click();
      await expect(page.getByTestId('status-text')).toContainText(/Pasted animation keyframe/i);

      await page.keyboard.press('Control+Z');
      await expect(page.getByTestId('status-text')).toContainText(/Undid paste animation keyframe/i);
      await page.keyboard.press('Control+Y');
      await expect(page.getByTestId('status-text')).toContainText(/Redid paste animation keyframe/i);

      await (await workspaceControl(page, 'animation-update-key-btn')).click();
      await expect(page.getByTestId('status-text')).toContainText(/Updated animation keyframe/i);
      await expect(page.getByTestId('timeline-keyframe-lane')).toHaveAttribute('data-keyframe-count', /[1-9]\d*/);

      await selectWorkspace(page, 'export');
      await expect(canvas).toHaveAttribute('data-transform-owner', 'disabled');
      await expect(canvas).toHaveAttribute('data-transform-attached', 'false');
      await page.getByTestId('smf-roundtrip-check-btn').click();
      await expect(page.getByTestId('smf-roundtrip-result')).toHaveAttribute('data-smf-roundtrip-ok', 'true', { timeout: 15000 });
      await expect(page.getByTestId('status-text')).toContainText(/SMF roundtrip check passed/i);

      await selectWorkspace(page, 'animate');
      await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');
      await (await workspaceControl(page, 'animation-delete-key-btn')).click();
      await expect(page.getByTestId('status-text')).toContainText(/Deleted animation keyframe/i);
      await page.keyboard.press('Control+Z');
      await expect(page.getByTestId('status-text')).toContainText(/Undid delete animation keyframe/i);
      await page.keyboard.press('Control+Y');
      await expect(page.getByTestId('status-text')).toContainText(/Redid delete animation keyframe/i);
    });

  test('scoped animation key authoring makes one undoable branch transaction', async ({ page }) => {
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await expect(page.getByTestId('status-text')).toContainText(/generated-skinned-fixture|bones: 2|clips: 1/i);
      await pausePlaybackIfRunning(page);

      await selectWorkspace(page, 'rig');
      const inspector = page.getByTestId('inspector');
      const boneEntry = await workspaceLocator(page, inspector.locator('li > div').filter({ hasText: /FixtureRoot/ }).first());
      await expect(boneEntry).toBeVisible();
      await boneEntry.click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Selected:\s*FixtureRoot/i);

      await selectWorkspace(page, 'animate');
      await expect(page.getByTestId('animation-scope-select')).toHaveValue('bone');
      await (await workspaceControl(page, 'animation-scope-select')).selectOption('branch');
      await expect(page.getByTestId('status-text')).toContainText(/Animation edit scope set to Branch/i);
      await (await workspaceControl(page, 'animation-insert-key-btn')).click();
      await expect(page.getByTestId('status-text')).toContainText(/Inserted branch animation keyframes for Branch \(FixtureRoot, FixtureTip\)/i);
      await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');

      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid insert branch animation keyframes/i);
      await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: false');
      await expect(page.getByTestId('animation-scope-select')).toHaveValue('branch');
    });

  test('timeline scrub, clip change, loading overlay, and error banner (extended controls + UX)', async ({ page }) => {
      await page.goto('/');

      // Error banner element should be in DOM (even if not shown)
      await expect(page.getByTestId('error-banner')).toBeAttached();

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(SAMPLE_SMF);

      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await expect(page.getByTestId('status-text')).toContainText(/mixamo|Loaded|bones|clips|verts/i);
      await showAnimateTimeline(page);

      // Loading overlay should not be visible after load
      await expect(page.getByTestId('loading-overlay')).toBeHidden();

      // Scrub slider present and interactive (set value; no crash + still renders)
      const slider = page.getByTestId('scrub-slider');
      await expect(slider).toBeVisible();
      await expect(slider).toBeEnabled();
      // Drive the scrub (Playwright range .fill works for value update)
      await slider.fill('0.5');
      // Give RAF a tick for any internal update
      await page.waitForTimeout(120);
      // Stronger assert: time display updated after scrub (uses data-testid)
      // Loosened regex for real model timing/play state (values may drift slightly while playing)
      await expect(page.getByTestId('time-display')).toContainText(/0\.[0-9]/);

      // Clip list items: click first clip (if present) and assert no crash / UI still live
      const firstClip = await workspaceControl(page, 'clip-item-0');
      if (await firstClip.count() > 0) {
        await firstClip.click();
        await page.waitForTimeout(80);
        // Status or timeline should still be sensible
        await expect(page.getByTestId('timeline')).toBeVisible();
      }

      // Canvas still rendering post-interactions
      await expect(page.getByTestId('three-canvas')).toBeVisible();

      // Empty projects disable the primary export; explicit format guards explain the rejection.
      await page.goto('/');
      await expect(page.getByTestId('export-btn')).toBeDisabled();
      await clickSecondaryCommand(page, 'export-glb-btn');
      await expect(page.getByTestId('status-text')).toContainText(/Nothing to export as GLB/i);
      await clickSecondaryCommand(page, 'export-fbx-btn');
      await expect(page.getByTestId('status-text')).toContainText(/Nothing to export as FBX/i);
      await expect(page.getByTestId('export-smf-btn')).toBeDisabled();

      // Drop zone hint is present (for drag-drop UX)
      await expect(page.locator('text=/Drop .* here/')).toBeAttached();
    });
});
