import { test, expect } from '@playwright/test';
import path from 'path';

// Basic smoke tests for the RustSMF shell + model loading.
// These exercise the core Three.js viewport, loaders, timeline, and export paths.
// For full visual regression of skinned models + animation, add screenshot comparisons
// after loading a reference .smf (see roundtrip backlog item).

// Use any real .smf from the reference collection for model load smoke.
// The exact filename may vary; we pick the first .smf we can find at runtime.
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SMF_DIR = path.resolve(__dirname, '../../docs/references/old-src/datafiles/SMF');
let _smfFilesCache = null;
function getSmfFiles() {
  if (_smfFilesCache) return _smfFilesCache;
  if (fs.existsSync(SMF_DIR)) {
    _smfFilesCache = fs.readdirSync(SMF_DIR).filter(f => f.endsWith('.smf'));
  } else {
    _smfFilesCache = [];
  }
  return _smfFilesCache;
}
const SAMPLE_SMF = getSmfFiles().length > 0 ? path.join(SMF_DIR, getSmfFiles()[0]) : null;

const BAD_GML_DIR_SEARCH = path.resolve(__dirname, '../../docs/references/old-src');
let _gmlFilesCache = null;
function getGmlFiles() {
  if (_gmlFilesCache) return _gmlFilesCache;
  const gmls = [];
  function findGml(dir) {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const full = path.join(dir, item);
        if (fs.statSync(full).isDirectory()) findGml(full);
        else if (item.endsWith('.gml')) gmls.push(full);
      }
    } catch {}
  }
  if (fs.existsSync(BAD_GML_DIR_SEARCH)) findGml(BAD_GML_DIR_SEARCH);
  _gmlFilesCache = gmls;
  return _gmlFilesCache;
}
const BAD_GML = getGmlFiles().length > 0 ? getGmlFiles()[0] : null;

test.describe('RustSMF basic shell and model flow (Chromium)', () => {
  test.beforeEach(async ({ page }) => {
    // Capture browser console errors and warnings during tests (for Chrome/Playwright)
    const browserErrors: string[] = [];
    page.on('console', msg => {
      const type = msg.type();
      if (type === 'error' || type === 'warning') {
        const text = `[BROWSER ${type.toUpperCase()}] ${msg.text()}`;
        console.log(text);
        browserErrors.push(text);
      }
    });
    page.on('pageerror', err => {
      const text = `[PAGE ERROR] ${err}`;
      console.error(text);
      browserErrors.push(text);
    });
    // Expose for assert (simple, attach to page for access in test)
    (page as any)._browserErrors = browserErrors;
  });
  test('app boots with expected UI elements and initial state', async ({ page }) => {
    await page.goto('/');

    // Initial status
    await expect(page.getByTestId('status-text')).toContainText('Three.js viewport ready');

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

    // Bones inspector (basic hierarchy from skeleton)
    await expect(page.getByTestId('inspector')).toContainText(/Bones/i);

    // Canvas still there (Three.js kept rendering)
    await expect(page.getByTestId('three-canvas')).toBeVisible();

    // Exercise bone list selection (simulates user picking bone in inspector for coverage)
    const inspector = page.getByTestId('inspector');
    await expect(inspector).toContainText(/Bones \(\d+\)/i);
    const anyBoneEntry = inspector.locator('li > div').filter({ hasText: /./ }).nth(0);
    if (await anyBoneEntry.count() > 0) {
      await anyBoneEntry.click({ force: true }).catch(() => {});
      await page.waitForTimeout(60);
    }
    await expect(page.getByTestId('three-canvas')).toBeVisible();

    // Exercise 3D viewport click (exercises raycast bone pick handler + orbit compat; no crash expected)
    const canvas = page.getByTestId('three-canvas');
    await canvas.click({ position: { x: 60, y: 60 } });
    await page.waitForTimeout(80);
    await expect(canvas).toBeVisible();

    // Verify bone selection (list or 3D raycast) updates status UX
    await expect(page.getByTestId('status-text')).toContainText(/Selected:/i);

    // Assert no critical browser console errors during load (errors logged by listener)
    // (warnings may exist for Three.js, but no errors)
    const errors = (page as any)._browserErrors || [];
    const criticalErrors = errors.filter((e: string) => e.includes('ERROR'));
    expect(criticalErrors.length).toBe(0);
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

    // Strict no critical console errors post export flow
    const exportErrors = (page as any)._browserErrors || [];
    const exportCritical = exportErrors.filter((e: string) => e.includes('ERROR'));
    expect(exportCritical.length).toBe(0);
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

  test('handles invalid file load with error banner and status (error path)', async ({ page }) => {
    test.skip(!BAD_GML || !fs.existsSync(BAD_GML), 'No bad test file for error path');

    await page.goto('/');

    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(BAD_GML);

    // Wait for attempt to finish
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 10000 });

    // Should show error UX
    await expect(page.getByTestId('error-banner')).toBeAttached();
    await expect(page.getByTestId('status-text')).toContainText(/error|Error|fail|unsupported/i);

    // Canvas still present (no crash)
    await expect(page.getByTestId('three-canvas')).toBeVisible();
  });

  // Additional robustness: confirm bone status update works in load flow (covers raycast/list + new validated status path indirectly)
  test('bone selection updates status (select UX coverage)', async ({ page }) => {
    test.skip(!SAMPLE_SMF, 'No .smf sample found in reference datafiles – adjust SAMPLE_SMF path');

    await page.goto('/');

    const input = page.getByTestId('model-file-input');
    await input.setInputFiles(SAMPLE_SMF!);

    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
    await expect(page.getByTestId('status-text')).toContainText(/Loaded|bones|clips/i);

    // Bone list select (targets label divs inside li for the nested tree structure)
    const inspector = page.getByTestId('inspector');
    const anyBoneEntry = inspector.locator('li > div').filter({ hasText: /./ }).nth(0);
    if (await anyBoneEntry.count() > 0) {
      await anyBoneEntry.click({ force: true }).catch(() => {});
      await page.waitForTimeout(60);
      await expect(page.getByTestId('status-text')).toContainText(/Selected:/i);
    }

    // Canvas/raycast click for 3D select
    const canvas = page.getByTestId('three-canvas');
    await canvas.click({ position: { x: 60, y: 60 } });
    await page.waitForTimeout(80);
    await expect(page.getByTestId('status-text')).toContainText(/Selected:/i);

    // Confirm inspector reflects bones (rig info indirectly via count)
    await expect(inspector).toContainText(/Bones \(\d+\)/i);
  });
});
