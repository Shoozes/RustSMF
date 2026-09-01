import type { EditorMode, ViewportLayout } from './store';

export const APP_THEME_STORAGE_KEY = 'rustsmf.appearance.theme';

export const APP_THEMES = [
  {
    id: 'modern',
    shellVariant: 'modern',
    label: 'Modern',
    description: 'The current RustSMF workspace with spacious panels and a single-view default.',
    chromeLabel: 'RustSMF',
    preferredViewportLayout: 'single',
    viewportCameraZoom: 1,
    viewportBackground: 0x0b1120,
    viewportGrid: {
      mode: 'floor',
      size: 14,
      divisions: 14,
      centerLine: 0x475569,
      line: 0x334155,
    },
    workspaceLabels: {
      view: 'Model',
      rig: 'Rig',
      skin: 'Skin',
      animate: 'Animate',
      export: 'Export',
    },
    panelTitles: {
      outliner: 'Scene',
      inspector: 'Properties',
    },
  },
  {
    id: 'original',
    shellVariant: 'original',
    label: 'Original SMF',
    description: 'The dense original editor format with narrow tool shelves, right-side submodels, and a quad-view default.',
    chromeLabel: 'Settings',
    preferredViewportLayout: 'quad',
    viewportCameraZoom: 1.2,
    viewportBackground: 0x1b1b1b,
    viewportGrid: {
      mode: 'camera-planes',
      size: 60,
      divisions: 60,
      centerLine: 0xa82c2c,
      line: 0x101010,
    },
    workspaceLabels: {
      view: 'Model [1]',
      rig: 'Rigging [2]',
      skin: 'Skinning [3]',
      animate: 'Animation [4]',
      export: 'Export [5]',
    },
    panelTitles: {
      outliner: 'Submodels',
      inspector: 'Settings',
    },
  },
] as const satisfies ReadonlyArray<{
  id: string;
  shellVariant: 'modern' | 'original';
  label: string;
  description: string;
  chromeLabel: string;
  preferredViewportLayout: ViewportLayout;
  viewportCameraZoom: number;
  viewportBackground: number;
  viewportGrid: {
    mode: 'floor' | 'camera-planes';
    size: number;
    divisions: number;
    centerLine: number;
    line: number;
  };
  workspaceLabels: Record<EditorMode, string>;
  panelTitles: {
    outliner: string;
    inspector: string;
  };
}>;

export type AppThemeId = typeof APP_THEMES[number]['id'];
export type AppThemeDefinition = typeof APP_THEMES[number];
export type ViewportGridMode = AppThemeDefinition['viewportGrid']['mode'];

export const DEFAULT_APP_THEME: AppThemeId = 'modern';

export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function isAppThemeId(value: unknown): value is AppThemeId {
  return APP_THEMES.some((theme) => theme.id === value);
}

export function getAppTheme(themeId: AppThemeId): AppThemeDefinition {
  return APP_THEMES.find((theme) => theme.id === themeId) ?? APP_THEMES[0];
}

function getBrowserThemeStorage(): ThemeStorage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadAppTheme(storage: ThemeStorage | null = getBrowserThemeStorage()): AppThemeId {
  if (!storage) return DEFAULT_APP_THEME;

  try {
    const storedTheme = storage.getItem(APP_THEME_STORAGE_KEY);
    return isAppThemeId(storedTheme) ? storedTheme : DEFAULT_APP_THEME;
  } catch {
    return DEFAULT_APP_THEME;
  }
}

export function saveAppTheme(
  themeId: AppThemeId,
  storage: ThemeStorage | null = getBrowserThemeStorage(),
): boolean {
  if (!storage) return false;

  try {
    storage.setItem(APP_THEME_STORAGE_KEY, themeId);
    return true;
  } catch {
    return false;
  }
}
