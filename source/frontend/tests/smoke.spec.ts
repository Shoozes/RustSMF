import { test, expect } from '@playwright/test';
import path from 'path';

// Basic smoke tests for the RustSMF shell + model loading.
// These exercise the core Three.js viewport, loaders, timeline, and export paths.
// For full visual regression of skinned models + animation, add screenshot comparisons
// after loading a reference .smf (see roundtrip backlog item).

// Use any real .smf from the reference collection for model load smoke.
// The exact filename may vary; we pick the first .smf we can find at runtime.
import fs from 'fs';
const SMF_DIR = path.resolve(__dirname, '../../docs/references/old-src/datafiles/SMF');
const SAMPLE_SMF = fs.existsSync(SMF_DIR)
  ? fs.readdirSync(SMF_DIR).find(f => f.endsWith('.smf'))
    ? path.join(SMF_DIR, fs.readdirSync(SMF_DIR).find(f => f.endsWith('.smf'))!)
    : null
  : null;

test.describe('RustSMF basic shell and model flow (Chromium)', () => {
  test('app boots with expected UI elements and initial state', async ({ page }) => {
    await page.goto('/');

    // Initial status
    await expect(page.getByTestId('status-text')).toContainText('Viewport ready');

    // Key controls
    await expect(page.getByTestId('open-model-btn')).toBeVisible();
    await expect(page.getByTestId('export-btn')).toBeVisible();
    await expect(page.getByTestId('ping-rust-btn')).toBeVisible();

    // Viewport + canvas
    await expect(page.getByTestId('viewport-container')).toBeVisible();
    await expect(page.getByTestId('three-canvas')).toBeVisible();

    // Timeline and outliner present
    await expect(page.getByTestId('timeline')).toBeVisible();
    await expect(page.getByTestId('outliner')).toBeVisible();
  });

  test('can load a real SMF sample and basic UI updates', async ({ page }) => {
    test.skip(!SAMPLE_SMF, 'No .smf sample found in reference datafiles – adjust SAMPLE_SMF path');

    await page.goto('/');

    // Use the persistent hidden input (added for e2e) – setInputFiles triggers onChange
    // which calls loadModel directly. This bypasses the dynamic openFile() for reliability.
    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(SAMPLE_SMF!);

    // Wait for load to finish (status changes and no longer says "Loading")
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });

    // After load we should see some model info in status (bones, clips, verts etc.)
    await expect(page.getByTestId('status-text')).toContainText(/Loaded|bones|clips/i);

    // Outliner should reflect content
    await expect(page.getByTestId('outliner')).toContainText(/Scene Root|Bone|Mesh/i);

    // Timeline should be enabled / have content
    await expect(page.getByTestId('timeline')).toBeVisible();

    // Inspector and outliner should reflect content after load
    await expect(page.getByTestId('inspector')).toBeVisible();
    await expect(page.getByTestId('inspector')).toContainText(/Clips|Selected/i);

    // Canvas still there (Three.js kept rendering)
    await expect(page.getByTestId('three-canvas')).toBeVisible();
  });

  test('export flow and basic visuals (smoke for roundtrip prep)', async ({ page }) => {
    test.skip(!SAMPLE_SMF, 'No .smf sample found in reference datafiles');

    await page.goto('/');

    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(SAMPLE_SMF!);

    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/Loaded|bones|clips/i);

    // Test export: click, check status for success message (download is blob, hard to reimport here but status confirms)
    const exportBtn = page.getByTestId('export-btn');
    await exportBtn.click();
    await expect(page.getByTestId('status-text')).toContainText(/Exported .smf/i, { timeout: 5000 });

    // Basic visual: screenshot viewport after load (for regression; update snapshots with --update-snapshots)
    await expect(page.getByTestId('viewport-container')).toHaveScreenshot('loaded-model.png', { timeout: 10000 });
  });

  test('timeline scrub, clip change, loading overlay, and error banner (extended controls + UX)', async ({ page }) => {
    test.skip(!SAMPLE_SMF, 'No .smf sample found in reference datafiles – adjust SAMPLE_SMF path');

    await page.goto('/');

    // Error banner element should be in DOM (even if not shown)
    await expect(page.getByTestId('error-banner')).toBeAttached();

    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(SAMPLE_SMF!);

    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/Loaded|bones|clips/i);

    // Loading overlay should not be visible after load
    await expect(page.getByTestId('loading-overlay')).toBeHidden();

    // Scrub slider present and interactive (set value; no crash + still renders)
    const slider = page.getByTestId('scrub-slider');
    await expect(slider).toBeVisible();
    await expect(slider).toBeEnabled();
    // Drive the scrub (Playwright range .fill works for value update)
    await slider.fill('0.5');
    // Give RAF a tick for any internal update
    await page.waitForTimeout(120);
    // Stronger assert: time display updated (uses data-testid)
    await expect(page.getByTestId('time-display')).toContainText(/0\.5|0\.50/);

    // Clip list items: click first clip (if present) and assert no crash / UI still live
    const firstClip = page.getByTestId('clip-item-0');
    if (await firstClip.count() > 0) {
      await firstClip.click();
      await page.waitForTimeout(80);
      // Status or timeline should still be sensible
      await expect(page.getByTestId('timeline')).toBeVisible();
    }

    // Canvas still rendering post-interactions
    await expect(page.getByTestId('three-canvas')).toBeVisible();

    // Nothing-to-export path (tests status for empty export attempt)
    await page.goto('/');
    await page.getByTestId('export-btn').click();
    await expect(page.getByTestId('status-text')).toContainText(/Nothing to export/i);

    // Drop zone hint is present (for drag-drop UX)
    await expect(page.locator('text=/Drop .* here/')).toBeAttached();
  });
});
