import {test,expect,type Page} from '@playwright/test';
import {createSkinnedGlbFixtureInput,createSkinnedGltfFixtureInputWithOptions} from './helpers/skinned-glb-fixture';
import {selectWorkspace,workspaceControl,applyTransferPreview,clickEditorHistory,showModernPanel} from './helpers/modern-shell';
import {exportEvidence,pauseJourney,downloadBytes,reopenProject,watchJourneyErrors} from './helpers/product-journey';
import {expectAssetContinuity,expectMotion,expectNumbersClose,sampleTrack} from './helpers/asset-evidence';
import {createCubicRetargetFixtureInput} from './helpers/cubic-retarget-fixture';
import {Quaternion} from 'three';
import {captureReview} from './helpers/review-capture';

async function openTarget(page:Page){
  await page.goto('/');await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
  await expect(page.getByTestId('status-text')).toContainText('Loaded:',{timeout:15000});await pauseJourney(page);
  await page.getByTestId('workspace-task-transfer').click();
}
async function chooseSource(page:Page,clipDuration=.5){
  const source=await createSkinnedGltfFixtureInputWithOptions({clipName:'Source Motion',clipDuration});
  const chooser=page.waitForEvent('filechooser');
  await (await workspaceControl(page,'animation-retarget-clips')).getByRole('button',{name:'Retarget clips',exact:true}).click();
  await(await chooser).setFiles(source);
}
test('real WASM/worker preview preserves canonical project/export, supports corrections, discard and one undoable Apply',async({page})=>{
  const assertErrors=watchJourneyErrors(page);await openTarget(page);
  const before=await exportEvidence(page);
  const canonicalProject=JSON.parse((await downloadBytes(page,'save-project-btn')).toString());
  await chooseSource(page,2);await expect(page.getByTestId('retarget-apply')).toBeVisible({timeout:15000});
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-retarget-preview','true');
  await expect(page.getByTestId('timeline')).toHaveAttribute('data-playback-source','transfer-preview');
  await expect(page.getByTestId('timeline-keyframe-lane')).toHaveCount(0);
  await expect(page.getByTestId('timeline-play-btn')).toHaveText('Pause');await page.getByTestId('timeline-play-btn').click();
  await page.getByTestId('scrub-slider').focus();await page.keyboard.press('End');
  await expect(page.getByTestId('scrub-slider')).toHaveValue('2');
  await page.getByTestId('timeline-speed-select').selectOption('2');
  expectAssetContinuity(await exportEvidence(page),before);
  const project=JSON.parse((await downloadBytes(page,'save-project-btn')).toString());
  expect(project.state.currentClipName).toBe('FixtureBend');
  expect(project.state.currentTime).toBe(canonicalProject.state.currentTime);
  expect(project.state.isPlaying).toBe(canonicalProject.state.isPlaying);expect(project.state.playbackSpeed).toBe(canonicalProject.state.playbackSpeed);
  await (await workspaceControl(page,'retarget-mapping-details')).locator(':scope > summary').click();
  const mapping=JSON.parse((await downloadBytes(page,'retarget-mapping-export')).toString());
  expect(mapping.retarget.manualMap).toEqual({FixtureRoot:'FixtureRoot',FixtureTip:'FixtureTip'});
  expect(mapping).not.toHaveProperty('sourceModel');
  await page.getByRole('combobox',{name:'Map FixtureRoot',exact:true}).selectOption('FixtureRoot');
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-retarget-preview','false');
  await page.getByTestId('retarget-review').click();await expect(page.getByTestId('retarget-apply')).toBeVisible({timeout:15000});
  await page.getByTestId('retarget-discard').click();await expect(page.getByRole('button',{name:'Retarget clips',exact:true})).toBeFocused();
  await expect(page.getByTestId('timeline')).toHaveAttribute('data-playback-source','editor');
  await expect(page.getByTestId('scrub-slider')).toHaveAttribute('max','0.5');
  expectAssetContinuity(await exportEvidence(page),before);
  await chooseSource(page);await applyTransferPreview(page);
  const applied=await exportEvidence(page);expect(applied.clips.map(clip=>clip.name)).toEqual(['FixtureBend','Source Motion']);expectMotion(applied.clips[1]);
  await clickEditorHistory(page,'undo');expectAssetContinuity(await exportEvidence(page),before);
  await clickEditorHistory(page,'redo');expectAssetContinuity(await exportEvidence(page),applied);assertErrors();
});

test('cubic glTF source retains known translation, rotation and scale through preview, Apply and project reopen',async({page})=>{
  const assertErrors=watchJourneyErrors(page);await openTarget(page);
  const before=await exportEvidence(page);
  const profile={$schema:'rustsmf.retarget-profile.v1',retarget:{
    manualMap:{FixtureRoot:'FixtureRoot',FixtureTip:'FixtureTip'},sampleRateHz:4,
    applyUpCorrection:false,alignMappedBoneDirections:false,scaleRootMotion:false,
    sourceReferencePose:'clip',sourceReferenceClip:'Cubic Motion',targetReferenceClip:'FixtureBend',
    clipScaleTransfer:{'Cubic Motion':[{sourceBone:'FixtureTip',targetBone:'FixtureTip',axes:['x','y','z'],strength:[1,1,1]}]},
  }};
  await (await workspaceControl(page,'retarget-profile-json')).fill(JSON.stringify(profile));
  const chooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Retarget with profile',exact:true}).click();
  await (await chooser).setFiles(await createCubicRetargetFixtureInput());
  await expect(page.getByTestId('retarget-apply')).toBeVisible({timeout:15000});
  expectAssetContinuity(await exportEvidence(page),before);
  await applyTransferPreview(page);
  const applied=await exportEvidence(page),clip=applied.clips.find(item=>item.name==='Cubic Motion')!;
  expect(clip.duration).toBe(2);expectMotion(clip);
  const at=(bone:string,path:string)=>sampleTrack(clip.tracks.find(track=>track.bone===bone && track.path===path)!,1);
  expectNumbersClose(at('FixtureRoot','translation'),[1.25,0,0]);
  expectNumbersClose(at('FixtureTip','scale'),[1.3125,1,1]);
  const rotation=new Quaternion(0,0,Math.SQRT1_2/2+.15,(1+Math.SQRT1_2)/2).normalize().toArray();
  expectNumbersClose(at('FixtureTip','rotation'),rotation);
  await clickEditorHistory(page,'undo');expectAssetContinuity(await exportEvidence(page),before);
  await clickEditorHistory(page,'redo');expectAssetContinuity(await exportEvidence(page),applied);
  await reopenProject(page,await downloadBytes(page,'save-project-btn'));await pauseJourney(page);
  expectAssetContinuity(await exportEvidence(page),applied);assertErrors();
});

for(const phase of ['analysis','bake'] as const)test(`cancel during ${phase} terminates the worker and rejects stale completion`,async({page})=>{
  const assertErrors=watchJourneyErrors(page);await openTarget(page);
  let release!:()=>void,seen!:()=>void;
  const blocked=new Promise<void>(resolve=>{release=resolve;}),requested=new Promise<void>(resolve=>{seen=resolve;});
  const pattern=phase==='analysis'?'**/assets/retarget_core_bg-*.wasm':'**/assets/retargetBakeRuntime-*.js';
  await page.route(pattern,async route=>{seen();await blocked;await route.continue().catch(()=>{});});
  await chooseSource(page);await requested;
  await expect(page.getByTestId('retarget-transfer')).toHaveAttribute('data-phase',phase);
  await page.getByTestId('retarget-cancel').click();release();
  await expect(page.getByTestId('retarget-transfer')).toHaveAttribute('data-phase','idle');
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-retarget-preview','false');
  await page.unroute(pattern);await page.getByTestId('workspace-task-clips').click();
  await page.getByTestId('animation-clip-name-input').fill('Still editable');await page.getByTestId('animation-rename-clip-btn').click();
  expect((await exportEvidence(page)).clips.map(clip=>clip.name)).toEqual(['Still editable']);
  await chooseSource(page);await applyTransferPreview(page);
  expectMotion((await exportEvidence(page)).clips[1]);assertErrors();
});

test('leaving Animate clears preview, retains profile drafts, and late analysis cannot replace work',async({page})=>{
  const assertErrors=watchJourneyErrors(page);await openTarget(page);
  const profile={$schema:'rustsmf.retarget-profile.v1',retarget:{manualMap:{FixtureRoot:'FixtureRoot',FixtureTip:'FixtureTip'}}};
  const editor=await workspaceControl(page,'retarget-profile-json');await editor.fill(JSON.stringify(profile));
  await chooseSource(page);await expect(page.getByTestId('retarget-apply')).toBeVisible({timeout:15000});
  await page.getByRole('button',{name:'Close supporting panel',exact:true}).click();
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-retarget-preview','true');
  await selectWorkspace(page,'rig');await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-retarget-preview','false');
  await selectWorkspace(page,'animate');await expect((await workspaceControl(page,'retarget-profile-json'))).toHaveValue(JSON.stringify(profile));
  expect((await exportEvidence(page)).clips.map(clip=>clip.name)).toEqual(['FixtureBend']);assertErrors();
});

test('an authoring revision during analysis terminates pending work and preserves the new edit',async({page})=>{
  const assertErrors=watchJourneyErrors(page);await openTarget(page);
  let release!:()=>void,seen!:()=>void,closed!:()=>void;
  const blocked=new Promise<void>(resolve=>{release=resolve;}),requested=new Promise<void>(resolve=>{seen=resolve;});
  const terminated=new Promise<void>(resolve=>{closed=resolve;});
  page.once('worker',worker=>worker.once('close',closed));
  await page.route('**/assets/retarget_core_bg-*.wasm',async route=>{seen();await blocked;await route.continue().catch(()=>{});});
  await chooseSource(page);await requested;
  await page.getByTestId('workspace-task-clips').click();await page.getByTestId('animation-clip-name-input').fill('Authored during review');
  await page.getByTestId('animation-rename-clip-btn').click();await terminated;release();
  await page.getByTestId('workspace-task-transfer').click();await expect(page.getByTestId('retarget-transfer')).toHaveAttribute('data-phase','idle');
  await expect(page.getByTestId('retarget-apply')).toHaveCount(0);
  expect((await exportEvidence(page)).clips.map(clip=>clip.name)).toEqual(['Authored during review']);assertErrors();
});

test('unavailable WASM reports an actionable failure and preserves continued editing',async({page})=>{
  const assertErrors=watchJourneyErrors(page);await openTarget(page);
  await page.route('**/assets/retarget_core_bg-*.wasm',route=>route.fulfill({contentType:'application/wasm',body:'invalid wasm'}));
  await chooseSource(page);await expect(page.getByTestId('retarget-transfer').getByRole('alert')).toContainText(/failed|invalid|magic|expected/i,{timeout:15000});
  await expect(page.getByTestId('retarget-apply')).toHaveCount(0);
  await page.getByTestId('retarget-discard').click();await page.unroute('**/assets/retarget_core_bg-*.wasm');
  await showModernPanel(page,'properties');await page.getByTestId('workspace-task-clips').click();
  await page.getByTestId('animation-clip-name-input').fill('Recovered');await page.getByTestId('animation-rename-clip-btn').click();
  expect((await exportEvidence(page)).clips[0].name).toBe('Recovered');assertErrors();
});

test('opaque numeric rigs require review and explicit mappings before preview and Apply',async({page})=>{
  const assertErrors=watchJourneyErrors(page);
  const numeric=async(clipName:string)=>{
    const fixture=await createSkinnedGltfFixtureInputWithOptions({clipName});
    return {...fixture,buffer:Buffer.from(fixture.buffer.toString().replace(/FixtureRoot/g,'0').replace(/FixtureTip/g,'1'))};
  };
  await page.goto('/');await page.getByTestId('model-file-input').setInputFiles(await numeric('FixtureBend'));
  await expect(page.getByTestId('status-text')).toContainText('Loaded:',{timeout:15000});await pauseJourney(page);
  await (await workspaceControl(page,'animation-retarget-clips')).locator('input').setInputFiles(await numeric('Source Motion'));
  await expect(page.getByTestId('retarget-transfer')).toHaveAttribute('data-phase','review',{timeout:15000});
  await expect(page.getByTestId('retarget-apply')).toHaveCount(0);
  await page.getByRole('button',{name:'Review mapping',exact:true}).click();
  await expect(page.getByTestId('retarget-mapping-details')).toContainText('RIG_MAP_OPAQUE_REQUIRES_MANUAL');
  await page.getByRole('combobox',{name:'Map 0',exact:true}).selectOption('0');
  await page.getByRole('combobox',{name:'Map 1',exact:true}).selectOption('1');
  await page.getByTestId('retarget-review').click();await applyTransferPreview(page);
  const exported=await exportEvidence(page);expect(exported.joints).toEqual(['0','1']);expectMotion(exported.clips[1]);assertErrors();
});

for(const [width,height,dpr] of [[1920,1080,1],[1440,900,1.25],[1280,800,1],[1024,768,1],[800,900,1],[390,844,2]]){
  test.describe(`Transfer review ${width}x${height} DPR${dpr}`,()=>{
    test.use({viewport:{width,height},deviceScaleFactor:dpr,hasTouch:width===390});
    test('compact review, mapping, Escape and backing size remain reachable',async({page},testInfo)=>{
      const assertErrors=watchJourneyErrors(page);await openTarget(page);await chooseSource(page);
      await expect(page.getByTestId('retarget-apply')).toBeVisible({timeout:15000});
      const canvas=page.getByTestId('three-canvas');
      await expect.poll(()=>canvas.evaluate(element=>{
        const bounds=element.getBoundingClientRect(),canvas=element as HTMLCanvasElement;
        return canvas.width>0 && canvas.height>0 && Math.abs(canvas.width-bounds.width*devicePixelRatio)<=2 && Math.abs(canvas.height-bounds.height*devicePixelRatio)<=2;
      })).toBe(true);
      const backing=await canvas.evaluate(element=>({width:(element as HTMLCanvasElement).width,height:(element as HTMLCanvasElement).height,
        cssWidth:element.getBoundingClientRect().width,cssHeight:element.getBoundingClientRect().height}));
      expect(Math.abs(backing.width-backing.cssWidth*dpr)).toBeLessThanOrEqual(2);expect(Math.abs(backing.height-backing.cssHeight*dpr)).toBeLessThanOrEqual(2);
      const panel=page.getByTestId('modern-support-panel');
      expect(await panel.evaluate(element=>element.scrollWidth>element.clientWidth+1)).toBe(false);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
      const primary=page.getByTestId('retarget-apply');await primary.focus();await expect(primary).toBeFocused();await page.keyboard.press('Tab');
      await expect(page.getByTestId('retarget-discard')).toBeFocused();
      if(width===390)expect((await primary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await captureReview(page,testInfo,`transfer-${width}x${height}-dpr${dpr}.png`);
      const details=page.getByTestId('retarget-mapping-details');await details.locator(':scope > summary').click();
      await page.getByRole('combobox',{name:'Source naming convention',exact:true}).selectOption('mixamo');
      await expect(page.getByTestId('retarget-apply')).toHaveCount(0);
      expect(await panel.evaluate(element=>element.scrollWidth>element.clientWidth+1)).toBe(false);
      await details.locator(':scope > summary').focus();await page.keyboard.press('Escape');
      await expect(details).not.toHaveAttribute('open','');await expect(details.locator(':scope > summary')).toBeFocused();
      await page.keyboard.press('Escape');await expect(panel).toHaveCount(0);await expect(page.getByTestId('modern-tools-button')).toBeFocused();assertErrors();
    });
  });
}
