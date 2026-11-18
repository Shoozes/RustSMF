import { expect, test, type Response } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { expectMotion, readAssetEvidence } from './helpers/asset-evidence';
import { revealSecondaryCommands, workspaceControl } from './helpers/modern-shell';
import { downloadBytes, pauseJourney, renameSubmodel, reopenProject, watchJourneyErrors } from './helpers/product-journey';
import { captureReview } from './helpers/review-capture';
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
  for (const id of ['export-glb-btn', 'export-fbx-btn', 'export-dae-btn']) {
    await expect(page.getByTestId(id)).toBeDisabled();
  }
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

test('Classic launches directly and remembers keyboard theme choices without losing focus', async ({ page }) => {
  await page.goto(webPath + '?theme=classic&ref=readme#editor');
  const shell = page.getByTestId('app-shell');
  await expect(shell).toHaveAttribute('data-theme', 'original');
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-viewport-layout', 'quad');
  await expect(page.getByTestId('outliner').locator('.panel-title').first()).toHaveText('Submodels');
  await page.setViewportSize({ width: 390, height: 844 });
  const theme = page.getByTestId('theme-select');
  const more = page.getByTestId('modern-more-menu-button');
  await expect(theme).not.toBeFocused();
  await theme.press('Home');
  await expect(shell).toHaveAttribute('data-theme', 'modern');
  await expect(more).toBeFocused();
  await expect(page).toHaveURL(/\/RustSMF\/\?ref=readme#editor$/);
  await page.reload();
  await expect(shell).toHaveAttribute('data-theme', 'modern');
  await more.press('Enter');
  await theme.press('End');
  await expect(shell).toHaveAttribute('data-theme', 'original');
  await expect(theme).toBeFocused();
  await page.reload();
  await expect(shell).toHaveAttribute('data-theme', 'original');
});

test('Classic keeps file actions and workspace tabs clickable at narrow and desktop widths', async ({ page }, testInfo) => {
  const assertErrors = watchJourneyErrors(page);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(webPath + '?theme=classic');
  const shell = page.getByTestId('app-shell');
  const toolbar = shell.locator('.original-toolbar');
  const commands = toolbar.getByRole('button').or(toolbar.getByRole('tab'));
  for (const { width, height, capture } of [
    { width: 320, height: 720 },
    { width: 390, height: 844, capture: 'classic-narrow.png' },
    { width: 801, height: 720 },
    { width: 1280, height: 720, capture: 'classic-desktop.png' },
  ]) {
    await page.setViewportSize({ width, height });
    await expect(shell).toHaveAttribute('data-theme', 'original');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await expect.poll(() => commands.evaluateAll(controls => controls.flatMap(control => {
      const { x, y, width, height } = control.getBoundingClientRect();
      const hit = document.elementFromPoint(x + width / 2, y + height / 2);
      return control.contains(hit) ? [] : [control.textContent?.trim()];
    })), `Classic toolbar at ${width}×${height}`).toEqual([]);
    if (capture) await captureReview(page, testInfo, capture);
  }

  for (const id of ['export-btn', 'export-glb-btn', 'export-fbx-btn', 'export-dae-btn', 'export-smf-btn']) {
    await expect(page.getByTestId(id)).toBeDisabled();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('open-model-btn').click();
  await (await chooser).setFiles(robot);
  await expect(page.getByTestId('status-text')).toContainText('Loaded: rustsmf-demo.glb');
  const project = await downloadBytes(page, 'save-project-btn');
  await expect(page.getByTestId('status-text')).toContainText('Project download requested');
  await page.reload();
  await expect(page.getByTestId('save-project-btn')).toBeDisabled();
  const reopen = page.waitForEvent('filechooser');
  await page.getByTestId('open-project-btn').click();
  await (await reopen).setFiles({ name: 'classic.rsproj', mimeType: 'application/json', buffer: project });
  await expect(page.getByTestId('status-text')).toContainText(/Loaded: .*\.glb/i);
  await page.getByTestId('mode-tab-export').click();
  await expect(shell).toHaveAttribute('data-editor-mode', 'export');
  const bytes = await downloadBytes(page, 'export-glb-btn');
  expect(readAssetEvidence(bytes).clips.map(clip => clip.name)).toEqual(['Wave', 'Turn']);
  await captureReview(page, testInfo, 'classic-narrow-export.png');

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByTestId('mode-tab-view').click();
  await page.getByTestId('viewport-display-menu-button').click();
  await page.getByTestId('viewport-grid-toggle').click();
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-grid-enabled', 'false');
  assertErrors();
});

test('Classic Help explains project downloads and returns focus to its launcher', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(webPath + '?theme=classic');
  const launcher = page.getByRole('button', { name: 'Help', exact: true });
  await expect(launcher).toBeVisible();
  await launcher.press('Enter');
  const help = page.getByRole('dialog', { name: 'RustSMF Help' });
  await expect(help).toBeVisible();
  await expect(help).toContainText('Download an .rsproj before closing the tab.');
  await expect(help).toContainText('Choose Modern under Theme');
  await expect(help.getByRole('link', { name: 'Third-party licenses' })).toHaveAttribute('href', webPath + 'licenses/THIRD_PARTY_LICENSES.txt');
  await expect(page.getByTestId('help-close')).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await expect(launcher).toBeFocused();
});

test.describe('Mobile Open Asset', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  for (const { name, entry, launcherId } of [
    { name: 'Modern toolbar', entry: webPath, launcherId: 'open-model-btn' },
    { name: 'Modern empty state', entry: webPath, launcherId: 'modern-empty-open' },
    { name: 'Classic toolbar', entry: webPath + '?theme=classic', launcherId: 'open-model-btn' },
  ]) {
    test(`${name} can retry a picker that yields no selection`, async ({ page }) => {
      const assertErrors = watchJourneyErrors(page);
      await page.goto(entry);
      const launcher = page.getByTestId(launcherId);
      const first = page.waitForEvent('filechooser');
      await launcher.tap();
      const picker = await first;

      // The intercepted picker delivers no change, cancel, or focus event.
      await expect(page.getByTestId('open-model-btn')).toBeEnabled({ timeout: 1500 });
      await expect(page.getByTestId('loading-overlay')).toHaveCount(0);
      expect(await picker.element().getAttribute('data-testid')).toBe('model-file-input');

      const retry = page.waitForEvent('filechooser');
      await launcher.tap();
      await (await retry).setFiles(robot);
      await expect(page.getByTestId('status-text')).toContainText('Loaded: rustsmf-demo.glb');
      await expect(page.getByTestId('open-model-btn')).toBeEnabled();
      assertErrors();
    });
  }
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
