import type { EditorMode, ViewportLayout } from './store';

export const APP_THEME_STORAGE_KEY = 'rustsmf.appearance.theme';

export const APP_THEMES = [
  {
    id: 'modern',
    label: 'Modern',
    description: 'The current RustSMF workspace with spacious panels and a single-view default.',
    preferredViewportLayout: 'single',
    viewportBackground: 0x0b1120,
    workspaceLabels: {
      view: 'Model',
      rig: 'Rig',
      skin: 'Skin',
      animate: 'Animate',
      export: 'Export',
    },
    panelTitles: {
      outliner: 'Outliner',
      inspector: 'Inspector',
    },
  },
  {
    id: 'original',
    label: 'Original SMF',
    description: 'A compact GameMaker-inspired workspace with left tools, right submodels, and a quad-view default.',
    preferredViewportLayout: 'quad',
    viewportBackground: 0x1b1b1b,
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
  label: string;
  description: string;
  preferredViewportLayout: ViewportLayout;
  viewportBackground: number;
  workspaceLabels: Record<EditorMode, string>;
  panelTitles: {
    outliner: string;
    inspector: string;
  };
}>;

export type AppThemeId = typeof APP_THEMES[number]['id'];
export type AppThemeDefinition = typeof APP_THEMES[number];

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
