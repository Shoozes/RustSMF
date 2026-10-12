import { test, expect } from '@playwright/test';
import { selectWorkspace, showModernPanel, workspaceControl } from './helpers/modern-shell';
import { createSkinnedGlbFixtureInput } from './helpers/skinned-glb-fixture';
import { watchJourneyErrors } from './helpers/product-journey';

test('task tabs expose one keyboard stop, wrap in both directions and keep focus in visible controls', async ({ page }) => {
  const assertErrors = watchJourneyErrors(page);
  await page.goto('/');
  await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
  await expect(page.getByTestId('status-text')).toContainText('Loaded:');
  for (const [mode, tasks] of [
    ['view', ['objects', 'surface', 'details']],
    ['rig', ['pose', 'hierarchy', 'setup']],
    ['skin', ['brush', 'weights', 'display']],
    ['animate', ['clips', 'pose', 'transfer']],
  ] as const) {
    await selectWorkspace(page, mode);
    await showModernPanel(page, 'properties');
    const drawer = page.getByTestId('modern-support-panel');
    const first = page.getByTestId(`workspace-task-${tasks[0]}`);
    const last = page.getByTestId(`workspace-task-${tasks[2]}`);
    await first.click();
    await first.press('ArrowLeft');
    await expect(last).toBeFocused();
    await expect(last).toHaveAttribute('aria-selected', 'true');
    await last.press('ArrowRight');
    await expect(first).toBeFocused();
    await first.press('End');
    await expect(last).toBeFocused();
    await last.press('Home');
    await expect(first).toBeFocused();
    await expect(drawer.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
    await expect(drawer.locator('[role="tab"][tabindex="-1"]')).toHaveCount(2);
    const content = drawer.getByRole('tabpanel');
    await expect(content).toHaveAttribute('id', (await first.getAttribute('aria-controls'))!);
    await expect(content).toHaveAttribute('aria-labelledby', (await first.getAttribute('id'))!);
    await page.keyboard.press('Tab');
    await expect(content).toBeFocused();
    for (let step = 0; step < 25; step++) {
      await page.keyboard.press('Tab');
      expect(await drawer.evaluate(element => {
        const focused = document.activeElement;
        return focused instanceof HTMLElement && element.contains(focused)
          && focused.checkVisibility() && !focused.closest('[hidden]');
      })).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(page.getByTestId(mode === 'skin' ? 'modern-skin-advanced' : 'modern-tools-button')).toBeFocused();
  }
  assertErrors();
});

test('clip and profile drafts survive task changes and keyboard file selection cancellation', async ({ page }) => {
  const assertErrors = watchJourneyErrors(page);
  await page.goto('/');
  await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
  await expect(page.getByTestId('status-text')).toContainText('Loaded:');
  await selectWorkspace(page, 'animate');
  const rootId = await page.getByTestId('three-canvas').getAttribute('data-model-root-id');
  const newAnimation = page.getByRole('button', { name: 'New animation', exact: true });
  await newAnimation.click();
  await expect(page.getByTestId('animation-new-name-input')).toBeFocused();
  await page.getByTestId('animation-new-name-input').fill('Unfinished clip');
  await page.getByTestId('animation-new-duration-input').fill('2.75');
  await page.getByTestId('animation-clip-name-input').fill('Unfinished rename');
  await page.getByTestId('workspace-task-pose').click();
  await expect(page.getByTestId('animation-new-name-input')).toBeHidden();
  await page.getByTestId('workspace-task-clips').click();
  await expect(page.getByTestId('animation-new-name-input')).toHaveValue('Unfinished clip');
  await expect(page.getByTestId('animation-new-duration-input')).toHaveValue('2.75');
  await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Unfinished rename');
  await page.locator('.workspace-task-on-demand > summary').click();
  await expect(newAnimation).toBeFocused();
  await expect(page.getByTestId('animation-new-name-input')).toBeHidden();

  await page.getByTestId('workspace-task-transfer').click();
  const profile = page.getByTestId('retarget-profile-controls');
  await profile.locator('summary').click();
  await page.getByTestId('retarget-profile-json').fill('{"unfinished":true}');
  await expect(profile.getByRole('alert')).toBeVisible();
  const errorText = await profile.getByRole('alert').innerText();
  await profile.locator('summary').click();
  await expect(page.locator('.animate-transfer-tools').getByRole('alert')).toHaveText(errorText);
  await expect(page.locator('.animate-transfer-tools').getByRole('alert')).toBeVisible();
  const picker = page.getByRole('button', { name: 'Retarget clips', exact: true });
  await expect(picker).toHaveAttribute('title', /Retarget.*named-bone/);
  await page.getByTestId('workspace-task-transfer').click();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('tabpanel')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(picker).toBeFocused();
  const playback = page.getByTestId('timeline-play-btn');
  const playbackLabel = await playback.innerText();
  for (const activation of ['Enter', 'Space']) {
    const pendingChooser = page.waitForEvent('filechooser');
    await expect(picker).toBeFocused();
    await picker.press(activation);
    await (await pendingChooser).setFiles([]);
    await expect(playback).toHaveText(playbackLabel);
  }
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', rootId!);
  await expect(page.getByTestId('error-banner')).toBeHidden();
  await page.getByTestId('workspace-task-clips').click();
  await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Unfinished rename');
  await page.getByTestId('workspace-task-transfer').click();
  await profile.locator('summary').click();
  await expect(page.getByTestId('retarget-profile-json')).toHaveValue('{"unfinished":true}');
  await expect(profile.getByRole('alert')).toHaveText(errorText);
  assertErrors();
});

test('Space activates an authoring button while the viewport shortcut still controls playback', async ({ page }) => {
  const assertErrors = watchJourneyErrors(page);
  await page.goto('/');
  await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
  await expect(page.getByTestId('status-text')).toContainText('Loaded:');
  await selectWorkspace(page, 'animate');
  const newAnimation = page.getByRole('button', { name: 'New animation', exact: true });
  await newAnimation.click();
  await page.locator('.workspace-task-on-demand > summary').click();
  await expect(newAnimation).toBeFocused();
  const playback = page.getByTestId('timeline-play-btn');
  const before = await playback.innerText();
  await newAnimation.press('Space');
  await expect(playback).toHaveText(before);
  await expect(page.getByTestId('animation-new-name-input')).toBeFocused();
  await page.keyboard.press('Escape');
  const viewport = (await page.getByTestId('three-canvas').boundingBox())!;
  await page.mouse.click(viewport.x + viewport.width - 30, viewport.y + viewport.height - 60);
  await page.keyboard.press('Space');
  await expect(playback).toHaveText(before === 'Pause' ? 'Play' : 'Pause');
  assertErrors();
});

test('Rig text editing preserves the transform mode and global shortcuts work outside inputs', async ({ page }) => {
  const assertErrors = watchJourneyErrors(page);
  await page.goto('/');
  await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
  await expect(page.getByTestId('status-text')).toContainText('Loaded:');
  await selectWorkspace(page, 'rig');
  await (await workspaceControl(page, 'bone-tree-item-FixtureRoot')).click();
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-transform-attached', 'true');
  const translate = await workspaceControl(page, 'mode-translate-btn');
  await translate.click();
  const rename = await workspaceControl(page, 'rig-rename-input');
  await rename.fill('draft');
  await rename.press('r');
  await rename.press('s');
  await expect(rename).toHaveValue('draftrs');
  await expect(page.getByTestId('mode-translate-btn')).toHaveClass(/bg-slate-500/);
  await page.keyboard.press('Escape');
  await page.keyboard.press('r');
  await showModernPanel(page, 'properties');
  await expect(page.getByTestId('mode-rotate-btn')).toHaveClass(/bg-slate-500/);
  assertErrors();
});

for (const width of [1440, 390]) {
  test(`Skin unsaved state stays visible in Scene at ${width}px without duplicate brush controls`, async ({ page }, testInfo) => {
    const assertErrors = watchJourneyErrors(page);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto('/');
    await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
    await expect(page.getByTestId('status-text')).toContainText('Loaded:');
    await selectWorkspace(page, 'skin');
    await showModernPanel(page, 'properties');
    await page.getByTestId('workspace-task-weights').click();
    await page.getByTestId('skin-autoskin-algorithm').selectOption('segment-inverse-distance');
    await page.getByTestId('skin-autoskin-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Auto skinned [1-9]/);
    await expect(page.getByTestId('skin-advanced-panel').getByText('Unsaved weights', { exact: true })).toBeVisible();
    await page.getByTestId('modern-panel-scene').click();
    await expect(page.getByTestId('modern-skin-state')).toBeVisible();
    await expect(page.getByTestId('modern-skin-state')).toContainText('Unsaved weights');
    await expect(page.getByTestId('modern-skin-state')).toBeInViewport();
    await expect(page.getByTestId('modern-skin-radius')).toHaveCount(0);
    await expect(page.getByTestId('modern-skin-strength')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`skin-scene-unsaved-${width}.png`) });
    await page.getByTestId('modern-panel-properties').click();
    await expect(page.getByTestId('modern-skin-state')).toHaveCount(0);
    await expect(page.getByTestId('skin-advanced-panel').getByText('Unsaved weights', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('modern-skin-state')).toBeVisible();
    await page.keyboard.press('Control+Z');
    await expect(page.getByTestId('modern-skin-state')).toHaveCount(0);
    await page.keyboard.press('Control+Y');
    await expect(page.getByTestId('modern-skin-state')).toContainText('Unsaved weights');
    assertErrors();
  });
}

test('coarse-pointer task tabs and symbol actions have 44px targets in every workspace', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  try {
    const page = await context.newPage();
    const assertErrors = watchJourneyErrors(page);
    await page.goto('/');
    await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
    await expect(page.getByTestId('status-text')).toContainText('Loaded:');
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    for (const mode of ['view', 'rig', 'skin', 'animate'] as const) {
      await selectWorkspace(page, mode);
      await showModernPanel(page, 'properties');
      const tasks = page.getByTestId('workspace-tasks');
      let actions = 0;
      for (const tab of await tasks.getByRole('tab').all()) {
        await tab.click();
        const box = (await tab.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        for (const button of await tasks.locator('.panel-icon-action:visible').all()) {
          actions++;
          const bounds = (await button.boundingBox())!;
          expect(bounds.width).toBeGreaterThanOrEqual(44);
          expect(bounds.height).toBeGreaterThanOrEqual(44);
          expect(await button.getAttribute('aria-label')).toBeTruthy();
          expect(await button.getAttribute('title')).toBeTruthy();
        }
      }
      expect(actions).toBeGreaterThan(0);
    }
    assertErrors();
  } finally {
    await context.close();
  }
});
