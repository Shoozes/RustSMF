import { workspaceControl, selectWorkspace, showModernPanel, showSkinAdvanced } from './helpers/modern-shell';
import { test, expect } from '@playwright/test';
import { captureReview } from './helpers/review-capture';
import { createSkinnedGlbFixtureInput } from './helpers/skinned-glb-fixture';
import { selectBone, watchJourneyErrors } from './helpers/product-journey';

for (const [width, height] of [[1920, 1080], [1440, 900], [1280, 800], [1024, 768], [800, 900], [390, 844]]) {
  test.describe(`Modern authoring ${width}x${height}`, () => {
    test.use({ viewport: { width, height }, deviceScaleFactor: width === 1440 ? 1.25 : 1 });
    test('selected rig, invalid profile and Skin controls remain reachable without overflow', async ({ page }, testInfo) => {
      const assertErrors = watchJourneyErrors(page);
      await page.goto('/');
      await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).toContainText(/Loaded:/, { timeout: 15_000 });
      await selectWorkspace(page, 'rig');
      await selectBone(page, 'FixtureTip');
      await (await workspaceControl(page, 'rig-primary-axis')).selectOption('x');
      await (await workspaceControl(page, 'rig-lock-toggle')).check();
      await expect(page.getByTestId('rig-tool-select')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('rig-tool-select')).toHaveCSS('background-color', 'rgb(228, 210, 168)');
      await expect(page.getByTestId('rig-rename-btn')).toHaveCSS('background-color', 'rgb(41, 42, 40)');
      await expect(page.getByTestId('modern-support-panel')).toHaveCount(1);
      const checkPanel = async () => {
        const panel = page.getByTestId('modern-support-panel');
        await expect(panel).toBeVisible();
        const bounds = await panel.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
        const overflow = await panel.evaluate(element => element.scrollWidth > element.clientWidth + 1);
        expect(overflow).toBe(false);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      };
      await checkPanel();
      const rename = await workspaceControl(page, 'rig-rename-btn');
      expect((await rename.boundingBox())!.height).toBeGreaterThanOrEqual(32);
      await captureReview(page, testInfo, `modern-rig-${width}x${height}.png`);
      await selectWorkspace(page, 'animate');
      await showModernPanel(page, 'properties');
      await (await workspaceControl(page, 'retarget-profile-controls')).locator('summary').click();
      await (await workspaceControl(page, 'retarget-profile-json')).fill('{"bad":true}');
      await expect(page.getByTestId('retarget-profile-controls').getByRole('alert')).toBeVisible();
      await expect(page.getByTestId('retarget-profile-controls').getByRole('alert')).toBeInViewport();
      await expect(page.getByTestId('retarget-profile-source')).toBeDisabled();
      await checkPanel();
      await expect(page.getByTestId('animate-workspace-panel')).toHaveCSS('max-height', 'none');
      await captureReview(page, testInfo, `modern-profile-error-${width}x${height}.png`);
      await selectWorkspace(page, 'skin');
      await expect(page.getByTestId('modern-support-panel')).toHaveCount(0);
      await expect(page.getByTestId('modern-skin-tool-paint')).toBeVisible();
      await showSkinAdvanced(page);
      await (await workspaceControl(page, 'skin-paint-pose')).selectOption('live');
      await expect(page.getByTestId('skin-paint-pose-warning')).toBeVisible();
      await (await workspaceControl(page, 'skin-paint-pose-warning')).scrollIntoViewIfNeeded();
      await expect(page.getByTestId('skin-paint-pose-warning')).toBeInViewport();
      await checkPanel();
      await captureReview(page, testInfo, `modern-skin-${width}x${height}.png`);
      await page.getByTestId('modern-panel-close').click();
      await expect(page.getByTestId('modern-support-panel')).toHaveCount(0);
      await expect(page.getByTestId('modern-skin-advanced')).toBeFocused();
      await showSkinAdvanced(page);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('modern-support-panel')).toHaveCount(0);
      await expect(page.getByTestId('modern-skin-advanced')).toBeFocused();
      assertErrors();
    });
  });
}
