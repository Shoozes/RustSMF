import { test, expect } from '@playwright/test';
import { SAMPLE_SMF, getBrowserErrors, pausePlaybackIfRunning, setupBrowserDiagnostics } from './helpers/smoke-helpers';
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

      await page.getByTestId('mode-tab-rig').click({ force: true });
      const inspector = page.getByTestId('inspector');
      const boneEntry = inspector.locator('li > div').filter({ hasText: /FixtureTip/ }).first();
      await expect(boneEntry).toBeVisible();
      await boneEntry.click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Selected:\s*FixtureTip/i);

      await page.getByTestId('transform-x-btn').click({ force: true });
      await expect(page.getByTestId('editor-undo-btn')).toBeEnabled();
      await expect(page.getByTestId('editor-redo-btn')).toBeDisabled();

      await page.getByTestId('mode-tab-animate').click({ force: true });
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

  test('SMF rig policy gates indexed edits and bind reset is reversible', async ({ page }) => {
      await page.goto('/');
      await page.getByTestId('model-file-input').setInputFiles(SAMPLE_SMF);
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await pausePlaybackIfRunning(page);
      await page.getByTestId('mode-tab-rig').click({ force: true });

      const childBone = page.getByTestId('inspector')
        .locator('li li > div')
        .filter({ hasText: /SMF_Node_\d+/ })
        .first();
      await expect(childBone).toBeVisible({ timeout: 8000 });
      await childBone.click({ force: true });

      const policy = page.getByTestId('smf-rig-policy');
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

      await page.getByTestId('transform-x-btn').click();
      await page.getByTestId('mode-tab-animate').click({ force: true });
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');
      await page.getByTestId('mode-tab-export').click({ force: true });
      await page.getByTestId('smf-roundtrip-check-btn').click();
      await expect(page.getByTestId('smf-roundtrip-result')).toHaveAttribute('data-smf-roundtrip-ok', 'true', { timeout: 15000 });

      await page.getByTestId('mode-tab-rig').click({ force: true });
      await page.getByTestId('transform-reset-btn').click();
      await expect(page.getByTestId('status-text')).toContainText(/Reset SMF_Node_\d+ to its bind pose/i);
      await page.getByTestId('mode-tab-animate').click({ force: true });
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

      await page.getByTestId('mode-tab-rig').click({ force: true });
      await expect(page.getByTestId('three-canvas')).toBeVisible();

      const inspector = page.getByTestId('inspector');
      const boneEntry = inspector
        .locator('li > div')
        .filter({ hasText: /SMF_Node_\d+/ })
        .first();
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
      await page.getByTestId('rig-tool-endpoint').click();
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

      await page.getByTestId('mode-tab-animate').click({ force: true });
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');
      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: false');
      await page.getByTestId('mode-tab-rig').click({ force: true });

      const canceledDrag = await dragEndpointHandle(page, selectedBone, undefined, async () => {
        await expect(singleCanvas).toHaveAttribute('data-transform-attached', 'false');
        await expect(singleCanvas).toHaveAttribute('data-endpoint-drag', 'active');
      }, 'cancel');
      expect(canceledDrag).toBe(true);
      await expect(singleCanvas).not.toHaveAttribute('data-endpoint-drag', 'active');
      await expect(singleCanvas).toHaveAttribute('data-transform-attached', 'false');
      await expect(page.getByTestId('status-text')).toContainText(/Canceled endpoint drag .* restored the prior pose/i);

      await page.getByTestId('mode-tab-animate').click({ force: true });
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: false');
      await page.getByTestId('mode-tab-rig').click({ force: true });

      await setViewportLayout(page, 'quad');
      const quadDragOk = await dragEndpointHandle(page, selectedBone);
      expect(quadDragOk).toBe(true);
      await expect(singleCanvas).toHaveAttribute('data-viewport-pane-role', 'perspective');
      await expect(singleCanvas).toHaveAttribute('data-pointer-owner', 'rig-endpoint-drag');
      await expect(singleCanvas).toHaveAttribute('data-bone-transform-source', 'endpoint-drag');

      await setViewportLayout(page, 'single');
      await expect(singleCanvas).not.toHaveAttribute('data-endpoint-drag', 'active');
      await page.getByTestId('rig-tool-select').click();
      await expect(singleCanvas).toHaveAttribute('data-transform-attached', 'true');
    });

  test('SMF IK pose drag is constrained, cancelable, atomic, and export-safe', async ({ page }) => {
      await page.goto('/');
      await page.getByTestId('model-file-input').setInputFiles(SAMPLE_SMF);
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await pausePlaybackIfRunning(page);
      await page.getByTestId('mode-tab-rig').click({ force: true });

      const inspector = page.getByTestId('inspector');
      const childBone = inspector.locator('li li > div').filter({ hasText: /SMF_Node_\d+/ }).first();
      await expect(childBone).toBeVisible({ timeout: 8000 });
      await childBone.click({ force: true });

      const canvas = page.getByTestId('three-canvas');
      await page.getByTestId('rig-tool-ik').click();
      await expect(page.getByTestId('rig-tool-ik')).toHaveClass(/bg-amber-400/);
      await expect(page.getByTestId('rig-ik-settings')).toBeVisible();
      await page.getByTestId('rig-ik-chain-length').selectOption('1');
      await page.getByTestId('rig-ik-pole-axis').selectOption('z');
      await page.getByTestId('rig-ik-joint-limit').selectOption('120');
      await expect(canvas).toHaveAttribute('data-rig-tool-mode', 'ik');
      await expect(canvas).toHaveAttribute('data-transform-attached', 'false');

      expect(await dragRigIkTarget(page)).toBe(true);
      await expect(canvas).toHaveAttribute('data-pointer-owner', 'rig-ik-drag');
      await expect(canvas).toHaveAttribute('data-rig-ik-status', /reached|unreachable|constrained|iteration-limit/);
      await expect(page.getByTestId('rig-ik-result')).toBeVisible();
      await expect(page.getByTestId('status-text')).toContainText(/Recorded IK pose .* one 2-bone transaction/i);

      await page.getByTestId('mode-tab-animate').click({ force: true });
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');
      await page.getByTestId('editor-undo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Undid IK pose/i);
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: false');

      await page.getByTestId('mode-tab-rig').click({ force: true });
      expect(await dragRigIkTarget(page, 'escape')).toBe(true);
      await expect(page.getByTestId('status-text')).toContainText(/Canceled IK pose .* restored the full chain/i);
      await page.getByTestId('mode-tab-animate').click({ force: true });
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: false');

      await page.getByTestId('editor-redo-btn').click({ force: true });
      await expect(page.getByTestId('status-text')).toContainText(/Redid IK pose/i);
      await expect(page.getByTestId('pose-edit-state')).toContainText('Pose edit dirty: true');

      await page.getByTestId('mode-tab-export').click({ force: true });
      await page.getByTestId('smf-roundtrip-check-btn').click();
      await expect(page.getByTestId('smf-roundtrip-result')).toHaveAttribute('data-smf-roundtrip-ok', 'true', { timeout: 5000 });
      await expect(page.getByTestId('smf-roundtrip-result')).toHaveAttribute('data-smf-roundtrip-status', 'passed');

      await page.getByTestId('export-glb-btn').click();
      await expect(page.getByTestId('status-text')).toContainText(/Exported \.glb/i, { timeout: 5000 });
      await page.getByTestId('export-smf-btn').click();
      await expect(page.getByTestId('status-text')).toContainText(/Exported \.smf .*pose edits applied/i, { timeout: 5000 });

      const errors = getBrowserErrors(page).filter((entry) => entry.includes('ERROR'));
      expect(errors).toEqual([]);
    });

  test('real TransformControls handle separates Rig pose and Animate key ownership', async ({ page }) => {
      await page.goto('/');
      await page.getByTestId('model-file-input').setInputFiles(await createSkinnedGlbFixtureInput());
      await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15000 });
      await pausePlaybackIfRunning(page);

      await page.getByTestId('mode-tab-rig').click({ force: true });
      const boneEntry = page.getByTestId('inspector')
        .locator('li > div')
        .filter({ hasText: /FixtureTip/ })
        .first();
      await expect(boneEntry).toBeVisible({ timeout: 8000 });
      await boneEntry.click({ force: true });

      const canvas = page.getByTestId('three-canvas');
      await expect(canvas).toHaveAttribute('data-transform-owner', 'pose');
      const rigAxis = await dragTransformHandle(page);
      expect(rigAxis).toMatch(/^[XYZ]$/);
      await expect(canvas).toHaveAttribute('data-bone-transform-owner', 'pose');
      await expect(page.getByTestId('status-text')).toContainText(/Recorded transform pose edit for FixtureTip/i);

      await page.getByTestId('mode-tab-animate').click({ force: true });
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

      await page.getByTestId('mode-tab-export').click({ force: true });
      await expect(canvas).toHaveAttribute('data-transform-attached', 'false');
      await page.getByTestId('smf-roundtrip-check-btn').click();
      await expect(page.getByTestId('smf-roundtrip-result')).toHaveAttribute('data-smf-roundtrip-ok', 'true', { timeout: 15000 });

      const errors = getBrowserErrors(page).filter((entry) => entry.includes('ERROR'));
      expect(errors).toEqual([]);
    });
});
