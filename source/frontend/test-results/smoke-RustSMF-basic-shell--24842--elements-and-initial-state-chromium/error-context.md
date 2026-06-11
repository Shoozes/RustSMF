# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> RustSMF basic shell and model flow (Chromium) >> app boots with expected UI elements and initial state
- Location: tests\smoke.spec.ts:38:3

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByTestId('status-text')
Expected substring: "Viewport ready"
Received string:    "Three.js viewport ready (Y-up). Open .smf/.glb/.fbx. SMF/GLB export (FBX limited)."
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for getByTestId('status-text')
    14 × locator resolved to <div data-testid="status-text" class="absolute bottom-2 left-2 text-[10px] px-2 py-0.5 rounded pointer-events-none bg-black/50 text-slate-300">Three.js viewport ready (Y-up). Open .smf/.glb/.f…</div>
       - unexpected value "Three.js viewport ready (Y-up). Open .smf/.glb/.fbx. SMF/GLB export (FBX limited)."

```

```yaml
- text: Three.js viewport ready (Y-up). Open .smf/.glb/.fbx. SMF/GLB export (FBX limited).
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import path from 'path';
  3   | 
  4   | // Basic smoke tests for the RustSMF shell + model loading.
  5   | // These exercise the core Three.js viewport, loaders, timeline, and export paths.
  6   | // For full visual regression of skinned models + animation, add screenshot comparisons
  7   | // after loading a reference .smf (see roundtrip backlog item).
  8   | 
  9   | // Use any real .smf from the reference collection for model load smoke.
  10  | // The exact filename may vary; we pick the first .smf we can find at runtime.
  11  | import fs from 'fs';
  12  | import { fileURLToPath } from 'url';
  13  | import { dirname } from 'path';
  14  | 
  15  | const __filename = fileURLToPath(import.meta.url);
  16  | const __dirname = dirname(__filename);
  17  | 
  18  | const SMF_DIR = path.resolve(__dirname, '../../docs/references/old-src/datafiles/SMF');
  19  | const SAMPLE_SMF = fs.existsSync(SMF_DIR)
  20  |   ? fs.readdirSync(SMF_DIR).find(f => f.endsWith('.smf'))
  21  |     ? path.join(SMF_DIR, fs.readdirSync(SMF_DIR).find(f => f.endsWith('.smf'))!)
  22  |     : null
  23  |   : null;
  24  | 
  25  | test.describe('RustSMF basic shell and model flow (Chromium)', () => {
  26  |   test.beforeEach(async ({ page }) => {
  27  |     // Capture browser console errors and warnings during tests (for Chrome/Playwright)
  28  |     page.on('console', msg => {
  29  |       const type = msg.type();
  30  |       if (type === 'error' || type === 'warning') {
  31  |         console.log(`[BROWSER ${type.toUpperCase()}] ${msg.text()}`);
  32  |       }
  33  |     });
  34  |     page.on('pageerror', err => {
  35  |       console.error(`[PAGE ERROR] ${err}`);
  36  |     });
  37  |   });
  38  |   test('app boots with expected UI elements and initial state', async ({ page }) => {
  39  |     await page.goto('/');
  40  | 
  41  |     // Initial status
> 42  |     await expect(page.getByTestId('status-text')).toContainText('Viewport ready');
      |                                                   ^ Error: expect(locator).toContainText(expected) failed
  43  | 
  44  |     // Key controls
  45  |     await expect(page.getByTestId('open-model-btn')).toBeVisible();
  46  |     await expect(page.getByTestId('export-btn')).toBeVisible();
  47  |     await expect(page.getByTestId('ping-rust-btn')).toBeVisible();
  48  | 
  49  |     // Viewport + canvas
  50  |     await expect(page.getByTestId('viewport-container')).toBeVisible();
  51  |     await expect(page.getByTestId('three-canvas')).toBeVisible();
  52  | 
  53  |     // Timeline and outliner present
  54  |     await expect(page.getByTestId('timeline')).toBeVisible();
  55  |     await expect(page.getByTestId('outliner')).toBeVisible();
  56  |   });
  57  | 
  58  |   test('can load a real SMF sample and basic UI updates', async ({ page }) => {
  59  |     test.skip(!SAMPLE_SMF, 'No .smf sample found in reference datafiles – adjust SAMPLE_SMF path');
  60  | 
  61  |     await page.goto('/');
  62  | 
  63  |     // Use the persistent hidden input (added for e2e) – setInputFiles triggers onChange
  64  |     // which calls loadModel directly. This bypasses the dynamic openFile() for reliability.
  65  |     const input = page.getByTestId('model-file-input');
  66  |     await input.setInputFiles(SAMPLE_SMF!);
  67  | 
  68  |     // Wait for load to finish (status changes and no longer says "Loading")
  69  |     await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
  70  | 
  71  |     // After load we should see some model info in status (bones, clips, verts etc.)
  72  |     await expect(page.getByTestId('status-text')).toContainText(/Loaded|bones|clips/i);
  73  | 
  74  |     // Outliner should reflect content
  75  |     await expect(page.getByTestId('outliner')).toContainText(/Scene Root|Bone|Mesh/i);
  76  | 
  77  |     // Timeline should be enabled / have content
  78  |     await expect(page.getByTestId('timeline')).toBeVisible();
  79  | 
  80  |     // Inspector and outliner should reflect content after load
  81  |     await expect(page.getByTestId('inspector')).toBeVisible();
  82  |     await expect(page.getByTestId('inspector')).toContainText(/Clips|Selected/i);
  83  | 
  84  |     // Canvas still there (Three.js kept rendering)
  85  |     await expect(page.getByTestId('three-canvas')).toBeVisible();
  86  |   });
  87  | 
  88  |   test('export flow and basic visuals (smoke for roundtrip prep)', async ({ page }) => {
  89  |     test.skip(!SAMPLE_SMF, 'No .smf sample found in reference datafiles');
  90  | 
  91  |     await page.goto('/');
  92  | 
  93  |     const input = page.getByTestId('model-file-input');
  94  |     await input.setInputFiles(SAMPLE_SMF!);
  95  | 
  96  |     await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
  97  |     await expect(page.getByTestId('status-text')).toContainText(/Loaded|bones|clips/i);
  98  | 
  99  |     // Test export: click, check status for success message (download is blob, hard to reimport here but status confirms)
  100 |     const exportBtn = page.getByTestId('export-btn');
  101 |     await exportBtn.click();
  102 |     await expect(page.getByTestId('status-text')).toContainText(/Exported .smf/i, { timeout: 5000 });
  103 | 
  104 |     // Basic visual: screenshot viewport after load (for regression; update snapshots with --update-snapshots)
  105 |     await expect(page.getByTestId('viewport-container')).toHaveScreenshot('loaded-model.png', { timeout: 10000 });
  106 |   });
  107 | 
  108 |   test('timeline scrub, clip change, loading overlay, and error banner (extended controls + UX)', async ({ page }) => {
  109 |     test.skip(!SAMPLE_SMF, 'No .smf sample found in reference datafiles – adjust SAMPLE_SMF path');
  110 | 
  111 |     await page.goto('/');
  112 | 
  113 |     // Error banner element should be in DOM (even if not shown)
  114 |     await expect(page.getByTestId('error-banner')).toBeAttached();
  115 | 
  116 |     const input = page.getByTestId('model-file-input');
  117 |     await input.setInputFiles(SAMPLE_SMF!);
  118 | 
  119 |     await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
  120 |     await expect(page.getByTestId('status-text')).toContainText(/Loaded|bones|clips/i);
  121 | 
  122 |     // Loading overlay should not be visible after load
  123 |     await expect(page.getByTestId('loading-overlay')).toBeHidden();
  124 | 
  125 |     // Scrub slider present and interactive (set value; no crash + still renders)
  126 |     const slider = page.getByTestId('scrub-slider');
  127 |     await expect(slider).toBeVisible();
  128 |     await expect(slider).toBeEnabled();
  129 |     // Drive the scrub (Playwright range .fill works for value update)
  130 |     await slider.fill('0.5');
  131 |     // Give RAF a tick for any internal update
  132 |     await page.waitForTimeout(120);
  133 |     // Stronger assert: time display updated (uses data-testid)
  134 |     await expect(page.getByTestId('time-display')).toContainText(/0\.5|0\.50/);
  135 | 
  136 |     // Clip list items: click first clip (if present) and assert no crash / UI still live
  137 |     const firstClip = page.getByTestId('clip-item-0');
  138 |     if (await firstClip.count() > 0) {
  139 |       await firstClip.click();
  140 |       await page.waitForTimeout(80);
  141 |       // Status or timeline should still be sensible
  142 |       await expect(page.getByTestId('timeline')).toBeVisible();
```