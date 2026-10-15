import fs from 'node:fs';
import { test, expect, type Page, type FileChooser, type Download } from '@playwright/test';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { PNG } from 'pngjs';
import type { SkinnedMesh } from 'three';
import { createSkinnedGlbFixtureInput, createSkinnedGlbFixtureInputWithOptions } from './helpers/skinned-glb-fixture';
import { SAMPLE_OBJ, installTauriMock, updateTauriMock, getTauriMockSnapshot } from './helpers/smoke-helpers';
import { selectWorkspace, showModernPanel } from './helpers/modern-shell';
import { exportEvidence, pauseJourney, renameSubmodel, watchJourneyErrors } from './helpers/product-journey';
import { readAssetEvidence, expectMotion, expectNumbersClose, sampleTrack, type AssetEvidence } from './helpers/asset-evidence';
import { captureReview } from './helpers/review-capture';
import { createSmfStressFixtureInput } from './helpers/smf-stress-fixture';

async function fixture() {
  const input = await createSkinnedGlbFixtureInput();
  const buffer = Buffer.from(input.buffer);
  const jsonLength = buffer.readUInt32LE(12);
  const doc = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength));
  const binary = 20 + jsonLength + 8;
  for (const primitive of doc.meshes[0].primitives) {
    for (const key of ['JOINTS_0', 'WEIGHTS_0']) {
      const accessor = doc.accessors[primitive.attributes[key]], view = doc.bufferViews[accessor.bufferView];
      const size = accessor.componentType === 5126 ? 4 : accessor.componentType === 5123 ? 2 : 1;
      const offset = binary + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      for (let vertex = 0; vertex < accessor.count; vertex++) for (let component = 0; component < 4; component++) {
        const value = key === 'WEIGHTS_0' ? [0.25,0.75,0,0][component] : [0,1,0,0][component];
        const at = offset + vertex * (view.byteStride ?? 4 * size) + component * size;
        if (size === 4) buffer.writeFloatLE(value, at);
        else if (size === 2) buffer.writeUInt16LE(value, at);
        else buffer.writeUInt8(value, at);
      }
    }
  }
  const evidence = readAssetEvidence(buffer);
  expect(evidence.primitives[0].attributes.WEIGHTS_0.slice(0,4)).toEqual([0.25,0.75,0,0]);
  return { ...input, buffer };
}
async function open(page: Page, input: Parameters<FileChooser['setFiles']>[0]) {
  if (await page.evaluate(() => !!Reflect.get(window, '__TAURI__'))) {
    await page.getByTestId('open-model-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Loaded/i, { timeout: 15000 });
    return;
  }
  const name = typeof input === 'string' ? input.split(/[\\/]/).at(-1)! : (input as { name: string }).name;
  const choosing = page.waitForEvent('filechooser');
  await page.getByTestId('open-model-btn').click(); await (await choosing).setFiles(input);
  await expect.poll(async () => await page.getByTestId('replacement-dialog').isVisible()
    || (await page.getByTestId('status-text').textContent())?.includes(name), { timeout: 15000 }).toBeTruthy();
  if (await page.getByTestId('replacement-dialog').isVisible()) await page.getByTestId('confirm-model-replacement').click();
  await expect(page.getByTestId('status-text')).toContainText(name, { timeout: 15000 });
}
async function queuePanel(page: Page) {
  await selectWorkspace(page, 'export');
  const details = page.getByTestId('export-queue');
  if (!await details.getAttribute('open').then(value => value !== null)) await details.locator('summary').first().click();
}
async function add(page: Page, format: string, name?: string, animation = true) {
  await queuePanel(page); await page.getByTestId('export-preset').selectOption(format);
  const options = page.locator('.export-queue-options');
  if (!await options.getAttribute('open').then(value => value !== null)) await options.locator('summary').click();
  await page.getByTestId('export-queue-name').fill(name ?? `queue-${format}`);
  await page.getByTestId('export-queue-animation').setChecked(animation);
  await page.getByTestId('export-queue-add').click();
}
function bytes(download: Download) { return download.path().then(path => fs.readFileSync(path!)); }
function decodedPng(hex: string) {
  const data = Buffer.from(hex,'hex'); let offset = 8;
  while (offset + 12 <= data.length) {
    const end = offset + 12 + data.readUInt32BE(offset);
    expect(end).toBeLessThanOrEqual(data.length);
    if (data.toString('ascii',offset+4,offset+8) === 'IEND') {
      // GLB buffer views may include up to three alignment bytes after the PNG.
      expect(data.length-end).toBeLessThanOrEqual(3); expect([...data.subarray(end)].every(byte=>byte===0)).toBe(true);
      return PNG.sync.read(data.subarray(0,end)).data;
    }
    offset = end;
  }
  throw new Error('PNG image has no complete IEND chunk.');
}
function prove(evidence: AssetEvidence, smf = false) {
  const names = smf ? ['SMF_Node_0','SMF_Node_1'] : ['FixtureRoot','FixtureTip'];
  expect(evidence.joints).toEqual(names);
  expect(evidence.hierarchy).toContainEqual({ name: names[1], parent: names[0] });
  expect(evidence.primitives.length).toBe(1);
  const attributes = evidence.primitives[0].attributes;
  expect(Math.min(...attributes.POSITION.filter((_, i) => i % 3 === 0))).toBeCloseTo(-0.35, 5);
  expect(Math.max(...attributes.POSITION.filter((_, i) => i % 3 === 1))).toBeCloseTo(1, 5);
  for (let vertex = 0; vertex < attributes.WEIGHTS_0.length / 4; vertex++) {
    const influences = [0,1,2,3].map(i => [evidence.joints[attributes.JOINTS_0[vertex*4+i]], attributes.WEIGHTS_0[vertex*4+i]])
      .filter(([, weight]) => Number(weight) > 0).sort((a,b) => String(a[0]).localeCompare(String(b[0])));
    expect(influences.map(item => item[0])).toEqual(names);
    expectNumbersClose(influences.map(item => Number(item[1])), smf ? [64/255,191/255] : [0.25,0.75], 1e-6);
  }
  expect(evidence.clips).toHaveLength(1); expect(evidence.clips[0].duration).toBeCloseTo(0.5, 5); expectMotion(evidence.clips[0]);
  const rotation = evidence.clips[0].tracks.find(track => track.bone === names[1] && track.path === 'rotation')!;
  expect(rotation).toBeDefined(); expectNumbersClose(sampleTrack(rotation, 0.5), [0,0,0.258819,0.965926], 1e-5);
}

for (const format of ['glb','fbx','dae','smf']) test(`queued ${format.toUpperCase()} preserves geometry, raw influences and sampled animation`, async ({ page }) => {
  const errors = watchJourneyErrors(page); await page.goto('/'); await open(page, await fixture()); await pauseJourney(page);
  await add(page, format, `safe-${format}`);
  const result = page.waitForEvent('download'); await page.getByTestId('export-queue-run').click(); const download = await result;
  expect(download.suggestedFilename()).toBe(`safe-${format}.${format}`);
  await expect(page.getByTestId('export-queue-item')).toHaveAttribute('data-status', 'downloaded');
  const data = await bytes(download);
  if (format === 'glb') prove(readAssetEvidence(data));
  if (format === 'fbx') {
    expect(data.toString('ascii',0,21)).toBe('Kaydara FBX Binary  \0');
    const root = new FBXLoader().parse(Uint8Array.from(data).buffer, '');
    const mesh = root.getObjectByName('FixtureSkinnedMesh') as SkinnedMesh;
    expect(mesh).toBeDefined(); expect(root.animations).toHaveLength(1);
    const weights = mesh.geometry.getAttribute('skinWeight');
    expectNumbersClose([weights.getX(0),weights.getY(0)].sort(), [0.25,0.75], 1e-6);
  }
  if (format === 'dae') {
    const xml = await page.evaluate(text => {
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      return { root: doc.documentElement.localName, weights: Array.from(doc.querySelectorAll('controller source float_array')).map(node => node.textContent) };
    }, data.toString('utf8'));
    expect(xml.root).toBe('COLLADA'); expect(xml.weights.join(' ')).toContain('0.75');
  }
  if (format === 'smf') expect(data.toString('ascii',0,6)).toMatch(/^SMF_v1/);
  await open(page, { name: `reimport.${format}`, mimeType: 'application/octet-stream', buffer: data });
  await pauseJourney(page); prove(await exportEvidence(page), format === 'smf'); errors();
});

test('queued captures survive later edits and replacement; mesh-only option and safe names are honored', async ({ page }) => {
  const errors = watchJourneyErrors(page); await page.goto('/'); await open(page, await fixture()); await pauseJourney(page);
  await add(page, 'glb', 'CON', false);
  await renameSubmodel(page, 'Changed_after_capture');
  await open(page, SAMPLE_OBJ); await queuePanel(page);
  const pending = page.waitForEvent('download'); await page.getByTestId('export-queue-retry').click(); const download = await pending;
  expect(download.suggestedFilename()).toBe('_CON.glb'); const captured = readAssetEvidence(await bytes(download));
  expect(captured.clips).toHaveLength(0); expect(captured.joints).toHaveLength(2);
  expect(captured.primitives[0].name).not.toContain('Changed_after_capture');
  await renameSubmodel(page, 'Editable_after_queue'); errors();
});

test('queued GLB captures decoded textures and materials independently of the live viewport', async ({ page }) => {
  const errors = watchJourneyErrors(page); const input = await createSkinnedGlbFixtureInputWithOptions({withTexture:true});
  const expected = readAssetEvidence(input.buffer); expect(expected.images).toHaveLength(1);
  await page.goto('/'); await open(page,input); await pauseJourney(page); await add(page,'glb','textured');
  const pending = page.waitForEvent('download'); await page.getByTestId('export-queue-run').click();
  const captured = readAssetEvidence(await bytes(await pending));
  expect(captured.images.map(({width,height,mime})=>({width,height,mime}))).toEqual(expected.images.map(({width,height,mime})=>({width,height,mime})));
  expect(decodedPng(captured.images[0].signature)).toEqual(decodedPng(expected.images[0].signature));
  expect(captured.primitives[0].material).toEqual(expected.primitives[0].material);
  expectMotion(captured.clips[0]); errors();
});

test('queued GLB preserves independently generated instance transforms through re-import', async ({ page }) => {
  const values = new Float32Array([-0.25,0,0, 0.25,0,0, 0,1,0, 0,0,1, 0,0,1, 0,0,1, -1,0,0, 1,0,0]);
  const data = Buffer.from(values.buffer);
  const document = {
    asset: { version: '2.0' }, extensionsUsed: ['EXT_mesh_gpu_instancing'], extensionsRequired: ['EXT_mesh_gpu_instancing'],
    scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: 'OriginalInstances', mesh: 0, extensions: { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: 2 } } } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 } }] }],
    buffers: [{ byteLength: data.length, uri: `data:application/octet-stream;base64,${data.toString('base64')}` }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 36 }, { buffer: 0, byteOffset: 72, byteLength: 24 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-0.25,0,0], max: [0.25,1,0] },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' }, { bufferView: 2, componentType: 5126, count: 2, type: 'VEC3' },
    ],
  };
  const errors = watchJourneyErrors(page); await page.goto('/');
  await open(page, { name: 'generated-instances.gltf', mimeType: 'model/gltf+json', buffer: Buffer.from(JSON.stringify(document)) });
  await add(page, 'glb', 'instances');
  const pending = page.waitForEvent('download'); await page.getByTestId('export-queue-run').click(); const captured = await bytes(await pending);
  const json = JSON.parse(captured.toString('utf8', 20, 20 + captured.readUInt32LE(12)));
  const node = json.nodes.find((value: { name?: string }) => value.name === 'OriginalInstances');
  const accessor = json.accessors[node.extensions.EXT_mesh_gpu_instancing.attributes.TRANSLATION];
  const view = json.bufferViews[accessor.bufferView];
  expect(accessor.componentType).toBe(5126); expect(accessor.type).toBe('VEC3'); expect(accessor.count).toBe(2);
  const offset = 20 + captured.readUInt32LE(12) + 8 + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const translations = Array.from({ length: 6 }, (_, index) => captured.readFloatLE(offset + Math.floor(index / 3) * (view.byteStride ?? 12) + index % 3 * 4));
  expectNumbersClose(translations, [-1,0,0, 1,0,0], 1e-6);
  await open(page, { name: 'instances.glb', mimeType: 'model/gltf-binary', buffer: captured });
  await renameSubmodel(page, 'EditableInstances'); errors();
});

test('queued SMF preserves the imported-data path and copied geometry after source replacement', async ({ page }) => {
  const errors = watchJourneyErrors(page); const input = createSmfStressFixtureInput(36);
  await page.goto('/'); await open(page,input); await add(page,'smf','imported'); await open(page,SAMPLE_OBJ); await queuePanel(page);
  const pending = page.waitForEvent('download'); await page.getByTestId('export-queue-retry').click(); const data = await bytes(await pending);
  expect(data.subarray(0,8)).toEqual(input.buffer.subarray(0,8));
  await open(page,{name:'copied.smf',mimeType:'application/octet-stream',buffer:data});
  const evidence = await exportEvidence(page); expect(evidence.joints).toEqual(['SMF_Node_0']); expect(evidence.clips).toHaveLength(0);
  expect(evidence.primitives[0].attributes.POSITION).toHaveLength(108);
  expect(evidence.primitives[0].attributes.WEIGHTS_0.filter((_,i)=>i%4===0)).toEqual(Array(36).fill(1)); errors();
});

test('preparation cancellation issues no downloads and retry uses the captured inputs', async ({ page }) => {
  const errors = watchJourneyErrors(page); await page.goto('/'); await open(page, await fixture()); await pauseJourney(page);
  await add(page, 'glb'); await add(page, 'glb', 'second');
  await page.evaluate(() => {
    const read = FileReader.prototype.readAsArrayBuffer; let remaining = 1;
    FileReader.prototype.readAsArrayBuffer = function(blob) {
      if (remaining-- > 0) setTimeout(() => read.call(this, blob), 1500); else read.call(this, blob);
    };
  });
  const downloads: Download[] = []; page.on('download', download => downloads.push(download));
  await page.getByTestId('export-queue-run').click();
  await expect(page.getByTestId('export-queue-item').first()).toHaveAttribute('data-status','preparing');
  await page.getByTestId('export-queue-progress').getByRole('button', { name: 'Cancel queue' }).click();
  await expect(page.getByTestId('export-queue-item').first()).toHaveAttribute('data-status','canceled');
  expect(downloads).toHaveLength(0); await page.getByTestId('export-queue-retry').click();
  await expect(page.getByTestId('export-queue-item').last()).toHaveAttribute('data-status','downloaded');
  expect(downloads).toHaveLength(2); prove(readAssetEvidence(await bytes(downloads[0]))); errors();
});

test('mocked native destination cancel and write failures retry only incomplete items', async ({ page }) => {
  const input = await fixture(); await installTauriMock(page, { openPath: 'C:/queue.glb', savePath: 'C:/queue-output.glb', sampleBytes: [...input.buffer] });
  const errors = watchJourneyErrors(page); await page.goto('/'); await open(page, input); await pauseJourney(page);
  await add(page,'glb','done'); await page.getByTestId('export-queue-run').click();
  await expect(page.getByTestId('export-queue-item')).toHaveAttribute('data-status','saved');
  await add(page,'fbx','retry-fbx'); await add(page,'glb','retry-glb');
  await updateTauriMock(page,{ cancelSave: true }); await page.getByTestId('export-queue-run').click();
  await expect(page.getByTestId('export-queue-item').last()).toHaveAttribute('data-status','canceled');
  let state = await getTauriMockSnapshot(page); expect(state.calls.filter(call => call.cmd === 'save_file_binary')).toHaveLength(2);
  await updateTauriMock(page,{ cancelSave: false, failWrite: true }); await page.getByTestId('export-queue-retry').click();
  await expect(page.getByTestId('export-queue-item').last()).toHaveAttribute('data-status','failed');
  await updateTauriMock(page,{ failWrite: false }); await page.getByTestId('export-queue-retry').click();
  await expect(page.getByTestId('export-queue-item').last()).toHaveAttribute('data-status','saved');
  state = await getTauriMockSnapshot(page); expect(state.calls.filter(call => call.cmd === 'save_file_binary')).toHaveLength(6);
  expect(state.maxActiveWrites).toBe(1); expect(state.writes).toHaveLength(3);
  await renameSubmodel(page,'Still_editable'); errors();
});

test('issued native saves settle before cancellation releases the owner and latest recovery runs', async ({ page }) => {
  const input = await fixture(); await installTauriMock(page,{ openPath: 'C:/queue.glb', savePath: 'C:/queue-output.glb', sampleBytes: [...input.buffer], writeDelayMs: 2000 });
  const errors = watchJourneyErrors(page); await page.goto('/'); await open(page,input); await pauseJourney(page);
  await add(page,'glb','issued'); await add(page,'glb','pending'); await page.getByTestId('export-queue-run').click();
  await expect(page.getByTestId('export-queue-item').first()).toHaveAttribute('data-status','saving');
  await expect.poll(async () => (await getTauriMockSnapshot(page)).calls.filter(call => call.cmd === 'save_file_binary').length).toBe(1);
  await page.getByTestId('export-queue-progress').getByRole('button',{name:'Cancel queue'}).click();
  await expect(page.getByTestId('export-queue-item').first()).toHaveAttribute('data-status','saved');
  await expect(page.getByTestId('export-queue-item').last()).toHaveAttribute('data-status','canceled');
  await updateTauriMock(page,{writeDelayMs:0}); await renameSubmodel(page,'Recovery_after_queue');
  await expect.poll(async () => {
    const state = await getTauriMockSnapshot(page);
    const call = state.calls.filter(call => call.cmd === 'autosave_project').at(-1)?.args as { data?: Record<string,number> } | undefined;
    if (!call?.data || state.activeWrites > 0) return false;
    const project = JSON.parse(Buffer.from(Object.values(call.data)).toString('utf8'));
    const data = Buffer.from(project.asset.bytesBase64,'base64');
    return data.toString('utf8',20,20+data.readUInt32LE(12)).includes('Recovery_after_queue');
  }, {timeout:12000}).toBe(true);
  const state = await getTauriMockSnapshot(page); expect(state.maxActiveWrites).toBe(1);
  const autosave = state.calls.filter(call => call.cmd === 'autosave_project').at(-1)!.args as { data: Record<string,number> };
  const project = JSON.parse(Buffer.from(Object.values(autosave.data)).toString('utf8'));
  const data = Buffer.from(project.asset.bytesBase64,'base64');
  readAssetEvidence(data);
  const document = JSON.parse(data.toString('utf8',20,20+data.readUInt32LE(12)));
  expect(document.nodes.map((node: { name?: string }) => node.name)).toContain('Recovery_after_queue'); errors();
});

test('waiting for an active recovery save stays cancelable without a competing native write', async ({ page }) => {
  const input = await fixture(); await installTauriMock(page,{openPath:'C:/queue.glb',savePath:'C:/queue.glb',sampleBytes:[...input.buffer],writeDelayMs:2500});
  const errors = watchJourneyErrors(page); await page.goto('/'); await open(page,input); await pauseJourney(page); await add(page,'glb');
  await expect.poll(async () => (await getTauriMockSnapshot(page)).calls.some(call => call.cmd === 'autosave_project')).toBe(true);
  await page.getByTestId('export-queue-run').click();
  await page.getByTestId('export-queue-progress').getByRole('button',{name:'Cancel queue'}).click();
  await expect(page.getByTestId('export-queue-item')).toHaveAttribute('data-status','canceled');
  const state = await getTauriMockSnapshot(page); expect(state.calls.filter(call => call.cmd === 'save_file_binary')).toHaveLength(0);
  expect(state.maxActiveWrites).toBe(1); await renameSubmodel(page,'Editable_after_wait'); errors();
});

test('explicit unsupported SMF stays blocked and queue capacity is visible', async ({ page }) => {
  const errors = watchJourneyErrors(page); await page.goto('/'); await open(page,SAMPLE_OBJ); await add(page,'smf');
  await expect(page.getByTestId('export-queue-error')).toContainText(/skinned|skeleton|SMF/i);
  await expect(page.getByTestId('export-queue-item')).toHaveCount(0);
  for(let i=0;i<8;i++) await add(page,'glb',`item-${i}`);
  await expect(page.getByTestId('export-queue-add')).toBeDisabled();
  await page.getByTestId('export-queue-clear').click(); await expect(page.getByTestId('export-queue-item')).toHaveCount(0);
  await expect(page.getByTestId('export-queue-add')).toBeEnabled(); errors();
});

test('queue controls fit Modern viewports, backing scales and coarse pointer with Escape focus return', async ({ browser }, testInfo) => {
  test.setTimeout(120000);
  const lanes = [
    [1920,1080,1,false], [1440,900,1,false], [1280,800,1,false], [1024,768,1,false], [800,900,1,false], [390,844,1,true],
    [1280,800,1.25,false], [1280,800,2,false],
  ] as const;
  for (const [width,height,dpr,coarse] of lanes) {
    const context = await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,hasTouch:coarse});
    const page = await context.newPage(); const errors = watchJourneyErrors(page);
    await page.goto('/'); await open(page,await fixture()); await pauseJourney(page); await add(page,'glb','Reviewed capture');
    const panel = page.getByTestId('modern-support-panel');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await expect(page.getByTestId('export-queue-run')).toBeInViewport();
    if (coarse) {
      const button = page.getByTestId('export-queue-add'); const box = await button.boundingBox();
      const styles = await button.evaluate(element => ({ minWidth: getComputedStyle(element).minWidth, minHeight: getComputedStyle(element).minHeight, rootSize: getComputedStyle(document.documentElement).fontSize, coarse: matchMedia('(pointer: coarse)').matches }));
      expect(box!.width, JSON.stringify(styles)).toBeGreaterThanOrEqual(44); expect(box!.height, JSON.stringify(styles)).toBeGreaterThanOrEqual(44);
    }
    const backing = await page.getByTestId('three-canvas').evaluate(canvas => ({pixels:(canvas as HTMLCanvasElement).width,width:canvas.getBoundingClientRect().width}));
    expect(Math.abs(backing.pixels - backing.width*dpr)).toBeLessThanOrEqual(2);
    await page.getByTestId('export-preset').focus(); await page.keyboard.press('ArrowDown');
    await captureReview(page,testInfo,`export-queue-${width}x${height}-dpr${dpr}.png`);
    await page.keyboard.press('Escape'); await expect(page.getByTestId('modern-tools-button')).toBeFocused();
    await showModernPanel(page,'properties'); await expect(page.getByTestId('export-queue-item')).toHaveCount(1);
    errors(); await context.close();
  }
});
