import { test, expect } from '@playwright/test';
import { pausePlaybackIfRunning, setupBrowserDiagnostics } from './helpers/smoke-helpers';
import { createSkinnedGlbFixtureInput } from './helpers/skinned-glb-fixture';
import { parseSelectedBone } from './helpers/format-assertions';
import { cancelPaintOnMeshInViewport, hoverPickableBoneInViewport, paintInViewport, paintOnMeshInViewport, setViewportLayout } from './helpers/viewport-interactions';
import { setRangeValue } from './helpers/timeline-interactions';
import { clickSecondaryCommand, showModernPanel, showSkinAdvanced } from './helpers/modern-shell';

// Browser integration coverage is split by feature ownership.
// Native IPC and filesystem coverage lives in native.spec.ts and Rust tests.

test.describe('RustSMF skin flow (Chromium)', () => {
  test.beforeEach(async ({ page }) => {
    setupBrowserDiagnostics(page);
  });

  test('skin paint is disabled without bone selection', async ({ page }) => {
      await page.goto('/');

      await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await pausePlaybackIfRunning(page);

      await page.getByTestId('mode-tab-skin').click({ force: true });
      await expect(page.getByTestId('skin-workspace-panel')).toBeVisible();
      await expect(page.getByTestId('modern-skin-tool-pick')).toHaveAttribute('aria-pressed', 'true');
      await showSkinAdvanced(page);
      await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: false');
      await page.getByTestId('modern-panel-close').click();

      const canvas = page.getByTestId('three-canvas');
      await expect(page.getByTestId('skin-workspace-panel')).toHaveAttribute('data-active-tool', 'pick');
      await expect(page.getByTestId('modern-skin-tool-paint')).toBeDisabled();
      await expect(page.getByTestId('modern-skin-tool-smooth')).toBeEnabled();
      await page.keyboard.press('s');
      await expect(page.getByTestId('skin-workspace-panel')).toHaveAttribute('data-active-tool', 'smooth');
      await page.getByTestId('modern-skin-advanced').click();
      await expect(page.getByTestId('skin-paint-mode-smooth')).toHaveClass(/bg-emerald-500/);
      await page.getByTestId('modern-panel-close').click();
      await page.keyboard.press('q');
      await expect(canvas).not.toHaveAttribute('data-skin-brush-hover', 'active');
      const noBoneHitCount = Number(await canvas.getAttribute('data-skin-paint-hit-count'));
      expect(noBoneHitCount).toBe(0);
      expect(await canvas.getAttribute('data-skin-brush-x')).toBe(null);

      const reason = page.getByTestId('skin-export-block');
      await expect(reason).toHaveCount(0);
      await clickSecondaryCommand(page, 'export-smf-btn');
      await expect(page.getByTestId('status-text')).toContainText(/Exported \.smf/i, { timeout: 5000 });
    });

  test('modern Skin stays canvas-first and keeps expert controls behind Advanced', async ({ page }) => {
      await page.goto('/');
      await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });

      await page.getByTestId('mode-tab-skin').click();
      const workspace = page.getByTestId('skin-workspace-panel');
      await expect(workspace).toBeVisible();
      await expect(workspace).toHaveAttribute('data-active-tool', 'pick');
      await expect(page.getByTestId('modern-support-panel')).toHaveCount(0);
      await expect(page.getByTestId('modern-skin-float')).toContainText('Choose a bone');
      await expect(page.getByTestId('modern-skin-tool-paint')).toBeDisabled();

      const hit = await hoverPickableBoneInViewport(page);
      expect(hit).not.toBeNull();
      await page.mouse.click(hit!.x, hit!.y);
      await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-viewport-picked-bone', hit!.bone);
      await expect(workspace).toHaveAttribute('data-active-tool', 'paint');
      await expect(page.getByTestId('modern-skin-float')).not.toContainText('Choose a bone');

      await page.getByTestId('modern-skin-advanced').click();
      await expect(page.getByTestId('skin-advanced-panel')).toBeVisible();
      await expect(page.getByTestId('inspector-selected')).toHaveText(hit!.bone);
      await page.getByTestId('modern-panel-close').click();
      await expect(page.getByTestId('modern-skin-tool-paint')).toBeEnabled();

      await page.keyboard.press('p');
      await expect(workspace).toHaveAttribute('data-active-tool', 'paint');
      await page.keyboard.press('e');
      await expect(workspace).toHaveAttribute('data-active-tool', 'erase');
      await page.keyboard.press('s');
      await expect(workspace).toHaveAttribute('data-active-tool', 'smooth');
      await page.getByTestId('modern-skin-advanced').click();
      await expect(page.getByTestId('skin-paint-mode-smooth')).toHaveClass(/bg-emerald-500/);
      await page.getByTestId('modern-panel-close').click();
      await page.keyboard.press('q');
      await expect(workspace).toHaveAttribute('data-active-tool', 'pick');

      const overflow = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
      }));
      expect(overflow.document).toBeLessThanOrEqual(1);
      expect(overflow.body).toBeLessThanOrEqual(1);
    });

  test('skin paint pointer cancel clears active gesture state', async ({ page }) => {
      await page.goto('/');

      await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await pausePlaybackIfRunning(page);

      await page.getByTestId('mode-tab-skin').click({ force: true });
      await expect(page.getByTestId('skin-workspace-panel')).toBeVisible();
      await showSkinAdvanced(page);

      const inspector = page.getByTestId('inspector');
      const bone = inspector.locator('li > div').filter({ hasText: /FixtureTip/ }).first();
      await expect(bone).toBeVisible();
      await bone.click({ force: true });
      await expect(page.getByTestId('inspector-selected')).toHaveText('FixtureTip');

      await page.getByTestId('skin-paint-mode-add').click({ force: true }).catch(() => {});
      await setRangeValue(page, 'skin-paint-target', 1);
      await setRangeValue(page, 'skin-paint-radius', 1);
      await setRangeValue(page, 'skin-paint-strength', 1);

      const canvas = page.getByTestId('three-canvas');
      expect(await cancelPaintOnMeshInViewport(page, { requireDirty: true })).toBe(true);
      await expect(canvas).toHaveAttribute('data-pointer-owner', 'skin-paint');
      expect(await canvas.getAttribute('data-pointer-owner')).not.toBe('orbit');
      await expect(canvas).not.toHaveAttribute('data-skin-paint-active', 'active');
      await expect(page.getByTestId('inspector-selected')).toHaveText('FixtureTip');
      await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true');

      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: false');
      await expect(page.getByTestId('inspector-selected')).toHaveText('FixtureTip');
    });

  test('skin Set mode exposes target weight, flow, and falloff to the brush contract', async ({ page }) => {
      await page.goto('/');

      await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await pausePlaybackIfRunning(page);

      await page.getByTestId('mode-tab-skin').click({ force: true });
      await showSkinAdvanced(page);
      const inspector = page.getByTestId('inspector');
      const bone = inspector.locator('li > div').filter({ hasText: /FixtureRoot/ }).first();
      await expect(bone).toBeVisible();
      await bone.click({ force: true });

      await page.getByTestId('skin-paint-mode-set').click({ force: true });
      await setRangeValue(page, 'skin-paint-target', 0.35);
      await setRangeValue(page, 'skin-paint-strength', 0.5);
      await setRangeValue(page, 'skin-paint-falloff', 2);
      await expect(page.getByTestId('skin-paint-target')).toHaveValue('0.35');
      await expect(page.getByTestId('skin-paint-strength')).toHaveValue('0.5');
      await expect(page.getByTestId('skin-paint-falloff')).toHaveValue('2');

      const canvas = page.getByTestId('three-canvas');
      expect(await paintOnMeshInViewport(page, { requireDirty: true })).toBe(true);
      await expect(canvas).toHaveAttribute('data-skin-paint-mode', 'set');
      await expect(canvas).toHaveAttribute('data-skin-paint-target-weight', '0.35');
      await expect(canvas).toHaveAttribute('data-skin-paint-strength', '0.5');
      await expect(canvas).toHaveAttribute('data-skin-paint-falloff', '2');
      await expect(page.getByTestId('status-text')).toContainText(/set mode/i);
      await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true');
    });

  test('skin paint updates edit state and exports SMF', async ({ page }) => {
      await page.goto('/');

      await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await pausePlaybackIfRunning(page);

      const skinTab = page.getByTestId('mode-tab-skin');
      await skinTab.click({ force: true });
      await expect(skinTab).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByTestId('skin-workspace-panel')).toBeVisible();
      await showSkinAdvanced(page);

      const inspector = page.getByTestId('inspector');
      const bone = inspector.locator('li > div').filter({ hasText: /FixtureRoot/ }).first();
      await expect(bone).toBeVisible();
      await bone.click({ force: true });
      await page.waitForTimeout(50);
      await expect(page.getByTestId('status-text')).toContainText(/Selected:\s*FixtureRoot/i);
      const selectedInspectorValue = page.getByTestId('inspector-selected');
      await expect(selectedInspectorValue).toHaveText('FixtureRoot');
      const paintCanvas = page.getByTestId('three-canvas');
      await expect(paintCanvas).toHaveAttribute('data-transform-owner', 'disabled');
      await expect(paintCanvas).toHaveAttribute('data-transform-attached', 'false');

      await page.getByTestId('skin-paint-mode-add').click({ force: true }).catch(() => {});
      await expect(page.getByTestId('skin-paint-mode-add')).toHaveClass(/bg-emerald-500/);
      await setRangeValue(page, 'skin-paint-target', 1);
      await setRangeValue(page, 'skin-paint-radius', 1);
      await setRangeValue(page, 'skin-paint-strength', 1);
      await expect(page.getByTestId('skin-paint-target')).toHaveValue('1');
      await expect(page.getByTestId('skin-paint-radius')).toHaveValue('1');
      await expect(page.getByTestId('skin-paint-strength')).toHaveValue('1');

      const canvasBox = await paintCanvas.boundingBox();
      expect(canvasBox).toBeTruthy();
      await paintInViewport(page, {
        x: canvasBox!.x + 8,
        y: canvasBox!.y + 8,
        dx: 4,
        dy: 4,
      });
      await expect(paintCanvas).toHaveAttribute('data-pointer-owner', 'skin-paint');
      await expect(paintCanvas).toHaveAttribute('data-skin-brush-hover', 'inactive');
      expect(Number(await paintCanvas.getAttribute('data-skin-paint-hit-count'))).toBe(0);
      expect(await paintCanvas.getAttribute('data-skin-brush-x')).toBe(null);
      await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: false');
      await expect(selectedInspectorValue).toHaveText('FixtureRoot');

      await setViewportLayout(page, 'quad');
      expect(await paintOnMeshInViewport(page, { requireDirty: true })).toBe(true);
      await expect(paintCanvas).toHaveAttribute('data-pointer-owner', 'skin-paint');
      await expect(paintCanvas).toHaveAttribute('data-viewport-pane-role', /top|perspective|front|side/);
      expect(await paintCanvas.getAttribute('data-pointer-owner')).not.toBe('orbit');
      await expect(selectedInspectorValue).toHaveText('FixtureRoot');
      await expect(paintCanvas).toHaveAttribute('data-skin-paint-mode', 'add');
      await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true');
      await expect(page.getByTestId('skin-paint-undo-btn')).toBeEnabled();
      await expect(page.getByTestId('skin-paint-redo-btn')).toBeDisabled();
      await expect(page.getByTestId('editor-undo-btn')).toBeEnabled();
      await expect(page.getByTestId('editor-redo-btn')).toBeDisabled();
      await setViewportLayout(page, 'single');

      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid skin edit/i);
      await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: false');
      await expect(page.getByTestId('skin-paint-undo-btn')).toBeDisabled();
      await expect(page.getByTestId('skin-paint-redo-btn')).toBeEnabled();
      await expect(page.getByTestId('editor-redo-btn')).toBeEnabled();

      await page.keyboard.press('Control+Y');
      await expect(page.getByTestId('status-text')).toContainText(/Redid skin edit/i);
      await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true');
      await expect(page.getByTestId('skin-paint-undo-btn')).toBeEnabled();

      await page.getByTestId('skin-autoskin-algorithm').selectOption('closest-two-segments');
      await page.getByTestId('skin-paint-mode-auto').click({ force: true }).catch(() => {});
      await expect(page.getByTestId('skin-paint-mode-auto')).toHaveClass(/bg-emerald-500/);
      await page.getByTestId('skin-paint-target-mode').selectOption('vertex');
      await setRangeValue(page, 'skin-paint-radius', 0.35);
      await setRangeValue(page, 'skin-paint-strength', 1);
      expect(await paintOnMeshInViewport(page)).toBe(true);
      await expect(paintCanvas).toHaveAttribute('data-skin-paint-mode', 'auto');
      await expect(paintCanvas).toHaveAttribute('data-skin-paint-target-mode', 'vertex');
      const autoPaintHitCount = Number(await paintCanvas.getAttribute('data-skin-paint-hit-count'));
      const autoPaintCandidateCount = Number(await paintCanvas.getAttribute('data-skin-candidate-count'));
      const autoPaintTotalVertexCount = Number(await paintCanvas.getAttribute('data-skin-total-vertex-count'));
      expect(autoPaintHitCount).toBeGreaterThan(0);
      expect(autoPaintCandidateCount).toBeGreaterThan(0);
      expect(autoPaintTotalVertexCount).toBeGreaterThan(autoPaintCandidateCount);
      await expect(page.getByTestId('status-text')).toContainText(/auto Closest two segments mode/i);
      await page.keyboard.press('Control+Z');
      await expect(page.getByTestId('status-text')).toContainText(/Undid skin edit/i);
      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid skin edit/i);

      await page.getByTestId('skin-autoskin-algorithm').selectOption('nearest-segment');
      await expect(page.getByTestId('skin-autoskin-power')).toBeDisabled();
      await expect(page.getByTestId('skin-autoskin-normal-weighting')).toBeDisabled();
      await expect(page.getByTestId('skin-autoskin-max-influences')).toBeDisabled();
      await page.getByTestId('skin-autoskin-algorithm').selectOption('segment-distance-normal');
      await setRangeValue(page, 'skin-autoskin-power', 3);
      await setRangeValue(page, 'skin-autoskin-normal-weighting', 0.5);
      await setRangeValue(page, 'skin-autoskin-max-influences', 2);
      await expect(page.getByTestId('skin-autoskin-power')).toHaveValue('3');
      await expect(page.getByTestId('skin-autoskin-normal-weighting')).toHaveValue('0.5');
      await expect(page.getByTestId('skin-autoskin-max-influences')).toHaveValue('2');
      await page.getByTestId('skin-autoskin-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Auto skin/i);
      await expect(page.getByTestId('status-text')).toContainText(/power 3, normal 0.5, max 2/i);
      await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true');
      await expect(page.getByTestId('skin-paint-undo-btn')).toBeEnabled();

      await page.keyboard.press('Control+Z');
      await expect(page.getByTestId('status-text')).toContainText(/Undid skin edit/i);
      await expect(page.getByTestId('skin-paint-redo-btn')).toBeEnabled();
      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid skin edit/i);
      await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true');

      await clickSecondaryCommand(page, 'export-smf-btn');
      await expect(page.getByTestId('status-text')).toContainText(/Exported \.smf/i, { timeout: 5000 });
      await expect(page.getByTestId('skin-export-block')).toHaveCount(0);
    });

  test('skin brush state clears when switching workspaces', async ({ page }) => {
      await page.goto('/');

      await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await pausePlaybackIfRunning(page);

      const skinTab = page.getByTestId('mode-tab-skin');
      await skinTab.click({ force: true });
      await expect(skinTab).toHaveAttribute('aria-selected', 'true');
      await showSkinAdvanced(page);
      const inspector = page.getByTestId('inspector');
      const bone = inspector.locator('li > div').filter({ hasText: /FixtureTip/ }).first();
      await expect(bone).toBeVisible();
      await bone.click({ force: true });
      await page.waitForTimeout(50);

      const statusText = await page.getByTestId('status-text').textContent();
      const selectedBone = parseSelectedBone(statusText);
      expect(selectedBone).toBe('FixtureTip');

      await page.getByTestId('skin-paint-mode-subtract').click({ force: true }).catch(() => {});
      await setRangeValue(page, 'skin-paint-radius', 1);
      await setRangeValue(page, 'skin-paint-strength', 1);
      const paintCanvas = page.getByTestId('three-canvas');
      expect(await paintOnMeshInViewport(page)).toBe(true);
      await expect(paintCanvas).toHaveAttribute('data-skin-brush-hover', 'active');
      await expect(paintCanvas).toHaveAttribute('data-skin-inspected-vertex', /\d+/);
      await expect(paintCanvas).toHaveAttribute('data-skin-paint-vertex-refs', /:\d+/);
      await page.mouse.move(4, 4);
      await expect(paintCanvas).toHaveAttribute('data-skin-brush-hover', 'inactive');
      expect(await paintCanvas.getAttribute('data-skin-brush-x')).toBe(null);
      expect(await paintCanvas.getAttribute('data-skin-inspected-vertex')).toBe(null);
      await expect(paintCanvas).toHaveAttribute('data-skin-paint-vertex-refs', '');

      await page.getByTestId('mode-tab-view').click({ force: true });
      await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-editor-mode', 'view');
      expect(await paintCanvas.getAttribute('data-skin-brush-hover')).toBe(null);
      expect(await paintCanvas.getAttribute('data-skin-paint-active')).toBe(null);
      expect(await paintCanvas.getAttribute('data-skin-paint-mode')).toBe(null);
      await showModernPanel(page, 'properties');
      await expect(inspector).toContainText(/Selected\s*FixtureTip/i);
    });

  test('skin diagnostics expose raw influences and explicit paint-pose safety', async ({ page }) => {
      await page.goto('/');

      await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await pausePlaybackIfRunning(page);
      await page.getByTestId('mode-tab-skin').click({ force: true });
      await showSkinAdvanced(page);

      await expect(page.getByTestId('skin-diagnostics')).toContainText(/Meshes \/ vertices/i);
      await expect(page.getByTestId('skin-diagnostics')).toContainText(/Invalid references/i);
      await expect(page.getByTestId('skin-paint-pose')).toHaveValue('rest');
      await expect(page.getByTestId('skin-paint-pose-warning')).toHaveCount(0);

      const canvas = page.getByTestId('three-canvas');
      await expect(canvas).toHaveAttribute('data-skin-paint-pose', 'rest');
      await expect(canvas).toHaveAttribute('data-workspace-pose', 'rest');
      await expect(canvas).toHaveAttribute('data-bone-labels-enabled', 'false');
      await page.getByTestId('skin-paint-pose').selectOption('frozen');
      await expect(page.getByTestId('skin-paint-pose')).toHaveValue('frozen');
      await expect(page.getByTestId('skin-paint-pose-warning')).toHaveCount(0);
      await expect(canvas).toHaveAttribute('data-skin-paint-pose', 'frozen');
      await expect(canvas).toHaveAttribute('data-workspace-pose', 'animation');
      await page.getByTestId('skin-paint-pose').selectOption('live');
      await expect(canvas).toHaveAttribute('data-skin-paint-pose', 'live');
      await expect(canvas).toHaveAttribute('data-workspace-pose', 'animation');
      await expect(page.getByTestId('skin-paint-pose-warning')).toBeVisible();
      await page.getByTestId('skin-paint-pose').selectOption('rest');
      await expect(canvas).toHaveAttribute('data-skin-paint-pose', 'rest');
      await expect(canvas).toHaveAttribute('data-workspace-pose', 'rest');
    });
});
