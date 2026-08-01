import { expect, type Page } from '@playwright/test';

export type RelativePoint = { x: number; y: number };

export const dispatchWindowPointerCancel = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 0,
    }));
  });
};

export const dragEndpointHandle = async (
  page: Page,
  selectedBone: string,
  points?: RelativePoint[],
  onActiveDrag?: () => Promise<void>,
  finish: 'release' | 'cancel' = 'release',
): Promise<boolean> => {
  const canvas = page.getByTestId('three-canvas');
  const box = await canvas.boundingBox();
  if (!box) return false;

  const waitForNoActiveEndpointDrag = async (): Promise<void> => {
    await page.waitForFunction(
      () => {
        const el = document.querySelector<HTMLElement>('[data-testid="three-canvas"]');
        return el?.dataset.endpointDrag !== 'active';
      },
      undefined,
      { timeout: 1200 },
    );
    await page.waitForTimeout(20);
  };

  await waitForNoActiveEndpointDrag();

  const endpointX = Number(await canvas.getAttribute('data-endpoint-x'));
  const endpointY = Number(await canvas.getAttribute('data-endpoint-y'));
  if (Number.isFinite(endpointX) && Number.isFinite(endpointY)) {
    await page.mouse.move(endpointX, endpointY);
    await page.waitForTimeout(25);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(endpointX + 12, endpointY + 12);
    await page.waitForTimeout(40);
    const active = await canvas.getAttribute('data-endpoint-drag');
    if (active === 'active') {
      await onActiveDrag?.();
      if (finish === 'cancel') {
        await dispatchWindowPointerCancel(page);
        await page.mouse.up({ button: 'left' }).catch(() => {});
        await waitForNoActiveEndpointDrag();
        return true;
      }
    }
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(30);
    if (active === 'active') {
      await waitForNoActiveEndpointDrag();
      return true;
    }
  }

  const targets = points ?? [
    { x: 10, y: 10 },
    { x: 10, y: 30 },
    { x: 10, y: 50 },
    { x: 10, y: 70 },
    { x: 10, y: 90 },
    { x: 30, y: 10 },
    { x: 30, y: 30 },
    { x: 30, y: 50 },
    { x: 30, y: 70 },
    { x: 30, y: 90 },
    { x: 50, y: 10 },
    { x: 50, y: 30 },
    { x: 50, y: 50 },
    { x: 50, y: 70 },
    { x: 50, y: 90 },
    { x: 70, y: 10 },
    { x: 70, y: 30 },
    { x: 70, y: 50 },
    { x: 70, y: 70 },
    { x: 70, y: 90 },
    { x: 90, y: 10 },
    { x: 90, y: 30 },
    { x: 90, y: 50 },
    { x: 90, y: 70 },
    { x: 90, y: 90 },
  ];

  for (const target of targets) {
    const x = Math.round(box.x + (box.width * target.x) / 100);
    const y = Math.round(box.y + (box.height * target.y) / 100);

    await page.mouse.move(x, y);
    await page.waitForTimeout(25);
    const hoveredBone = await canvas.getAttribute('data-hovered-bone');
    if (hoveredBone && hoveredBone !== selectedBone) {
      continue;
    }

    await page.mouse.move(x + 2, y + 2);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(x + 12, y + 12);
    await page.waitForTimeout(40);
    const active = await canvas.getAttribute('data-endpoint-drag');
    if (active === 'active') {
      await onActiveDrag?.();
      if (finish === 'cancel') {
        await dispatchWindowPointerCancel(page);
        await page.mouse.up({ button: 'left' }).catch(() => {});
        await waitForNoActiveEndpointDrag();
        return true;
      }
    }
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(30);

    if (active === 'active') {
      await waitForNoActiveEndpointDrag();
      return true;
    }
  }

  return false;
};

export const dragRigIkTarget = async (
  page: Page,
  finish: 'release' | 'cancel' | 'escape' = 'release',
): Promise<boolean> => {
  const canvas = page.getByTestId('three-canvas');
  await expect.poll(async () => {
    const x = Number(await canvas.getAttribute('data-rig-ik-target-screen-x'));
    const y = Number(await canvas.getAttribute('data-rig-ik-target-screen-y'));
    return Number.isFinite(x) && Number.isFinite(y);
  }, { timeout: 3000 }).toBe(true);

  const x = Number(await canvas.getAttribute('data-rig-ik-target-screen-x'));
  const y = Number(await canvas.getAttribute('data-rig-ik-target-screen-y'));
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(x + 36, y + 24, { steps: 4 });
  await page.waitForTimeout(60);
  const active = await canvas.getAttribute('data-rig-ik');
  if (active !== 'active') {
    await page.mouse.up({ button: 'left' }).catch(() => {});
    return false;
  }

  if (finish === 'cancel') {
    await dispatchWindowPointerCancel(page);
    await page.mouse.up({ button: 'left' }).catch(() => {});
  } else if (finish === 'escape') {
    await page.keyboard.press('Escape');
    await page.mouse.up({ button: 'left' }).catch(() => {});
  } else {
    await page.mouse.up({ button: 'left' });
  }
  await expect(canvas).not.toHaveAttribute('data-rig-ik', 'active');
  return true;
};

export const dragTransformHandle = async (page: Page): Promise<string> => {
  const canvas = page.getByTestId('three-canvas');
  await expect(canvas).toHaveAttribute('data-transform-helper-mounted', 'true');
  await expect(canvas).toHaveAttribute('data-transform-handle-mode', 'translate');
  await expect.poll(async () => {
    const values = await Promise.all([
      canvas.getAttribute('data-transform-handle-start-x'),
      canvas.getAttribute('data-transform-handle-start-y'),
      canvas.getAttribute('data-transform-handle-end-x'),
      canvas.getAttribute('data-transform-handle-end-y'),
    ]);
    return values.every((value) => value !== null && Number.isFinite(Number(value)));
  }, { timeout: 3000 }).toBe(true);

  const axis = await canvas.getAttribute('data-transform-handle-axis');
  const startX = Number(await canvas.getAttribute('data-transform-handle-start-x'));
  const startY = Number(await canvas.getAttribute('data-transform-handle-start-y'));
  const endX = Number(await canvas.getAttribute('data-transform-handle-end-x'));
  const endY = Number(await canvas.getAttribute('data-transform-handle-end-y'));
  if (!axis || ![startX, startY, endX, endY].every(Number.isFinite)) {
    throw new Error('TransformControls did not expose a finite real-handle drag path.');
  }

  await page.mouse.move(startX, startY);
  await expect(canvas).toHaveAttribute('data-transform-axis', axis);
  await page.mouse.down({ button: 'left' });
  await expect(canvas).toHaveAttribute('data-transform-dragging', 'true');
  await page.mouse.move(endX, endY, { steps: 5 });
  await expect(canvas).toHaveAttribute('data-bone-transform-source', 'transform-controls');
  await expect(canvas).toHaveAttribute('data-bone-transform-phase', 'change');
  await page.mouse.up({ button: 'left' });
  await expect(canvas).toHaveAttribute('data-transform-dragging', 'false');
  await expect(canvas).toHaveAttribute('data-bone-transform-phase', 'end');
  return axis;
};

export const paintInViewport = async (
  page: Page,
  options?: { x?: number; y?: number; dx?: number; dy?: number },
): Promise<boolean> => {
  const canvas = page.getByTestId('three-canvas');
  const box = await canvas.boundingBox();
  if (!box) return false;

  const x = options?.x ?? (box.x + box.width / 2);
  const y = options?.y ?? (box.y + box.height / 2);
  const dx = options?.dx ?? 28;
  const dy = options?.dy ?? 24;

  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(x + dx, y + dy);
  await page.waitForTimeout(80);
  await page.mouse.up({ button: 'left' });
  return true;
};

export const paintOnMeshInViewport = async (
  page: Page,
  options?: { requireDirty?: boolean },
): Promise<boolean> => {
  const canvas = page.getByTestId('three-canvas');
  const box = await canvas.boundingBox();
  if (!box) return false;

  const quadProbePercents = [12, 25, 38, 62, 75, 88];
  const targets: RelativePoint[] = [
    { x: 50, y: 50 },
    { x: 55, y: 55 },
    { x: 60, y: 60 },
    { x: 45, y: 55 },
    { x: 50, y: 65 },
    { x: 60, y: 70 },
    { x: 40, y: 60 },
    { x: 70, y: 60 },
    { x: 30, y: 40 },
    { x: 40, y: 40 },
    { x: 50, y: 40 },
    { x: 60, y: 40 },
    { x: 70, y: 40 },
    { x: 30, y: 50 },
    { x: 70, y: 50 },
    { x: 30, y: 70 },
    { x: 40, y: 70 },
    { x: 50, y: 70 },
    { x: 70, y: 70 },
    ...quadProbePercents.flatMap((x) => quadProbePercents.map((y) => ({ x, y }))),
  ];

  for (const target of targets) {
    const x = box.x + (box.width * target.x) / 100;
    const y = box.y + (box.height * target.y) / 100;
    await page.mouse.move(x, y);
    await page.waitForTimeout(25);
    const hitCount = Number(await canvas.getAttribute('data-skin-paint-hit-count'));
    const hover = await canvas.getAttribute('data-skin-brush-hover');
    if (hover === 'active' && hitCount > 0) {
      await page.mouse.down({ button: 'left' });
      await page.mouse.move(x + 2, y + 2, { steps: 2 });
      await page.waitForTimeout(80);
      await page.mouse.up({ button: 'left' });
      if (options?.requireDirty) {
        try {
          await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true', { timeout: 300 });
          return true;
        } catch {
          continue;
        }
      }
      return true;
    }
  }

  return false;
};

export const clickPickableBoneInViewport = async (
  page: Page,
  expectedOwner: string,
): Promise<{ bone: string; paneRole: string } | null> => {
  const canvas = page.getByTestId('three-canvas');
  const box = await canvas.boundingBox();
  if (!box) return null;

  const probes = [12, 25, 38, 50, 62, 75, 88];
  for (const y of probes) {
    for (const x of probes) {
      const screenX = box.x + (box.width * x) / 100;
      const screenY = box.y + (box.height * y) / 100;
      await page.mouse.click(screenX, screenY);
      await page.waitForTimeout(40);

      const owner = await canvas.getAttribute('data-pointer-owner');
      const bone = (await canvas.getAttribute('data-viewport-picked-bone')) ?? '';
      const paneRole = (await canvas.getAttribute('data-viewport-pane-role')) ?? '';
      if (owner === expectedOwner && bone && paneRole) {
        return { bone, paneRole };
      }
    }
  }

  return null;
};

export const cancelPaintOnMeshInViewport = async (
  page: Page,
  options?: { requireDirty?: boolean },
): Promise<boolean> => {
  const canvas = page.getByTestId('three-canvas');
  const box = await canvas.boundingBox();
  if (!box) return false;

  const targets: RelativePoint[] = [
    { x: 50, y: 50 },
    { x: 55, y: 55 },
    { x: 60, y: 60 },
    { x: 45, y: 55 },
    { x: 50, y: 65 },
    { x: 60, y: 70 },
    { x: 40, y: 60 },
    { x: 70, y: 60 },
  ];

  for (const target of targets) {
    const x = box.x + (box.width * target.x) / 100;
    const y = box.y + (box.height * target.y) / 100;
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(x + 16, y + 12);
    await page.waitForTimeout(80);

    const active = await canvas.getAttribute('data-skin-paint-active');
    if (active === 'active') {
      await dispatchWindowPointerCancel(page);
      await page.mouse.up({ button: 'left' }).catch(() => {});
      await page.waitForFunction(
        () => {
          const el = document.querySelector<HTMLElement>('[data-testid="three-canvas"]');
          return el?.dataset.skinPaintActive !== 'active';
        },
        undefined,
        { timeout: 1200 },
      );
      if (options?.requireDirty) {
        try {
          await expect(page.getByTestId('skin-dirty-state')).toContainText('Skin edit dirty: true', { timeout: 500 });
        } catch {
          continue;
        }
      }
      return true;
    }

    await page.mouse.up({ button: 'left' }).catch(() => {});
  }

  return false;
};

export const openViewportDisplayMenu = async (page: Page): Promise<void> => {
  const panel = page.getByTestId('viewport-display-menu-panel');
  if (!(await panel.isVisible())) {
    await page.getByTestId('viewport-display-menu-button').click();
  }
  await expect(panel).toBeVisible();
};

export const setViewportLayout = async (page: Page, layout: 'single' | 'quad'): Promise<void> => {
  const canvas = page.getByTestId('three-canvas');
  const singleBtn = page.getByTestId('viewport-layout-single');
  const quadBtn = page.getByTestId('viewport-layout-quad');

  if (layout === 'quad') {
    await quadBtn.click({ force: true });
    await expect(canvas).toHaveAttribute('data-viewport-layout', 'quad');
    await expect(quadBtn).toHaveAttribute('aria-pressed', 'true');
  } else {
    await singleBtn.click({ force: true });
    await expect(canvas).toHaveAttribute('data-viewport-layout', 'single');
    await expect(quadBtn).toHaveAttribute('aria-pressed', 'false');
  }

  await page.waitForTimeout(120);
};

export const dragRigMoveInOrthoPane = async (page: Page): Promise<void> => {
  const canvas = page.getByTestId('three-canvas');
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Viewport canvas is not visible.');
  }

  const startX = box.x + box.width * 0.18;
  const startY = box.y + box.height * 0.18;
  await page.mouse.move(startX, startY);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(box.x + box.width * 0.32, box.y + box.height * 0.26, { steps: 8 });
  await page.waitForTimeout(80);
  await page.mouse.up({ button: 'left' });
};

export const dragRigRotateInOrthoPane = async (page: Page): Promise<void> => {
  const canvas = page.getByTestId('three-canvas');
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Viewport canvas is not visible.');
  }

  const centerX = box.x + box.width * 0.25;
  const centerY = box.y + box.height * 0.25;
  await page.mouse.move(centerX + box.width * 0.08, centerY);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(centerX, centerY + box.height * 0.08, { steps: 8 });
  await page.waitForTimeout(80);
  await page.mouse.up({ button: 'left' });
};
