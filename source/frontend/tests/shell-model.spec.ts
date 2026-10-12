import { workspaceLocator, workspaceControl, selectWorkspace, revealSecondaryCommands, showAnimateTimeline, showModernPanel, showSkinAdvanced } from './helpers/modern-shell';

import { test, expect } from '@playwright/test';
import { BAD_INPUT_FOR_ERROR_TEST, SAMPLE_SMF, expectRenderedScreenshot, getBrowserErrors, pausePlaybackIfRunning, setupBrowserDiagnostics } from './helpers/smoke-helpers';
import {
  createSkinnedGlbFixtureInput,
  createSkinnedGlbFixtureInputWithOptions,
} from './helpers/skinned-glb-fixture';
import { parseSelectedBone, escapeRegex } from './helpers/format-assertions';
import {
  clickPickableBoneInViewport,
  clickPickableObjectInViewport,
  hoverPickableBoneInViewport,
  openPickableObjectContextInViewport,
  paintOnMeshInViewport,
  openViewportDisplayMenu,
  setViewportLayout,
} from './helpers/viewport-interactions';
import { setRangeValue } from './helpers/timeline-interactions';

// Browser integration coverage is split by feature ownership.
// Native IPC and filesystem coverage lives in native.spec.ts and Rust tests.

const MATERIAL_REPAIR_OBJ = [
  'mtllib fixture.mtl',
  'o FixtureSkinnedMesh',
  'v -0.35 0 0',
  'v 0.35 0 0',
  'v 0.35 1 0',
  'v -0.35 1 0',
  'usemtl FixtureMaterial',
  'f 1 2 3',
  'f 1 3 4',
].join('\n');
const MATERIAL_REPAIR_MTL = [
  'newmtl FixtureMaterial',
  'Kd 0.2 0.4 0.8',
  'map_Kd fixture.png',
].join('\n');
const MATERIAL_REPAIR_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAANSURBVBhXY2BgYPgPAAEEAQBwIGULAAAAAElFTkSuQmCC',
  'base64',
);

test.describe('RustSMF shell model flow (Chromium)', () => {
  test.beforeEach(async ({ page }) => {
    setupBrowserDiagnostics(page);
  });

  test('app boots with expected UI elements and initial state', async ({ page }) => {
      await page.goto('/');

      // Initial status
      await expect(page.getByTestId('status-text')).toContainText('Ready');

      // Key controls
      await expect(page.getByTestId('open-model-btn')).toBeVisible();
      await expect(page.getByTestId('export-btn')).toBeVisible();
      await revealSecondaryCommands(page);
      await expect(page.getByTestId('export-glb-btn')).toBeVisible();
      await expect(page.getByTestId('export-fbx-btn')).toBeVisible();
      await expect(page.getByTestId('export-smf-btn')).toBeVisible();
      await expect(page.getByTestId('ping-rust-btn')).toBeVisible();
      await page.getByTestId('modern-more-menu-button').click();

      // Viewport + canvas
      await expect(page.getByTestId('viewport-container')).toBeVisible();
      const canvas = page.getByTestId('three-canvas');
      await expect(canvas).toBeVisible();
      await expect(canvas).toHaveAttribute('data-viewport-layout', 'single');
      await expect(canvas).toHaveAttribute('data-model-root-id', '');
      await expect(canvas).toHaveAttribute('data-wireframe-enabled', 'false');
      await expect(canvas).toHaveAttribute('data-grid-enabled', 'true');
      await expect(canvas).toHaveAttribute('data-axes-enabled', 'true');
      await expect(canvas).toHaveAttribute('data-texture-enabled', 'true');
      await expect(canvas).toHaveAttribute('data-shader-enabled', 'false');
      await expect(canvas).toHaveAttribute('data-perspective-enabled', 'true');
      await expect(canvas).toHaveAttribute('data-model-opacity', '1');
      await expect(canvas).toHaveAttribute('data-bone-index-labels-enabled', 'false');
      await expect(canvas).toHaveAttribute('data-rig-opacity', '1');
      await expect(canvas).toHaveAttribute('data-rig-thickness-scale', '1');
      await expect(canvas).toHaveAttribute('data-skin-points-enabled', 'false');
      await expect(canvas).toHaveAttribute('data-skin-point-overlay-count', '0');
      await expect(canvas).not.toHaveAttribute('data-endpoint-x');
      await expect(canvas).not.toHaveAttribute('data-rig-ik-target-screen-x');
      await expect(page.getByTestId('viewport-layout-single')).toBeDisabled();
      await expect(page.getByTestId('viewport-layout-quad')).toBeDisabled();
      await expect(page.getByTestId('viewport-wireframe-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-grid-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-axes-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-texture-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-texture-repeat-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-texture-filter-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-bone-index-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-shader-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-perspective-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-model-opacity-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-rig-opacity-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-rig-thickness-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-skin-points-toggle')).toBeDisabled();

      await expect(page.getByTestId('modern-empty-state')).toBeVisible();
      await expect(page.getByTestId('timeline')).toHaveCount(0);
      await expect(page.getByTestId('outliner')).toHaveCount(0);
    });

  test('mode switching without model keeps disabled layout controls stable', async ({ page }) => {
      await page.goto('/');

      await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-viewport-layout', 'single');
      await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', '');
      await expect(page.getByTestId('viewport-layout-single')).toBeDisabled();
      await expect(page.getByTestId('viewport-layout-quad')).toBeDisabled();
      await expect(page.getByTestId('viewport-wireframe-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-texture-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-texture-repeat-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-texture-filter-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-bone-index-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-shader-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-perspective-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-model-opacity-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-rig-opacity-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-rig-thickness-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-skin-points-toggle')).toBeDisabled();

    const assertModeActive = async (mode: 'view' | 'rig' | 'skin' | 'animate' | 'export'): Promise<void> => {
      const tab = page.getByTestId(`mode-tab-${mode}`);
      await selectWorkspace(page, mode);
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByTestId('three-canvas')).toBeVisible();
      await expect(page.getByTestId('viewport-layout-single')).toBeDisabled();
      await expect(page.getByTestId('viewport-layout-quad')).toBeDisabled();
      await expect(page.getByTestId('viewport-wireframe-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-grid-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-axes-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-texture-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-texture-repeat-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-texture-filter-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-bone-index-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-shader-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-perspective-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-model-opacity-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-rig-opacity-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-rig-thickness-toggle')).toBeDisabled();
      await expect(page.getByTestId('viewport-skin-points-toggle')).toBeDisabled();
      const statusText = await page.getByTestId('status-text').textContent();
      expect(statusText).toContain('Ready');
      await expect(page.getByTestId('three-canvas')).not.toHaveAttribute('data-endpoint-x');
      await expect(page.getByTestId('three-canvas')).not.toHaveAttribute('data-rig-ik-target-screen-x');
      };

      await assertModeActive('view');
      await assertModeActive('rig');
      await assertModeActive('skin');
      await assertModeActive('animate');
      await assertModeActive('export');
      await expect(page.getByTestId('modern-empty-state')).toBeVisible();
      await expect(page.getByTestId('modern-support-panel')).toHaveCount(0);
      await expect(page.getByTestId('timeline')).toHaveCount(0);
      await expect(page.getByTestId('export-btn')).toBeDisabled();
      await expect(page.getByTestId('export-glb-btn')).toBeEnabled();
      await expect(page.getByTestId('export-fbx-btn')).toBeEnabled();
      // Empty workspaces keep SMF disabled; the action requires a loaded
      // source-fidelity model and the export panel explains the reason.
      await expect(page.getByTestId('export-smf-btn')).toBeDisabled();

      const criticalErrors = getBrowserErrors(page).filter((e: string) => e.includes('ERROR'));
      expect(criticalErrors.length).toBe(0);
    });

  test('can load a real SMF sample and basic UI updates', async ({ page }) => {
      await page.goto('/');

      // Use the persistent hidden input (added for e2e) – setInputFiles triggers onChange
      // which calls loadModel directly. This bypasses the dynamic openFile() for reliability.
      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(SAMPLE_SMF);

      // Wait for load to finish (status changes and no longer says "Loading")
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });

      // After load we should see some model info in status (bones, clips, verts etc.)
      await expect(page.getByTestId('status-text')).toContainText(/Loaded|bones|clips/i);

      // Outliner should reflect content
      await showModernPanel(page, 'scene');
      await expect(page.getByTestId('outliner')).toContainText(/Scene Root|Bone|Mesh/i);
      await expect(page.getByTestId('outliner-submodel-count')).toContainText(/\d+ mesh/i);
      await showModernPanel(page, 'scene');
      const firstSubmodel = (await workspaceControl(page, 'outliner-submodel-0'));
      await expect(firstSubmodel).toBeVisible();
      await expect(firstSubmodel).toHaveAttribute('data-visible', 'true');
      await showModernPanel(page, 'scene');
      const firstVisibilityToggle = (await workspaceControl(page, 'outliner-visibility-toggle-0'));
      await expect(firstVisibilityToggle).toHaveAttribute('aria-pressed', 'true');
      await firstVisibilityToggle.click();
      await expect(firstSubmodel).toHaveAttribute('data-visible', 'false');
      await expect(firstVisibilityToggle).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByTestId('status-text')).toContainText(/Hidden submodel/i);
      await expect(page.getByTestId('editor-undo-btn')).toBeEnabled();
      await page.getByTestId('editor-undo-btn').click();
      await expect(firstSubmodel).toHaveAttribute('data-visible', 'true');
      await expect(firstVisibilityToggle).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('status-text')).toContainText(/Undid outliner visibility toggle/i);
      await expect(page.getByTestId('editor-redo-btn')).toBeEnabled();
      await page.getByTestId('editor-redo-btn').click();
      await expect(firstSubmodel).toHaveAttribute('data-visible', 'false');
      await expect(firstVisibilityToggle).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByTestId('status-text')).toContainText(/Redid outliner visibility toggle/i);
      await page.getByTestId('editor-undo-btn').click();
      await expect(firstSubmodel).toHaveAttribute('data-visible', 'true');
      await expect(firstVisibilityToggle).toHaveAttribute('aria-pressed', 'true');
      await firstSubmodel.locator('button').first().click();
      await expect(firstSubmodel).toHaveAttribute('data-selected', 'true');
      await expect(page.getByTestId('outliner-selection-count')).toContainText('1 selected');
      await (await workspaceControl(page, 'outliner-select-all-btn')).click();
      await expect(page.getByTestId('outliner-selection-count')).toContainText(/selected/);
      await (await workspaceControl(page, 'outliner-hide-selected-btn')).click();
      await expect(firstSubmodel).toHaveAttribute('data-visible', 'false');
      await page.keyboard.press('Control+Z');
      await expect(firstSubmodel).toHaveAttribute('data-visible', 'true');
      await expect(page.getByTestId('status-text')).toContainText(/Undid hide selected submodels/i);
      await page.keyboard.press('Control+Y');
      await expect(firstSubmodel).toHaveAttribute('data-visible', 'false');
      await expect(page.getByTestId('status-text')).toContainText(/Redid hide selected submodels/i);
      await (await workspaceControl(page, 'outliner-unhide-all-btn')).click();
      await expect(firstSubmodel).toHaveAttribute('data-visible', 'true');
      await firstSubmodel.locator('button').first().click();
      await (await workspaceControl(page, 'outliner-hide-unselected-btn')).click();
      if (await page.getByTestId('outliner-submodel-1').count() > 0) {
        await expect(page.getByTestId('outliner-submodel-1')).toHaveAttribute('data-visible', 'false');
      }
      await (await workspaceControl(page, 'outliner-unhide-all-btn')).click();
      await (await workspaceControl(page, 'outliner-clear-selection-btn')).click();
      await expect(page.getByTestId('outliner-selection-count')).toContainText('0 selected');

      await showAnimateTimeline(page);
      await expect(page.getByTestId('timeline')).toBeVisible();
      await expect(page.getByTestId('timeline-keyframe-lane')).toHaveAttribute('data-keyframe-count', /[1-9]\d*/);
      await expect(page.locator('[data-testid^="timeline-keyframe-marker-"]').first()).toBeVisible();

      await selectWorkspace(page, 'view');
      await expect(page.getByTestId('mode-tab-view')).toHaveAttribute('aria-selected', 'true');
      await showModernPanel(page, 'properties');
      await expect(page.getByTestId('inspector')).toBeVisible();
      await expect(page.getByTestId('inspector')).toContainText(/Clips|Selected/i);

      // Bones inspector (basic hierarchy from skeleton)
      await expect(page.getByTestId('inspector')).toContainText(/Bones/i);
      await showModernPanel(page, 'scene');

      // Canvas still there (Three.js kept rendering)
      await expect(page.getByTestId('three-canvas')).toBeVisible();
      const wireframeBtn = page.getByTestId('viewport-wireframe-toggle');
      const gridBtn = page.getByTestId('viewport-grid-toggle');
      const axesBtn = page.getByTestId('viewport-axes-toggle');
      const textureBtn = page.getByTestId('viewport-texture-toggle');
      const textureRepeatBtn = page.getByTestId('viewport-texture-repeat-toggle');
      const textureFilterBtn = page.getByTestId('viewport-texture-filter-toggle');
      const shaderBtn = page.getByTestId('viewport-shader-toggle');
      const perspectiveBtn = page.getByTestId('viewport-perspective-toggle');
      const boneIndexBtn = page.getByTestId('viewport-bone-index-toggle');
      const rigOpacityBtn = page.getByTestId('viewport-rig-opacity-toggle');
      const rigVisibilityBtn = page.getByTestId('viewport-rig-visibility-toggle');
      const rigThicknessBtn = page.getByTestId('viewport-rig-thickness-toggle');
      const skinPointsBtn = page.getByTestId('viewport-skin-points-toggle');
      const modelOpacityBtn = page.getByTestId('viewport-model-opacity-toggle');
      const canvas = page.getByTestId('three-canvas');
      expect(await clickPickableObjectInViewport(page)).toBe(true);
      await expect(canvas).toHaveAttribute('data-pointer-owner', 'model-select');
      await expect(page.getByTestId('outliner-selection-count')).toContainText('1 selected');
      await expect(page.getByTestId('outliner').locator('[data-selected="true"]').first()).toBeVisible();
      await expect(canvas).toHaveAttribute('data-selection-overlay-count', /[1-9]\d*/);
      await (await workspaceControl(page, 'outliner-hide-selected-btn')).click();
      await expect(canvas).toHaveAttribute('data-selection-overlay-count', '0');
      await (await workspaceControl(page, 'outliner-unhide-all-btn')).click();
      await expect(canvas).toHaveAttribute('data-selection-overlay-count', /[1-9]\d*/);
      expect(await openPickableObjectContextInViewport(page)).toBe(true);
      await expect(page.getByTestId('status-text')).toContainText(/Submodel context actions ready/i);
      await expect(wireframeBtn).toBeEnabled();
      await expect(wireframeBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(gridBtn).toBeEnabled();
      await expect(gridBtn).toHaveAttribute('aria-pressed', 'true');
      await expect(axesBtn).toBeEnabled();
      await expect(axesBtn).toHaveAttribute('aria-pressed', 'true');
      await expect(textureBtn).toBeEnabled();
      await expect(textureBtn).toHaveAttribute('aria-pressed', 'true');
      await expect(textureRepeatBtn).toBeEnabled();
      await expect(textureRepeatBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(textureFilterBtn).toBeEnabled();
      await expect(textureFilterBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(shaderBtn).toBeEnabled();
      await expect(shaderBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(shaderBtn).toContainText('Legacy');
      await expect(perspectiveBtn).toBeEnabled();
      await expect(perspectiveBtn).toHaveAttribute('aria-pressed', 'true');
      await expect(modelOpacityBtn).toBeEnabled();
      await expect(modelOpacityBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(boneIndexBtn).toBeEnabled();
      await expect(boneIndexBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(rigOpacityBtn).toBeEnabled();
      await expect(rigOpacityBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(rigVisibilityBtn).toBeEnabled();
      await expect(rigVisibilityBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(rigVisibilityBtn).toContainText('Hide rig');
      await expect(rigThicknessBtn).toBeEnabled();
      await expect(rigThicknessBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(skinPointsBtn).toBeEnabled();
      await expect(skinPointsBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(canvas).toHaveAttribute('data-grid-enabled', 'true');
      await expect(canvas).toHaveAttribute('data-axes-enabled', 'true');
      await expect(canvas).toHaveAttribute('data-texture-enabled', 'true');
      await expect(canvas).toHaveAttribute('data-texture-repeat-preview', 'false');
      await expect(canvas).toHaveAttribute('data-texture-filter-preview', 'source');
      await expect(canvas).toHaveAttribute('data-shader-enabled', 'false');
      await expect(canvas).toHaveAttribute('data-shader-mode', 'standard');
      await expect(canvas).toHaveAttribute('data-perspective-enabled', 'true');
      await expect(canvas).toHaveAttribute('data-model-opacity', '1');
      await expect(canvas).toHaveAttribute('data-bone-index-labels-enabled', 'false');
      await expect(canvas).toHaveAttribute('data-rig-opacity', '1');
      await expect(canvas).toHaveAttribute('data-rig-thickness-scale', '1');
      await expect(canvas).toHaveAttribute('data-skin-points-enabled', 'false');
      await expect(canvas).toHaveAttribute('data-skin-point-overlay-count', '0');
      await openViewportDisplayMenu(page);
      await wireframeBtn.click();
      await expect(wireframeBtn).toHaveAttribute('aria-pressed', 'true');
      await expect(canvas).toHaveAttribute('data-wireframe-enabled', 'true');
      await gridBtn.click();
      await expect(gridBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(canvas).toHaveAttribute('data-grid-enabled', 'false');
      await axesBtn.click();
      await expect(axesBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(canvas).toHaveAttribute('data-axes-enabled', 'false');
      await textureBtn.click();
      await expect(textureBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(canvas).toHaveAttribute('data-texture-enabled', 'false');
      await textureRepeatBtn.click();
      await expect(textureRepeatBtn).toHaveAttribute('aria-pressed', 'true');
      await expect(canvas).toHaveAttribute('data-texture-repeat-preview', 'true');
      await textureFilterBtn.click();
      await expect(canvas).toHaveAttribute('data-texture-filter-preview', 'nearest');
      await textureFilterBtn.click();
      await expect(canvas).toHaveAttribute('data-texture-filter-preview', 'linear');
      await shaderBtn.click();
      await expect(shaderBtn).toHaveAttribute('aria-pressed', 'true');
      await expect(canvas).toHaveAttribute('data-shader-enabled', 'true');
      await expect(canvas).toHaveAttribute('data-shader-mode', 'legacy-smf');
      await perspectiveBtn.click();
      await expect(perspectiveBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(canvas).toHaveAttribute('data-perspective-enabled', 'false');
      await modelOpacityBtn.click();
      await expect(modelOpacityBtn).toHaveAttribute('aria-pressed', 'true');
      await expect(canvas).toHaveAttribute('data-model-opacity', '0.35');
      await boneIndexBtn.click();
      await expect(boneIndexBtn).toHaveAttribute('aria-pressed', 'true');
      await expect(canvas).toHaveAttribute('data-bone-index-labels-enabled', 'true');
      await rigOpacityBtn.click();
      await expect(rigOpacityBtn).toHaveAttribute('aria-pressed', 'true');
      await expect(canvas).toHaveAttribute('data-rig-opacity', '0.35');
      await rigThicknessBtn.click();
      await expect(rigThicknessBtn).toHaveAttribute('aria-pressed', 'true');
      await expect(canvas).toHaveAttribute('data-rig-thickness-scale', '0.45');
      await skinPointsBtn.click();
      await expect(skinPointsBtn).toHaveAttribute('aria-pressed', 'true');
      await expect(canvas).toHaveAttribute('data-skin-points-enabled', 'true');
      await expect(canvas).toHaveAttribute('data-skin-point-overlay-count', /[1-9]\d*/);
      await expectRenderedScreenshot(page.getByTestId('viewport-container'), 2500);
      await wireframeBtn.click();
      await expect(canvas).toHaveAttribute('data-wireframe-enabled', 'false');
      await gridBtn.click();
      await expect(canvas).toHaveAttribute('data-grid-enabled', 'true');
      await axesBtn.click();
      await expect(canvas).toHaveAttribute('data-axes-enabled', 'true');
      await textureBtn.click();
      await expect(canvas).toHaveAttribute('data-texture-enabled', 'true');
      await textureRepeatBtn.click();
      await expect(canvas).toHaveAttribute('data-texture-repeat-preview', 'false');
      await textureFilterBtn.click();
      await expect(canvas).toHaveAttribute('data-texture-filter-preview', 'source');
      await boneIndexBtn.click();
      await expect(boneIndexBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(canvas).toHaveAttribute('data-bone-index-labels-enabled', 'false');
      await rigOpacityBtn.click();
      await expect(rigOpacityBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(canvas).toHaveAttribute('data-rig-opacity', '1');
      await rigVisibilityBtn.click();
      await expect(rigVisibilityBtn).toHaveAttribute('aria-pressed', 'true');
      await expect(rigVisibilityBtn).toContainText('Show rig');
      await expect(rigOpacityBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(canvas).toHaveAttribute('data-rig-opacity', '0');
      await rigVisibilityBtn.click();
      await expect(rigVisibilityBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(rigVisibilityBtn).toContainText('Hide rig');
      await expect(canvas).toHaveAttribute('data-rig-opacity', '1');
      await rigThicknessBtn.click();
      await expect(rigThicknessBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(canvas).toHaveAttribute('data-rig-thickness-scale', '1');
      await skinPointsBtn.click();
      await expect(skinPointsBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(canvas).toHaveAttribute('data-skin-points-enabled', 'false');
      await expect(canvas).toHaveAttribute('data-skin-point-overlay-count', '0');
      await shaderBtn.click();
      await expect(shaderBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(canvas).toHaveAttribute('data-shader-enabled', 'false');
      await expect(canvas).toHaveAttribute('data-shader-mode', 'standard');
      await perspectiveBtn.click();
      await expect(perspectiveBtn).toHaveAttribute('aria-pressed', 'true');
      await expect(canvas).toHaveAttribute('data-perspective-enabled', 'true');
      await modelOpacityBtn.click();
      await expect(modelOpacityBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(canvas).toHaveAttribute('data-model-opacity', '1');

      // Exercise bone list selection (simulates user picking bone in inspector for coverage)
      // Also verifies collapsible hierarchy tree (nested ul/li with +/- toggles) using the real local model
      await showModernPanel(page, 'properties');
      const inspector = page.getByTestId('inspector');
      await expect(inspector).toContainText(/Bones \(\d+\)/i);
      // Verify collapsible UI present (hierarchy with toggles)
      await expect(await workspaceLocator(page, inspector.locator('span').filter({ hasText: /[+-]/ }).first())).toBeVisible();
      const anyBoneEntry = await workspaceLocator(page, inspector.locator('li > div').filter({ hasText: /./ }).nth(0));
      if (await anyBoneEntry.count() > 0) {
        await anyBoneEntry.click({ force: true }).catch(() => {});
        await page.waitForTimeout(60);
      }
      // Toggle first +/- if present (tests collapse edge for deep rigs)
      const toggle = inspector.locator('span').filter({ hasText: /[+-]/ }).first();
      if (await toggle.count() > 0) {
        await toggle.click({ force: true }).catch(() => {});
        await page.waitForTimeout(60);
      }

      // Labels toggle button (recent work: bone name viz in viewport, off-by-default for perf)
      // Presence + basic interaction exercises the new toggle path (state lift in hook, prop to Inspector/Viewport)
      const labelsBtn = inspector.getByTestId('labels-toggle-btn');
      await expect(labelsBtn).toBeVisible();
      // Exercise toggle (click on/off; no visual assert needed, just no crash + state change)
      await labelsBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(50);
      await labelsBtn.click({ force: true }).catch(() => {}); // back to off

      await expect(page.getByTestId('three-canvas')).toBeVisible();

      // Editor mode tabs (new foundation for modern workspaces #1): presence + change exercises state flow from Toolbar through hook/store.
      // Test interactions with other recent features (labels toggle, bone pick) post mode change; verify no breakage or state corruption.
      await expect(page.getByTestId('modern-workspace-button')).toBeVisible();
      await selectWorkspace(page, 'rig');
      await page.waitForTimeout(30);
      // Interact with labels and bone selection while in 'rig' mode (edge: mode + labels + picker)
      const labelsBtn2 = inspector.getByTestId('labels-toggle-btn');
      await labelsBtn2.click({ force: true }).catch(() => {});
      await page.waitForTimeout(30);
      const pickCanvas = page.getByTestId('three-canvas');
      await pickCanvas.hover({ position: { x: 170, y: 120 } });
      await page.waitForTimeout(40);
      const hovered = await pickCanvas.getAttribute('data-hovered-bone');
      if (hovered) {
        expect(hovered).toContain('SMF_Node_');
      }
      await pickCanvas.click({ position: { x: 70, y: 70 } });
      await page.waitForTimeout(50);
      await expect(page.getByTestId('status-text')).toContainText(/Selected:/i);
      // Reset mode
      await selectWorkspace(page, 'view');
      await expect(page.getByTestId('three-canvas')).toBeVisible();

      // Workspace surfaces are mode-native and composable with Inspector.
      await selectWorkspace(page, 'skin');
      await page.waitForTimeout(20);
      await expect(page.getByTestId('skin-workspace-panel')).toBeVisible();
      await selectWorkspace(page, 'animate');
      await page.waitForTimeout(20);
      await expect(page.getByTestId('animate-workspace-panel')).toBeVisible();
      await expect(page.getByTestId('animate-summary')).toContainText(/Tracks|Keys/);
      await selectWorkspace(page, 'export');
      await page.waitForTimeout(20);
      await expect(page.getByTestId('export-workspace-panel')).toBeVisible();
      const smfPolicyPanel = page.getByTestId('texture-export-policy-panel');
      await expect(smfPolicyPanel.locator('[data-export-action="export"]')).toHaveAttribute('data-export-format', 'smf');
      await expect(smfPolicyPanel.locator('[data-export-action="export"]')).toHaveAttribute('data-texture-policy', 'embedded');
      await expect(smfPolicyPanel.locator('[data-export-action="fbx"]')).toHaveAttribute('data-texture-policy', 'embedded');
      await expect(smfPolicyPanel.locator('[data-export-action="smf"]')).toHaveAttribute('data-texture-policy', 'embedded');
      await selectWorkspace(page, 'view');
      await page.waitForTimeout(20);
      await expect(page.getByTestId('skin-workspace-panel')).toBeHidden();
      await expect(page.getByTestId('animate-workspace-panel')).toBeHidden();
      await expect(page.getByTestId('export-workspace-panel')).toBeHidden();

      // Exercise Model workspace viewport click routing (object pick/empty clear + orbit compat; no crash expected)
      await canvas.click({ position: { x: 60, y: 60 } });
      await page.waitForTimeout(80);
      await expect(canvas).toBeVisible();
      await expect(canvas).toHaveAttribute('data-pointer-owner', 'model-select');

      // Assert no critical browser console errors during load (errors logged by listener)
      // (warnings may exist for Three.js, but no errors)
      const errors = getBrowserErrors(page);
      const criticalErrors = errors.filter((e: string) => e.includes('ERROR'));
      expect(criticalErrors.length).toBe(0);

      // Cycle 1: lightweight screenshot assert for bone flow (real sample + selection/collapse/raycast exercised)
      // Keeps CI green without mandatory snapshot updates while providing visual state coverage for bone/export prep.
      // Use strict visual for this core load + bone state when we want a committed reference render.
      await showAnimateTimeline(page);
      await pausePlaybackIfRunning(page);
      await page.getByTestId('timeline').locator('button').filter({ hasText: /Reset/i }).first().click({ force: true });
      await page.waitForTimeout(120);
      await expectRenderedScreenshot(page.getByTestId('viewport-container'), 3000, { strict: true, name: 'loaded-smf-bone-flow' });
    });

  test('auto-frames tiny and huge authored model scales without changing their transforms', async ({ page }) => {
      await page.goto('/');

      const canvas = page.getByTestId('three-canvas');
      const cameraToggle = page.getByTestId('viewport-perspective-toggle');
      type RenderedCoverage = {
        widthRatio: number;
        heightRatio: number;
        pixelCount: number;
        imageWidth: number;
        imageHeight: number;
      };
      const coverageByScale: Array<{
        scale: number;
        perspective: RenderedCoverage;
        orthographic: RenderedCoverage;
      }> = [];

      const waitForFrame = async (): Promise<void> => {
        await page.evaluate(() => new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }));
      };

      const readGreenModelCoverage = async (): Promise<RenderedCoverage> => {
        await waitForFrame();
        const screenshot = await canvas.screenshot();
        return page.evaluate(async (base64) => {
          const image = new Image();
          image.src = `data:image/png;base64,${base64}`;
          await image.decode();
          const sample = document.createElement('canvas');
          sample.width = image.width;
          sample.height = image.height;
          const context = sample.getContext('2d', { willReadFrequently: true });
          if (!context) throw new Error('2D screenshot analysis context is unavailable');
          context.drawImage(image, 0, 0);
          const pixels = context.getImageData(0, 0, image.width, image.height).data;
          let minX = image.width;
          let minY = image.height;
          let maxX = -1;
          let maxY = -1;
          let pixelCount = 0;
          for (let y = 0; y < image.height; y += 1) {
            for (let x = 0; x < image.width; x += 1) {
              const index = (y * image.width + x) * 4;
              const red = pixels[index];
              const green = pixels[index + 1];
              const blue = pixels[index + 2];
              if (green <= red + 35 || green <= blue + 15) continue;
              pixelCount += 1;
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
            }
          }
          return {
            widthRatio: maxX >= minX ? (maxX - minX + 1) / image.width : 0,
            heightRatio: maxY >= minY ? (maxY - minY + 1) / image.height : 0,
            pixelCount,
            imageWidth: image.width,
            imageHeight: image.height,
          };
        }, screenshot.toString('base64'));
      };

      const expectCoverageParity = (
        first: RenderedCoverage,
        second: RenderedCoverage,
        maxWidthDelta: number,
        maxHeightDelta: number,
      ): void => {
        const widthPixelTolerance = (1 / first.imageWidth) + (1 / second.imageWidth);
        const heightPixelTolerance = (1 / first.imageHeight) + (1 / second.imageHeight);
        expect(Math.abs(first.widthRatio - second.widthRatio)).toBeLessThanOrEqual(
          maxWidthDelta + widthPixelTolerance,
        );
        expect(Math.abs(first.heightRatio - second.heightRatio)).toBeLessThanOrEqual(
          maxHeightDelta + heightPixelTolerance,
        );
      };

      for (const scale of [1e-5, 1e5]) {
        await page.getByTestId('model-file-input').setInputFiles(
          await createSkinnedGlbFixtureInputWithOptions({ rootScale: scale }),
        );
        await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
        await expect(canvas).toHaveAttribute('data-model-root-id', /.+/);
        // Compare scale, not the autoplay phase reached while opening controls.
        await showAnimateTimeline(page);
        await pausePlaybackIfRunning(page);
        await page.getByTestId('timeline-reset-btn').click();
        await expect(canvas).toHaveAttribute('data-playback-time', '0.000000');
        await selectWorkspace(page, 'view');
        if (await page.getByTestId('modern-panel-close').isVisible()) {
          await page.getByTestId('modern-panel-close').click();
        }
        await openViewportDisplayMenu(page);
        for (const toggleId of ['viewport-grid-toggle', 'viewport-axes-toggle']) {
          const toggle = page.getByTestId(toggleId);
          if (await toggle.getAttribute('aria-pressed') === 'true') await toggle.click();
        }

        await expect.poll(async () => (
          Number(await canvas.getAttribute('data-model-max-dimension')) / scale
        )).toBeCloseTo(2, 6);
        const modelDimension = Number(await canvas.getAttribute('data-model-max-dimension'));
        const cameraDistance = Number(await canvas.getAttribute('data-camera-distance'));
        const minDistance = Number(await canvas.getAttribute('data-camera-min-distance'));
        const maxDistance = Number(await canvas.getAttribute('data-camera-max-distance'));
        const near = Number(await canvas.getAttribute('data-viewport-camera-near'));
        const far = Number(await canvas.getAttribute('data-viewport-camera-far'));
        expect(cameraDistance / modelDimension).toBeCloseTo(1.35, 8);
        expect(minDistance / modelDimension).toBeCloseTo(0.05, 8);
        expect(maxDistance / modelDimension).toBeCloseTo(50, 8);
        expect(near / modelDimension).toBeCloseTo(0.001, 8);
        expect(far / modelDimension).toBeCloseTo(100, 8);

        const perspective = await readGreenModelCoverage();
        expect(perspective.pixelCount).toBeGreaterThan(500);
        expect(perspective.widthRatio).toBeGreaterThan(0.1);
        expect(perspective.widthRatio).toBeLessThan(0.9);
        expect(perspective.heightRatio).toBeGreaterThan(0.25);
        expect(perspective.heightRatio).toBeLessThan(0.9);

        await cameraToggle.click();
        await expect(canvas).toHaveAttribute('data-viewport-camera-type', 'OrthographicCamera');
        const orthographic = await readGreenModelCoverage();
        expect(orthographic.pixelCount).toBeGreaterThan(500);
        // The 13% boundary can fall between pixels at this viewport width.
        expect(orthographic.widthRatio + 1 / orthographic.imageWidth).toBeGreaterThan(0.13);
        expect(orthographic.widthRatio).toBeLessThan(0.9);
        expect(orthographic.heightRatio).toBeGreaterThan(0.5);
        expect(orthographic.heightRatio).toBeLessThan(0.9);

        coverageByScale.push({ scale, perspective, orthographic });
        await cameraToggle.click();
        await expect(canvas).toHaveAttribute('data-viewport-camera-type', 'PerspectiveCamera');
      }

      const [tiny, huge] = coverageByScale;
      expectCoverageParity(tiny.perspective, huge.perspective, 0.03, 0.03);
      expectCoverageParity(tiny.orthographic, huge.orthographic, 0.06, 0.03);
      expect(getBrowserErrors(page).filter((error) => error.includes('ERROR'))).toEqual([]);
    });

  test('viewport layout toggle works in single/quad modes', async ({ page }) => {
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(SAMPLE_SMF);
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await expect(page.getByTestId('three-canvas')).toBeVisible();

      const singleBtn = page.getByTestId('viewport-layout-single');
      const quadBtn = page.getByTestId('viewport-layout-quad');
      await expect(singleBtn).toHaveAttribute('aria-pressed', 'true');
      await expect(quadBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(singleBtn).toBeEnabled();
      await expect(quadBtn).toBeEnabled();

      await selectWorkspace(page, 'rig');
      const inspector = page.getByTestId('inspector');
      const boneEntry = await workspaceLocator(page, inspector
        .locator('li > div')
        .filter({ hasText: /SMF_Node_\d+/ })
        .first());
      await expect(boneEntry).toBeVisible({ timeout: 8000 });
      await boneEntry.click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Selected:/i);
      const selectedBefore = parseSelectedBone(await page.getByTestId('status-text').textContent());
      expect(selectedBefore).toBeTruthy();
      await showAnimateTimeline(page);
      await pausePlaybackIfRunning(page);
      await setRangeValue(page, 'scrub-slider', 0.2);
      const scrubBefore = await page.getByTestId('three-canvas').getAttribute('data-playback-time');
      await selectWorkspace(page, 'rig');

      const canvas = page.getByTestId('three-canvas');
      const expectEndpointTelemetry = async (): Promise<{ x: number; y: number }> => {
        await expect.poll(async () => {
          const x = Number(await canvas.getAttribute('data-endpoint-x'));
          const y = Number(await canvas.getAttribute('data-endpoint-y'));
          return Number.isFinite(x) && Number.isFinite(y);
        }, { timeout: 3000 }).toBe(true);
        return {
          x: Number(await canvas.getAttribute('data-endpoint-x')),
          y: Number(await canvas.getAttribute('data-endpoint-y')),
        };
      };
      const hoverEndpoint = async (): Promise<string> => {
        const endpoint = await expectEndpointTelemetry();
        await page.mouse.move(endpoint.x, endpoint.y);
        await page.waitForTimeout(60);
        return (await canvas.getAttribute('data-hovered-bone')) ?? '';
      };

      const hoveredBefore = await hoverEndpoint();
      expect(hoveredBefore === '' || hoveredBefore === selectedBefore).toBe(true);

      await setViewportLayout(page, 'quad');
      await setViewportLayout(page, 'single');
      await setViewportLayout(page, 'quad');
      await setViewportLayout(page, 'single');
      await expect(page.getByTestId('status-text')).toContainText(new RegExp(`Selected:\\s*${selectedBefore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-playback-time', scrubBefore!);

      await setViewportLayout(page, 'quad');
      await expect(page.getByTestId('viewport-container')).toBeVisible();
      await expect(page.getByTestId('quad-pane-overlay')).toBeVisible();
      await expect(page.getByTestId('quad-pane-label-top')).toContainText('Top');
      await expect(page.getByTestId('quad-pane-label-3d')).toContainText('3D');
      await expect(page.getByTestId('quad-pane-label-front')).toContainText('Front');
      await expect(page.getByTestId('quad-pane-label-side')).toContainText('Side');
      const hoveredAfter = await hoverEndpoint();
      expect(hoveredAfter === '' || hoveredAfter === selectedBefore).toBe(true);
      await expect(canvas).toHaveAttribute('data-playback-time', scrubBefore!);
      await expectRenderedScreenshot(page.getByTestId('viewport-container'), 2500);

      // Quad mode is now wired for deterministic per-pane interaction: each panel is clickable and should not
      // throw selection errors while raycast/orbit filters route the active pane behavior.
      const box = await canvas.boundingBox();
      if (box) {
        const points = [
          { role: 'top', x: box.x + box.width * 0.25, y: box.y + box.height * 0.25, minX: 0.05, maxX: 0.45, minY: 0.05, maxY: 0.45 },
          { role: 'perspective', x: box.x + box.width * 0.75, y: box.y + box.height * 0.25, minX: 0.55, maxX: 0.95, minY: 0.05, maxY: 0.45 },
          { role: 'front', x: box.x + box.width * 0.25, y: box.y + box.height * 0.75, minX: 0.05, maxX: 0.45, minY: 0.55, maxY: 0.95 },
          { role: 'side', x: box.x + box.width * 0.75, y: box.y + box.height * 0.75, minX: 0.55, maxX: 0.95, minY: 0.55, maxY: 0.95 },
        ];
        for (const p of points) {
          await page.mouse.click(p.x, p.y);
          await expect(canvas).toHaveAttribute('data-viewport-pane-role', p.role);
          await expect(canvas).toHaveAttribute('data-pointer-owner', /rig-select|rig-endpoint-drag/);
          expect(parseSelectedBone(await page.getByTestId('status-text').textContent())).toBeTruthy();
          await page.waitForTimeout(40);
        }

        let panesWithSelectableBone = 0;
        for (const pane of points) {
          let hit: { x: number; y: number; bone: string } | null = null;
          for (const relY of [pane.minY, (pane.minY + pane.maxY) / 2, pane.maxY]) {
            for (const relX of [pane.minX, (pane.minX + pane.maxX) / 2, pane.maxX]) {
              const x = box.x + box.width * relX;
              const y = box.y + box.height * relY;
              await page.mouse.move(x, y);
              await page.waitForTimeout(30);
              const bone = (await canvas.getAttribute('data-hovered-bone')) ?? '';
              if (bone) {
                hit = { x, y, bone };
                break;
              }
            }
            if (hit) break;
          }
          if (!hit) continue;

          await page.mouse.click(hit.x, hit.y);
          await expect(canvas).toHaveAttribute('data-viewport-pane-role', pane.role);
          await expect(canvas).toHaveAttribute('data-pointer-owner', /rig-select|rig-endpoint-drag/);
          const pickedBone = (await canvas.getAttribute('data-viewport-picked-bone')) ?? '';
          if (!pickedBone) continue;
          panesWithSelectableBone += 1;
          await expect(page.getByTestId('status-text')).toContainText(new RegExp(`Selected:\\s*${escapeRegex(pickedBone)}`));
        }
        expect(panesWithSelectableBone).toBeGreaterThan(0);
        await expect(canvas).toBeVisible();
      }

      await setViewportLayout(page, 'single');
      await expect(page.getByTestId('viewport-container')).toBeVisible();
      await expect(page.getByTestId('quad-pane-overlay')).toBeHidden();
      await expectRenderedScreenshot(page.getByTestId('viewport-container'), 2500);

      const cameraBtn = page.getByTestId('viewport-perspective-toggle');
      await expect(cameraBtn).toContainText('3D');
      await cameraBtn.click();
      await expect(cameraBtn).toContainText('Ortho');
      await expect(cameraBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(canvas).toHaveAttribute('data-perspective-enabled', 'false');
      await expect(canvas).toHaveAttribute('data-viewport-camera-type', 'OrthographicCamera');
      await page.setViewportSize({ width: 1180, height: 760 });
      await expect(canvas).toHaveAttribute('data-viewport-camera-type', 'OrthographicCamera');
      await expectRenderedScreenshot(page.getByTestId('viewport-container'), 2500);

      await cameraBtn.click();
      await expect(cameraBtn).toContainText('3D');
      await expect(cameraBtn).toHaveAttribute('aria-pressed', 'true');
      await expect(canvas).toHaveAttribute('data-perspective-enabled', 'true');
      await expect(canvas).toHaveAttribute('data-viewport-camera-type', 'PerspectiveCamera');
    });

  test('quad orthographic and perspective panes pan one shared focus target', async ({ page }) => {
      await page.goto('/');
      await page.getByTestId('model-file-input').setInputFiles(SAMPLE_SMF);
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await setViewportLayout(page, 'quad');

      const canvas = page.getByTestId('three-canvas');
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();
      if (!box) return;

      const readTarget = async (): Promise<[number, number, number]> => [
        Number(await canvas.getAttribute('data-camera-target-x')),
        Number(await canvas.getAttribute('data-camera-target-y')),
        Number(await canvas.getAttribute('data-camera-target-z')),
      ];
      const expectTargetChanged = async (before: [number, number, number]): Promise<[number, number, number]> => {
        await expect.poll(async () => {
          const after = await readTarget();
          return Math.hypot(
            after[0] - before[0],
            after[1] - before[1],
            after[2] - before[2],
          );
        }).toBeGreaterThan(0.001);
        return readTarget();
      };

      const initial = await readTarget();
      expect(initial.every(Number.isFinite)).toBe(true);
      const topX = box.x + box.width * 0.25;
      const topY = box.y + box.height * 0.25;
      await page.mouse.move(topX, topY);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(topX + 40, topY + 24);
      await page.mouse.up({ button: 'right' });
      const afterOrtho = await expectTargetChanged(initial);

      const perspectiveX = box.x + box.width * 0.75;
      const perspectiveY = box.y + box.height * 0.25;
      await page.mouse.move(perspectiveX, perspectiveY);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(perspectiveX - 36, perspectiveY + 18);
      await page.mouse.up({ button: 'right' });
      await expectTargetChanged(afterOrtho);

      await page.keyboard.press('r');
      await expect.poll(async () => {
        const reset = await readTarget();
        return Math.hypot(
          reset[0] - initial[0],
          reset[1] - initial[1],
          reset[2] - initial[2],
        );
      }).toBeLessThan(0.000001);
    });

  test('small viewport mode tabs switch deterministically after load', async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 720 });
      await page.goto('/');

      await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-viewport-layout', 'single');
      await expect(page.getByTestId('viewport-layout-quad')).toBeDisabled();

      await page.getByTestId('model-file-input').setInputFiles(SAMPLE_SMF);
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await expect(page.getByTestId('viewport-layout-quad')).toBeEnabled();

      await showModernPanel(page, 'properties');
      const inspector = page.getByTestId('inspector');
      const firstBone = await workspaceLocator(page, inspector.locator('li > div').filter({ hasText: /./ }).first());
      await firstBone.click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Selected:/i);
      const selectedBefore = parseSelectedBone(await page.getByTestId('status-text').textContent());

      await showAnimateTimeline(page);
      await pausePlaybackIfRunning(page);
      const slider = page.getByTestId('timeline').locator('input[type="range"]');
      await slider.fill('0.2');
      const scrubBefore = await page.getByTestId('three-canvas').getAttribute('data-playback-time');

      const switchMode = async (
        mode: 'view' | 'rig' | 'skin' | 'animate' | 'export',
        panelTestId?: string,
      ): Promise<void> => {
        const tab = page.getByTestId(`mode-tab-${mode}`);
        await expect(page.getByTestId('modern-workspace-button')).toBeVisible();
        await selectWorkspace(page, mode);
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        if (panelTestId) {
          if (mode !== 'skin') await showModernPanel(page, 'properties');
          await expect(page.getByTestId(panelTestId)).toBeVisible();
        }
        await expect(page.getByTestId('three-canvas')).toBeVisible();
      };

      await switchMode('rig');
      await switchMode('skin', 'skin-workspace-panel');
      await switchMode('animate', 'animate-workspace-panel');
      await switchMode('export', 'export-workspace-panel');
      await switchMode('view');

      const statusAfter = await page.getByTestId('status-text').textContent();
      expect(parseSelectedBone(statusAfter)).toBe(selectedBefore);
      await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-playback-time', scrubBefore!);
    });

  test('workspace transition matrix preserves loaded authoring and tool ownership state', async ({ page }) => {
      await page.goto('/');

      await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      const canvas = page.getByTestId('three-canvas');
      const rootId = await canvas.getAttribute('data-model-root-id');
      expect(rootId).toBeTruthy();

      await showModernPanel(page, 'scene');

      const selectedSubmodel = (await workspaceControl(page, 'outliner-submodel-0'));
      await selectedSubmodel.locator('.outliner-name-btn').click();
      await expect(selectedSubmodel).toHaveAttribute('data-selected', 'true');
      await expect(page.getByTestId('outliner-selection-count')).toContainText('1 selected');

      await selectWorkspace(page, 'rig');
      const boneEntry = await workspaceLocator(page, page.getByTestId('inspector').locator('li > div').filter({ hasText: /FixtureTip/ }).first());
      await boneEntry.click({ force: true });
      await expect(page.getByTestId('inspector-selected')).toHaveText('FixtureTip');
      await (await workspaceControl(page, 'transform-x-btn')).click();

      await selectWorkspace(page, 'animate');
      await pausePlaybackIfRunning(page);
      await setRangeValue(page, 'scrub-slider', 0.2);
      await (await workspaceControl(page, 'animation-insert-key-btn')).click();
      await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');
      const scrubState = await canvas.getAttribute('data-playback-time');

      await selectWorkspace(page, 'skin');
      await showSkinAdvanced(page);
      await page.getByTestId('modern-skin-tool-paint').click();
      await (await workspaceControl(page, 'skin-paint-mode-add')).click();
      await setRangeValue(page, 'skin-paint-target', 1);
      await setRangeValue(page, 'skin-paint-radius', 1);
      await setRangeValue(page, 'skin-paint-strength', 1);
      expect(await paintOnMeshInViewport(page, { requireDirty: true })).toBe(true);
      await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true');

      const expectPair = async (xName: string, yName: string): Promise<void> => {
        await expect.poll(async () => {
          const x = Number(await canvas.getAttribute(xName));
          const y = Number(await canvas.getAttribute(yName));
          return Number.isFinite(x) && Number.isFinite(y);
        }).toBe(true);
      };

      await selectWorkspace(page, 'rig');
      await (await workspaceControl(page, 'rig-tool-select')).click();
      await expect(canvas).toHaveAttribute('data-transform-attached', 'true');
      await expect(canvas).not.toHaveAttribute('data-endpoint-x');
      await expect(canvas).not.toHaveAttribute('data-rig-ik-target-screen-x');

      await (await workspaceControl(page, 'rig-tool-endpoint')).click();
      await expect(canvas).toHaveAttribute('data-transform-attached', 'false');
      await expectPair('data-endpoint-x', 'data-endpoint-y');
      await expect(canvas).not.toHaveAttribute('data-rig-ik-target-screen-x');
      await selectWorkspace(page, 'animate');
      await expect(canvas).not.toHaveAttribute('data-endpoint-x');
      await expect(canvas).not.toHaveAttribute('data-endpoint-drag');
      await expect(canvas).toHaveAttribute('data-transform-attached', 'true');

      await selectWorkspace(page, 'rig');
      await expectPair('data-endpoint-x', 'data-endpoint-y');
      await (await workspaceControl(page, 'rig-tool-ik')).click();
      await expect(canvas).toHaveAttribute('data-transform-attached', 'false');
      await expect(canvas).not.toHaveAttribute('data-endpoint-x');
      await expectPair('data-rig-ik-target-screen-x', 'data-rig-ik-target-screen-y');
      await selectWorkspace(page, 'skin');
      await expect(canvas).not.toHaveAttribute('data-rig-ik-target-screen-x');
      await expect(canvas).not.toHaveAttribute('data-rig-ik');
      await expect(canvas).toHaveAttribute('data-transform-attached', 'false');
      await selectWorkspace(page, 'rig');
      await expectPair('data-rig-ik-target-screen-x', 'data-rig-ik-target-screen-y');
      await (await workspaceControl(page, 'rig-tool-select')).click();
      await expect(canvas).not.toHaveAttribute('data-rig-ik-target-screen-x');
      await expect(canvas).toHaveAttribute('data-transform-attached', 'true');

      const downloadPromise = page.waitForEvent('download');
      await revealSecondaryCommands(page);
      await page.getByTestId('export-glb-btn').click();
      await downloadPromise;
      await page.getByTestId('modern-more-menu-button').click();
      await expect(page.getByTestId('status-text')).toContainText(/Exported \.glb/i, { timeout: 5000 });

      const assertContinuity = async (): Promise<void> => {
        await expect(canvas).toHaveAttribute('data-model-root-id', rootId!);
        await expect(canvas).toHaveAttribute('data-selection-overlay-count', /[1-9]\d*/);
        await expect(canvas).toHaveAttribute('data-playback-time', scrubState!);
        await expect(page.getByTestId('status-text')).toContainText(/Exported \.glb/i);
      };

      await setViewportLayout(page, 'quad');
      for (const mode of ['view', 'rig', 'skin', 'animate', 'export'] as const) {
        await selectWorkspace(page, mode);
        await assertContinuity();
        if (mode === 'skin') {
          await showSkinAdvanced(page);
          await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true');
        } else if (mode === 'animate') {
          await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');
          await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');
        }
      }

      await setViewportLayout(page, 'single');
      await page.getByTestId('viewport-perspective-toggle').click();
      await expect(canvas).toHaveAttribute('data-perspective-enabled', 'false');
      for (const mode of ['view', 'animate', 'export'] as const) {
        await selectWorkspace(page, mode);
        await assertContinuity();
      }
    });

  test('repairs rigged materials as one undoable model transaction', async ({ page }) => {
      await page.goto('/');

      await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await showModernPanel(page, 'scene');
      await showModernPanel(page, 'scene');
      const repair = (await workspaceControl(page, 'outliner-repair-materials'));
      await expect(repair.locator('input')).toBeEnabled();
      await repair.locator('input').setInputFiles([
        { name: 'fixture.obj', mimeType: 'text/plain', buffer: Buffer.from(MATERIAL_REPAIR_OBJ) },
        { name: 'fixture.mtl', mimeType: 'text/plain', buffer: Buffer.from(MATERIAL_REPAIR_MTL) },
        { name: 'fixture.png', mimeType: 'image/png', buffer: MATERIAL_REPAIR_PNG },
      ]);

      await expect(page.getByTestId('status-text')).toContainText(/Repaired 1 rigged mesh material from OBJ\/MTL/i, { timeout: 15000 });
      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid repair rigged materials/i);
      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid repair rigged materials/i);
    });

  test('handles invalid file load with error banner and status (error path)', async ({ page }) => {
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(BAD_INPUT_FOR_ERROR_TEST);

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
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(SAMPLE_SMF);

      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await expect(page.getByTestId('status-text')).toContainText(/mixamo|Loaded|bones|clips|verts/i);

      // Visual snapshot after load (normalization + initial framing; tolerant for env)
      const canvas = page.getByTestId('three-canvas');
      await pausePlaybackIfRunning(page);
      await expectRenderedScreenshot(canvas);

      // Bone list select (targets label divs inside li for the nested/collapsible tree structure; clicks name to select)
      // Also exercises toggle for collapse/expand
      await showModernPanel(page, 'properties');
      const inspector = page.getByTestId('inspector');
      const anyBoneEntry = await workspaceLocator(page, inspector.locator('li > div').filter({ hasText: /./ }).nth(0));
      if (await anyBoneEntry.count() > 0) {
        await anyBoneEntry.click({ force: true }).catch(() => {});
        await page.waitForTimeout(60);
        await expect(page.getByTestId('status-text')).toContainText(/Selected:/i);
      }
      // Toggle first +/- if present (tests collapse edge for deep rigs)
      const toggle = inspector.locator('span').filter({ hasText: /[+-]/ }).first();
      if (await toggle.count() > 0) {
        await toggle.click({ force: true }).catch(() => {});
        await page.waitForTimeout(60);
        // Double-toggle to test both collapse and re-expand states
        await toggle.click({ force: true }).catch(() => {});
        await page.waitForTimeout(60);
      }

      // Canvas/raycast click for 3D bone select belongs to Rig mode; View mode now handles model/submodel picking.
      await selectWorkspace(page, 'rig');
      const hover = await hoverPickableBoneInViewport(page);
      expect(hover).not.toBeNull();
      await expect(canvas).toHaveAttribute('data-hover-label-visible', 'true');
      await expect(canvas).toHaveAttribute(
        'title',
        new RegExp(`Bone: ${escapeRegex(hover!.bone)} · [A-Za-z_]+`),
      );
      await page.mouse.move(5, 5);
      await expect(canvas).toHaveAttribute('data-hover-label-visible', 'false');
      await expect(canvas).toHaveAttribute('title', '');

      expect(await clickPickableBoneInViewport(page, 'rig-select')).not.toBeNull();
      await expect(page.getByTestId('status-text')).toContainText(/Selected:/i);
      const selectedAfterClick = parseSelectedBone(await page.getByTestId('status-text').textContent());
      expect(selectedAfterClick).toBeTruthy();

      const canvasBox = await canvas.boundingBox();
      expect(canvasBox).toBeTruthy();
      await page.mouse.move(canvasBox!.x + 90, canvasBox!.y + 90);
      await page.mouse.down({ button: 'left' });
      await page.mouse.move(canvasBox!.x + 120, canvasBox!.y + 124);
      await page.mouse.up({ button: 'left' });
      await page.waitForTimeout(60);
      expect(parseSelectedBone(await page.getByTestId('status-text').textContent())).toBe(selectedAfterClick);

      await page.mouse.move(canvasBox!.x + 130, canvasBox!.y + 130);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(canvasBox!.x + 160, canvasBox!.y + 150);
      await page.mouse.up({ button: 'right' });
      await page.waitForTimeout(60);
      await expect(canvas).toHaveAttribute('data-pointer-owner', 'orbit');
      expect(parseSelectedBone(await page.getByTestId('status-text').textContent())).toBe(selectedAfterClick);

      // Confirm inspector reflects bones (rig info indirectly via count)
      await expect(inspector).toContainText(/Bones \(\d+\)/i);

      // Visual after bone select (marker visible, normalized framing)
      await expectRenderedScreenshot(canvas);

      // Exercise transform buttons + new Cycle 3 editor UI (gizmo modes T/R/S + weight preview toggle) for full bone UX coverage (list/raycast + controls + viz)
      const xBtn = (await workspaceControl(page, 'transform-x-btn'));
      if (await xBtn.count() > 0) {
        await xBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(40);
      }
      const resetBtn = (await workspaceControl(page, 'transform-reset-btn'));
      if (await resetBtn.count() > 0) {
        await resetBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(40);
      }

      // Exercise Cycle 3 editor UI buttons (mode + weight preview) - coverage for new controls (T/R/S + weight viz toggle)
      // Clicks ensure no crash, DOM present, state updates (toggle twice for weight)
      const weightBtn = (await workspaceControl(page, 'weight-preview-btn'));
      if (await weightBtn.count() > 0) {
        await weightBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(40);
        await weightBtn.click({ force: true }).catch(() => {}); // toggle off
        await page.waitForTimeout(40);
      }
      const tBtn = (await workspaceControl(page, 'mode-translate-btn'));
      if (await tBtn.count() > 0) {
        await tBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(40);
      }
      await expect(page.getByTestId('three-canvas')).toBeVisible();

      // Visual + control for animation play state (after load + bone UX)
      // Click play if timeline button present (tests control + visual during anim; tolerant snapshot)
      const playBtn = page.locator('button').filter({ hasText: /play|pause|▶|⏸/i }).first();
      if (await playBtn.count() > 0) {
        await playBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(120);
        await pausePlaybackIfRunning(page);
        await expectRenderedScreenshot(canvas);
      }

      // More interactive camera controls (zoom wheel, drag rotate, right-drag pan) + visual
      // Tests the enhanced SimpleOrbit (pan added) and normalization (framing)
      await canvas.hover({ position: { x: 150, y: 150 } });
      await page.mouse.wheel(0, -150); // zoom in
      await page.waitForTimeout(80);
      await expectRenderedScreenshot(canvas);

      await page.mouse.down();
      await page.mouse.move(200, 120);
      await page.mouse.up();
      await page.waitForTimeout(80);
      await expectRenderedScreenshot(canvas);

      // right drag for pan (new support)
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(180, 130);
      await page.mouse.up();
      await page.waitForTimeout(80);
      await expectRenderedScreenshot(canvas);

      // keyboard interactive (R reset, space play, T/R/S modes)
      await page.keyboard.press('r');
      await page.waitForTimeout(50);
      await expectRenderedScreenshot(canvas);

      await page.keyboard.press(' ');
      await page.waitForTimeout(100);
      await page.keyboard.press(' ');
      await page.waitForTimeout(50);

      await page.keyboard.press('t');
      await page.waitForTimeout(30);
      await page.keyboard.press('r');
      await page.waitForTimeout(30);
      await page.keyboard.press('s');
      await page.waitForTimeout(30);
    });

  // Viewport coverage for transform controls, weight preview, bone selection, and SMF load state.
    test('viewport features smoke', async ({ page }) => {
      await page.goto('/');
      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(SAMPLE_SMF);
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });

      // Viewport basics
      const canvas = page.getByTestId('three-canvas');
      await expect(canvas).toBeVisible();
      await expect(canvas).toHaveAttribute('data-transform-owner', 'disabled');
      await expect(canvas).toHaveAttribute('data-transform-attached', 'false');

      // Weight preview toggle (for weight preview behavior)
      const weightBtn = (await workspaceControl(page, 'weight-preview-btn'));
      if (await weightBtn.count() > 0) {
        await expect(weightBtn).toBeVisible();
      }

      await selectWorkspace(page, 'rig');
      const inspector = page.getByTestId('inspector');
      const boneEntry = await workspaceLocator(page, inspector.locator('li > div').filter({ hasText: /./ }).first());
      await expect(boneEntry).toBeVisible();
      await boneEntry.click({ force: true });

      // Transform buttons (for drag/gizmo coverage)
      await expect(await workspaceControl(page, 'transform-x-btn')).toBeVisible();
      await expect(page.getByTestId('mode-translate-btn')).toBeVisible();
      await expect(canvas).toHaveAttribute('data-transform-owner', 'pose');
      await expect(canvas).toHaveAttribute('data-transform-attached', 'true');

      // Bone selection via inspector (raycast complement)
      await expect(await workspaceLocator(page, inspector.locator('li > div').filter({ hasText: /./ }).first())).toBeVisible();
    });
});
