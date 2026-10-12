import { workspaceLocator, workspaceControl, selectWorkspace, clickSecondaryCommand } from './helpers/modern-shell';

import { test, expect } from '@playwright/test';
import { SAMPLE_OBJ, SAMPLE_SMF, getBrowserErrors, pausePlaybackIfRunning, setupBrowserDiagnostics } from './helpers/smoke-helpers';
import { createSkinnedGlbFixtureInput } from './helpers/skinned-glb-fixture';
import { parseSelectedBone } from './helpers/format-assertions';
import { dragEndpointHandle, dragRigIkTarget, dragTransformHandle, setViewportLayout } from './helpers/viewport-interactions';

// Browser integration coverage is split by feature ownership.
// Native IPC and filesystem coverage lives in native.spec.ts and Rust tests.

test.describe('RustSMF rig flow (Chromium)', () => {
  test.beforeEach(async ({ page }) => {
    setupBrowserDiagnostics(page);
  });

  test('global pose undo and redo track nudge transactions', async ({ page }) => {
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await expect(page.getByTestId('status-text')).toContainText(/generated-skinned-fixture|bones: 2|clips: 1/i);

      await expect(page.getByTestId('editor-undo-btn')).toBeDisabled();
      await expect(page.getByTestId('editor-redo-btn')).toBeDisabled();

      await selectWorkspace(page, 'rig');
      const canvas = page.getByTestId('three-canvas');
      await expect(canvas).toHaveAttribute('data-workspace-pose', 'rest');
      await expect(canvas).toHaveAttribute('data-bone-labels-enabled', 'false');
      const inspector = page.getByTestId('inspector');
      const boneEntry = await workspaceLocator(page, inspector.locator('li > div').filter({ hasText: /FixtureTip/ }).first());
      await expect(boneEntry).toBeVisible();
      await boneEntry.click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Selected:\s*FixtureTip/i);

      await (await workspaceControl(page, 'transform-x-btn')).click();
      await expect(page.getByTestId('editor-undo-btn')).toBeEnabled();
      await expect(page.getByTestId('editor-redo-btn')).toBeDisabled();

      await selectWorkspace(page, 'animate');
      await expect(canvas).toHaveAttribute('data-workspace-pose', 'animation');
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');

      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid Nudge FixtureTip/i);
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: false');
      await expect(page.getByTestId('editor-undo-btn')).toBeDisabled();
      await expect(page.getByTestId('editor-redo-btn')).toBeEnabled();

      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid Nudge FixtureTip/i);
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');
      await expect(page.getByTestId('editor-undo-btn')).toBeEnabled();

      await page.keyboard.press('Control+Z');
      await expect(page.getByTestId('status-text')).toContainText(/Undid Nudge FixtureTip/i);
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: false');

      await page.keyboard.press('Control+Y');
      await expect(page.getByTestId('status-text')).toContainText(/Redid Nudge FixtureTip/i);
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');
    });

  test('static OBJ root preparation is reversible, replacement-guarded, and export-safe', async ({ page }) => {
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(SAMPLE_OBJ);
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      const originalRootId = await page.getByTestId('three-canvas').getAttribute('data-model-root-id');
      expect(originalRootId).toBeTruthy();

      await selectWorkspace(page, 'rig');
      await expect(page.getByTestId('rig-bone-count')).toHaveText('0');
      await expect(page.getByTestId('rig-skinned-mesh-count')).toHaveText('0');
      await expect(page.getByTestId('rig-prepare-static-panel')).toBeVisible();
      await (await workspaceControl(page, 'rig-prepare-root-skeleton')).click();
      await expect(page.getByTestId('status-text')).toContainText(/Prepared root skeleton "Root" on 1 mesh/i);
      await expect(page.getByTestId('rig-bone-count')).toHaveText('1');
      await expect(page.getByTestId('rig-skinned-mesh-count')).toHaveText('1');
      await expect(page.getByTestId('rig-prepare-static-panel')).toHaveCount(0);
      await expect(page.getByTestId('editor-undo-btn')).toBeEnabled();

      await selectWorkspace(page, 'export');
      const diagnostics = page.getByTestId('smf-diagnostics-panel');
      await expect(diagnostics).toHaveAttribute('data-smf-can-export', 'true');
      await expect(page.getByTestId('export-smf-btn')).toBeEnabled();
      await page.getByTestId('smf-roundtrip-check-btn').click();
      await expect(page.getByTestId('smf-roundtrip-result')).toHaveAttribute('data-smf-roundtrip-ok', 'true', { timeout: 15000 });
      await clickSecondaryCommand(page, 'export-glb-btn');
      await expect(page.getByTestId('status-text')).toContainText(/Exported \.glb .*1 bones/i, { timeout: 15000 });
      await clickSecondaryCommand(page, 'export-smf-btn');
      await expect(page.getByTestId('status-text')).toContainText(/Exported \.smf .*validated threeToSmf converter/i, { timeout: 15000 });

      await page.getByTestId('editor-undo-btn').click();
      await expect(page.getByTestId('status-text')).toContainText(/Undid prepare root skeleton for static meshes/i);
      await selectWorkspace(page, 'rig');
      await expect(page.getByTestId('rig-bone-count')).toHaveText('0');
      await expect(page.getByTestId('rig-skinned-mesh-count')).toHaveText('0');
      await expect(page.getByTestId('rig-prepare-static-panel')).toBeVisible();
      await selectWorkspace(page, 'export');
      await expect(diagnostics).toHaveAttribute('data-smf-can-export', 'false');
      await expect(diagnostics).toContainText('SMF_NO_SKINNED_SKELETON');
      await expect(page.getByTestId('export-smf-btn')).toBeDisabled();

      await page.getByTestId('editor-redo-btn').click();
      await expect(page.getByTestId('status-text')).toContainText(/Redid prepare root skeleton for static meshes/i);
      await selectWorkspace(page, 'rig');
      await expect(page.getByTestId('rig-bone-count')).toHaveText('1');
      await expect(page.getByTestId('rig-skinned-mesh-count')).toHaveText('1');

      await input.setInputFiles(SAMPLE_SMF);
      await expect(page.getByTestId('replacement-dialog')).toBeVisible();
      await page.getByTestId('cancel-model-replacement').click();
      await expect(page.getByTestId('replacement-dialog')).toHaveCount(0);
      await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-model-root-id', originalRootId!);
      await expect(page.getByTestId('rig-bone-count')).toHaveText('1');

      await input.setInputFiles(SAMPLE_SMF);
      await expect(page.getByTestId('replacement-dialog')).toBeVisible();
      await page.getByTestId('confirm-model-replacement').click();
      await expect(page.getByTestId('status-text')).toContainText(/Loaded:.*\.smf/i, { timeout: 15000 });
      await expect(page.getByTestId('three-canvas')).not.toHaveAttribute('data-model-root-id', originalRootId!);

      expect(getBrowserErrors(page).filter((entry) => entry.includes('ERROR'))).toEqual([]);
    });

  test('SMF rig policy gates indexed edits and bind reset is reversible', async ({ page }) => {
      await page.goto('/');
      await page.getByTestId('model-file-input').setInputFiles(SAMPLE_SMF);
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await pausePlaybackIfRunning(page);
      await selectWorkspace(page, 'rig');

      const childBone = await workspaceLocator(page, page.getByTestId('inspector')
        .locator('li li > div')
        .filter({ hasText: /SMF_Node_\d+/ })
        .first());
      await expect(childBone).toBeVisible({ timeout: 8000 });
      await childBone.click({ force: true });

      const policy = await workspaceControl(page, 'smf-rig-policy');
      await expect(policy).toBeVisible();
      await expect(page.getByTestId('smf-rig-policy-rename')).toHaveAttribute('data-smf-rig-supported', 'false');
      await expect(page.getByTestId('smf-rig-policy-structure')).toContainText(/head nodes.*skin indices.*animation/i);
      await expect(page.getByTestId('smf-rig-policy-bind-transform')).toContainText(/rig-space rewrite/i);
      await expect(page.getByTestId('smf-rig-policy-mirror')).toContainText(/no mirror command.*no left\/right pairing/i);
      await expect(page.getByTestId('smf-rig-policy-reset')).toHaveAttribute('data-smf-rig-supported', 'true');
      await expect(page.getByTestId('rig-rename-btn')).toBeDisabled();
      await expect(page.getByTestId('rig-rename-btn')).toHaveAttribute('title', /no persisted name field/i);
      await expect(page.getByTestId('rig-detach-toggle-btn')).toBeDisabled();
      await expect(page.getByTestId('rig-detach-toggle-btn')).toHaveAttribute('title', /parent\/isBone records.*head nodes.*skin indices/i);
      await expect(page.getByTestId('rig-tool-move')).toBeDisabled();
      await expect(page.getByTestId('rig-tool-move')).toHaveAttribute('title', /coordinated rig-space rewrite/i);

      await (await workspaceControl(page, 'transform-x-btn')).click();
      await selectWorkspace(page, 'animate');
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');
      await selectWorkspace(page, 'export');
      await page.getByTestId('smf-roundtrip-check-btn').click();
      await expect(page.getByTestId('smf-roundtrip-result')).toHaveAttribute('data-smf-roundtrip-ok', 'true', { timeout: 15000 });

      await selectWorkspace(page, 'rig');
      await (await workspaceControl(page, 'transform-reset-btn')).click();
      await expect(page.getByTestId('status-text')).toContainText(/Reset SMF_Node_\d+ to its bind pose/i);
      await selectWorkspace(page, 'animate');
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: false');
      await page.getByTestId('editor-undo-btn').click();
      await expect(page.getByTestId('status-text')).toContainText(/Undid Reset bind pose SMF_Node_\d+/i);
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');
      await page.getByTestId('editor-redo-btn').click();
      await expect(page.getByTestId('status-text')).toContainText(/Redid Reset bind pose SMF_Node_\d+/i);
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: false');
    });

  test('endpoint drag works in rig mode across single and quad layouts', async ({ page }) => {
      await page.goto('/');

      const input = page.getByTestId('model-file-input');
      await input.setInputFiles(SAMPLE_SMF);
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await expect(page.getByTestId('status-text')).toContainText(/Loaded|bones|clips|verts/i);

      await selectWorkspace(page, 'rig');
      await expect(page.getByTestId('three-canvas')).toBeVisible();

      const inspector = page.getByTestId('inspector');
      const boneEntry = await workspaceLocator(page, inspector
        .locator('li > div')
        .filter({ hasText: /SMF_Node_\d+/ })
        .first());
      await expect(boneEntry).toBeVisible({ timeout: 8000 });
      await boneEntry.click({ force: true });
      await page.waitForTimeout(80);

      const statusText = await page.getByTestId('status-text').textContent();
      const selectedBone = parseSelectedBone(statusText);
      expect(selectedBone).toBeTruthy();
      await page.waitForTimeout(180);

      const singleCanvas = page.getByTestId('three-canvas');
      await expect(singleCanvas).toHaveAttribute('data-transform-owner', 'pose');
      await expect(singleCanvas).toHaveAttribute('data-transform-attached', 'true');
      await (await workspaceControl(page, 'rig-tool-endpoint')).click();
      await expect(singleCanvas).toHaveAttribute('data-rig-tool-mode', 'endpoint');
      await expect(singleCanvas).toHaveAttribute('data-transform-attached', 'false');
      const singleDrag = await dragEndpointHandle(page, selectedBone, undefined, async () => {
        await expect(singleCanvas).toHaveAttribute('data-transform-attached', 'false');
        await expect(singleCanvas).toHaveAttribute('data-endpoint-drag', 'active');
      });
      expect(singleDrag).toBe(true);
      await expect(singleCanvas).toHaveAttribute('data-pointer-owner', 'rig-endpoint-drag');
      await expect(singleCanvas).toHaveAttribute('data-bone-transform-source', 'endpoint-drag');
      await expect(singleCanvas).toHaveAttribute('data-transform-attached', 'false');

      await selectWorkspace(page, 'animate');
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');
      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: false');
      await selectWorkspace(page, 'rig');

      const canceledDrag = await dragEndpointHandle(page, selectedBone, undefined, async () => {
        await expect(singleCanvas).toHaveAttribute('data-transform-attached', 'false');
        await expect(singleCanvas).toHaveAttribute('data-endpoint-drag', 'active');
      }, 'cancel');
      expect(canceledDrag).toBe(true);
      await expect(singleCanvas).not.toHaveAttribute('data-endpoint-drag', 'active');
      await expect(singleCanvas).toHaveAttribute('data-transform-attached', 'false');
      await expect(page.getByTestId('status-text')).toContainText(/Canceled endpoint drag .* restored the prior pose/i);

      await selectWorkspace(page, 'animate');
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: false');
      await selectWorkspace(page, 'rig');

      await setViewportLayout(page, 'quad');
      const quadDragOk = await dragEndpointHandle(page, selectedBone);
      expect(quadDragOk).toBe(true);
      await expect(singleCanvas).toHaveAttribute('data-viewport-pane-role', 'perspective');
      await expect(singleCanvas).toHaveAttribute('data-pointer-owner', 'rig-endpoint-drag');
      await expect(singleCanvas).toHaveAttribute('data-bone-transform-source', 'endpoint-drag');

      await setViewportLayout(page, 'single');
      await expect(singleCanvas).not.toHaveAttribute('data-endpoint-drag', 'active');
      await (await workspaceControl(page, 'rig-tool-select')).click();
      await expect(singleCanvas).toHaveAttribute('data-transform-attached', 'true');
    });

  test('SMF IK pose drag is constrained, cancelable, atomic, and export-safe', async ({ page }) => {
      await page.goto('/');
      await page.getByTestId('model-file-input').setInputFiles(SAMPLE_SMF);
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await pausePlaybackIfRunning(page);
      await selectWorkspace(page, 'rig');

      const inspector = page.getByTestId('inspector');
      const childBone = await workspaceLocator(page, inspector.locator('li li > div').filter({ hasText: /SMF_Node_\d+/ }).first());
      await expect(childBone).toBeVisible({ timeout: 8000 });
      await childBone.click({ force: true });

      const canvas = page.getByTestId('three-canvas');
      await (await workspaceControl(page, 'rig-tool-ik')).click();
      await expect(page.getByTestId('rig-tool-ik')).toHaveClass(/bg-amber-400/);
      await expect(page.getByTestId('rig-ik-settings')).toBeVisible();
      await (await workspaceControl(page, 'rig-ik-chain-length')).selectOption('1');
      await (await workspaceControl(page, 'rig-ik-pole-axis')).selectOption('z');
      await (await workspaceControl(page, 'rig-ik-joint-limit')).selectOption('120');
      await expect(canvas).toHaveAttribute('data-rig-tool-mode', 'ik');
      await expect(canvas).toHaveAttribute('data-transform-attached', 'false');

      expect(await dragRigIkTarget(page)).toBe(true);
      await expect(canvas).toHaveAttribute('data-pointer-owner', 'rig-ik-drag');
      await expect(canvas).toHaveAttribute('data-rig-ik-status', /reached|unreachable|constrained|iteration-limit/);
      await expect(page.getByTestId('rig-ik-result')).toBeVisible();
      await expect(page.getByTestId('status-text')).toContainText(/Recorded IK pose .* one 2-bone transaction/i);

      await selectWorkspace(page, 'animate');
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');
      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid IK pose/i);
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: false');

      await selectWorkspace(page, 'rig');
      expect(await dragRigIkTarget(page, 'escape')).toBe(true);
      await expect(page.getByTestId('status-text')).toContainText(/Canceled IK pose .* restored the full chain/i);
      await selectWorkspace(page, 'animate');
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: false');

      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid IK pose/i);
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');

      await selectWorkspace(page, 'export');
      await page.getByTestId('smf-roundtrip-check-btn').click();
      await expect(page.getByTestId('smf-roundtrip-result')).toHaveAttribute('data-smf-roundtrip-ok', 'true', { timeout: 5000 });
      await expect(page.getByTestId('smf-roundtrip-result')).toHaveAttribute('data-smf-roundtrip-status', 'passed');

      await clickSecondaryCommand(page, 'export-glb-btn');
      await expect(page.getByTestId('status-text')).toContainText(/Exported \.glb/i, { timeout: 5000 });
      await clickSecondaryCommand(page, 'export-smf-btn');
      await expect(page.getByTestId('status-text')).toContainText(/Exported \.smf .*pose edits applied/i, { timeout: 5000 });

      const errors = getBrowserErrors(page).filter((entry) => entry.includes('ERROR'));
      expect(errors).toEqual([]);
    });

  test('real TransformControls handle separates Rig pose and Animate key ownership', async ({ page }) => {
      await page.goto('/');
      await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await pausePlaybackIfRunning(page);

      await selectWorkspace(page, 'rig');
      const boneEntry = await workspaceLocator(page, page.getByTestId('inspector')
        .locator('li > div')
        .filter({ hasText: /FixtureTip/ })
        .first());
      await expect(boneEntry).toBeVisible({ timeout: 8000 });
      await boneEntry.click({ force: true });

      const canvas = page.getByTestId('three-canvas');
      await expect(canvas).toHaveAttribute('data-transform-owner', 'pose');
      const rigAxis = await dragTransformHandle(page);
      expect(rigAxis).toMatch(/^[XYZ]$/);
      await expect(canvas).toHaveAttribute('data-bone-transform-owner', 'pose');
      await expect(page.getByTestId('status-text')).toContainText(/Recorded transform pose edit for FixtureTip/i);

      await selectWorkspace(page, 'animate');
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');
      await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: false');
      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid Transform FixtureTip/i);
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: false');

      await expect(canvas).toHaveAttribute('data-transform-owner', 'animation');
      const animateAxis = await dragTransformHandle(page);
      expect(animateAxis).toMatch(/^[XYZ]$/);
      await expect(canvas).toHaveAttribute('data-bone-transform-owner', 'animation');
      await expect(page.getByTestId('status-text')).toContainText(/Recorded viewport animation keyframe for FixtureTip/i);
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: false');
      await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');

      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid viewport animation keyframe for FixtureTip/i);
      await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: false');
      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid viewport animation keyframe for FixtureTip/i);
      await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');

      await selectWorkspace(page, 'export');
      await expect(canvas).toHaveAttribute('data-transform-attached', 'false');
      await page.getByTestId('smf-roundtrip-check-btn').click();
      await expect(page.getByTestId('smf-roundtrip-result')).toHaveAttribute('data-smf-roundtrip-ok', 'true', { timeout: 15000 });

      const errors = getBrowserErrors(page).filter((entry) => entry.includes('ERROR'));
      expect(errors).toEqual([]);
    });
});
