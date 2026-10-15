import { showExportDetails } from './helpers/modern-shell';
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { createSkinnedGlbFixtureInput, createSkinnedGltfFixtureInputWithOptions } from './helpers/skinned-glb-fixture';
import { SAMPLE_INDEPENDENT_FBX, SAMPLE_OBJ, SAMPLE_SMF } from './helpers/smoke-helpers';
import { downloadBytes, exportEvidence, pauseJourney, watchJourneyErrors } from './helpers/product-journey';
import { expectNumbersClose, expectMotion, expectAssetContinuity, readAssetEvidence } from './helpers/asset-evidence';

const triangleDae = `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><created>2026-10-08T00:00:00Z</created><modified>2026-10-08T00:00:00Z</modified><unit meter="1" name="meter"/><up_axis>Y_UP</up_axis></asset>
<library_geometries><geometry id="triangle" name="Triangle"><mesh>
<source id="positions"><float_array id="position-array" count="9">0 0 0 1 0 0 0 1 0</float_array><technique_common><accessor source="#position-array" count="3" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
<vertices id="vertices"><input semantic="POSITION" source="#positions"/></vertices><triangles count="1"><input semantic="VERTEX" source="#vertices" offset="0"/><p>0 1 2</p></triangles>
</mesh></geometry></library_geometries><library_visual_scenes><visual_scene id="scene"><node id="Triangle" name="Triangle"><instance_geometry url="#triangle"/></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#scene"/></scene></COLLADA>`;

for (const [format, output] of [['smf', 'smf'], ['glb', 'glb'], ['gltf', 'glb'], ['fbx', 'fbx'], ['dae', 'dae'], ['obj', 'glb']]) {
  test(`browser Open ${format.toUpperCase()} dispatches default ${output.toUpperCase()} export and reimports supported content`, async ({ page }) => {
    const assertErrors = watchJourneyErrors(page);
    const input = format === 'glb' ? await createSkinnedGlbFixtureInput()
      : format === 'gltf' ? await createSkinnedGltfFixtureInputWithOptions()
        : format === 'dae' ? { name: 'independent-triangle.dae', mimeType: 'model/vnd.collada+xml', buffer: Buffer.from(triangleDae) }
          : { name: `source.${format}`, mimeType: 'application/octet-stream', buffer: fs.readFileSync(format === 'smf' ? SAMPLE_SMF : format === 'fbx' ? SAMPLE_INDEPENDENT_FBX : SAMPLE_OBJ) };
    await page.goto('/');
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('open-model-btn').click();
    await (await chooser).setFiles(input);
    await expect(page.getByTestId('status-text')).toContainText(/Loaded/i, { timeout: 15_000 });
    await pauseJourney(page);
    const before = await exportEvidence(page);
    const pending = page.waitForEvent('download');
    await page.getByTestId('export-btn').click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${output}$`));
    const bytes = fs.readFileSync((await download.path())!);
    if (output === 'glb') expect(bytes.toString('ascii', 0, 4)).toBe('glTF');
    if (output === 'fbx') expect(bytes.toString('ascii', 0, 21)).toBe('Kaydara FBX Binary  \0');
    if (output === 'dae') expect(bytes.toString()).toContain('<COLLADA');
    await page.getByTestId('model-file-input').setInputFiles({ name: `default-roundtrip.${output}`, mimeType: 'application/octet-stream', buffer: bytes });
    await expect(page.getByTestId('status-text')).toContainText(new RegExp(`Loaded.*default-roundtrip\\.${output}`), { timeout: 15_000 });
    await pauseJourney(page);
    const after = await exportEvidence(page);
    expect(after.joints.length).toBe(before.joints.length);
    expect(after.clips.map(c => c.name)).toEqual(before.clips.map(c => c.name));
    expect(after.primitives.length).toBe(before.primitives.length);
    after.primitives.forEach((p, i) => expectNumbersClose(p.attributes.POSITION, before.primitives[i].attributes.POSITION, 1e-4));
    after.clips.forEach((clip, i) => {
      expect(clip.duration).toBeCloseTo(before.clips[i].duration, 4);
      if (clip.name !== 'Land') expectMotion(clip);
    });
    assertErrors();
  });
}

test('SMF export stays blocked for a static OBJ until rig preparation while default GLB remains usable', async ({ page }) => {
  const assertErrors = watchJourneyErrors(page);
  await page.goto('/');
  await page.getByTestId('model-file-input').setInputFiles(SAMPLE_OBJ);
  await expect(page.getByTestId('status-text')).toContainText(/Loaded/i, { timeout: 15_000 });
  await showExportDetails(page);
  await expect(page.getByTestId('export-smf-btn')).toBeDisabled();
  await expect(page.getByTestId('smf-diagnostics-panel')).toContainText('SMF_NO_SKINNED_SKELETON');
  expect((await downloadBytes(page, 'export-btn')).toString('ascii', 0, 4)).toBe('glTF');
  assertErrors();
});

test('FBX encoder failure falls back to verified GLB and keeps the reason visible', async ({ page }) => {
  const assertErrors = watchJourneyErrors(page);
  await page.goto('/');
  await page.getByTestId('model-file-input').setInputFiles(SAMPLE_INDEPENDENT_FBX);
  await expect(page.getByTestId('status-text')).toContainText(/Loaded FBX/, { timeout: 15_000 });
  await pauseJourney(page);
  const before = await exportEvidence(page);
  // Inject a one-shot output boundary failure, without setting editor state or bypassing UI actions.
  await page.evaluate(() => {
    const original = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function () {
      if (this.type === 'application/octet-stream') {
        Blob.prototype.arrayBuffer = original;
        return Promise.reject(new Error('injected FBX encoder read failure'));
      }
      return original.call(this);
    };
  });
  const pending = page.waitForEvent('download');
  await page.getByTestId('export-btn').click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('exported_model.glb');
  expectAssetContinuity(readAssetEvidence(fs.readFileSync((await download.path())!)), before);
  await expect(page.getByTestId('status-text')).toContainText('FBX fallback: injected FBX encoder read failure');
  await expect(page.getByTestId('status-text')).toHaveAttribute('title', /FBX fallback: injected FBX encoder read failure/);
  await expect(page.getByTestId('export-btn')).toBeEnabled();
  assertErrors();
});
