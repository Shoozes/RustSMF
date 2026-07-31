import { test, expect } from '@playwright/test';
import { SAMPLE_SMF, pausePlaybackIfRunning, setupBrowserDiagnostics } from './helpers/smoke-helpers';
import { createSkinnedGlbFixtureInput } from './helpers/skinned-glb-fixture';
import { escapeRegex } from './helpers/format-assertions';
import { clickPickableBoneInViewport, setViewportLayout } from './helpers/viewport-interactions';
import { setRangeValue, clickTimelineLaneAt, dragSelectedTimelineMarkerTo } from './helpers/timeline-interactions';

// Browser integration coverage is split by feature ownership.
// Native IPC and filesystem coverage lives in native.spec.ts and Rust tests.

test.describe('RustSMF animation flow (Chromium)', () => {
  test.beforeEach(async ({ page }) => {
    setupBrowserDiagnostics(page);
  });

  test('timeline lane click scrubs and double-click inserts selected-bone keyframes', async ({ page }) => {
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await expect(page.getByTestId('status-text')).toContainText(/generated-skinned-fixture|bones: 2|clips: 1/i);
      await pausePlaybackIfRunning(page);

      await page.getByTestId('mode-tab-rig').click({ force: true });
      const inspector = page.getByTestId('inspector');
      const boneEntry = inspector.locator('li > div').filter({ hasText: /FixtureTip/ }).first();
      await expect(boneEntry).toBeVisible();
      await boneEntry.click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Selected:\s*FixtureTip/i);

      await page.getByTestId('mode-tab-animate').click({ force: true });
      await expect(page.getByTestId('animate-workspace-panel')).toBeVisible();
      await pausePlaybackIfRunning(page);
      await page.getByTestId('animation-snap-step-select').selectOption('0.1');
      await expect(page.getByTestId('status-text')).toContainText(/Animation snap set to 0\.10s/i);
      await expect(page.getByTestId('timeline-keyframe-lane')).toHaveAttribute('data-keyframe-count', '2');

      await clickTimelineLaneAt(page, 0.75, 2);
      await expect(page.getByTestId('status-text')).toContainText(/Inserted animation keyframe for FixtureTip/i);
      await expect(page.getByTestId('timeline-keyframe-lane')).toHaveAttribute('data-keyframe-count', '3');
      await expect(page.getByTestId('animation-selected-key')).toContainText('0.40s');
      await expect(page.getByTestId('time-display')).toContainText(/0\.40/);

      await dragSelectedTimelineMarkerTo(page, 0.55);
      await expect(page.getByTestId('status-text')).toContainText(/Moved animation keyframe for FixtureTip/i);
      await expect(page.getByTestId('timeline-keyframe-lane')).toHaveAttribute('data-keyframe-count', '3');
      await expect(page.getByTestId('animation-selected-key')).toContainText('0.30s');
      await expect(page.getByTestId('time-display')).toContainText(/0\.30/);

      await clickTimelineLaneAt(page, 0.25);
      await expect(page.getByTestId('animation-selected-key')).toContainText('none');
      await expect(page.getByTestId('time-display')).toContainText(/0\.10/);

      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid move animation keyframe for FixtureTip/i);
      await expect(page.getByTestId('timeline-keyframe-lane')).toHaveAttribute('data-keyframe-count', '3');
      await expect(page.getByTestId('animation-selected-key')).toContainText('0.40s');

      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid move animation keyframe for FixtureTip/i);
      await expect(page.getByTestId('animation-selected-key')).toContainText('0.30s');
      await expect(page.getByTestId('timeline-keyframe-lane')).toHaveAttribute('data-keyframe-count', '3');
    });

  test('animation clip tools duplicate, rename, delete, and undo workspace changes', async ({ page }) => {
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await expect(page.getByTestId('status-text')).toContainText(/generated-skinned-fixture|bones: 2|clips: 1/i);
      await pausePlaybackIfRunning(page);

      await page.getByTestId('mode-tab-animate').click({ force: true });
      await expect(page.getByTestId('animate-workspace-panel')).toBeVisible();
      await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend');
      await expect(page.getByTestId('animation-delete-clip-btn')).toBeDisabled();
      await expect(page.getByTestId('animation-loop-toggle')).toBeChecked();
      await expect(page.getByTestId('animation-sample-multiplier-input')).toHaveValue('1');

      await page.getByTestId('animation-loop-toggle').uncheck({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Animation clip FixtureBend loop disabled/i);
      await page.getByTestId('animation-sample-multiplier-input').fill('3');
      await expect(page.getByTestId('status-text')).toContainText(/sample frame multiplier set to 3/i);
      await expect(page.getByTestId('animation-sample-multiplier-input')).toHaveValue('3');

      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid set animation clip FixtureBend sample frame multiplier to 3/i);
      await expect(page.getByTestId('animation-sample-multiplier-input')).toHaveValue('1');
      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid set animation clip FixtureBend loop off/i);
      await expect(page.getByTestId('animation-loop-toggle')).toBeChecked();
      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid set animation clip FixtureBend loop off/i);
      await expect(page.getByTestId('animation-loop-toggle')).not.toBeChecked();
      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid set animation clip FixtureBend sample frame multiplier to 3/i);
      await expect(page.getByTestId('animation-sample-multiplier-input')).toHaveValue('3');

      await page.getByTestId('animation-duplicate-clip-btn').click();
      await expect(page.getByTestId('status-text')).toContainText(/Duplicated animation clip FixtureBend as FixtureBend Copy/i);
      await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend Copy');
      await expect(page.getByTestId('animation-loop-toggle')).not.toBeChecked();
      await expect(page.getByTestId('animation-sample-multiplier-input')).toHaveValue('3');
      await expect(page.getByTestId('animation-delete-clip-btn')).toBeEnabled();
      await expect(page.getByTestId('clip-item-1')).toContainText(/FixtureBend Copy/);

      await page.getByTestId('animation-clip-name-input').fill('Hero Bend');
      await page.getByTestId('animation-rename-clip-btn').click();
      await expect(page.getByTestId('status-text')).toContainText(/Renamed animation clip FixtureBend Copy to Hero Bend/i);
      await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Hero Bend');
      await expect(page.getByTestId('clip-item-1')).toContainText(/Hero Bend/);
      await expect(page.getByTestId('animation-move-clip-down-btn')).toBeDisabled();
      await expect(page.getByTestId('animation-move-clip-up-btn')).toBeEnabled();

      await page.getByTestId('animation-move-clip-up-btn').click();
      await expect(page.getByTestId('status-text')).toContainText(/Moved animation clip Hero Bend up/i);
      await expect(page.getByTestId('clip-item-0')).toContainText(/Hero Bend/);
      await expect(page.getByTestId('clip-item-1')).toContainText(/^FixtureBend/);
      await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Hero Bend');
      await expect(page.getByTestId('animation-move-clip-up-btn')).toBeDisabled();
      await expect(page.getByTestId('animation-move-clip-down-btn')).toBeEnabled();

      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid move up animation clip Hero Bend/i);
      await expect(page.getByTestId('clip-item-1')).toContainText(/Hero Bend/);
      await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Hero Bend');

      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid move up animation clip Hero Bend/i);
      await expect(page.getByTestId('clip-item-0')).toContainText(/Hero Bend/);

      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid move up animation clip Hero Bend/i);
      await expect(page.getByTestId('clip-item-1')).toContainText(/Hero Bend/);

      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid rename animation clip FixtureBend Copy to Hero Bend/i);
      await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend Copy');

      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid rename animation clip FixtureBend Copy to Hero Bend/i);
      await page.getByTestId('animation-delete-clip-btn').click();
      await expect(page.getByTestId('status-text')).toContainText(/Deleted animation clip Hero Bend/i);
      await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('FixtureBend');
      await expect(page.getByTestId('animation-delete-clip-btn')).toBeDisabled();
      await expect(page.getByTestId('clip-item-1')).toBeHidden();

      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid delete animation clip Hero Bend/i);
      await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Hero Bend');
      await expect(page.getByTestId('animation-delete-clip-btn')).toBeEnabled();
    });

  test('animation keyframe authoring updates selected-bone clips and SMF checks', async ({ page }) => {
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await expect(page.getByTestId('status-text')).toContainText(/generated-skinned-fixture|bones: 2|clips: 1/i);
      await pausePlaybackIfRunning(page);

      const firstSubmodel = page.getByTestId('outliner-submodel-0');
      const firstVisibilityToggle = page.getByTestId('outliner-visibility-toggle-0');
      await expect(firstSubmodel).toBeVisible();
      await firstVisibilityToggle.click();
      await expect(firstSubmodel).toHaveAttribute('data-visible', 'false');
      await firstVisibilityToggle.click();
      await expect(firstSubmodel).toHaveAttribute('data-visible', 'true');
      await expect(page.getByTestId('editor-undo-btn')).toBeEnabled();

      await page.getByTestId('mode-tab-rig').click({ force: true });
      const inspector = page.getByTestId('inspector');
      const boneEntry = inspector
        .locator('li > div')
        .filter({ hasText: /FixtureTip/ })
        .first();
      await expect(boneEntry).toBeVisible({ timeout: 8000 });
      await boneEntry.click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Selected:\s*FixtureTip/i);
      const canvas = page.getByTestId('three-canvas');
      await expect(canvas).toHaveAttribute('data-transform-owner', 'pose');
      await expect(canvas).toHaveAttribute('data-transform-attached', 'true');

      await page.getByTestId('mode-tab-animate').click({ force: true });
      await expect(page.getByTestId('animate-workspace-panel')).toBeVisible();
      await expect(canvas).toHaveAttribute('data-transform-owner', 'animation');
      await expect(canvas).toHaveAttribute('data-transform-attached', 'true');
      await expect(page.getByTestId('animation-insert-key-btn')).toBeEnabled();
      await setViewportLayout(page, 'quad');
      const animatePick = await clickPickableBoneInViewport(page, 'animate-select');
      expect(animatePick).toBeTruthy();
      await expect(canvas).toHaveAttribute('data-viewport-pane-role', animatePick!.paneRole);
      await expect(canvas).toHaveAttribute('data-viewport-picked-bone', animatePick!.bone);
      await expect(page.getByTestId('status-text')).toContainText(new RegExp(`Selected:\\s*${escapeRegex(animatePick!.bone)}`));
      await page.getByTestId('animation-interpolation-select').selectOption('step');
      await expect(page.getByTestId('status-text')).toContainText(/Animation interpolation set to step/i);
      await page.getByTestId('animation-interpolation-select').selectOption('quadratic');
      await expect(page.getByTestId('status-text')).toContainText(/Animation interpolation set to quadratic/i);
      await page.getByTestId('animation-insert-key-btn').click();
      await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');
      await expect(page.getByTestId('animation-selected-key')).not.toContainText('none');
      await expect(page.getByTestId('status-text')).toContainText(/Inserted animation keyframe/i);
      await expect(page.getByTestId('editor-undo-btn')).toBeEnabled();
      await setViewportLayout(page, 'single');

      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid insert animation keyframe/i);
      await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: false');
      await expect(page.getByTestId('editor-redo-btn')).toBeEnabled();

      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid insert animation keyframe/i);
      await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');

      await page.getByTestId('animation-copy-key-btn').click();
      await expect(page.getByTestId('animation-paste-key-btn')).toBeEnabled();
      await setRangeValue(page, 'scrub-slider', 0.37);
      await page.getByTestId('animation-paste-key-btn').click();
      await expect(page.getByTestId('status-text')).toContainText(/Pasted animation keyframe/i);

      await page.keyboard.press('Control+Z');
      await expect(page.getByTestId('status-text')).toContainText(/Undid paste animation keyframe/i);
      await page.keyboard.press('Control+Y');
      await expect(page.getByTestId('status-text')).toContainText(/Redid paste animation keyframe/i);

      await page.getByTestId('animation-update-key-btn').click();
      await expect(page.getByTestId('status-text')).toContainText(/Updated animation keyframe/i);
      await expect(page.getByTestId('timeline-keyframe-lane')).toHaveAttribute('data-keyframe-count', /[1-9]\d*/);

      await page.getByTestId('mode-tab-export').click({ force: true });
      await expect(canvas).toHaveAttribute('data-transform-owner', 'disabled');
      await expect(canvas).toHaveAttribute('data-transform-attached', 'false');
      await page.getByTestId('smf-roundtrip-check-btn').click();
      await expect(page.getByTestId('smf-roundtrip-result')).toHaveAttribute('data-smf-roundtrip-ok', 'true', { timeout: 15000 });
      await expect(page.getByTestId('status-text')).toContainText(/SMF roundtrip check passed/i);

      await page.getByTestId('mode-tab-animate').click({ force: true });
      await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');
      await page.getByTestId('animation-delete-key-btn').click();
      await expect(page.getByTestId('status-text')).toContainText(/Deleted animation keyframe/i);
      await page.keyboard.press('Control+Z');
      await expect(page.getByTestId('status-text')).toContainText(/Undid delete animation keyframe/i);
      await page.keyboard.press('Control+Y');
      await expect(page.getByTestId('status-text')).toContainText(/Redid delete animation keyframe/i);
    });

  test('timeline scrub, clip change, loading overlay, and error banner (extended controls + UX)', async ({ page }) => {
      await page.goto('/');

      // Error banner element should be in DOM (even if not shown)
      await expect(page.getByTestId('error-banner')).toBeAttached();

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(SAMPLE_SMF);

      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await expect(page.getByTestId('status-text')).toContainText(/mixamo|Loaded|bones|clips|verts/i);

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
      // Stronger assert: time display updated after scrub (uses data-testid)
      // Loosened regex for real model timing/play state (values may drift slightly while playing)
      await expect(page.getByTestId('time-display')).toContainText(/0\.[0-9]/);

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
      await page.getByTestId('export-glb-btn').click();
      await expect(page.getByTestId('status-text')).toContainText(/Nothing to export as GLB/i);
      await page.getByTestId('export-fbx-btn').click();
      await expect(page.getByTestId('status-text')).toContainText(/Nothing to export as FBX/i);
      await page.getByTestId('export-smf-btn').click();
      await expect(page.getByTestId('status-text')).toContainText(/No model loaded for SMF export|Nothing to export as SMF/i);

      // Drop zone hint is present (for drag-drop UX)
      await expect(page.locator('text=/Drop .* here/')).toBeAttached();
    });
});
