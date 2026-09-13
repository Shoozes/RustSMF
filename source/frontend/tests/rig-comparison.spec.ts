import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startFitRigPreview } from '../scripts/fit-rig-preview';
import { createSkinnedGlbFixtureInputWithOptions } from './helpers/skinned-glb-fixture';

async function comparisonPreview(options: { duration?: number; fittedClip?: string; fittedDuration?: number; gameTransforms?: boolean } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rig-comparison-browser-'));
  const source = path.join(directory, 'source.glb');
  const template = path.join(directory, 'template.glb');
  const fitted = path.join(directory, 'fitted.glb');
  const [sourceFixture, templateFixture, fittedFixture] = await Promise.all([
    createSkinnedGlbFixtureInputWithOptions({ clipName: 'idle', clipDuration: options.duration ?? 0.5 }),
    createSkinnedGlbFixtureInputWithOptions({ clipName: 'idle', clipDuration: options.duration ?? 0.5 }),
    createSkinnedGlbFixtureInputWithOptions({ clipName: options.fittedClip ?? 'idle', clipDuration: options.fittedDuration ?? options.duration ?? 0.5 }),
  ]);
  await Promise.all([
    writeFile(source, sourceFixture.buffer),
    writeFile(template, templateFixture.buffer),
    writeFile(fitted, fittedFixture.buffer),
  ]);
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  const gameTransform = {
    normalizationScale: 4.4,
    visualScale: 1.12,
    groundTranslationY: 0,
    facing: 1,
    modelPitch: 0.1,
    pitchJoint: 'FixtureTip',
  };
  await writeFile(path.join(directory, 'job.json'), JSON.stringify({
    schema: 'rustsmf-fit-rig-v1',
    source,
    template,
    outputDirectory: directory,
    mapping: { FixtureRoot: 'FixtureRoot' },
    clips: ['idle'],
    comparison: options.gameTransforms ? {
      playbackRate: 0.5,
      displayHeight: 2,
      gameTransforms: { source: gameTransform, fitted: gameTransform, template: gameTransform },
    } : undefined,
  }));
  await writeFile(path.join(directory, 'report.json'), JSON.stringify({
    schema: 'rustsmf-fit-rig-report-v1',
    status: 'passed',
    sourceSha256: hash(sourceFixture.buffer),
    templateSha256: hash(templateFixture.buffer),
    outputSha256: hash(fittedFixture.buffer),
  }));
  const preview = await startFitRigPreview(directory);
  return {
    ...preview,
    async dispose() {
      await preview.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('rig comparison exposes strict synchronized coverage and a reproducible capture receipt', async ({ page }) => {
  await page.addInitScript(() => {
    let nextId = 1;
    const callbacks = new Map<number, FrameRequestCallback>();
    window.requestAnimationFrame = (callback) => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id) => { callbacks.delete(id); };
    (window as typeof window & { __stepComparisonAnimation__: (time: number) => void }).__stepComparisonAnimation__ = (time) => {
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pending) callback(time);
    };
  });
  const preview = await comparisonPreview({ gameTransforms: true });
  try {
    await page.goto(preview.url);
    await expect(page.locator('#status')).toContainText('Strict coverage passed');
    await expect(page.locator('#labels span')).toHaveCount(3);
    await expect(page.locator('#mode')).toBeEnabled();
    const receipt = await page.evaluate(() => (window as typeof window & {
      __RUSTSMF_COMPARISON_CAPTURE__: {
        clip: string;
        sourceFrame: number;
        clipTime: number;
        skeletonOverlay: boolean;
        meshOpacity: number;
        selectedJoint: string;
        jointDiagnostic: boolean;
        mappingLegend: { mapped: string; unmappedOrTargetOnly: string };
        models: Array<{ sha256: string; raw: object; applied: object }>;
        camera: object;
      };
    }).__RUSTSMF_COMPARISON_CAPTURE__);
    expect(receipt.clip).toBe('idle');
    expect(receipt.sourceFrame).toBe(0);
    expect(receipt.clipTime).toBe(0);
    expect(receipt.skeletonOverlay).toBe(false);
    expect(receipt.meshOpacity).toBe(1);
    expect(receipt.selectedJoint).toBe('FixtureRoot');
    expect(receipt.jointDiagnostic).toBe(false);
    expect(receipt.mappingLegend).toEqual({ mapped: '#00a9c1', unmappedOrTargetOnly: '#d18a00' });
    expect(receipt.models).toHaveLength(3);
    expect(receipt.models.every((model) => /^[a-f0-9]{64}$/.test(model.sha256))).toBe(true);
    expect(receipt.models.every((model) => model.raw && model.applied)).toBe(true);
    expect(receipt.camera).toBeTruthy();
    expect((receipt.camera as { layout: string }).layout).toBe('quad-ortho');
    await page.locator('#diagnostics summary').click();
    await expect(page.locator('.legend')).toContainText('Unmapped / target-only');
    await page.locator('#bones').check();
    await page.locator('#opacity').fill('0.45');
    await page.locator('#joint-diagnostic').check();
    const overlayReceipt = await page.evaluate(() => (window as typeof window & {
      __RUSTSMF_COMPARISON_CAPTURE__: {
        skeletonOverlay: boolean;
        meshOpacity: number;
        jointDiagnostic: boolean;
      };
    }).__RUSTSMF_COMPARISON_CAPTURE__);
    expect(overlayReceipt.skeletonOverlay).toBe(true);
    expect(overlayReceipt.meshOpacity).toBe(0.45);
    expect(overlayReceipt.jointDiagnostic).toBe(true);
    await page.locator('#mode').selectOption('game-transform');
    const gameReceipt = await page.evaluate(() => (window as typeof window & {
      __RUSTSMF_COMPARISON_CAPTURE__: { mode: string; models: Array<{ applied: { game: { normalizationScale: number; visualScale: number; combinedScale: number; pitchJointLocalXOverride: number } } }> };
    }).__RUSTSMF_COMPARISON_CAPTURE__);
    expect(gameReceipt.mode).toBe('game-transform');
    expect(gameReceipt.models[0].applied.game).toMatchObject({
      normalizationScale: 4.4,
      visualScale: 1.12,
      pitchJointLocalXOverride: 0.1,
    });
    expect(gameReceipt.models[0].applied.game.combinedScale).toBeCloseTo(4.928, 12);

    await page.locator('#play').click();
    await page.evaluate(() => (window as typeof window & { __stepComparisonAnimation__: (time: number) => void }).__stepComparisonAnimation__(100));
    await page.evaluate(() => (window as typeof window & { __stepComparisonAnimation__: (time: number) => void }).__stepComparisonAnimation__(183));
    await page.evaluate(() => (window as typeof window & { __stepComparisonAnimation__: (time: number) => void }).__stepComparisonAnimation__(201));
    const advancedFrame = await page.evaluate(() => (window as typeof window & {
      __RUSTSMF_COMPARISON_CAPTURE__: { sourceFrame: number };
    }).__RUSTSMF_COMPARISON_CAPTURE__.sourceFrame);
    expect(advancedFrame).toBe(3);
  } finally {
    await preview.dispose();
  }
});

test('rig comparison cleans up after a partial model-load failure', async ({ page }) => {
  const preview = await comparisonPreview();
  try {
    await page.route(`${preview.url}/fitted.glb`, (route) => route.abort());
    await page.goto(preview.url);
    await expect(page.locator('#error')).not.toBeEmpty();
    const state = await page.evaluate(() => (window as typeof window & {
      __RUSTSMF_COMPARISON_STATE__: { disposed: boolean; viewCount: number };
    }).__RUSTSMF_COMPARISON_STATE__);
    expect(state).toEqual({ disposed: true, ready: false, viewCount: 0 });
  } finally {
    await preview.dispose();
  }
});

test('rig comparison rejects and cleans up a missing requested clip', async ({ page }) => {
  const preview = await comparisonPreview({ fittedClip: 'other' });
  try {
    await page.goto(preview.url);
    await expect(page.locator('#error')).toContainText('fitted is missing clip "idle"');
    const state = await page.evaluate(() => (window as typeof window & {
      __RUSTSMF_COMPARISON_STATE__: { disposed: boolean; viewCount: number };
    }).__RUSTSMF_COMPARISON_STATE__);
    expect(state).toEqual({ disposed: true, ready: false, viewCount: 0 });
  } finally {
    await preview.dispose();
  }
});

test('rig comparison rejects and cleans up a shortened requested clip', async ({ page }) => {
  const preview = await comparisonPreview({ fittedDuration: 0.25 });
  try {
    await page.goto(preview.url);
    await expect(page.locator('#error')).toContainText('fitted clip "idle" duration');
    const state = await page.evaluate(() => (window as typeof window & {
      __RUSTSMF_COMPARISON_STATE__: { disposed: boolean; viewCount: number };
    }).__RUSTSMF_COMPARISON_STATE__);
    expect(state).toEqual({ disposed: true, ready: false, viewCount: 0 });
  } finally {
    await preview.dispose();
  }
});

test('rig comparison rejects an oversized clip before allocating its frame schedule', async ({ page }) => {
  const preview = await comparisonPreview({ duration: 1_000_000 });
  try {
    await page.goto(preview.url);
    await expect(page.locator('#error')).toContainText('exceeds 6000 regular frames');
    const state = await page.evaluate(() => (window as typeof window & {
      __RUSTSMF_COMPARISON_STATE__: { disposed: boolean; viewCount: number };
    }).__RUSTSMF_COMPARISON_STATE__);
    expect(state).toEqual({ disposed: true, ready: false, viewCount: 0 });
  } finally {
    await preview.dispose();
  }
});
