import { expect, test, type Response } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { expectMotion, readAssetEvidence } from './helpers/asset-evidence';
import { revealSecondaryCommands, workspaceControl } from './helpers/modern-shell';
import { downloadBytes, pauseJourney, renameSubmodel, reopenProject, watchJourneyErrors } from './helpers/product-journey';
import { createSkinnedGlbFixtureInput, createSkinnedGltfFixtureInputWithOptions } from './helpers/skinned-glb-fixture';

const webPath = '/RustSMF/';
const robot = fileURLToPath(new URL('../../../examples/rustsmf-demo.glb', import.meta.url));

function expectDelivery(responses: Response[], path: RegExp, mime: RegExp) {
  const matches = responses.filter(response => path.test(new URL(response.url()).pathname));
  expect(matches.length, String(path)).toBeGreaterThan(0);
  for (const response of matches) {
    expect(new URL(response.url()).pathname).toMatch(/^\/RustSMF\//);
    expect(response.ok(), response.url()).toBe(true);
    expect(response.headers()['content-type'], response.url()).toMatch(mime);
  }
}

test('Web Edition keeps edited files in the tab and downloads reusable projects and GLBs', async ({ page, context }) => {
  const assertErrors = watchJourneyErrors(page);
  const requests: Array<{ method: string; url: string }> = [];
  const responses: Response[] = [];
  context.on('request', request => requests.push({ method: request.method(), url: request.url() }));
  context.on('response', response => responses.push(response));
  await page.goto(webPath);
  await expect(page).toHaveTitle('RustSMF Web Edition');
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(false);
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-theme', 'modern');
  await revealSecondaryCommands(page);
  await expect(page.getByTestId('recover-project-btn')).toHaveCount(0);
  await expect(page.getByTestId('ping-rust-btn')).toHaveCount(0);
  await page.getByTestId('help-open').click();
  await expect(page.getByTestId('help-dialog')).toContainText('Download an .rsproj before closing the tab.');
  const notices = await page.getByRole('link', { name: 'Third-party licenses' }).getAttribute('href');
  expect(notices).toBe(webPath + 'licenses/THIRD_PARTY_LICENSES.txt');
  await expect((await page.request.get(notices!)).ok()).toBe(true);
  await page.getByTestId('help-close').click();

  await page.getByTestId('model-file-input').setInputFiles(robot);
  await expect(page.getByTestId('status-text')).toContainText('Loaded: rustsmf-demo.glb');
  await renameSubmodel(page, 'WebEditedRobot');
  const canvas = page.getByTestId('three-canvas');
  const rootId = await canvas.getAttribute('data-model-root-id');
  expect(rootId).toBeTruthy();
  await revealSecondaryCommands(page);
  await page.getByTestId('theme-select').selectOption('original');
  await expect(page.getByTestId('theme-select').locator('option:checked')).toHaveText('Classic (Original SMF)');
  await expect(canvas).toHaveAttribute('data-viewport-layout', 'quad');
  await expect(canvas).toHaveAttribute('data-model-root-id', rootId!);
  await expect(page.getByTestId('outliner')).toContainText('WebEditedRobot');
  await expect(page.getByTestId('recover-project-btn')).toHaveCount(0);
  await expect(page.getByTestId('ping-rust-btn')).toHaveCount(0);
  await page.getByTestId('theme-select').selectOption('modern');

  const project = await downloadBytes(page, 'save-project-btn');
  await expect(page.getByTestId('status-text')).toContainText('Project download requested');
  await reopenProject(page, project);
  const bytes = await downloadBytes(page, 'export-btn');
  const exported = readAssetEvidence(bytes);
  expect(exported.poses.some(node => node.name === 'WebEditedRobot')).toBe(true);
  expect(exported.clips.map(clip => clip.name)).toEqual(['Wave', 'Turn']);
  exported.clips.forEach(expectMotion);
  await page.getByTestId('model-file-input').setInputFiles({
    name: 'web-return.glb', mimeType: 'model/gltf-binary', buffer: bytes,
  });
  await expect(page.getByTestId('status-text')).toContainText('Loaded: web-return.glb');

  // The ordinary desktop/dev build schedules recovery 1.2 seconds after a model or edit.
  await page.waitForTimeout(1500);
  expect(await page.evaluate(async () => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    databases: await indexedDB.databases(),
  }))).toEqual({
    local: ['rustsmf.appearance.theme'], session: [], databases: [],
  });
  const origin = new URL(page.url()).origin;
  const network = requests.filter(request => /^https?:/.test(request.url));
  expect(network.length).toBeGreaterThan(0);
  expect(network.filter(({ method, url }) =>
    !['GET', 'HEAD'].includes(method) || !url.startsWith(origin + webPath)
  )).toEqual([]);
  expectDelivery(responses, /\/assets\/.*\.js$/, /(?:text|application)\/javascript/i);
  expectDelivery(responses, /\/assets\/.*\.css$/, /text\/css/i);
  assertErrors();
});

test('Classic launches directly, remembers menu choices, and fits a narrow viewport', async ({ page }) => {
  await page.goto(webPath + '?theme=classic&ref=readme#editor');
  const shell = page.getByTestId('app-shell');
  await expect(shell).toHaveAttribute('data-theme', 'original');
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-viewport-layout', 'quad');
  await expect(page.getByTestId('outliner').locator('.panel-title').first()).toHaveText('Submodels');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.getByTestId('open-model-btn')).toBeVisible();
  await page.getByTestId('theme-select').selectOption('modern');
  await expect(page).toHaveURL(/\/RustSMF\/\?ref=readme#editor$/);
  await page.reload();
  await expect(shell).toHaveAttribute('data-theme', 'modern');
  await revealSecondaryCommands(page);
  await page.getByTestId('theme-select').selectOption('original');
  await page.reload();
  await expect(shell).toHaveAttribute('data-theme', 'original');
});

test('Pages serves runnable retarget worker JavaScript and WASM under the repository path', async ({ page, context }) => {
  const assertErrors = watchJourneyErrors(page);
  const responses: Response[] = [];
  context.on('response', response => responses.push(response));
  await page.goto(webPath);
  await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
  await expect(page.getByTestId('status-text')).toContainText('Loaded:');
  await pauseJourney(page);
  await page.getByTestId('workspace-task-transfer').click();
  const source = await createSkinnedGltfFixtureInputWithOptions({ clipName: 'Web Motion' });
  const chooser = page.waitForEvent('filechooser');
  await (await workspaceControl(page, 'animation-retarget-clips')).getByRole('button', { name: 'Retarget clips', exact: true }).click();
  await (await chooser).setFiles(source);
  await expect(page.getByTestId('retarget-apply')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-retarget-preview', 'true');
  expectDelivery(responses, /\/assets\/retargetWorker-.*\.js$/, /(?:text|application)\/javascript/i);
  expectDelivery(responses, /\/assets\/retarget_core_bg-.*\.wasm$/, /application\/wasm/i);
  assertErrors();
});
