import { test, expect } from '@playwright/test';
import { BLACK_CAT_PATH, CAT_CLIPS } from './helpers/black-cat-evidence';
import { watchJourneyErrors } from './helpers/product-journey';
import { selectWorkspace, workspaceControl } from './helpers/modern-shell';
import { expectRenderedScreenshot } from './helpers/smoke-helpers';
import { captureReview } from './helpers/review-capture';
import { clickTimelineLaneAt } from './helpers/timeline-interactions';
import { PNG } from 'pngjs';

test('original Sable pack opens normally and all four clips play visible geometry', async ({ page }, testInfo) => {
  const errors = watchJourneyErrors(page);
  await page.goto('/');
  const choosing = page.waitForEvent('filechooser');
  await page.getByTestId('open-model-btn').click();
  await (await choosing).setFiles(BLACK_CAT_PATH);
  await expect(page.getByTestId('status-text')).toHaveText('Loaded: sable.glb', { timeout: 15000 });
  await expect(page.getByTestId('status-text')).toHaveAttribute('title', /bones: 24.*clips: 4/);
  await selectWorkspace(page, 'animate', false);
  const play = page.getByTestId('timeline-play-btn');
  if ((await play.textContent())?.includes('Pause')) await play.click();
  await page.getByTestId('viewport-display-menu-button').click();
  for (const id of ['viewport-grid-toggle', 'viewport-axes-toggle', 'viewport-rig-visibility-toggle']) await page.getByTestId(id).click();
  await page.getByTestId('viewport-display-menu-button').click();
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-grid-enabled', 'false');
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-axes-enabled', 'false');
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-rig-opacity', '0');
  await expectRenderedScreenshot(page.getByTestId('three-canvas'));
  await captureReview(page, testInfo, 'sable-open.png');

  await selectWorkspace(page, 'animate');
  for (const [name, duration] of Object.entries(CAT_CLIPS)) {
    await selectWorkspace(page, 'animate');
    const clip = await workspaceControl(page, 'clip-item-0');
    const row = page.locator('[data-testid^="clip-item-"]').filter({ hasText: `${name} (` });
    await expect(clip).toBeVisible();
    await row.press('Enter');
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    if ((await play.textContent())?.includes('Pause')) await play.click();
    const slider = page.getByTestId('scrub-slider');
    await slider.press('Home');
    await page.getByRole('button', { name: 'Close supporting panel', exact: true }).click();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const before = PNG.sync.read(await page.getByTestId('three-canvas').screenshot());
    await play.click();
    await expect(play).toHaveText('Pause');
    await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(.05);
    await play.click();
    await slider.press('End');
    await expect(page.getByTestId('time-display')).toHaveText(`${duration.toFixed(2)} / ${duration.toFixed(2)}s`);
    if (name !== 'Sit') await clickTimelineLaneAt(page, .5);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const after = PNG.sync.read(await page.getByTestId('three-canvas').screenshot());
    expect([after.width, after.height]).toEqual([before.width, before.height]);
    let changed = 0;
    for (let i = 0; i < after.data.length; i += 4) {
      if ([0, 1, 2].some(channel => Math.abs(after.data[i + channel] - before.data[i + channel]) > 12)) changed++;
    }
    expect(changed, `${name} must move visible model pixels with helpers and Tools hidden`).toBeGreaterThan(40);
    await expectRenderedScreenshot(page.getByTestId('three-canvas'));
    await expect(page.getByTestId('error-banner')).toBeHidden();
    await captureReview(page, testInfo, `sable-${name.toLowerCase()}.png`);
  }
  errors();
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Sable presentation ${viewport.width}`, () => {
    test.use({ viewport });
    test('charcoal coat remains visible in the ordinary dark viewport', async ({ page }, testInfo) => {
      const errors = watchJourneyErrors(page);
      await page.goto('/');
      const choosing = page.waitForEvent('filechooser');
      await page.getByTestId('open-model-btn').click();
      await (await choosing).setFiles(BLACK_CAT_PATH);
      await expect(page.getByTestId('status-text')).toHaveText('Loaded: sable.glb', { timeout: 15000 });
      await selectWorkspace(page, 'animate', false);
      const play = page.getByTestId('timeline-play-btn');
      if ((await play.textContent())?.includes('Pause')) await play.click();
      await page.getByTestId('scrub-slider').press('Home');
      await page.getByTestId('viewport-display-menu-button').click();
      for (const id of ['viewport-grid-toggle', 'viewport-axes-toggle', 'viewport-rig-visibility-toggle']) await page.getByTestId(id).click();
      await page.getByTestId('viewport-display-menu-button').click();
      await expectRenderedScreenshot(page.getByTestId('three-canvas'));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.getByTestId('error-banner')).toBeHidden();
      await captureReview(page, testInfo, `sable-${viewport.width}.png`);
      errors();
    });
  });
}
