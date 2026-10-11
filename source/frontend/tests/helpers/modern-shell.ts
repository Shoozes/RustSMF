import { expect, type Page } from '@playwright/test';

export async function expectLoadDetails(page: Page, expected: RegExp): Promise<void> {
  await revealSecondaryCommands(page);
  await page.getByTestId('help-open').click();
  const details = page.getByTestId('help-status-details');
  await details.locator('summary').click();
  await expect(details).toContainText(expected);
  await page.getByTestId('help-close').click();
  await expect(page.getByTestId('modern-more-menu-button')).toBeFocused();
}

async function settleShellLayout(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

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
  await settleShellLayout(page);
  const content = page.getByTestId(panel === 'scene' ? 'outliner' : 'inspector');
  if (await content.count() === 0 || !await content.isVisible()) {
    if (!await page.getByTestId('modern-support-panel').isVisible()) {
      const skin = await page.getByTestId('app-shell').getAttribute('data-editor-mode') === 'skin';
      await page.getByTestId(skin ? 'modern-skin-advanced' : 'modern-tools-button').click();
      await expect(page.getByTestId('modern-support-panel')).toBeFocused();
    }
    if (await page.getByTestId('modern-support-panel').getAttribute('data-panel') !== panel) {
      await page.getByTestId(`modern-panel-${panel}`).click();
    }
  }
  await expect(content).toBeVisible();
}

export async function selectWorkspace(page: Page, mode: 'view' | 'rig' | 'skin' | 'animate' | 'export', tools = true): Promise<void> {
  const modern = await page.getByTestId('app-shell').getAttribute('data-shell-variant') === 'modern';
  if (modern && !await page.getByTestId(`mode-tab-${mode}`).isVisible()) {
    await page.getByTestId('modern-workspace-button').click();
  }
  await page.getByTestId(`mode-tab-${mode}`).click();
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-editor-mode', mode);
  if (modern && tools && mode !== 'skin' && await page.getByTestId('modern-tools-button').isEnabled()) {
    await showModernPanel(page, mode === 'view' ? 'scene' : 'properties');
  }
}

export async function showSkinAdvanced(page: Page): Promise<void> {
  await settleShellLayout(page);
  const advanced = page.getByTestId('skin-advanced-panel');
  if (await advanced.count() === 0 || !await advanced.isVisible()) {
    await page.getByTestId('modern-skin-advanced').click();
    await expect(page.getByTestId('modern-support-panel')).toBeFocused();
  }
  await expect(advanced).toBeVisible();
}

export async function showAnimateTimeline(page: Page): Promise<void> {
  await selectWorkspace(page, 'animate');
  await expect(page.getByTestId('timeline')).toBeVisible();
}
