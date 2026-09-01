import { createHash } from 'node:crypto';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  getBrowserErrors,
  pausePlaybackIfRunning,
  SAMPLE_SMF,
  setupBrowserDiagnostics,
} from '../helpers/smoke-helpers';
import { setRangeValue } from '../helpers/timeline-interactions';
import { showModernPanel, showSkinAdvanced } from '../helpers/modern-shell';
import {
  clickPickableBoneInViewport,
  hoverPickableBoneInViewport,
} from '../helpers/viewport-interactions';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, '../../../..');
const journeyOutputDir = path.join(repoRoot, 'output', 'playwright', 'hand-wave-journey');
const journeyVideoPath = path.join(journeyOutputDir, 'hand-wave-journey.webm');
const wavingArm = {
  upperArm: 'SMF_Node_12',
  forearm: 'SMF_Node_13',
  hand: 'SMF_Node_14',
} as const;
// Hold the shoulder outside the head silhouette and keep the wave in the elbow/hand range.
const wavePoses = {
  outer: { forearmRotationClicks: 5, handRotationClicks: -1 },
  inner: { forearmRotationClicks: 6, handRotationClicks: 1 },
} as const;
const skinRepairBone = wavingArm.forearm;
interface FixturePaintTarget {
  label: string;
  vertexIds: ReadonlySet<number>;
  posedWorld: Readonly<{ x: number; y: number; z: number }>;
  correctedWorld: Readonly<{ x: number; y: number; z: number }>;
}

// Mesh_4 is triangle soup, so each torso-seam position has several vertex IDs.
// Repair both faces of both seam corners; leaving one group on the forearm creates
// a rigid triangular bridge even when the nearest visible vertex is corrected.
const torsoSeamTargets = {
  frontLower: {
    label: 'front lower torso seam',
    vertexIds: new Set([19, 22, 24, 52, 55, 110, 111, 166]),
    posedWorld: { x: 4.2, y: 12.88, z: 1.34 },
    correctedWorld: { x: 2.28, y: 13.64, z: 1.35 },
  },
  frontUpper: {
    label: 'front upper torso seam',
    vertexIds: new Set([56, 92, 106, 165, 168]),
    posedWorld: { x: 3.25, y: 13.44, z: 1 },
    correctedWorld: { x: 1.96, y: 15.04, z: 1.04 },
  },
  backLower: {
    label: 'back lower torso seam',
    vertexIds: new Set([13, 16, 18, 108, 161, 171]),
    posedWorld: { x: 3.98, y: 13.03, z: -0.86 },
    correctedWorld: { x: 2.35, y: 13.64, z: -0.85 },
  },
  backUpper: {
    label: 'back upper torso seam',
    vertexIds: new Set([7, 10, 12, 88, 91, 169, 172]),
    posedWorld: { x: 3.16, y: 13.66, z: -0.44 },
    correctedWorld: { x: 2, y: 14.9, z: -0.41 },
  },
} satisfies Record<string, FixturePaintTarget>;
const upperSleeveTargets = {
  frontLower: {
    label: 'front lower upper-sleeve edge',
    vertexIds: new Set([109, 112, 160]),
    posedWorld: { x: 5.39, y: 15.65, z: 1.21 },
    correctedWorld: { x: 5.23, y: 15.02, z: 1.19 },
  },
  frontUpper: {
    label: 'front upper upper-sleeve edge',
    vertexIds: new Set([89, 90, 113, 167]),
    posedWorld: { x: 4.03, y: 15.52, z: 0.29 },
    correctedWorld: { x: 4.69, y: 16.32, z: 0.33 },
  },
  back: {
    label: 'back upper-sleeve edge',
    vertexIds: new Set([87, 159, 173]),
    posedWorld: { x: 5.53, y: 15.73, z: -0.5 },
    correctedWorld: { x: 5.26, y: 15.02, z: -0.53 },
  },
} satisfies Record<string, FixturePaintTarget>;
const armHierarchyPath = ['SMF_Node_2', 'SMF_Node_3', 'SMF_Node_4', 'SMF_Node_12', 'SMF_Node_13', 'SMF_Node_14'];

const screenshotHash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

async function captureStep(page: Page, fileName: string): Promise<void> {
  await page.waitForTimeout(450);
  const bytes = await page.screenshot({
    path: path.join(journeyOutputDir, fileName),
    fullPage: true,
  });
  expect(bytes.byteLength).toBeGreaterThan(10_000);
}

async function expectActionable(locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  await expect(locator).toBeEnabled();
  const state = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(centerX, centerY);
    return {
      inViewport: rect.width > 0
        && rect.height > 0
        && rect.left >= 0
        && rect.top >= 0
        && rect.right <= window.innerWidth
        && rect.bottom <= window.innerHeight,
      receivesPointer: !!hit && (element === hit || element.contains(hit) || hit.contains(element)),
    };
  });
  expect(state.inViewport).toBe(true);
  expect(state.receivesPointer).toBe(true);
}

async function expectNoDocumentOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    x: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
    y: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight,
  }));
  expect(overflow.x).toBeLessThanOrEqual(1);
  expect(overflow.y).toBeLessThanOrEqual(1);
}

async function expandBonePath(page: Page): Promise<void> {
  for (const boneName of armHierarchyPath) {
    const item = page.getByTestId(`bone-tree-item-${boneName}`);
    await item.scrollIntoViewIfNeeded();
    await expect(item).toBeVisible();
    const toggle = item.locator('span').first();
    if (await toggle.count() > 0 && (await toggle.textContent())?.trim() === '+') {
      await toggle.click();
    }
  }
}

async function selectBone(page: Page, boneName: string): Promise<void> {
  if (!await page.getByTestId('inspector').isVisible()) {
    await showModernPanel(page, 'properties');
  }
  const bone = page.getByTestId(`bone-tree-item-${boneName}`);
  await bone.scrollIntoViewIfNeeded();
  await expectActionable(bone);
  await bone.click();
  await expect(page.getByTestId('inspector-selected')).toHaveText(boneName);
}

async function selectSkinBoneOnCanvas(page: Page, boneName: string): Promise<void> {
  const workspace = page.getByTestId('skin-workspace-panel');
  await expect(workspace).toBeVisible();
  if (await workspace.getAttribute('data-active-tool') !== 'pick') {
    await page.getByTestId('modern-skin-tool-pick').click();
  }

  const hit = await hoverPickableBoneInViewport(page, boneName);
  expect(hit, `Expected ${boneName} to be pickable in the Skin viewport`).not.toBeNull();
  await page.mouse.click(hit!.x, hit!.y);
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-viewport-picked-bone', boneName);
  await expect(workspace).toHaveAttribute('data-active-tool', 'paint');

  await showSkinAdvanced(page);
  await expect(page.getByTestId('inspector-selected')).toHaveText(boneName);
}

async function findFixturePaintTarget(
  page: Page,
  target: FixturePaintTarget,
  expectedWorld: { x: number; y: number; z: number },
): Promise<{ x: number; y: number; vertexId: number }> {
  const canvas = page.getByTestId('three-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The viewport canvas has no screen bounds.');

  type Candidate = { x: number; y: number; vertexId: number; worldDistance: number };
  type ProbePoint = { x: number; y: number };
  const probeBatch = async (points: ProbePoint[]): Promise<Candidate[]> => canvas.evaluate(
    (element, input) => {
      const matches: Candidate[] = [];
      const allowedIds = new Set(input.vertexIds);
      for (const point of input.points) {
        element.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true,
          clientX: point.x,
          clientY: point.y,
          pointerId: 1,
          pointerType: 'mouse',
        }));
        const paintedIds = (element.dataset.skinPaintVertexRefs ?? '')
          .split(',')
          .map((entry) => /^Mesh_4:(\d+)$/.exec(entry))
          .filter((match): match is RegExpExecArray => match !== null)
          .map((match) => Number(match[1]));
        const vertexId = paintedIds.find((id) => allowedIds.has(id)) ?? -1;
        if (vertexId < 0) continue;
        const world = [
          Number(element.dataset.skinBrushX),
          Number(element.dataset.skinBrushY),
          Number(element.dataset.skinBrushZ),
        ];
        if (!world.every(Number.isFinite) || Number(element.dataset.skinPaintHitCount) <= 0) continue;
        matches.push({
          x: point.x,
          y: point.y,
          vertexId,
          worldDistance: Math.hypot(
            world[0] - input.expectedWorld.x,
            world[1] - input.expectedWorld.y,
            world[2] - input.expectedWorld.z,
          ),
        });
      }
      return matches;
    },
    { points, vertexIds: [...target.vertexIds], expectedWorld },
  );

  const makeGrid = (
    minXPercent: number,
    maxXPercent: number,
    minYPercent: number,
    maxYPercent: number,
    stepPercent: number,
  ): ProbePoint[] => {
    const points: ProbePoint[] = [];
    for (let yPercent = minYPercent; yPercent <= maxYPercent; yPercent += stepPercent) {
      for (let xPercent = minXPercent; xPercent <= maxXPercent; xPercent += stepPercent) {
        points.push({
          x: box.x + (box.width * xPercent) / 100,
          y: box.y + (box.height * yPercent) / 100,
        });
      }
    }
    return points;
  };

  const candidates = await probeBatch(makeGrid(10, 90, 10, 72, 1.5));

  if (candidates.length === 0) {
    throw new Error(`Could not find the visible Mesh_4 ${target.label} vertex.`);
  }
  const coarseBest = candidates.reduce((closest, candidate) => (
    candidate.worldDistance < closest.worldDistance ? candidate : closest
  ));
  const coarseX = ((coarseBest.x - box.x) / box.width) * 100;
  const coarseY = ((coarseBest.y - box.y) / box.height) * 100;
  candidates.push(...await probeBatch(makeGrid(coarseX - 2, coarseX + 2, coarseY - 2, coarseY + 2, 0.5)));
  const best = candidates.reduce((closest, candidate) => (
    candidate.worldDistance < closest.worldDistance ? candidate : closest
  ));
  if (best.worldDistance > 0.5) {
    throw new Error(`Could not place the brush on the ${target.label}; closest world distance was ${best.worldDistance.toFixed(3)}.`);
  }
  await page.mouse.move(best.x, best.y);
  await page.waitForTimeout(20);
  const currentTargetIds = await canvas.evaluate((element) => (
    (element.dataset.skinPaintVertexRefs ?? '')
      .split(',')
      .map((entry) => /^Mesh_4:(\d+)$/.exec(entry))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => Number(match[1]))
  ));
  const currentVertexId = currentTargetIds.find((id) => target.vertexIds.has(id)) ?? -1;
  if (currentVertexId < 0) {
    throw new Error(`The refined ${target.label} brush no longer contains its target vertices.`);
  }
  return { x: best.x, y: best.y, vertexId: currentVertexId };
}

async function paintFixtureTarget(
  page: Page,
  target: FixturePaintTarget,
  selectedBoneName: string,
): Promise<number> {
  const brushTarget = await findFixturePaintTargetAcrossViews(
    page,
    target,
    target.posedWorld,
    selectedBoneName,
  );
  await page.mouse.move(brushTarget.x, brushTarget.y);
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(80);
  await page.mouse.up({ button: 'left' });
  await expect(page.getByTestId('status-text')).toContainText(new RegExp(`Painted \\d+ skin vertices on ${selectedBoneName}`));
  return brushTarget.vertexId;
}

async function findFixturePaintTargetAcrossViews(
  page: Page,
  target: FixturePaintTarget,
  expectedWorld: { x: number; y: number; z: number },
  selectedBoneName: string,
): Promise<Awaited<ReturnType<typeof findFixturePaintTarget>>> {
  let brushTarget: Awaited<ReturnType<typeof findFixturePaintTarget>> | null = null;
  let lastError: unknown = null;
  for (let view = 0; view < 4 && !brushTarget; view += 1) {
    try {
      brushTarget = await findFixturePaintTarget(page, target, expectedWorld);
    } catch (error) {
      lastError = error;
      if (view < 3) await orbitViewport(page, selectedBoneName, Math.PI / 2);
    }
  }
  if (!brushTarget) throw lastError;
  return brushTarget;
}

async function expectSelectedVertexInTarget(
  selectedVertex: Locator,
  target: FixturePaintTarget,
): Promise<number> {
  await expect(selectedVertex).toContainText(/Mesh_4 vertex \d+/);
  const match = /Mesh_4 vertex (\d+)/.exec(await selectedVertex.textContent() ?? '');
  const vertexId = match ? Number(match[1]) : -1;
  expect(target.vertexIds.has(vertexId)).toBe(true);
  return vertexId;
}

async function orbitViewport(page: Page, selectedBoneName: string, radians: number): Promise<void> {
  const canvas = page.getByTestId('three-canvas');
  if (await canvas.getAttribute('data-viewport-layout') !== 'single') {
    await page.getByTestId('viewport-layout-single').click();
    await expect(canvas).toHaveAttribute('data-viewport-layout', 'single');
  }
  await page.getByTestId('mode-tab-animate').click();
  await expect(page.getByTestId('animate-workspace-panel')).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The viewport canvas has no screen bounds.');
  const y = box.y + box.height * 0.45;
  const dragPixels = Math.min(box.width * 0.4, Math.abs(radians) / 0.0035);
  const direction = Math.sign(radians) || 1;
  const startX = box.x + box.width * 0.5 - (dragPixels * direction) / 2;
  const endX = box.x + box.width * 0.5 + (dragPixels * direction) / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(endX, y, { steps: 8 });
  await page.mouse.up({ button: 'left' });
  await page.getByTestId('mode-tab-skin').click();
  await expect(page.getByTestId('skin-workspace-panel')).toBeVisible();
  await expect(page.getByTestId('modern-skin-tool-paint')).toBeEnabled();
  await page.getByTestId('modern-skin-tool-paint').click();
  await showSkinAdvanced(page);
  await expect(page.getByTestId('inspector-selected')).toHaveText(selectedBoneName);
}

async function orbitViewportPasses(page: Page, selectedBoneName: string, passes: number): Promise<void> {
  for (let pass = 0; pass < passes; pass += 1) {
    await orbitViewport(page, selectedBoneName, Math.PI);
  }
}

async function resetViewportCamera(page: Page, selectedBoneName: string): Promise<void> {
  await page.getByTestId('mode-tab-animate').click();
  await expect(page.getByTestId('animate-workspace-panel')).toBeVisible();
  // R controls the selected bone's rotate gizmo while a bone owns transform input.
  // Clear that owner first so the same shortcut reaches the camera reset path.
  await showModernPanel(page, 'scene');
  await page.getByTestId('outliner-scene-root').click();
  await page.keyboard.press('r');
  await page.waitForTimeout(120);
  await showModernPanel(page, 'properties');
  await expandBonePath(page);
  await selectBone(page, selectedBoneName);
  await page.getByTestId('mode-tab-skin').click();
  await expect(page.getByTestId('skin-workspace-panel')).toBeVisible();
  await page.getByTestId('modern-skin-tool-paint').click();
  await showSkinAdvanced(page);
}

type RotationAxis = 'x' | 'y' | 'z';

function rotationControlTestId(axis: RotationAxis, clicks: number): string {
  if (axis === 'z') return clicks < 0 ? 'transform-rot-negative-btn' : 'transform-rot-btn';
  return `transform-rot-${axis}${clicks < 0 ? '-negative' : ''}-btn`;
}

async function poseBoneFromBind(
  page: Page,
  boneName: string,
  axis: RotationAxis,
  rotationClicks: number,
): Promise<void> {
  await selectBone(page, boneName);
  await page.getByTestId('transform-reset-btn').click();
  await expect(page.getByTestId('status-text')).toContainText(new RegExp(`${boneName}.*bind pose`, 'i'));
  const rotateControl = page.getByTestId(rotationControlTestId(axis, rotationClicks));
  await expectActionable(rotateControl);
  for (let index = 0; index < Math.abs(rotationClicks); index += 1) {
    await rotateControl.click();
  }
  await expect(page.getByTestId('status-text')).toContainText(
    new RegExp(`Posed ${boneName}: ${axis.toUpperCase()} rotation`, 'i'),
  );
}

async function insertWavePose(
  page: Page,
  time: number,
  pose: (typeof wavePoses)[keyof typeof wavePoses],
): Promise<Buffer> {
  await setRangeValue(page, 'scrub-slider', time);
  await expect(page.getByTestId('time-display')).toContainText(time.toFixed(2));
  await poseBoneFromBind(page, wavingArm.upperArm, 'y', -2);
  await poseBoneFromBind(page, wavingArm.forearm, 'y', pose.forearmRotationClicks);
  await poseBoneFromBind(page, wavingArm.hand, 'y', pose.handRotationClicks);
  await selectBone(page, wavingArm.upperArm);
  await page.getByTestId('animation-insert-key-btn').click();
  await expect(page.getByTestId('status-text')).toContainText(/Inserted branch animation keyframes/i);
  await expect(page.getByTestId('animation-selected-key')).toContainText(`${time.toFixed(2)}s`);
  await page.waitForTimeout(180);
  return page.getByTestId('viewport-container').locator('canvas').first().screenshot();
}

test('headless user journey creates and previews a hand-wave animation', async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  await mkdir(journeyOutputDir, { recursive: true });
  const priorScreenshots = (await readdir(journeyOutputDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.png'))
    .map((entry) => rm(path.join(journeyOutputDir, entry.name), { force: true }));
  await Promise.all([
    ...priorScreenshots,
    rm(journeyVideoPath, { force: true }),
  ]);

  const context = await browser.newContext({
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.25,
    recordVideo: {
      dir: testInfo.outputPath('video'),
      size: { width: 1440, height: 900 },
    },
  });
  const page = await context.newPage();
  const video = page.video();
  setupBrowserDiagnostics(page);

  try {
    await page.goto('/');
    await expect(page.getByTestId('app-shell')).toBeVisible();
    await expectNoDocumentOverflow(page);
    await captureStep(page, '01-empty-app.png');

    const modelInput = page.getByTestId('model-file-input');
    await modelInput.setInputFiles(SAMPLE_SMF);
    await expect(page.getByTestId('status-text')).not.toContainText('Loading', { timeout: 15_000 });
    await expect(page.getByTestId('status-text')).toContainText(/bones:\s*24|clips:\s*12/i);
    await pausePlaybackIfRunning(page);
    await showModernPanel(page, 'properties');
    await expect(page.getByTestId('smf-indexed-bone-guidance')).toBeVisible();
    await expectNoDocumentOverflow(page);
    await captureStep(page, '02-character-loaded.png');

    const animateTab = page.getByTestId('mode-tab-animate');
    await expectActionable(animateTab);
    await animateTab.click();
    await expect(page.getByTestId('animate-workspace-panel')).toBeVisible();
    await expect(page.getByTestId('animation-workflow-hint')).toContainText(/Select a bone.*Branch.*whole chain/i);

    await page.getByTestId('animation-new-name-input').fill('Hand Wave');
    await page.getByTestId('animation-new-duration-input').fill('2');
    await page.getByTestId('animation-new-pose-select').selectOption('rest');
    const createButton = page.getByTestId('animation-create-btn');
    await expectActionable(createButton);
    await createButton.click();
    await expect(page.getByTestId('status-text')).toContainText(/Created animation clip Hand Wave from the rest pose/i);
    await expect(page.getByTestId('animation-clip-name-input')).toHaveValue('Hand Wave');
    await pausePlaybackIfRunning(page);
    await captureStep(page, '03-new-animation.png');

    const restPose = await page.getByTestId('viewport-container').locator('canvas').first().screenshot();

    const viewportPick = await clickPickableBoneInViewport(page, 'animate-select');
    expect(viewportPick).not.toBeNull();
    await expect(page.getByTestId('inspector-selected')).toHaveText(viewportPick?.bone ?? '');
    const hover = await hoverPickableBoneInViewport(page);
    expect(hover).not.toBeNull();
    await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-hover-label-visible', 'true');
    await expect(page.getByTestId('three-canvas')).toHaveAttribute('title', /Bone: SMF_Node_\d+ · [A-Za-z_]+/);
    await captureStep(page, '04-bone-hover-label.png');

    await expandBonePath(page);
    await expect(page.getByTestId(`bone-tree-item-${wavingArm.upperArm}`)).toHaveAttribute('data-bone-alias', 'mixamorig:LeftArm');
    await expect(page.getByTestId(`bone-tree-item-${wavingArm.forearm}`)).toHaveAttribute('data-bone-alias', 'mixamorig:LeftForeArm');
    await expect(page.getByTestId(`bone-tree-item-${wavingArm.hand}`)).toHaveAttribute('data-bone-alias', 'mixamorig:LeftHand');
    await selectBone(page, wavingArm.upperArm);
    await expect(page.getByTestId('animate-workspace-panel')).toContainText(`Selected bone: ${wavingArm.upperArm}`);
    await expect(page.getByTestId('animation-insert-key-btn')).toBeEnabled();
    await page.getByTestId('animation-snap-step-select').selectOption('0.5');
    await page.getByTestId('animation-interpolation-select').selectOption('linear');
    await page.getByTestId('animation-scope-select').selectOption('branch');
    await expect(page.getByTestId('status-text')).toContainText(/Animation edit scope set to Branch/i);
    await captureStep(page, '05-arm-chain-selected.png');

    await insertWavePose(page, 0, wavePoses.outer);
    const waveInner = await insertWavePose(page, 0.5, wavePoses.inner);
    await captureStep(page, '06-arm-held-wave-inner.png');
    const waveOuter = await insertWavePose(page, 1, wavePoses.outer);
    await captureStep(page, '07-arm-held-wave-outer.png');
    const waveInnerAgain = await insertWavePose(page, 1.5, wavePoses.inner);
    await captureStep(page, '08-arm-held-wave-inner-again.png');
    await insertWavePose(page, 2, wavePoses.outer);

    expect(screenshotHash(restPose)).not.toBe(screenshotHash(waveInner));
    expect(screenshotHash(waveInner)).not.toBe(screenshotHash(waveOuter));
    expect(screenshotHash(waveOuter)).not.toBe(screenshotHash(waveInnerAgain));
    await expect(page.getByTestId('timeline-keyframe-lane')).toHaveAttribute('data-keyframe-count', '5');
    await expect(page.getByTestId('animation-edit-state')).toContainText('Animation edit dirty: true');

    for (const boneName of Object.values(wavingArm)) {
      await selectBone(page, boneName);
      await expect(page.getByTestId('animation-selected-key')).toContainText('2.00s');
    }

    await setRangeValue(page, 'scrub-slider', 0.5);
    await expect(page.getByTestId('time-display')).toContainText('0.50');
    await captureStep(page, '09-wave-before-weight-paint.png');

    await page.getByTestId('mode-tab-skin').click();
    await expect(page.getByTestId('skin-workspace-panel')).toBeVisible();
    await selectSkinBoneOnCanvas(page, skinRepairBone);
    await expect(page.getByTestId('skin-workspace-panel')).toContainText('LeftForeArm');
    await page.getByTestId('skin-paint-pose').selectOption('frozen');
    await page.getByTestId('skin-paint-target-mode').selectOption('vertex');
    await page.getByTestId('skin-paint-mode-subtract').click();
    await setRangeValue(page, 'skin-paint-radius', 0.4);
    await setRangeValue(page, 'skin-paint-strength', 1);
    await setRangeValue(page, 'skin-paint-target', 1);
    await setRangeValue(page, 'skin-paint-falloff', 1);
    await page.getByTestId('skin-weight-preview-btn').click();
    await expect(page.getByTestId('skin-weight-preview-btn')).toContainText('Hide Weights');
    await page.getByTestId('skin-paint-vertices-btn').click();
    await expect(page.getByTestId('skin-paint-vertices-btn')).toContainText('Hide Vertices');
    await expect(page.getByTestId('skin-paint-vertices-btn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-skin-points-enabled', 'true');

    const frontLowerTarget = torsoSeamTargets.frontLower;
    const torsoTarget = await findFixturePaintTarget(page, frontLowerTarget, frontLowerTarget.posedWorld);
    const selectedVertex = page.getByTestId('skin-selected-vertex');
    expect(frontLowerTarget.vertexIds.has(torsoTarget.vertexId)).toBe(true);
    await expectSelectedVertexInTarget(selectedVertex, frontLowerTarget);
    await expect(selectedVertex).toContainText('SMF_Node_13 · LeftForeArm');
    const forearmInfluence = selectedVertex.locator(`[data-bone-name="${wavingArm.forearm}"]`);
    await expect(forearmInfluence).toHaveCount(1);
    expect(Number(await forearmInfluence.getAttribute('data-weight'))).toBeGreaterThan(0.5);
    await selectedVertex.scrollIntoViewIfNeeded();
    await page.mouse.move(8, 8);
    await captureStep(page, '10-torso-influence-before.png');

    await page.getByTestId('skin-paint-mode-set').scrollIntoViewIfNeeded();
    await paintFixtureTarget(page, frontLowerTarget, skinRepairBone);
    const correctedTarget = await findFixturePaintTarget(page, frontLowerTarget, frontLowerTarget.correctedWorld);
    expect(frontLowerTarget.vertexIds.has(correctedTarget.vertexId)).toBe(true);
    await expectSelectedVertexInTarget(selectedVertex, frontLowerTarget);
    const upperArmInfluence = selectedVertex.locator(`[data-bone-name="${wavingArm.upperArm}"]`);
    await expect(upperArmInfluence).toHaveCount(1);
    await expect.poll(async () => Number(await upperArmInfluence.getAttribute('data-weight'))).toBeGreaterThanOrEqual(0.7);
    await expect.poll(async () => Number(await forearmInfluence.getAttribute('data-weight'))).toBeLessThanOrEqual(0.1);
    await paintFixtureTarget(page, torsoSeamTargets.frontUpper, skinRepairBone);
    await orbitViewportPasses(page, skinRepairBone, 3);
    await paintFixtureTarget(page, torsoSeamTargets.backLower, skinRepairBone);
    await orbitViewportPasses(page, skinRepairBone, 1);
    await paintFixtureTarget(page, torsoSeamTargets.backUpper, skinRepairBone);
    await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true');

    await resetViewportCamera(page, wavingArm.upperArm);
    await page.getByTestId('skin-paint-mode-set').click();
    await page.getByTestId('viewport-layout-quad').click();
    await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-viewport-layout', 'quad');
    const sleeveBeforeTarget = await findFixturePaintTargetAcrossViews(
      page,
      upperSleeveTargets.frontLower,
      upperSleeveTargets.frontLower.posedWorld,
      wavingArm.upperArm,
    );
    expect(upperSleeveTargets.frontLower.vertexIds.has(sleeveBeforeTarget.vertexId)).toBe(true);
    await paintFixtureTarget(page, upperSleeveTargets.frontLower, wavingArm.upperArm);
    const sleeveCorrectedTarget = await findFixturePaintTargetAcrossViews(
      page,
      upperSleeveTargets.frontLower,
      upperSleeveTargets.frontLower.correctedWorld,
      wavingArm.upperArm,
    );
    expect(upperSleeveTargets.frontLower.vertexIds.has(sleeveCorrectedTarget.vertexId)).toBe(true);
    await paintFixtureTarget(page, upperSleeveTargets.frontUpper, wavingArm.upperArm);
    await paintFixtureTarget(page, upperSleeveTargets.back, wavingArm.upperArm);
    await page.getByTestId('viewport-layout-single').click();
    await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-viewport-layout', 'single');
    await resetViewportCamera(page, wavingArm.upperArm);
    await selectedVertex.scrollIntoViewIfNeeded();
    await page.mouse.move(8, 8);
    await captureStep(page, '11-torso-and-sleeve-corrected.png');

    await page.getByTestId('skin-weight-preview-btn').scrollIntoViewIfNeeded();
    await page.getByTestId('skin-weight-preview-btn').click();
    await expect(page.getByTestId('skin-weight-preview-btn')).toContainText('Show Weights');
    await page.getByTestId('skin-paint-vertices-btn').click();
    await expect(page.getByTestId('skin-paint-vertices-btn')).toContainText('Show Vertices');
    await expect(page.getByTestId('skin-paint-vertices-btn')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('mode-tab-animate').click();
    await expect(page.getByTestId('animate-workspace-panel')).toBeVisible();
    await selectBone(page, 'SMF_Node_2');
    await page.getByTestId('timeline-reset-btn').click();
    await page.getByTestId('timeline-play-btn').click();
    await expect(page.getByTestId('timeline-play-btn')).toContainText('Pause');
    await page.waitForTimeout(900);
    await captureStep(page, '12-wave-playback.png');
    await page.waitForTimeout(3_400);
    await pausePlaybackIfRunning(page);

    await expectNoDocumentOverflow(page);
    expect(getBrowserErrors(page).filter((message) => message.includes('ERROR'))).toEqual([]);
  } finally {
    await context.close().catch(() => {});
    if (video) {
      await video.saveAs(journeyVideoPath).catch(() => {});
      try {
        await stat(journeyVideoPath);
        await testInfo.attach('hand-wave-journey.webm', {
          path: journeyVideoPath,
          contentType: 'video/webm',
        });
      } catch {
        // The primary assertion remains authoritative when the runner closes a timed-out browser.
      } finally {
        await video.delete().catch(() => {});
      }
    }
  }

  const videoStats = await stat(journeyVideoPath);
  expect(videoStats.size).toBeGreaterThan(50_000);
});
