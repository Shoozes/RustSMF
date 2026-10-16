import fs from 'node:fs';
import { PNG } from 'pngjs';
import { test, expect, type Page, type FileChooser } from '@playwright/test';
import { daeFixture, objResourceInputs, textureInput, texturePixels, unnamedAnimatedGltf } from './helpers/interchange-fixtures';
import { SAMPLE_OBJ } from './helpers/smoke-helpers';
import { selectWorkspace } from './helpers/modern-shell';
import { downloadBytes, exportEvidence, pauseJourney, renameSubmodel, watchJourneyErrors } from './helpers/product-journey';
import { expectNumbersClose, readAssetEvidence, sampleTrack, type AssetEvidence } from './helpers/asset-evidence';

async function choose(page: Page, files: Parameters<FileChooser['setFiles']>[0]) {
  const pending = page.waitForEvent('filechooser');
  await page.getByTestId('open-model-btn').click(); await (await pending).setFiles(files);
}
async function queue(page: Page) {
  await selectWorkspace(page, 'export');
  const section = page.getByTestId('export-queue');
  if (await section.getAttribute('open') === null) await section.locator('summary').first().click();
}
async function queuedGlb(page: Page) {
  await queue(page); await page.getByTestId('export-preset').selectOption('glb');
  await page.getByTestId('export-queue-add').click();
  const pending = page.waitForEvent('download'); await page.getByTestId('export-queue-run').click();
  return fs.readFileSync((await (await pending).path())!);
}
function knownMotion(asset: AssetEvidence) {
  expect(asset.clips).toHaveLength(1); expect(asset.clips[0].name).toBe('Travel');
  expect(asset.clips[0].duration).toBeCloseTo(1, 5);
  const track = asset.clips[0].tracks.find(track => track.path === 'translation')!;
  expect(track).toBeDefined();
  for (const time of [0, .25, .5, .75, 1]) expectNumbersClose(sampleTrack(track, time), [time * 2, 0, 0], 1e-5);
}
function texture(asset: AssetEvidence) {
  expect(asset.images).toHaveLength(1);
  const bytes = Buffer.from(asset.images[0].signature, 'hex');
  let end = 8;
  while (end + 12 <= bytes.length) {
    const type = bytes.toString('ascii', end + 4, end + 8); end += bytes.readUInt32BE(end) + 12;
    if (type === 'IEND') break;
  }
  const image = PNG.sync.read(bytes.subarray(0, end));
  expect([image.width, image.height]).toEqual([2, 2]);
  // OBJ/DAE images are Y-up textures; glTF bakes flipY into its embedded PNG.
  expect(image.data).toEqual(Buffer.concat([texturePixels.subarray(8), texturePixels.subarray(0, 8)]));
}

for (const format of ['obj', 'dae'] as const) for (const mode of ['success', 'failure', 'timeout'] as const) {
  test(`${format} waits for delayed texture ${mode} and preserves editable replacement work`, async ({ page }) => {
    const errors = watchJourneyErrors(page, mode === 'success' ? [] : [new RegExp(`Error: ${format.toUpperCase()} resource(?: failed to load|s timed out)`)]);
    const png = textureInput();
    await page.addInitScript(({ bytes, mode }) => {
      const urls = new Set<string>(), create = URL.createObjectURL.bind(URL);
      URL.createObjectURL = blob => { const url = create(blob); if (blob instanceof Blob && blob.size === bytes) urls.add(url); return url; };
      const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
      Object.defineProperty(HTMLImageElement.prototype, 'src', { ...src, set(value: string) {
        if (!urls.has(value)) { src.set!.call(this, value); return; }
        if (mode === 'timeout') return;
        setTimeout(() => { if (mode === 'failure') this.dispatchEvent(new Event('error')); else src.set!.call(this, value); }, 500);
      } });
    }, { bytes: png.buffer.length, mode });
    await page.goto('/'); await choose(page, SAMPLE_OBJ);
    await expect(page.getByTestId('status-text')).toContainText('Loaded:');
    await renameSubmodel(page, 'KeepEdit');
    const before = await exportEvidence(page);
    await choose(page, format === 'obj' ? objResourceInputs() : [daeFixture(true), png]);
    await expect(page.getByTestId('replacement-dialog')).toBeVisible();
    await page.getByTestId('confirm-model-replacement').click();
    if (mode === 'success') {
      await expect(page.getByTestId('status-text')).toContainText('Loading');
      await expect(page.getByTestId('status-text')).toContainText('Loaded:', { timeout: 15000 });
      texture(await exportEvidence(page));
      texture(readAssetEvidence(await queuedGlb(page)));
    } else {
      await expect(page.getByTestId('error-banner')).toContainText(mode === 'timeout' ? 'resources timed out' : 'resource failed to load', { timeout: 15000 });
      await page.getByRole('button', { name: 'dismiss', exact: true }).click();
      const retained = await exportEvidence(page);
      expect(retained.primitives).toEqual(before.primitives);
      await renameSubmodel(page, 'EditableAfterFailure');
      expect((await exportEvidence(page)).primitives[0].name).toContain('EditableAfterFailure');
    }
    errors();
  });
}

for (const format of ['gltf', 'dae'] as const) test(`${format} UUID-bound motion survives queued capture, replacement, retry and re-import`, async ({ page }) => {
  const errors = watchJourneyErrors(page);
  await page.goto('/'); await choose(page, format === 'gltf' ? unnamedAnimatedGltf() : daeFixture());
  await expect(page.getByTestId('status-text')).toContainText('Loaded:'); await pauseJourney(page);
  knownMotion(await exportEvidence(page));
  await queue(page); await page.getByTestId('export-preset').selectOption('glb'); await page.getByTestId('export-queue-add').click();
  await selectWorkspace(page, 'animate');
  const { workspaceControl } = await import('./helpers/modern-shell');
  await (await workspaceControl(page, 'animation-clip-name-input')).fill('ChangedAfterCapture');
  await (await workspaceControl(page, 'animation-rename-clip-btn')).click();
  await expect(page.getByTestId('status-text')).toContainText('ChangedAfterCapture');
  await choose(page, SAMPLE_OBJ); await page.getByTestId('confirm-model-replacement').click();
  await expect(page.getByTestId('status-text')).toContainText('Loaded:'); await queue(page);
  const pending = page.waitForEvent('download'); await page.getByTestId('export-queue-retry').click();
  const bytes = fs.readFileSync((await (await pending).path())!); knownMotion(readAssetEvidence(bytes));
  await choose(page, { name: 'queued.glb', mimeType: 'model/gltf-binary', buffer: bytes });
  await expect(page.getByTestId('status-text')).toContainText('Loaded: queued.glb');
  knownMotion(await exportEvidence(page)); errors();
});

test('single solid DAE preserves named clip and sampled motion through ordinary export and re-import', async ({ page }) => {
  const errors = watchJourneyErrors(page);
  await page.goto('/'); await choose(page, daeFixture());
  await expect(page.getByTestId('status-text')).toContainText('Loaded:'); await pauseJourney(page);
  const bytes = await downloadBytes(page, 'export-dae-btn', true);
  expect(bytes.toString()).toContain('name="Travel"');
  await choose(page, { name: 'roundtrip.dae', mimeType: 'model/vnd.collada+xml', buffer: bytes });
  await expect(page.getByTestId('status-text')).toContainText('Loaded: roundtrip.dae');
  knownMotion(await exportEvidence(page)); errors();
});
