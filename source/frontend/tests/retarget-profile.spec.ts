import { clickEditorHistory, applyTransferPreview, workspaceControl, selectWorkspace, showModernPanel } from './helpers/modern-shell';
import { test, expect } from '@playwright/test';
import { createSkinnedGlbFixtureInput, createSkinnedGlbFixtureInputWithOptions, createSkinnedGltfFixtureInputWithOptions } from './helpers/skinned-glb-fixture';
import { parseRetargetProfile } from '../src/utils/retargetProfile';
import { readFile } from 'node:fs/promises';

import { captureReview } from './helpers/review-capture';

test('authored contact patches survive browser profile import/export and invalid ownership disables application',async({page})=>{
  await page.goto('/');
  await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
  await expect(page.getByTestId('status-text')).not.toContainText('Loading',{timeout:15000});
  await selectWorkspace(page, 'animate');
  const panel = (await workspaceControl(page, 'retarget-profile-controls'));
  await (await workspaceControl(page, 'retarget-profile-controls')).locator('summary').click();
  const leg=(side:string)=>({hip:side+'Hip',knee:side+'Knee',ankle:side+'Foot',soleOffset:[0,-.1,0],pole:[0,0,1],minBendDegrees:0,maxBendDegrees:160,maxPelvisCorrection:.2});
  const patch={foot:'right',positionMode:'plane',orientationMode:'animated',contactPatch:[{point:[0,-.1,-.1]},{bone:'RightToe',point:[0,-.02,.1]}],startFrame:0,endFrame:16,blendFrames:0};
  const profile={$schema:'rustsmf.retarget-profile.v1',targetClipNames:{},retarget:{manualMap:{FixtureRoot:'FixtureRoot'},clips:['FixtureBend'],sampleRateHz:60,naturalMotion:{legs:{left:leg('Left'),right:leg('Right')},contacts:{FixtureBend:[patch]}}}};
  await (await workspaceControl(page, 'retarget-profile-import')).setInputFiles({name:'toe-patch.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(profile))});
  await expect(panel.getByRole('alert')).toHaveCount(0);
  const downloadPromise=page.waitForEvent('download');await (await workspaceControl(page, 'retarget-profile-export')).click();
  const file=await(await downloadPromise).path();
  expect(parseRetargetProfile(await readFile(file!,'utf8')).retarget.naturalMotion!.contacts!.FixtureBend[0].contactPatch).toEqual(patch.contactPatch);
  patch.positionMode='planted';await (await workspaceControl(page, 'retarget-profile-json')).fill(JSON.stringify(profile));
  await expect(panel.getByRole('alert')).toContainText('contactPatch');
  await expect(page.getByTestId('retarget-profile-source')).toBeDisabled();
});

test('saved profile import, strict errors, export and retarget are visible and undoable', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
  await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
  await selectWorkspace(page, 'animate');
  const panel = (await workspaceControl(page, 'retarget-profile-controls'));
  await (await workspaceControl(page, 'retarget-profile-controls')).locator('summary').click();
  const profile = { $schema: 'rustsmf.retarget-profile.v1', targetClipNames: { FixtureBend: 'Target Reference' },
    retarget: { manualMap: { FixtureRoot: 'FixtureRoot', FixtureTip: 'FixtureTip' },
      clips: ['Source Motion'], sourceReferencePose: 'clip', sourceReferenceClip: 'Source Motion', targetReferenceClip: 'FixtureBend',
      interpolation: 'step', sampleRateHz: 60, applyUpCorrection: false, targetChainCurls: [],
      rootMotionScale: 1, directionAlignmentBones: ['FixtureRoot'],
      localReferenceCorrections: { FixtureTip: { from: [0, 0, 0, 1], to: [0, Math.sin(.1), 0, Math.cos(.1)] } } } };
  await (await workspaceControl(page, 'retarget-profile-import')).setInputFiles({ name: 'profile.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(profile)) });
  const editor = (await workspaceControl(page, 'retarget-profile-json'));
  await expect(editor).toContainText('Target Reference');
  const valid = await editor.inputValue();
  await editor.fill('{ "bad": true }');
  await expect(panel.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('retarget-profile-source')).toBeDisabled();
  await captureReview(page, testInfo, 'retarget-profile-error.png');
  await editor.fill(valid);
  await expect(panel.getByRole('alert')).toHaveCount(0);
  const downloadPromise = page.waitForEvent('download');
  await (await workspaceControl(page, 'retarget-profile-export')).click();
  const download = await downloadPromise;
  const file = await download.path();
  expect(file).not.toBeNull();
  expect(parseRetargetProfile(await readFile(file!, 'utf8'))).toEqual(parseRetargetProfile(valid));
  await (await workspaceControl(page, 'retarget-profile-source')).setInputFiles(await createSkinnedGltfFixtureInputWithOptions({ clipName: 'Source Motion' }));
  await applyTransferPreview(page);
  await expect(page.getByTestId('status-text')).toContainText('using the saved profile', { timeout: 15000 });
  await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Source Motion');
  await captureReview(page, testInfo, 'retarget-profile-applied.png');
  await (await workspaceControl(page, 'retarget-profile-controls')).locator('summary').click();
  await page.setViewportSize({ width: 900, height: 700 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await captureReview(page, testInfo, 'retarget-profile-closed-narrow.png');
  await clickEditorHistory(page,'undo');
  await showModernPanel(page, 'properties');
  await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend');
  await (await workspaceControl(page, 'retarget-profile-controls')).locator('summary').click();
  await expect(editor).toHaveValue(valid);
  expect(errors).toEqual([]);
});

test('saved endpoint envelopes resolve target clips, report errors and apply as one undoable transaction', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
  await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
  await selectWorkspace(page, 'animate');
  await (await workspaceControl(page, 'retarget-profile-controls')).locator('summary').click();
  const endpoint={targetClip:'FixtureBend',targetFrame:10,spanFrames:4,rootOffset:[0,0,0]};
  const profile={$schema:'rustsmf.retarget-profile.v1',retarget:{clips:['Source Motion'],manualMap:{FixtureRoot:'FixtureRoot',FixtureTip:'FixtureTip'},
    sourceReferencePose:'rest',sampleRateHz:60,interpolation:'step',alignMappedBoneDirections:false,
    clipEndpointEnvelopes:{'Source Motion':{entry:{...endpoint,rootYawDegrees:180},exit:{...endpoint,targetFrame:20},
      intermediatePoses:[{frame:15,targetClip:'FixtureBend',targetFrame:15,rootOffset:[0,0,0],rootYawDegrees:90}]}}}};
  const editor=(await workspaceControl(page, 'retarget-profile-json')),source=await createSkinnedGltfFixtureInputWithOptions({clipName:'Source Motion'});
  await editor.fill(JSON.stringify({...profile,retarget:{...profile.retarget,clipEndpointEnvelopes:{'Source Motion':{entry:{...endpoint,targetClip:'missing'},exit:endpoint}}}}));
  await (await workspaceControl(page, 'retarget-profile-source')).setInputFiles(source);
  await expect(page.getByTestId('status-text')).toContainText('Missing or ambiguous target endpoint clip', {timeout:15000});
  await editor.fill(JSON.stringify(profile));
  const pending=page.waitForEvent('download');await (await workspaceControl(page, 'retarget-profile-export')).click();const file=await(await pending).path();
  expect(parseRetargetProfile(await readFile(file!,'utf8')).retarget.clipEndpointEnvelopes).toEqual(profile.retarget.clipEndpointEnvelopes);
  await (await workspaceControl(page, 'retarget-profile-source')).setInputFiles(source);
  await applyTransferPreview(page);
  await expect(page.getByTestId('status-text')).toContainText('using the saved profile',{timeout:15000});
  await (await workspaceControl(page, 'retarget-profile-controls')).locator('summary').click();await clickEditorHistory(page,'undo');
  await expect(page.getByTestId('status-text')).toContainText('Undid transfer animation clips.');
});

test('saved axial redistribution validates conflicts and applies through the browser transaction', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInputWithOptions({ withHeadChain: true }));
  await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
  await selectWorkspace(page, 'animate');
  const panel = (await workspaceControl(page, 'retarget-profile-controls')); await (await workspaceControl(page, 'retarget-profile-controls')).locator('summary').click();
  const retarget = { manualMap: { FixtureRoot: 'FixtureRoot', FixtureTip: 'FixtureTip', FixtureHead: 'FixtureHead' }, clips: ['Source Motion'],
    sourceReferencePose: 'rest', interpolation: 'step', sampleRateHz: 60, alignMappedBoneDirections: false,
    clipForearmTwist: { 'Source Motion': [{ forearm: 'FixtureTip', hand: 'FixtureHead', share: .5 }] } };
  const profile = { $schema: 'rustsmf.retarget-profile.v1', retarget };
  const editor = (await workspaceControl(page, 'retarget-profile-json'));
  await editor.fill(JSON.stringify({ ...profile, retarget: { ...retarget, interpolation: 'linear' } }));
  await expect(panel.getByRole('alert')).toContainText('isolated STEP');
  await expect(page.getByTestId('retarget-profile-source')).toBeDisabled();
  await editor.fill(JSON.stringify(profile));
  const downloadPromise = page.waitForEvent('download');
  await (await workspaceControl(page, 'retarget-profile-export')).click();
  const file = await (await downloadPromise).path();
  expect(parseRetargetProfile(await readFile(file!, 'utf8')).retarget.clipForearmTwist).toEqual(retarget.clipForearmTwist);
  await (await workspaceControl(page, 'retarget-profile-source')).setInputFiles(await createSkinnedGltfFixtureInputWithOptions({ clipName: 'Source Motion', withHeadChain: true }));
  await applyTransferPreview(page);
  await expect(page.getByTestId('status-text')).toContainText('using the saved profile', { timeout: 15000 });
  await (await workspaceControl(page, 'retarget-profile-controls')).locator('summary').click();
  await clickEditorHistory(page,'undo');
  await expect(page.getByTestId('status-text')).toContainText('Undid transfer animation clips.');
});

test('saved neck/head constraints correct rejected source motion in one undoable application', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInputWithOptions({ withHeadChain: true }));
  await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
  await selectWorkspace(page, 'animate');
  await (await workspaceControl(page, 'retarget-profile-controls')).locator('summary').click();
  const joint = (bone: string, limit: number) => ({ bone, referenceRotation: [0, 0, 0, 1], twistAxis: [0, 1, 0], bendAxis: [1, 0, 0],
    flexionDegrees: [-limit, limit], lateralDegrees: [-limit, limit], twistDegrees: [-90, 90], maximumSwingDegrees: limit });
  const retarget = { manualMap: { FixtureRoot: 'FixtureRoot', FixtureTip: 'FixtureTip', FixtureHead: 'FixtureHead' },
    clips: ['Source Motion'], sampleRateHz: 60, applyUpCorrection: false, alignMappedBoneDirections: false,
    poseRanges: { schema: 'rustsmf.pose-ranges.v1', id: 'browser-head', policy: 'reject', joints: [joint('FixtureTip', 70), joint('FixtureHead', 55)] } };
  const profile = { $schema: 'rustsmf.retarget-profile.v1', targetClipNames: {}, retarget };
  const source = await createSkinnedGltfFixtureInputWithOptions({ withHeadChain: true, clipName: 'Source Motion' });
  await (await workspaceControl(page, 'retarget-profile-json')).fill(JSON.stringify(profile));
  await (await workspaceControl(page, 'retarget-profile-source')).setInputFiles(source);
  await expect(page.getByTestId('status-text')).toContainText('body-range flags', { timeout: 15000 });
  await (await workspaceControl(page, 'retarget-profile-json')).fill(JSON.stringify({ ...profile, retarget: { ...retarget,
    clipJointConstraints: { 'Source Motion': { neck: 'FixtureTip', head: 'FixtureHead', transitionDegrees: 5 } } } }));
  const downloadPromise = page.waitForEvent('download');
  await (await workspaceControl(page, 'retarget-profile-export')).click();
  const downloaded = await (await downloadPromise).path();
  expect(parseRetargetProfile(await readFile(downloaded!, 'utf8')).retarget.clipJointConstraints!['Source Motion'].head).toBe('FixtureHead');
  await (await workspaceControl(page, 'retarget-profile-source')).setInputFiles(source);
  await applyTransferPreview(page);
  await expect(page.getByTestId('status-text')).toContainText('using the saved profile', { timeout: 15000 });
  await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Source Motion');
  await (await workspaceControl(page, 'retarget-profile-controls')).locator('summary').click();
  await clickEditorHistory(page,'undo');
  await showModernPanel(page, 'properties');
  await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend');
});

test('explicit replacement rejects collisions and remains undoable', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
  await expect(page.getByTestId('status-text')).not.toContainText('Loading', {timeout:15000});
  await selectWorkspace(page, 'animate');
  await (await workspaceControl(page, 'retarget-profile-controls')).locator('summary').click();
  const profile={$schema:'rustsmf.retarget-profile.v1',targetClipNames:{},retarget:{
    manualMap:{FixtureRoot:'FixtureRoot',FixtureTip:'FixtureTip'},clips:['Source Motion'],
    clipNames:{'Source Motion':'FixtureBend'},sampleRateHz:60,applyUpCorrection:false,
    clipVisualTiming:{'Source Motion':{durationFrames:120,cycles:1}},
  }};
  await (await workspaceControl(page, 'retarget-profile-json')).fill(JSON.stringify(profile));
  const source=await createSkinnedGltfFixtureInputWithOptions({clipName:'Source Motion'});
  await (await workspaceControl(page, 'retarget-profile-source')).setInputFiles(source);
  await expect(page.getByTestId('status-text')).toContainText('explicit replacement', {timeout:15000});
  await (await workspaceControl(page, 'retarget-profile-json')).fill(JSON.stringify({...profile,retarget:{...profile.retarget,replaceClips:['FixtureBend']}}));
  await (await workspaceControl(page, 'retarget-profile-source')).setInputFiles(source);
  await applyTransferPreview(page);
  await expect(page.getByTestId('status-text')).toContainText('using the saved profile', {timeout:15000});
  await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend');
  await (await workspaceControl(page, 'retarget-profile-controls')).locator('summary').click();
  await clickEditorHistory(page,'undo');
  await expect(page.getByTestId('status-text')).toContainText('Undid transfer animation clips.');
  await showModernPanel(page,'properties');
  await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend');
});

test('saved body ranges reject before replacement or report actionable frame warnings', async ({page},testInfo)=>{
  await page.goto('/');
  await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
  await expect(page.getByTestId('status-text')).not.toContainText('Loading',{timeout:15000});
  await selectWorkspace(page, 'animate');
  await (await workspaceControl(page, 'retarget-profile-controls')).locator('summary').click();
  const profile={$schema:'rustsmf.retarget-profile.v1',targetClipNames:{},retarget:{
    manualMap:{FixtureRoot:'FixtureRoot',FixtureTip:'FixtureTip'},clips:['Source Motion'],sampleRateHz:60,applyUpCorrection:false,
    poseRanges:{schema:'rustsmf.pose-ranges.v1',id:'fixture-tight',policy:'reject',joints:[{
      bone:'FixtureTip',referenceRotation:[0,0,0,1],twistAxis:[0,1,0],bendAxis:[1,0,0],
      flexionDegrees:[-1,1],lateralDegrees:[-1,1],twistDegrees:[-1,1],maximumSwingDegrees:1,
    }]},
  }};
  const source=await createSkinnedGltfFixtureInputWithOptions({clipName:'Source Motion'});
  await (await workspaceControl(page, 'retarget-profile-json')).fill(JSON.stringify(profile));
  await (await workspaceControl(page, 'retarget-profile-source')).setInputFiles(source);
  await expect(page.getByTestId('status-text')).toContainText('body-range flags',{timeout:15000});
  await expect(page.getByTestId('status-text')).toContainText('frame');
  await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend');
  profile.retarget.poseRanges.policy='report';
  await (await workspaceControl(page, 'retarget-profile-json')).fill(JSON.stringify(profile));
  await (await workspaceControl(page, 'retarget-profile-source')).setInputFiles(source);
  await expect((await workspaceControl(page, 'retarget-bake-notes'))).toContainText('Review 1 flagged clips',{timeout:15000});
  await expect(page.getByTestId('retarget-bake-notes')).toContainText('FixtureTip');
  await applyTransferPreview(page);
  await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Source Motion');
  await captureReview(page,testInfo,'retarget-body-ranges.png');
});
