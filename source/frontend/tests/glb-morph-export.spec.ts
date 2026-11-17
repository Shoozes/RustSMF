import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { parseGlbContainer } from '../src/utils/glbContainer';
import { clickSecondaryCommand, selectWorkspace } from './helpers/modern-shell';
import { createSharedMorphGlbFixture } from './helpers/morph-glb-fixture';

for (const workspace of ['view', 'export'] as const) {
  test(`direct GLB export from ${workspace} preserves per-node morph defaults during playback`, async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('model-file-input').setInputFiles(await createSharedMorphGlbFixture());
    await expect(page.getByTestId('status-text')).toHaveAttribute('title', /shared-morph\.glb.*clips: 1/);
    if (workspace === 'export') await selectWorkspace(page, 'export', false);

    const canvas = page.getByTestId('three-canvas');
    const playbackTime = async () => Number(await canvas.getAttribute('data-playback-time'));
    await expect.poll(playbackTime).toBeGreaterThan(0.5);
    const beforeExport = await playbackTime();
    const downloadPromise = page.waitForEvent('download');
    if (workspace === 'view') await page.getByTestId('export-btn').click();
    else await clickSecondaryCommand(page, 'export-glb-btn');
    const download = await downloadPromise;
    await expect(page.getByTestId('status-text')).toContainText('verified 0 bones, 1 clips');
    await expect.poll(playbackTime).toBeGreaterThan(beforeExport);

    const { json } = parseGlbContainer(fs.readFileSync(await download.path()));
    const nodes = json.nodes as Array<{ name?: string; mesh?: number; weights?: number[] }>;
    const animated = nodes.find(node => node.name === 'AnimatedShape');
    const sibling = nodes.find(node => node.name === 'StaticShape');
    expect(animated?.mesh).toBeDefined();
    expect(sibling?.mesh).toBe(animated?.mesh);
    expect(animated?.weights).toEqual([0.25]);
    expect(sibling?.weights).toEqual([0.75]);
    const meshes = json.meshes as Array<{ weights?: number[] }>;
    expect(meshes[animated!.mesh!].weights).toEqual([0.25]);
  });
}
