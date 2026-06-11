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

    // Canvas still there (Three.js kept rendering)
    await expect(page.getByTestId('three-canvas')).toBeVisible();
  });

  test('export button is present and clickable (smoke)', async ({ page }) => {
    await page.goto('/');
    const exportBtn = page.getByTestId('export-btn');
    await expect(exportBtn).toBeVisible();
    // Just ensure it doesn't crash on click (actual download behavior is hard to assert without extra setup)
    await exportBtn.click();
  });
});
