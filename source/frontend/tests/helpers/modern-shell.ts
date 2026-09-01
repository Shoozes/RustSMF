import { expect, type Page } from '@playwright/test';

export async function revealSecondaryCommands(page: Page): Promise<void> {
  const panel = page.getByTestId('modern-more-menu-panel');
  if (!await panel.isVisible()) {
    await page.getByTestId('modern-more-menu-button').click();
  }
  await expect(panel).toBeVisible();
}

export async function clickSecondaryCommand(page: Page, testId: string): Promise<void> {
  await revealSecondaryCommands(page);
  await page.getByTestId(testId).click();
}

export async function showModernPanel(page: Page, panel: 'scene' | 'properties'): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const content = page.getByTestId(panel === 'scene' ? 'outliner' : 'inspector');
  if (await content.count() === 0 || !await content.isVisible()) {
    const trigger = page.getByTestId(panel === 'scene' ? 'modern-scene-trigger' : 'modern-properties-trigger');
    await trigger.click();
  }
  await expect(content).toBeVisible();
}

export async function showAnimateTimeline(page: Page): Promise<void> {
  await page.getByTestId('mode-tab-animate').click();
  await expect(page.getByTestId('timeline')).toBeVisible();
}
