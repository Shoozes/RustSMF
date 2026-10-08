import { selectWorkspace, showModernPanel } from './modern-shell';
import { expect, type Locator, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const requireFixture = (relativePath: string): string => {
  const fixturePath = path.resolve(__dirname, relativePath);
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Required Playwright fixture is missing: ${fixturePath}`);
  }
  return fixturePath;
};

export const SAMPLE_SMF = requireFixture('../mixamo_smf_baldguy.smf');
export const SAMPLE_FBX = requireFixture('../test.fbx');
export const SAMPLE_INDEPENDENT_FBX = requireFixture('../fixtures/independent-fbx/independent_skinned.fbx');
export const SAMPLE_OBJ = requireFixture('../test.obj');
export const BAD_INPUT_FOR_ERROR_TEST = requireFixture('../fixtures/invalid-model.gml');
export const SAMPLE_EXTERNAL_GLTF = requireFixture('../fixtures/external-gltf/scene.gltf');
export const SAMPLE_EXTERNAL_GLTF_BUFFER = requireFixture('../fixtures/external-gltf/mesh.bin');
export const SAMPLE_EXTERNAL_GLTF_TEXTURE = requireFixture('../fixtures/external-gltf/texture.png');

export async function pausePlaybackIfRunning(page: Page): Promise<void> {
  const mode = await page.getByTestId('app-shell').getAttribute('data-editor-mode') as 'view' | 'rig' | 'skin' | 'animate' | 'export';
  const drawer = page.getByTestId('modern-support-panel');
  const panel = await drawer.count() ? await drawer.getAttribute('data-panel') : null;
  const button = page.getByTestId('timeline-play-btn');
  if (!await button.isVisible()) await selectWorkspace(page, 'animate', false);
  if (/Pause|⏸/i.test(await button.textContent() ?? '')) await button.click();
  await expect(button).not.toContainText(/Pause|⏸/i);
  if (mode !== 'animate') {
    await selectWorkspace(page, mode, false);
    if (panel === 'scene' || panel === 'properties') await showModernPanel(page, panel);
  }
}

export interface SyntheticDropFile {
  name: string;
  mimeType: string;
  base64: string;
}

export async function expectRenderedScreenshot(
  locator: Locator,
  minBytes = 3000,
  options?: { strict?: boolean; name?: string; threshold?: number; maxDiffPixelRatio?: number },
): Promise<void> {
  if (options?.strict && process.env.RUSTSMF_STRICT_VISUALS === '1') {
    // Opt-in visual regression for key states. Default e2e keeps tolerant checks for WebGL stability.
    const name = options.name || 'viewport';
    const threshold = options.threshold ?? 0.2;
    const maxDiffPixelRatio = options.maxDiffPixelRatio ?? 0.03;
    await expect(locator).toHaveScreenshot(`${name}.png`, { threshold, maxDiffPixelRatio });
    return;
  }
  // Default: tolerant byte-size smoke. Avoids brittle per-machine WebGL differences.
  // Still proves the viewport actually rendered something substantial (model + grid + axes etc.).
  const shot = await locator.screenshot();
  expect(shot.length).toBeGreaterThan(minBytes);
}

export async function withBrowserFileArrayBufferDelay(
  page: Page,
  options: { delayedFileName: string; delayMs: number; rejectMessage?: string },
): Promise<void> {
  await page.evaluate((config) => {
    const originalArrayBuffer = File.prototype.arrayBuffer;
    const delayedFile = config.delayedFileName;
    const delayMs = config.delayMs;
    const rejectMessage = config.rejectMessage;
    let remainingDelayCalls = 1;

    File.prototype.arrayBuffer = async function (): Promise<ArrayBuffer> {
      const fileName = this instanceof File ? this.name : '';
      const shouldDelay = fileName === delayedFile && remainingDelayCalls > 0;
      if (shouldDelay) {
        remainingDelayCalls -= 1;
        await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
        if (rejectMessage) throw new Error(rejectMessage);
      }
      return originalArrayBuffer.call(this) as Promise<ArrayBuffer>;
    };

    (window as any).__RUSTSMF_ARRAYBUFFER_RESTORE__ = () => {
      File.prototype.arrayBuffer = originalArrayBuffer;
    };
  }, options);
}

export async function restoreBrowserFileArrayBuffer(page: Page): Promise<void> {
  await page.evaluate(() => {
    const restore = (window as any).__RUSTSMF_ARRAYBUFFER_RESTORE__;
    if (typeof restore === 'function') {
      restore();
      (window as any).__RUSTSMF_ARRAYBUFFER_RESTORE__ = undefined;
    }
  });
}

export async function dispatchSyntheticDrop(
  target: Locator,
  file: SyntheticDropFile,
): Promise<void> {
  await target.evaluate((targetElement, fileDef) => {
    const binaryString = atob(fileDef.base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i += 1) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const synthetic = new File([bytes], fileDef.name, {
      type: fileDef.mimeType || 'application/octet-stream',
    });

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(synthetic);
    targetElement.dispatchEvent(new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }));
    targetElement.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }));
  }, file);
}

interface DiagnosticPage extends Page {
  _browserErrors?: string[];
  _tauriTestContext?: { simulated: boolean; note: string };
}

export function setupBrowserDiagnostics(page: Page): void {
  const diagnosticPage = page as DiagnosticPage;
  const browserErrors: string[] = [];
  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      const text = `[BROWSER ${type.toUpperCase()}] ${msg.text()}`;
      if (text.includes('SyntaxError') && (text.includes('import') || text.includes('JSON') || text.includes('Unexpected token'))) {
        return;
      }
      if (text.includes('THREE.Object3D.add') || text.includes('Multiple instances of Three.js') || text.includes('TransformControls')) {
        return;
      }
      if (text.includes('GLTFExporter: Use MeshStandardMaterial or MeshBasicMaterial')) {
        return;
      }
      if (text.includes('GL Driver Message') && text.includes('ReadPixels')) {
        return;
      }
      console.log(text);
      browserErrors.push(text);
    }
  });
  page.on('pageerror', err => {
    const text = `[PAGE ERROR] ${err}`;
    console.error(text);
    browserErrors.push(text);
  });
  page.on('crash', () => {
    const text = '[PAGE CRASH] page crashed during test (Tauri/webview simulation)';
    console.error(text);
    browserErrors.push(text);
  });
  page.on('requestfailed', req => {
    const url = req.url();
    if (url.includes('tauri') || url.includes('localhost')) return;
    const text = `[REQUEST FAILED] ${req.method()} ${url}`;
    console.warn(text);
    browserErrors.push(text);
  });
  diagnosticPage._browserErrors = browserErrors;
  diagnosticPage._tauriTestContext = { simulated: true, note: 'Tauri IPC mocks drive desktop read/write branches in browser e2e.' };
}

export function getBrowserErrors(page: Page): string[] {
  return (page as DiagnosticPage)._browserErrors ?? [];
}

export interface TauriMockInit {
  openPath: string;
  openPaths?: string[];
  savePath: string;
  sampleBytes: number[];
  resourceBytes?: number[][];
  recoveryBytes?: number[];
  cancelOpen?: boolean;
  cancelSave?: boolean;
  failWrite?: boolean;
  failOpen?: boolean;
  failRead?: boolean;
  openDelayMs?: number;
  readDelayMs?: number;
  writeDelayMs?: number;
}

interface TauriMockCall {
  cmd: string;
  args?: unknown;
}

interface TauriMockWrite {
  path: string;
  length: number;
  firstBytes: number[];
}

export interface TauriMockSnapshot {
  calls: TauriMockCall[];
  writes: TauriMockWrite[];
  autosaves: TauriMockWrite[];
  activeWrites: number;
  maxActiveWrites: number;
}

interface TauriMockWindow extends Window {
  __TAURI__?: Record<string, unknown>;
  __TAURI_INTERNALS__?: Record<string, unknown>;
  __RUSTSMF_TAURI_MOCK__?: TauriMockInit & TauriMockSnapshot;
}

export async function installTauriMock(page: Page, init: TauriMockInit): Promise<void> {
  await page.addInitScript((mockInit: TauriMockInit) => {
    const state: TauriMockInit & TauriMockSnapshot = {
      ...mockInit,
      calls: [],
      writes: [],
      autosaves: [],
      activeWrites: 0,
      maxActiveWrites: 0,
    };
    const w = window as TauriMockWindow;
    w.__TAURI__ = {};
    w.__RUSTSMF_TAURI_MOCK__ = state;

    let nextCallbackId = 1;
    const callbacks = new Map<number, unknown>();
    const writeBytes = async (
      args: Record<string, unknown> | undefined,
      destination: TauriMockWrite[],
      path: string,
      canCancel: boolean,
    ): Promise<boolean> => {
      if (canCancel && state.cancelSave) return false;
      state.activeWrites += 1;
      state.maxActiveWrites = Math.max(state.maxActiveWrites, state.activeWrites);
      try {
        if (typeof state.writeDelayMs === 'number' && state.writeDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, state.writeDelayMs));
        }
        if (state.failWrite) throw new Error('mock write failed');
        const rawData = args?.data;
        const data = rawData instanceof Uint8Array
          ? Array.from(rawData)
          : Array.isArray(rawData) ? rawData as number[] : [];
        destination.push({
          path,
          length: data.length,
          firstBytes: data.slice(0, 8),
        });
        if (destination === state.autosaves) state.recoveryBytes = data;
        return true;
      } finally {
        state.activeWrites -= 1;
      }
    };
    w.__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args?: Record<string, unknown>) => {
        state.calls.push({ cmd, args });
        switch (cmd) {
          case 'open_file':
            if (typeof state.openDelayMs === 'number' && state.openDelayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, state.openDelayMs));
            }
            if (state.failOpen) throw new Error('mock open failed');
            return state.cancelOpen ? null : (state.openPaths ?? state.openPath);
          case 'read_file_binary':
            if (typeof state.readDelayMs === 'number' && state.readDelayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, state.readDelayMs));
            }
            if (state.failRead) throw new Error('mock read failed');
            return state.sampleBytes;
          case 'read_files_binary':
            if (typeof state.readDelayMs === 'number' && state.readDelayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, state.readDelayMs));
            }
            if (state.failRead) throw new Error('mock read failed');
            return state.resourceBytes ?? [state.sampleBytes];
          case 'open_project_file':
            return state.cancelOpen ? null : state.openPath;
          case 'save_file_binary':
          case 'save_project_atomic':
            return writeBytes(args, state.writes, state.savePath, true);
          case 'autosave_project':
            return writeBytes(args, state.autosaves, 'rustsmf-autosave.rsproj', false);
          case 'discover_project_recovery':
            return state.recoveryBytes ? ['rustsmf-autosave.rsproj'] : [];
          case 'read_project_recovery':
            if (args?.name !== 'rustsmf-autosave.rsproj' || !state.recoveryBytes) {
              throw new Error('mock recovery generation was not found');
            }
            return state.recoveryBytes;
          case 'greet':
            return `Hello, ${String(args?.name || 'RustSMF')}!`;
          default:
            throw new Error(`Unhandled Tauri mock command: ${cmd}`);
        }
      },
      transformCallback: (callback: unknown, once = false) => {
        const id = nextCallbackId++;
        callbacks.set(id, { callback, once });
        return id;
      },
      unregisterCallback: (id: number) => {
        callbacks.delete(id);
      },
      runCallback: (id: number, payload: unknown) => {
        const entry = callbacks.get(id) as { callback?: (payload: unknown) => unknown; once?: boolean } | undefined;
        const result = entry?.callback?.(payload);
        if (entry?.once) callbacks.delete(id);
        return result;
      },
      callbacks,
    };
  }, init);
}

export async function updateTauriMock(
  page: Page,
  patch: Partial<Pick<TauriMockInit,
    'cancelOpen' | 'cancelSave' | 'failOpen' | 'failRead' | 'failWrite' | 'openDelayMs' | 'readDelayMs' | 'writeDelayMs'
  >>,
): Promise<void> {
  await page.evaluate((statePatch) => {
    const state = (window as TauriMockWindow).__RUSTSMF_TAURI_MOCK__;
    if (state) Object.assign(state, statePatch);
  }, patch);
}

export async function getTauriMockSnapshot(page: Page): Promise<TauriMockSnapshot> {
  return page.evaluate(() => {
    const state = (window as TauriMockWindow).__RUSTSMF_TAURI_MOCK__;
    return {
      calls: state?.calls ?? [],
      writes: state?.writes ?? [],
      autosaves: state?.autosaves ?? [],
      activeWrites: state?.activeWrites ?? 0,
      maxActiveWrites: state?.maxActiveWrites ?? 0,
    };
  });
}
