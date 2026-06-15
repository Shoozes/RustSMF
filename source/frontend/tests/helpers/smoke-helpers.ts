import { expect, type Locator, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOCAL_TEST_SMF = path.resolve(__dirname, '../mixamo_smf_baldguy.smf');
const SMF_DIR = path.resolve(__dirname, '../../../../docs/references/old-src/datafiles/SMF');
const BAD_GML_DIR_SEARCH = path.resolve(__dirname, '../../../../docs/references/old-src');
const LOCAL_TEST_FBX = path.resolve(__dirname, '../test.fbx');

let smfFilesCache: string[] | null = null;
function getSmfFiles(): string[] {
  if (smfFilesCache) return smfFilesCache;
  smfFilesCache = fs.existsSync(SMF_DIR)
    ? fs.readdirSync(SMF_DIR).filter(f => f.endsWith('.smf'))
    : [];
  return smfFilesCache;
}

let gmlFilesCache: string[] | null = null;
function getGmlFiles(): string[] {
  if (gmlFilesCache) return gmlFilesCache;
  const gmls: string[] = [];
  function findGml(dir: string): void {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const full = path.join(dir, item);
        if (fs.statSync(full).isDirectory()) findGml(full);
        else if (item.endsWith('.gml')) gmls.push(full);
      }
    } catch {}
  }
  if (fs.existsSync(BAD_GML_DIR_SEARCH)) findGml(BAD_GML_DIR_SEARCH);
  gmlFilesCache = gmls;
  return gmlFilesCache;
}

export let SAMPLE_SMF: string | null = null;
if (fs.existsSync(LOCAL_TEST_SMF)) {
  SAMPLE_SMF = LOCAL_TEST_SMF;
} else if (getSmfFiles().length > 0) {
  SAMPLE_SMF = path.join(SMF_DIR, getSmfFiles()[0]);
}
// Note: old-src datafiles/SMF/*.smf (Axe, Dragon, Dwarf, etc.) provide additional legacy SMF format coverage
// for roundtrips + visual smoke when the primary local sample is not present. These exercise the same
// import/export paths used for "recover old model files" scenarios.

const BAD_GML = getGmlFiles().length > 0 ? getGmlFiles()[0] : null;
export const BAD_INPUT_FOR_ERROR_TEST = (BAD_GML && fs.existsSync(BAD_GML))
  ? BAD_GML
  : path.resolve(__dirname, '../smoke.spec.ts');

export let SAMPLE_FBX: string | null = null;
if (fs.existsSync(LOCAL_TEST_FBX)) {
  SAMPLE_FBX = LOCAL_TEST_FBX;
}

const LOCAL_TEST_OBJ = path.resolve(__dirname, '../test.obj');
export let SAMPLE_OBJ: string | null = null;
if (fs.existsSync(LOCAL_TEST_OBJ)) {
  SAMPLE_OBJ = LOCAL_TEST_OBJ;
}
// No broad fallback to non-.obj files; old-src typically has no .obj. If needed later, extend getObjFiles similar to smf/fbx.


export function simulateSmfHeaderParse(bytes: Uint8Array): { version: string; size: number; offTex: number; offModel: number; offRig: number; offAnim: number } | { error: string } {
  if (!bytes || bytes.length === 0) return { error: 'empty file' };
  if (bytes.length < 32) return { error: 'too small' };
  let off = 0;
  while (off < bytes.length && bytes[off] !== 0) off++;
  const versionEnd = off;
  let version = '';
  for (let i = 0; i < versionEnd; i++) version += String.fromCharCode(bytes[i]);
  off += 1;
  if (off + 16 > bytes.length) return { error: 'header short' };
  const offTex = (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0; off += 4;
  const offModel = (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0; off += 4;
  const offRig = (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0; off += 4;
  const offAnim = (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0;
  return { version, size: bytes.length, offTex, offModel, offRig, offAnim };
}

export function simulateGetSmfDesktopInfo(bytes: Uint8Array): string {
  const p = simulateSmfHeaderParse(bytes);
  if ('error' in p) return p.error;
  const valid = p.version.startsWith('SMF_v') ? 'valid SMF' : 'invalid';
  const rigCount = (p.offRig + 4 <= bytes.length) ? (bytes[p.offRig] | (bytes[p.offRig + 1] << 8) | (bytes[p.offRig + 2] << 16) | (bytes[p.offRig + 3] << 24)) >>> 0 : 0;
  const animCount = (p.offAnim + 1 <= bytes.length) ? bytes[p.offAnim] : 0;
  return `${valid} | rig ~${rigCount} | anim ~${animCount} (offsets t${p.offTex} m${p.offModel} r${p.offRig} a${p.offAnim})`;
}

export function simulateValidateSmf(bytes: Uint8Array): string {
  const p = simulateSmfHeaderParse(bytes);
  if ('error' in p) return `invalid: ${p.error}`;
  if (p.version.startsWith('SMF_v')) return 'valid SMF';
  return `invalid: not SMF header (starts with '${p.version.slice(0, 20)}')`;
}

export async function pausePlaybackIfRunning(page: Page): Promise<void> {
  const pauseButton = page.locator('button').filter({ hasText: /Pause|⏸/i }).first();
  if (await pauseButton.count() > 0) {
    await pauseButton.click({ force: true }).catch(() => {});
    await page.waitForTimeout(120);
  }
}

export async function expectRenderedScreenshot(locator: Locator, minBytes = 3000, options?: { strict?: boolean; name?: string; threshold?: number }): Promise<void> {
  if (options?.strict && process.env.RUSTSMF_STRICT_VISUALS === '1') {
    // Opt-in visual regression for key states. Default e2e keeps tolerant checks for WebGL stability.
    const name = options.name || 'viewport';
    const threshold = options.threshold ?? 0.2;
    await expect(locator).toHaveScreenshot(`${name}.png`, { threshold });
    return;
  }
  // Default: tolerant byte-size smoke. Avoids brittle per-machine WebGL differences.
  // Still proves the viewport actually rendered something substantial (model + grid + axes etc.).
  const shot = await locator.screenshot();
  expect(shot.length).toBeGreaterThan(minBytes);
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
  diagnosticPage._tauriTestContext = { simulated: true, note: 'Tauri IPC mocks drive desktop read/peek branches in browser e2e.' };
}

export function getBrowserErrors(page: Page): string[] {
  return (page as DiagnosticPage)._browserErrors ?? [];
}

export interface TauriMockInit {
  openPath: string;
  savePath: string;
  sampleBytes: number[];
  desktopInfo: string;
  modelInfo: string;
  cancelOpen?: boolean;
  cancelSave?: boolean;
  failWrite?: boolean;
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
    };
    const w = window as TauriMockWindow;
    w.__TAURI__ = {};
    w.__RUSTSMF_TAURI_MOCK__ = state;

    let nextCallbackId = 1;
    const callbacks = new Map<number, unknown>();
    w.__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args?: Record<string, unknown>) => {
        state.calls.push({ cmd, args });
        switch (cmd) {
          case 'plugin:dialog|open':
            return state.cancelOpen ? null : state.openPath;
          case 'plugin:dialog|save':
            return state.cancelSave ? null : state.savePath;
          case 'read_file_binary':
            return state.sampleBytes;
          case 'get_smf_desktop_info':
            return state.desktopInfo;
          case 'peek_smf_model_basic':
            return state.modelInfo;
          case 'write_file_binary': {
            if (state.failWrite) throw new Error('mock write failed');
            const data = Array.isArray(args?.data) ? args.data as number[] : [];
            const pathValue = typeof args?.path === 'string' ? args.path : '';
            state.writes.push({
              path: pathValue,
              length: data.length,
              firstBytes: data.slice(0, 8),
            });
            return null;
          }
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

export async function updateTauriMock(page: Page, patch: Partial<Pick<TauriMockInit, 'cancelOpen' | 'cancelSave' | 'failWrite'>>): Promise<void> {
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
    };
  });
}
