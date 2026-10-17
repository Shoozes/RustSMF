import { readFileSync } from 'node:fs';
import { test, expect, type Page, type FileChooser } from '@playwright/test';
import { PNG } from 'pngjs';
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { exportDAE } from '../src/loaders/dae';
import { createSmfStressFixtureInput } from './helpers/smf-stress-fixture';
import { createExternalFbxFixtureInputs } from './helpers/external-fbx-fixture';
import { captureReview } from './helpers/review-capture';
import { archiveInput } from './helpers/archive-fixture';
import { createSkinnedGlbFixtureInput } from './helpers/skinned-glb-fixture';
import { downloadBytes, exportEvidence, pauseJourney, renameSubmodel, reopenProject, watchJourneyErrors } from './helpers/product-journey';
import { expectAssetContinuity, readAssetEvidence, sampleTrack } from './helpers/asset-evidence';
import { SAMPLE_OBJ, SAMPLE_EXTERNAL_GLTF, installTauriMock, updateTauriMock, getTauriMockSnapshot, dispatchSyntheticDrop } from './helpers/smoke-helpers';
import { selectWorkspace } from './helpers/modern-shell';

const obj = () => readFileSync(SAMPLE_OBJ);
function sidecars() {
  const image = new PNG({ width: 2, height: 2 });
  image.data.set([255,128,32,255, 255,128,32,255, 32,128,255,255, 32,128,255,255]);
  const texture = PNG.sync.write(image);
  expect(PNG.sync.read(texture).data).toEqual(image.data);
  const positions = new Float32Array([-1,0,0,1,0,0,0,2,0]);
  const scene = JSON.parse(readFileSync(SAMPLE_EXTERNAL_GLTF, 'utf8'));
  scene.buffers[0].byteLength = positions.byteLength;
  scene.bufferViews[0].byteLength = positions.byteLength;
  Object.assign(scene.accessors[0], { componentType: 5126, min: [-1,0,0], max: [1,2,0] });
  return {
    'asset/': new Uint8Array(),
    'asset/model.gltf': Buffer.from(JSON.stringify(scene)),
    'asset/mesh.bin': Buffer.from(positions.buffer),
    'asset/texture.png': texture,
  };
}
async function open(page: Page, input: Parameters<FileChooser['setFiles']>[0]) {
  const choosing = page.waitForEvent('filechooser');
  await page.getByTestId('open-model-btn').click();
  await (await choosing).setFiles(input);
}
async function dirtyBase(page: Page, native = false) {
  await page.goto('/');
  if (native) await page.getByTestId('model-file-input').setInputFiles(SAMPLE_OBJ);
  else await open(page, SAMPLE_OBJ);
  await expect(page.getByTestId('status-text')).toContainText('Loaded:');
  await renameSubmodel(page, 'Keep_this_work');
  return await page.getByTestId('three-canvas').getAttribute('data-model-root-id');
}
async function proveStillEditable(page: Page, root: string | null) {
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', root!);
  await renameSubmodel(page, 'Continued_editing');
  await page.getByTestId('editor-undo-btn').click();
  await expect(page.getByTestId('outliner')).toContainText('Keep_this_work');
  await page.getByTestId('editor-redo-btn').click();
  await expect(page.getByTestId('outliner')).toContainText('Continued_editing');
}

test('ZIP nested sidecars load real geometry and texture through the browser worker', async ({ page }) => {
  const errors = watchJourneyErrors(page);
  await page.goto('/');
  await open(page, archiveInput(sidecars()));
  await expect(page.getByTestId('status-text')).toContainText('Loaded: asset/model.gltf');
  await expect(page.getByTestId('archive-dialog')).toBeHidden();
  const exported = await exportEvidence(page);
  expect(exported.primitives).toHaveLength(1);
  expect(exported.primitives[0].attributes.POSITION).toEqual([-1,0,0,1,0,0,0,2,0]);
  expect(exported.images).toHaveLength(1);
  expect(exported.images[0].signature).toMatch(/^89504e47/);
  errors();
});

test('explicit archive choice preserves skin and sampled motion through project and export', async ({ page }) => {
  const errors = watchJourneyErrors(page);
  const fixture = await createSkinnedGlbFixtureInput();
  const original = readAssetEvidence(fixture.buffer);
  await page.goto('/');
  await open(page, archiveInput({ 'variants/static.obj': obj(), 'variants/animated.glb': fixture.buffer }));
  const dialog = page.getByTestId('archive-dialog');
  await expect(dialog.getByRole('button', { name: 'Open model' })).toBeDisabled();
  await expect(dialog.getByLabel('Model', { exact: true })).toBeFocused();
  await dialog.getByLabel('Model', { exact: true }).selectOption('variants/animated.glb');
  await dialog.getByRole('button', { name: 'Open model' }).click();
  await expect(page.getByTestId('status-text')).toContainText('Loaded: variants/animated.glb');
  await pauseJourney(page);
  const imported = await exportEvidence(page);
  // The existing loader derives missing tangents; every authored attribute must survive.
  expectAssetContinuity({ ...imported, primitives: imported.primitives.map(p => ({
    ...p, attributes: Object.fromEntries(Object.entries(p.attributes).filter(([key]) => key !== 'TANGENT')),
  })) }, original);
  expect(imported.joints.length).toBeGreaterThan(0);
  expect(imported.clips).toHaveLength(1);
  const moving = imported.clips[0].tracks.find(track => sampleTrack(track, 0).some((v,i) => Math.abs(v - sampleTrack(track, .5)[i]) > .01));
  expect(moving).toBeTruthy();
  await selectWorkspace(page, 'view', false);
  await renameSubmodel(page, 'Archived_character');
  const project = await downloadBytes(page, 'save-project-btn');
  await reopenProject(page, project);
  const after = await exportEvidence(page);
  expectAssetContinuity(after, imported);
  expect(after.poses.some(node => node.name === 'Archived_character')).toBe(true);
  await renameSubmodel(page, 'Continued_archive_edit');
  errors();
});

for (const format of ['obj', 'fbx', 'dae', 'smf'] as const) {
  test(`ZIP ${format.toUpperCase()} uses the existing loader and parsed GLB export`, async ({ page }) => {
    const errors = watchJourneyErrors(page);
    let files: Record<string, Uint8Array>;
    if (format === 'obj') files = {
      'pack/triangle.obj': Buffer.from('mtllib material.mtl\no ArchiveTriangle\nv -1 0 0\nv 1 0 0\nv 0 2 0\nusemtl Copper\nf 1 2 3\n'),
      'pack/material.mtl': Buffer.from('newmtl Copper\nKd 0.8 0.3 0.1\n'),
    };
    else if (format === 'fbx') files = Object.fromEntries(createExternalFbxFixtureInputs().map(file => [`pack/${file.name}`, file.buffer]));
    else if (format === 'smf') files = { 'pack/triangle.smf': createSmfStressFixtureInput(3).buffer };
    else {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1,0,0,1,0,0,0,2,0]), 3));
      const root = new Group(), material = new MeshStandardMaterial();
      root.add(new Mesh(geometry, material));
      files = { 'pack/triangle.dae': await exportDAE(root) };
      geometry.dispose(); material.dispose();
    }
    await page.goto('/');
    const input = archiveInput(files);
    if (format === 'obj') await dispatchSyntheticDrop(page.getByTestId('viewport-container'), { name: input.name, mimeType: input.mimeType, base64: input.buffer.toString('base64') });
    else await open(page, input);
    await expect(page.getByTestId('status-text')).toContainText(/Loaded(?: FBX)?:/);
    const asset = await exportEvidence(page);
    expect(asset.primitives).toHaveLength(1);
    expect(asset.primitives[0].attributes.POSITION).toHaveLength(9);
    if (format === 'obj' || format === 'dae') expect(asset.primitives[0].attributes.POSITION).toEqual([-1,0,0,1,0,0,0,2,0]);
    if (format === 'fbx') expect(asset.images).toHaveLength(1);
    if (format === 'smf') {
      expect(asset.joints).toHaveLength(1);
      expect(asset.primitives[0].attributes.WEIGHTS_0.filter((_, i) => i % 4 === 0)).toEqual([1,1,1]);
    }
    errors();
  });
}

test('archive chooser stays compact with keyboard and touch across viewport/DPI lanes', async ({ browser }, info) => {
  const input = archiveInput({ 'models/first.obj': obj(), 'models/second.obj': obj() });
  for (const [width, height, dpr, touch] of [
    [1920,1080,1,false], [1440,900,1.25,false], [1280,800,1,false],
    [1024,768,1,false], [800,900,2,false], [390,844,2,true],
  ] as const) {
    const context = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: touch });
    try {
      const page = await context.newPage();
      const errors = watchJourneyErrors(page);
      await page.goto('/');
      await open(page, input);
      const dialog = page.getByTestId('archive-dialog');
      const choice = dialog.getByLabel('Model', { exact: true });
      await expect(choice).toBeFocused();
      await choice.selectOption('models/second.obj');
      await page.keyboard.press('Tab');
      await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(dialog.getByRole('button', { name: 'Open model' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(choice).toBeFocused();
      const bounds = await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
      expect(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
      if (touch) for (const button of await dialog.getByRole('button').all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await captureReview(page, info, `archive-${width}-${dpr}.png`);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(page.getByTestId('open-model-btn')).toBeFocused();
      errors();
    } finally { await context.close(); }
  }
});

for (const failure of [
  { name: 'unsafe path', input: () => archiveInput({ '../escape.obj': obj() }), error: /unsafe path.*refused/ },
  { name: 'malformed ZIP', input: () => ({ name: 'broken.zip', mimeType: 'application/zip', buffer: Buffer.from('broken') }), error: /end-of-directory/ },
  { name: 'missing resource', input: () => archiveInput({ 'asset/model.gltf': readFileSync(SAMPLE_EXTERNAL_GLTF) }), error: /mesh.bin.*not found|Failed to load buffer/ },
  { name: 'missing texture', input: () => archiveInput(Object.fromEntries(Object.entries(sidecars()).filter(([name]) => !name.endsWith('texture.png')))), error: /texture.png.*not found/ },
  { name: 'no model', input: () => archiveInput({ 'README.txt': Buffer.from('no model') }), error: /ZIP contains no supported model/ },
]) {
  test(`ZIP ${failure.name} preserves edited work after discard authorization`, async ({ page }) => {
    const errors = watchJourneyErrors(page, [failure.error, ...(['missing resource', 'missing texture'].includes(failure.name) ? [/^THREE.GLTFLoader: Couldn't load texture texture\.png$/] : [])]);
    const root = await dirtyBase(page);
    await open(page, failure.input());
    await page.getByTestId('confirm-model-replacement').click();
    await expect(page.getByTestId('error-banner')).toContainText(failure.error);
    await expect(page.getByTestId('archive-dialog')).toBeHidden();
    await proveStillEditable(page, root);
    errors();
  });
}

test('ZIP replacement cancel and model-choice Escape preserve dirty work and restore focus', async ({ page }) => {
  const errors = watchJourneyErrors(page);
  const root = await dirtyBase(page);
  const input = archiveInput({ 'a.obj': obj(), 'b.obj': obj() }, 'two-models.zip', true);
  await open(page, input);
  await page.getByTestId('cancel-model-replacement').click();
  await expect(page.getByTestId('archive-dialog')).toBeHidden();
  await open(page, input);
  await page.getByTestId('confirm-model-replacement').click();
  await expect(page.getByTestId('archive-dialog').getByLabel('Model', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('archive-dialog')).toBeHidden();
  await expect(page.getByTestId('status-text')).toContainText('ZIP import canceled');
  await expect(page.getByTestId('open-model-btn')).toBeFocused();
  await proveStillEditable(page, root);
  errors();
});

test('native ZIP read cancellation rejects late bytes, then the same authorized path can load', async ({ page }) => {
  const errors = watchJourneyErrors(page);
  const archive = archiveInput(sidecars());
  const path = 'C:\\fixtures\\generated-bundle.zip';
  await installTauriMock(page, { openPath: path, openPaths: [path], sampleBytes: [...archive.buffer], savePath: 'C:\\fixtures\\out.glb', readDelayMs: 700 });
  const root = await dirtyBase(page, true);
  await page.getByTestId('open-model-btn').click();
  await page.getByTestId('confirm-model-replacement').click();
  await page.getByTestId('archive-dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByTestId('status-text')).toContainText('ZIP import canceled');
  await proveStillEditable(page, root);
  await updateTauriMock(page, { readDelayMs: 0 });
  await page.getByTestId('open-model-btn').click();
  await page.getByTestId('confirm-model-replacement').click();
  await expect(page.getByTestId('status-text')).toContainText('Loaded: asset/model.gltf');
  const snapshot = await getTauriMockSnapshot(page);
  expect(snapshot.calls.filter(c => c.cmd === 'read_file_binary').map(c => c.args)).toEqual([{ path }, { path }]);
  expect(snapshot.calls.some(c => c.cmd === 'read_files_binary')).toBe(false);
  errors();
});

test('native ZIP mixed selection is refused before any file read', async ({ page }) => {
  const errors = watchJourneyErrors(page);
  await installTauriMock(page, { openPath: 'C:\\bundle.zip', openPaths: ['C:\\bundle.zip', 'C:\\extra.png'], sampleBytes: [], savePath: 'C:\\unused.glb' });
  await page.goto('/');
  await page.getByTestId('open-model-btn').click();
  await expect(page.getByTestId('error-banner')).toContainText('Select one ZIP by itself');
  expect((await getTauriMockSnapshot(page)).calls.some(c => c.cmd.startsWith('read_file'))).toBe(false);
  errors();
});

test('timed-out native ZIP requests never issue queued reads after a fresh retry', async ({ page }) => {
  const errors = watchJourneyErrors(page, [/ZIP import timed out/]);
  const archive = archiveInput(sidecars());
  const path = 'C:\\fixtures\\slow-bundle.zip';
  await installTauriMock(page, { openPath: path, openPaths: [path], sampleBytes: [...archive.buffer], savePath: 'C:\\unused.glb', readDelayMs: 300_000 });
  await page.clock.install();
  await page.goto('/');
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByTestId('open-model-btn').click();
    await expect(page.getByTestId('archive-dialog')).toBeVisible();
    await page.clock.fastForward(121_000);
    await expect(page.getByTestId('error-banner')).toContainText('ZIP import timed out');
    await expect(page.getByTestId('archive-dialog')).toBeHidden();
  }
  expect((await getTauriMockSnapshot(page)).calls.filter(c => c.cmd === 'read_file_binary')).toHaveLength(1);
  await updateTauriMock(page, { readDelayMs: 0 });
  await page.getByTestId('open-model-btn').click();
  await expect(page.getByTestId('archive-dialog')).toBeVisible();
  await page.clock.fastForward(60_000);
  await expect(page.getByTestId('status-text')).toContainText('Loaded: asset/model.gltf');
  expect((await getTauriMockSnapshot(page)).calls.filter(c => c.cmd === 'read_file_binary')).toHaveLength(2);
  errors();
});

test('cancel during worker startup releases the job and allows a fresh archive', async ({ page }) => {
  const errors = watchJourneyErrors(page);
  let release!: () => void;
  let requested!: () => void;
  const request = new Promise<void>(resolve => { requested = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/modelArchive.worker-*.js', async route => { requested(); await held; await route.continue().catch(() => {}); }, { times: 1 });
  await page.goto('/');
  await open(page, archiveInput({ 'test.obj': obj() }));
  await request;
  await page.getByTestId('archive-dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  release();
  await expect(page.getByTestId('status-text')).toContainText('ZIP import canceled');
  await open(page, archiveInput({ 'retry.obj': obj() }));
  await expect(page.getByTestId('status-text')).toContainText('Loaded: retry.obj');
  errors();
});
