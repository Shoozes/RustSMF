import { expect, type Page } from '@playwright/test';
import { workspaceControl } from './modern-shell';

export const setRangeValue = async (page: Page, testId: string, value: number): Promise<void> => {
  const slider = await workspaceControl(page, testId);
  await slider.fill(String(value));
  await slider.dispatchEvent('input');
  await page.waitForTimeout(20);
};

export const clickTimelineLaneAt = async (
  page: Page,
  ratio: number,
  clickCount: 1 | 2 = 1,
): Promise<void> => {
  const lane = page.getByTestId('timeline-keyframe-lane');
  const box = await lane.boundingBox();
  if (!box) {
    throw new Error('Timeline keyframe lane is not visible.');
  }

  const x = box.x + box.width * Math.min(1, Math.max(0, ratio));
  const y = box.y + box.height / 2;
  if (clickCount === 2) {
    await page.mouse.dblclick(x, y);
  } else {
    await page.mouse.click(x, y);
  }
  await page.waitForTimeout(80);
};

export const dragSelectedTimelineMarkerTo = async (page: Page, ratio: number): Promise<void> => {
  const lane = page.getByTestId('timeline-keyframe-lane');
  const laneBox = await lane.boundingBox();
  if (!laneBox) {
    throw new Error('Timeline keyframe lane is not visible.');
  }

  const marker = page.locator('.timeline-keyframe-marker-selected').first();
  await expect(marker).toBeVisible();
  await expect(marker).toHaveAttribute('data-draggable-keyframe', 'true');
  const markerBox = await marker.boundingBox();
  if (!markerBox) {
    throw new Error('Selected timeline marker is not visible.');
  }

  const startX = markerBox.x + markerBox.width / 2;
  const startY = markerBox.y + markerBox.height / 2;
  const targetX = laneBox.x + laneBox.width * Math.min(1, Math.max(0, ratio));
  const targetY = laneBox.y + laneBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(targetX, targetY, { steps: 8 });
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(120);
};
