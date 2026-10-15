import type { Page, TestInfo } from '@playwright/test';

/** Optional successful UI captures belong to the current run, never an older evidence batch. */
export async function captureReview(page: Page, testInfo: TestInfo, name: string, fullPage = false): Promise<string | undefined> {
  if (process.env.RUSTSMF_CAPTURE_UI_REVIEW !== '1') return;
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage });
  return path;
}
