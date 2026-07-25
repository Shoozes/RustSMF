import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APP_THEMES,
  APP_THEME_STORAGE_KEY,
  DEFAULT_APP_THEME,
  getAppTheme,
  isAppThemeId,
  loadAppTheme,
  saveAppTheme,
  type ThemeStorage,
} from './theme';

function memoryStorage(initialValue: string | null = null): ThemeStorage {
  let value = initialValue;
  return {
    getItem: (key) => key === APP_THEME_STORAGE_KEY ? value : null,
    setItem: (key, nextValue) => {
      if (key === APP_THEME_STORAGE_KEY) value = nextValue;
    },
  };
}

test('theme registry exposes guarded modern and original themes', () => {
  assert.deepEqual(APP_THEMES.map((theme) => theme.id), ['modern', 'original']);
  assert.equal(isAppThemeId('modern'), true);
  assert.equal(isAppThemeId('original'), true);
  assert.equal(isAppThemeId('classic'), false);
  assert.equal(getAppTheme('original').preferredViewportLayout, 'quad');
  assert.equal(getAppTheme('original').viewportBackground, 0x1b1b1b);
  assert.equal(getAppTheme('original').workspaceLabels.rig, 'Rigging [2]');
  assert.equal(getAppTheme('original').panelTitles.outliner, 'Submodels');
});

test('every registered theme owns complete workspace and panel copy', () => {
  const modeKeys = ['view', 'rig', 'skin', 'animate', 'export'];
  for (const theme of APP_THEMES) {
    assert.deepEqual(Object.keys(theme.workspaceLabels), modeKeys);
    assert.ok(Object.values(theme.workspaceLabels).every((label) => label.trim().length > 0));
    assert.ok(theme.panelTitles.outliner.trim().length > 0);
    assert.ok(theme.panelTitles.inspector.trim().length > 0);
  }
});

test('theme preference roundtrips through storage and rejects stale values', () => {
  const storage = memoryStorage();
  assert.equal(loadAppTheme(storage), DEFAULT_APP_THEME);
  assert.equal(saveAppTheme('original', storage), true);
  assert.equal(loadAppTheme(storage), 'original');
  assert.equal(loadAppTheme(memoryStorage('retired-theme')), DEFAULT_APP_THEME);
});

test('theme storage failures fall back without blocking the app', () => {
  const brokenStorage: ThemeStorage = {
    getItem: () => {
      throw new Error('unavailable');
    },
    setItem: () => {
      throw new Error('unavailable');
    },
  };

  assert.equal(loadAppTheme(brokenStorage), DEFAULT_APP_THEME);
  assert.equal(saveAppTheme('original', brokenStorage), false);
  assert.equal(loadAppTheme(null), DEFAULT_APP_THEME);
  assert.equal(saveAppTheme('modern', null), false);
});
