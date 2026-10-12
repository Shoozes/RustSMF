import { expect, type Locator, type Page } from '@playwright/test';

// Follow the visible task/disclosure path before exercising an authoring control.
export async function workspaceControl(page: Page, testId: string): Promise<Locator> {
  return workspaceLocator(page, page.getByTestId(testId));
}

export async function workspaceLocator(page: Page, control: Locator): Promise<Locator> {
  if (!await control.count()) return control;
  const task = await control.evaluate(element => element.closest<HTMLElement>('.workspace-task-section[hidden]')?.dataset.workspaceTasks?.split(' ')[0]);
  if (task) await page.getByTestId(`workspace-task-${task}`).click();
  for (let depth = 0; depth < 4; depth++) {
    const closed = await control.evaluate(element => {
      const details: HTMLDetailsElement[] = [];
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement && !parent.open) details.push(parent);
      }
      const outer = details.at(-1);
      return outer ? { onDemand: outer.classList.contains('workspace-task-on-demand'), label: outer.querySelector('summary')?.textContent ?? '' } : null;
    });
    if (!closed) break;
    if (closed.onDemand) await page.getByRole('button', { name: closed.label, exact: true }).click();
    else await control.locator('xpath=ancestor::details[not(@open)][last()]/summary').click();
  }
  return control;
}

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
  const modern = await page.getByTestId('app-shell').getAttribute('data-shell-variant') === 'modern';
  const content = page.getByTestId(panel === 'scene' ? 'outliner' : modern ? 'modern-support-panel' : 'inspector');
  if (!modern) {
    await expect(content).toBeVisible();
    return;
  }
  if (await content.count() === 0 || !await content.isVisible() || await page.getByTestId('modern-support-panel').getAttribute('data-panel') !== panel) {
    if (!await page.getByTestId('modern-support-panel').isVisible()) {
      const skin = await page.getByTestId('app-shell').getAttribute('data-editor-mode') === 'skin';
      await page.getByTestId(skin ? 'modern-skin-advanced' : 'modern-tools-button').click();
      await expect(page.getByTestId('modern-support-panel')).toBeFocused();
    }
    if (await page.getByTestId('modern-support-panel').getAttribute('data-panel') !== panel) {
      await page.getByTestId(`modern-panel-${panel}`).click();
    }
  }
  const task = page.getByTestId(panel === 'scene' ? 'workspace-task-objects' : 'workspace-task-details');
  if (await task.count()) await task.click();
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
    if (mode === 'rig' && !await page.getByTestId('rig-prepare-static-panel').isVisible()) {
      await page.getByTestId('workspace-task-hierarchy').click();
    }
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
  await page.getByTestId('workspace-task-weights').click();
}

export async function showAnimateTimeline(page: Page): Promise<void> {
  await selectWorkspace(page, 'animate');
  if (await page.getByTestId('workspace-task-pose').count()) await page.getByTestId('workspace-task-pose').click();
  await expect(page.getByTestId('timeline')).toBeVisible();
}
