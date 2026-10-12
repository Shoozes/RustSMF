import { workspaceControl, selectWorkspace, clickSecondaryCommand, showModernPanel } from './modern-shell';
import fs from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

import { readAssetEvidence } from './asset-evidence';

export { test, expect };

export function watchJourneyErrors(page: Page, allowed: RegExp[] = []): () => void {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('crash', () => errors.push('page crashed'));
  page.on('console', message => {
    if (message.type() === 'error' && !allowed.some(pattern => pattern.test(message.text()))) errors.push(message.text());
  });
  return () => expect(errors).toEqual([]);
}

export async function downloadBytes(page: Page, id: string, secondary = false): Promise<Buffer> {
  const pending = page.waitForEvent('download');
  if (secondary) await clickSecondaryCommand(page, id);
  else await (await workspaceControl(page, id)).click();
  const download = await pending;
  const file = await download.path();
  expect(file).not.toBeNull();
  return fs.readFileSync(file!);
}

export async function exportEvidence(page: Page) {
  return readAssetEvidence(await downloadBytes(page, 'export-glb-btn', true));
}

export async function reopenProject(page: Page, bytes: Buffer): Promise<void> {
  const pending = page.waitForEvent('filechooser');
  await clickSecondaryCommand(page, 'open-project-btn');
  await (await pending).setFiles({ name: 'journey.rsproj', mimeType: 'application/json', buffer: bytes });
  await expect(page.getByTestId('replacement-dialog')).toBeVisible();
  await page.getByTestId('confirm-model-replacement').click();
  await expect(page.getByTestId('status-text')).toContainText(/Loaded: .*\.glb/i, { timeout: 15_000 });
}

export async function selectBone(page: Page, name: string): Promise<void> {
  await showModernPanel(page, 'properties');
  const inspector = page.getByTestId('inspector');
  const row = await workspaceControl(page, `bone-tree-item-${name}`);
  await row.click();
  await expect(inspector).toContainText(new RegExp(`Selected\\s*${name}`));
}

export async function renameSubmodel(page: Page, name: string): Promise<void> {
  await showModernPanel(page, 'scene');
  await (await workspaceControl(page, 'outliner-submodel-0')).locator('.outliner-name-btn').click();
  await (await workspaceControl(page, 'outliner-rename-input')).fill(name);
  await (await workspaceControl(page, 'outliner-rename-btn')).click();
  await expect(page.getByTestId('outliner')).toContainText(name);
}

export async function pauseJourney(page: Page): Promise<void> {
  await selectWorkspace(page, 'animate');
  const button = page.getByTestId('timeline-play-btn');
  if ((await button.textContent())?.includes('Pause')) await button.click();
  await expect(button).not.toContainText('Pause');
}
