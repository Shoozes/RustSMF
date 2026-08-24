import { createHash } from 'node:crypto';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  getBrowserErrors,
  pausePlaybackIfRunning,
  SAMPLE_SMF,
  setupBrowserDiagnostics,
} from '../helpers/smoke-helpers';
import { setRangeValue } from '../helpers/timeline-interactions';
import { clickPickableBoneInViewport } from '../helpers/viewport-interactions';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, '../../../..');
const journeyOutputDir = path.join(repoRoot, 'output', 'playwright', 'hand-wave-journey');
const journeyVideoPath = path.join(journeyOutputDir, 'hand-wave-journey.webm');
const selectedArmBone = 'SMF_Node_14';
const armHierarchyPath = ['SMF_Node_2', 'SMF_Node_3', 'SMF_Node_4', 'SMF_Node_12', 'SMF_Node_13'];

const screenshotHash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

async function captureStep(page: Page, fileName: string): Promise<void> {
  await page.waitForTimeout(450);
  const bytes = await page.screenshot({
    path: path.join(journeyOutputDir, fileName),
    fullPage: true,
  });
  expect(bytes.byteLength).toBeGreaterThan(10_000);
}

async function expectActionable(locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  await expect(locator).toBeEnabled();
  const state = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(centerX, centerY);
    return {
      inViewport: rect.width > 0
        && rect.height > 0
        && rect.left >= 0
        && rect.top >= 0
        && rect.right <= window.innerWidth
        && rect.bottom <= window.innerHeight,
      receivesPointer: !!hit && (element === hit || element.contains(hit) || hit.contains(element)),
    };
  });
  expect(state.inViewport).toBe(true);
  expect(state.receivesPointer).toBe(true);
}

async function expectNoDocumentOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    x: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
    y: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight,
  }));
  expect(overflow.x).toBeLessThanOrEqual(1);
  expect(overflow.y).toBeLessThanOrEqual(1);
}

async function expandBonePath(page: Page): Promise<void> {
  for (const boneName of armHierarchyPath) {
    const item = page.getByTestId(`bone-tree-item-${boneName}`);
    await item.scrollIntoViewIfNeeded();
    await expect(item).toBeVisible();
    const toggle = item.locator('span').first();
    if (await toggle.count() > 0 && (await toggle.textContent())?.trim() === '+') {
      await toggle.click();
    }
  }
}

async function insertPoseKey(page: Page, time: number, rotationClicks: number): Promise<Buffer> {
  await setRangeValue(page, 'scrub-slider', time);
  await expect(page.getByTestId('time-display')).toContainText(time.toFixed(2));
  const rotateControl = rotationClicks < 0
    ? page.getByTestId('transform-rot-negative-btn')
    : page.getByTestId('transform-rot-btn');
  await expectActionable(rotateControl);
  for (let index = 0; index < Math.abs(rotationClicks); index += 1) {
    await rotateControl.click();
  }
  await expect(page.getByTestId('status-text')).toContainText(
    new RegExp(`Posed ${selectedArmBone}: Z rotation`, 'i'),
  );
  await page.getByTestId('animation-insert-key-btn').click();
  await expect(page.getByTestId('status-text')).toContainText(/Inserted animation keyframe/i);
  await expect(page.getByTestId('animation-selected-key')).toContainText(`${time.toFixed(2)}s`);
  await page.waitForTimeout(180);
  return page.getByTestId('viewport-container').locator('canvas').first().screenshot();
}

test('headless user journey creates and previews a hand-wave animation', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  await mkdir(journeyOutputDir, { recursive: true });
  await rm(journeyVideoPath, { force: true });

  const context = await browser.newContext({
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.25,
    recordVideo: {
      dir: testInfo.outputPath('video'),
      size: { width: 1440, height: 900 },
    },
  });
  const page = await context.newPage();
  const video = page.video();
  setupBrowserDiagnostics(page);

  try {
    await page.goto('/');
    await expect(page.getByTestId('app-shell')).toBeVisible();
    await expectNoDocumentOverflow(page);
    await captureStep(page, '01-empty-app.png');

    const modelInput = page.getByTestId('model-file-input');
    await modelInput.setInputFiles(SAMPLE_SMF);
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15_000 });
    await expect(page.getByTestId('status-text')).toContainText(/bones:\s*24|clips:\s*12/i);
    await pausePlaybackIfRunning(page);
    await expect(page.getByTestId('smf-indexed-bone-guidance')).toBeVisible();
    await expectNoDocumentOverflow(page);
    await captureStep(page, '02-character-loaded.png');

    const animateTab = page.getByTestId('mode-tab-animate');
    await expectActionable(animateTab);
    await animateTab.click();
    await expect(page.getByTestId('animate-workspace-panel')).toBeVisible();
    await expect(page.getByTestId('animation-workflow-hint')).toContainText(/Select a bone.*pose it.*Insert/i);

    await page.getByTestId('animation-new-name-input').fill('Hand Wave');
    await page.getByTestId('animation-new-duration-input').fill('2');
    await page.getByTestId('animation-new-pose-select').selectOption('rest');
    const createButton = page.getByTestId('animation-create-btn');
    await expectActionable(createButton);
    await createButton.click();
    await expect(page.getByTestId('status-text')).toContainText(/Created animation clip Hand Wave from the rest pose/i);
    await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Hand Wave');
    await captureStep(page, '03-new-animation.png');

    const viewportPick = await clickPickableBoneInViewport(page, 'animate-select');
    expect(viewportPick).not.toBeNull();
    await expect(page.getByTestId('inspector-selected')).toHaveText(viewportPick?.bone ?? '');

    await expandBonePath(page);
    const armBone = page.getByTestId(`bone-tree-item-${selectedArmBone}`);
    await armBone.scrollIntoViewIfNeeded();
    await expectActionable(armBone);
    await armBone.click();
    await expect(page.getByTestId('inspector-selected')).toHaveText(selectedArmBone);
    await expect(page.getByTestId('animate-workspace-panel')).toContainText(`Selected bone: ${selectedArmBone}`);
    await expect(page.getByTestId('animation-insert-key-btn')).toBeEnabled();
    await page.getByTestId('animation-snap-step-select').selectOption('0.5');
    await page.getByTestId('animation-interpolation-select').selectOption('linear');
    await captureStep(page, '04-arm-selected.png');

    const waveUp = await insertPoseKey(page, 0.5, 4);
    await captureStep(page, '05-wave-up-key.png');
    const waveDown = await insertPoseKey(page, 1, -8);
    await captureStep(page, '06-wave-down-key.png');
    const waveUpAgain = await insertPoseKey(page, 1.5, 8);
    await captureStep(page, '07-wave-up-again-key.png');

    expect(screenshotHash(waveUp)).not.toBe(screenshotHash(waveDown));
    expect(screenshotHash(waveDown)).not.toBe(screenshotHash(waveUpAgain));
    await expect(page.getByTestId('timeline-keyframe-lane')).toHaveAttribute('data-keyframe-count', '5');
    await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');

    await page.getByTestId('timeline-reset-btn').click();
    await page.getByTestId('timeline-play-btn').click();
    await expect(page.getByTestId('timeline-play-btn')).toContainText('Pause');
    await page.waitForTimeout(900);
    await captureStep(page, '08-wave-playback.png');
    await page.waitForTimeout(3_400);
    await pausePlaybackIfRunning(page);

    await expectNoDocumentOverflow(page);
    expect(getBrowserErrors(page).filter((message) => message.includes('ERROR'))).toEqual([]);
  } finally {
    await context.close().catch(() => {});
    if (video) {
      await video.saveAs(journeyVideoPath).catch(() => {});
      try {
        await stat(journeyVideoPath);
        await testInfo.attach('hand-wave-journey.webm', {
          path: journeyVideoPath,
          contentType: 'video/webm',
        });
      } catch {
        // The primary assertion remains authoritative when the runner closes a timed-out browser.
      }
    }
  }

  const videoStats = await stat(journeyVideoPath);
  expect(videoStats.size).toBeGreaterThan(50_000);
});
