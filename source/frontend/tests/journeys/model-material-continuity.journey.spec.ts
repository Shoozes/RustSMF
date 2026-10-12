import { workspaceControl, selectWorkspace, showModernPanel } from '../helpers/modern-shell';
import fs from 'node:fs';
import { test, expect, downloadBytes, exportEvidence, renameSubmodel, reopenProject, watchJourneyErrors } from '../helpers/product-journey';
import { SAMPLE_EXTERNAL_GLTF_TEXTURE } from '../helpers/smoke-helpers';

import { expectAssetContinuity, expectNumbersClose } from '../helpers/asset-evidence';

const quad = (name: string) => `o ${name}\nv -0.35 0 0\nv 0.35 0 0\nv 0.35 1 0\nv -0.35 1 0\nusemtl SurfaceMaterial\nf 1 2 3\nf 1 3 4\n`;

test('product journey edits a static surface and saves reversible rigged material repair', async ({ page }) => {
  const assertErrors = watchJourneyErrors(page);
  await page.goto('/');
  await page.getByTestId('model-file-input').setInputFiles({ name: 'surface.obj', mimeType: 'text/plain', buffer: Buffer.from(quad('Surface')) });
  await expect(page.getByTestId('status-text')).toContainText(/Loaded/i, { timeout: 15_000 });
  await renameSubmodel(page, 'AuthoredSurface');
  await (await workspaceControl(page, 'outliner-duplicate-btn')).click();
  await expect(page.getByTestId('outliner-submodel-count')).toContainText('2');
  await (await workspaceControl(page, 'outliner-move-earlier-btn')).click();
  await (await workspaceControl(page, 'outliner-delete-btn')).click();
  await expect(page.getByTestId('outliner-submodel-count')).toContainText('1');
  await page.getByTestId('editor-undo-btn').click();
  await expect(page.getByTestId('outliner-submodel-count')).toContainText('2');
  await page.getByTestId('editor-redo-btn').click();
  await (await workspaceControl(page, 'outliner-submodel-0')).locator('.outliner-name-btn').click();
  await (await workspaceControl(page, 'outliner-position-0')).fill('0.5');
  await (await workspaceControl(page, 'outliner-position-0')).press('Tab');
  await (await workspaceControl(page, 'outliner-scale-input')).fill('1.2');
  await (await workspaceControl(page, 'outliner-scale-input')).press('Tab');
  await (await workspaceControl(page, 'outliner-material-input')).fill('SurfaceMaterial');
  await (await workspaceControl(page, 'outliner-material-btn')).click();
  await (await workspaceControl(page, 'outliner-flip-winding-btn')).click();
  await page.getByTestId('editor-undo-btn').click();
  await (await workspaceControl(page, 'outliner-prepare-geometry-btn')).click();
  await (await workspaceControl(page, 'outliner-append-static')).locator('input').setInputFiles({ name: 'append.obj', mimeType: 'text/plain', buffer: Buffer.from(quad('Appended')) });
  await expect(page.getByTestId('outliner-submodel-count')).toContainText('2');
  await page.getByTestId('editor-undo-btn').click();
  await expect(page.getByTestId('outliner-submodel-count')).toContainText('1');
  const staticAsset = await exportEvidence(page);
  expectNumbersClose(staticAsset.poses.find(p => p.name === 'AuthoredSurface')!.translation, [0.5, 0, 0]);
  expectNumbersClose(staticAsset.poses.find(p => p.name === 'AuthoredSurface')!.scale, [1.2, 1.2, 1.2]);
  await selectWorkspace(page, 'rig');
  await showModernPanel(page, 'properties');
  await (await workspaceControl(page, 'rig-prepare-root-skeleton')).click();
  const prepared = await downloadBytes(page, 'export-glb-btn', true);
  await page.getByTestId('model-file-input').setInputFiles({ name: 'prepared-surface.glb', mimeType: 'model/gltf-binary', buffer: prepared });
  await page.getByTestId('confirm-model-replacement').click();
  await expect(page.getByTestId('status-text')).toContainText('Loaded: prepared-surface.glb', { timeout: 15_000 });
  const beforeRepair = await exportEvidence(page);
  await showModernPanel(page, 'scene');
  await (await workspaceControl(page, 'outliner-repair-materials')).locator('input').setInputFiles([
    { name: 'repair.obj', mimeType: 'text/plain', buffer: Buffer.from(`mtllib repair.mtl\n${quad('AuthoredSurface').replace('f 1 2 3', 'usemtl RepairedMaterial\nf 1 2 3')}`) },
    { name: 'repair.mtl', mimeType: 'text/plain', buffer: Buffer.from('newmtl RepairedMaterial\nKd 0.2 0.4 0.8\nmap_Kd repair.png\n') },
    { name: 'repair.png', mimeType: 'image/png', buffer: fs.readFileSync(SAMPLE_EXTERNAL_GLTF_TEXTURE) },
  ]);
  await expect(page.getByTestId('status-text')).toContainText(/Repaired 1 rigged mesh material/, { timeout: 15_000 });
  const repaired = await exportEvidence(page);
  expect(repaired.images).toHaveLength(1);
  expect(repaired.primitives[0].material).not.toEqual(beforeRepair.primitives[0].material);
  expect(repaired.joints).toEqual(beforeRepair.joints);
  expect(repaired.clips).toEqual(beforeRepair.clips);
  expect(repaired.primitives[0].attributes).toEqual(beforeRepair.primitives[0].attributes);
  await page.getByTestId('editor-undo-btn').click();
  expectAssetContinuity(await exportEvidence(page), beforeRepair);
  await page.getByTestId('editor-redo-btn').click();
  expectAssetContinuity(await exportEvidence(page), repaired);
  const project = await downloadBytes(page, 'save-project-btn');
  await reopenProject(page, project);
  const reopened = await exportEvidence(page);
  expectAssetContinuity(reopened, repaired);
  expectNumbersClose(reopened.poses.find(p => p.name === 'AuthoredSurface')!.translation, [0.5, 0, 0]);
  expectNumbersClose(reopened.poses.find(p => p.name === 'AuthoredSurface')!.scale, [1.2, 1.2, 1.2]);
  await showModernPanel(page, 'scene');
  await (await workspaceControl(page, 'outliner-visibility-toggle-0')).click();
  await expect(page.getByTestId('outliner-submodel-0')).toHaveAttribute('data-visible', 'false');
  await page.getByTestId('editor-undo-btn').click();
  await expect(page.getByTestId('outliner-submodel-0')).toHaveAttribute('data-visible', 'true');
  assertErrors();
});
