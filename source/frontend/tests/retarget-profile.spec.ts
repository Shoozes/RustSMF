import { test, expect } from '@playwright/test';
import { createSkinnedGlbFixtureInput, createSkinnedGltfFixtureInputWithOptions } from './helpers/skinned-glb-fixture';
import { parseRetargetProfile } from '../src/utils/retargetProfile';
import { readFile } from 'node:fs/promises';
import { showModernPanel } from './helpers/modern-shell';

test('saved profile import, strict errors, export and retarget are visible and undoable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
  await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
  await page.getByTestId('mode-tab-animate').click({ force: true });
  const panel = page.getByTestId('retarget-profile-controls');
  await panel.locator('summary').click();
  const profile = { $schema: 'rustsmf.retarget-profile.v1', targetClipNames: { FixtureBend: 'Target Reference' },
    retarget: { manualMap: { FixtureRoot: 'FixtureRoot', FixtureTip: 'FixtureTip' },
      clips: ['Source Motion'], sourceReferencePose: 'clip', sourceReferenceClip: 'Source Motion', targetReferenceClip: 'FixtureBend',
      interpolation: 'step', sampleRateHz: 60, applyUpCorrection: false,
      localReferenceCorrections: { FixtureTip: { from: [0, 0, 0, 1], to: [0, Math.sin(.1), 0, Math.cos(.1)] } } } };
  await page.getByTestId('retarget-profile-import').setInputFiles({ name: 'profile.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(profile)) });
  const editor = page.getByTestId('retarget-profile-json');
  await expect(editor).toContainText('Target Reference');
  const valid = await editor.inputValue();
  await editor.fill('{ "bad": true }');
  await expect(panel.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('retarget-profile-source')).toBeDisabled();
  await page.screenshot({ path: '../../output/playwright/retarget-profile-error.png' });
  await editor.fill(valid);
  await expect(panel.getByRole('alert')).toHaveCount(0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('retarget-profile-export').click();
  const download = await downloadPromise;
  const file = await download.path();
  expect(file).not.toBeNull();
  expect(parseRetargetProfile(await readFile(file!, 'utf8'))).toEqual(parseRetargetProfile(valid));
  await page.getByTestId('retarget-profile-source').setInputFiles(await createSkinnedGltfFixtureInputWithOptions({ clipName: 'Source Motion' }));
  await expect(page.getByTestId('status-text')).toContainText('using the saved profile', { timeout: 15000 });
  await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Source Motion');
  await page.screenshot({ path: '../../output/playwright/retarget-profile-applied.png' });
  await panel.locator('summary').click();
  await page.setViewportSize({ width: 900, height: 700 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: '../../output/playwright/retarget-profile-closed-narrow.png' });
  await page.getByTestId('editor-undo-btn').click({ force: true });
  await showModernPanel(page, 'properties');
  await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend');
  await panel.locator('summary').click();
  await expect(editor).toHaveValue(valid);
  expect(errors).toEqual([]);
});


test('explicit replacement rejects collisions and remains undoable', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
  await expect(page.getByTestId('status-text')).not.toContainText('Loading', {timeout:15000});
  await page.getByTestId('mode-tab-animate').click({force:true});
  const panel=page.getByTestId('retarget-profile-controls');
  await panel.locator('summary').click();
  const profile={$schema:'rustsmf.retarget-profile.v1',targetClipNames:{},retarget:{
    manualMap:{FixtureRoot:'FixtureRoot',FixtureTip:'FixtureTip'},clips:['Source Motion'],
    clipNames:{'Source Motion':'FixtureBend'},sampleRateHz:60,applyUpCorrection:false,
    clipVisualTiming:{'Source Motion':{durationFrames:120,cycles:1}},
  }};
  await page.getByTestId('retarget-profile-json').fill(JSON.stringify(profile));
  const source=await createSkinnedGltfFixtureInputWithOptions({clipName:'Source Motion'});
  await page.getByTestId('retarget-profile-source').setInputFiles(source);
  await expect(page.getByTestId('status-text')).toContainText('explicit replacement', {timeout:15000});
  await page.getByTestId('retarget-profile-json').fill(JSON.stringify({...profile,retarget:{...profile.retarget,replaceClips:['FixtureBend']}}));
  await page.getByTestId('retarget-profile-source').setInputFiles(source);
  await expect(page.getByTestId('status-text')).toContainText('using the saved profile', {timeout:15000});
  await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend');
  await panel.locator('summary').click();
  await page.getByTestId('editor-undo-btn').click({force:true});
  await expect(page.getByTestId('status-text')).toContainText('Undid retarget 1 animation clip.');
  await showModernPanel(page,'properties');
  await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend');
});

test('saved body ranges reject before replacement or report actionable frame warnings', async ({page})=>{
  await page.goto('/');
  await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
  await expect(page.getByTestId('status-text')).not.toContainText('Loading',{timeout:15000});
  await page.getByTestId('mode-tab-animate').click({force:true});
  const panel=page.getByTestId('retarget-profile-controls');await panel.locator('summary').click();
  const profile={$schema:'rustsmf.retarget-profile.v1',targetClipNames:{},retarget:{
    manualMap:{FixtureRoot:'FixtureRoot',FixtureTip:'FixtureTip'},clips:['Source Motion'],sampleRateHz:60,applyUpCorrection:false,
    poseRanges:{schema:'rustsmf.pose-ranges.v1',id:'fixture-tight',policy:'reject',joints:[{
      bone:'FixtureTip',referenceRotation:[0,0,0,1],twistAxis:[0,1,0],bendAxis:[1,0,0],
      flexionDegrees:[-1,1],lateralDegrees:[-1,1],twistDegrees:[-1,1],maximumSwingDegrees:1,
    }]},
  }};
  const source=await createSkinnedGltfFixtureInputWithOptions({clipName:'Source Motion'});
  await page.getByTestId('retarget-profile-json').fill(JSON.stringify(profile));
  await page.getByTestId('retarget-profile-source').setInputFiles(source);
  await expect(page.getByTestId('status-text')).toContainText('body-range flags',{timeout:15000});
  await expect(page.getByTestId('status-text')).toContainText('frame');
  await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend');
  profile.retarget.poseRanges.policy='report';
  await page.getByTestId('retarget-profile-json').fill(JSON.stringify(profile));
  await page.getByTestId('retarget-profile-source').setInputFiles(source);
  await expect(page.getByTestId('status-text')).toContainText('Review 1 flagged clips',{timeout:15000});
  await expect(page.getByTestId('status-text')).toContainText('FixtureTip');
  await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Source Motion');
  await page.screenshot({path:'../../output/playwright/retarget-body-ranges.png'});
});
