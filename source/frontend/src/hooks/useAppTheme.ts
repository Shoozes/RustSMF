import { useCallback, useMemo, useState } from 'react';
import {
  getAppTheme,
  loadAppTheme,
  saveAppTheme,
  type AppThemeId,
} from '../theme';
import { IS_WEB_EDITION } from '../webEdition';

function hasClassicLaunch(url: URL): boolean {
  return url.searchParams.get('theme') === 'classic';
}

export function useAppTheme() {
  const [themeId, setThemeIdState] = useState<AppThemeId>(() => (
    IS_WEB_EDITION && hasClassicLaunch(new URL(window.location.href)) ? 'original' : loadAppTheme()
  ));

  const setThemeId = useCallback((nextThemeId: AppThemeId) => {
    setThemeIdState(nextThemeId);
    saveAppTheme(nextThemeId);
    if (IS_WEB_EDITION) {
      const url = new URL(window.location.href);
      if (hasClassicLaunch(url)) {
        url.searchParams.delete('theme');
        window.history.replaceState(window.history.state, '', url);
      }
    }
  }, []);

  const theme = useMemo(() => getAppTheme(themeId), [themeId]);

  return {
    theme,
    themeId,
    setThemeId,
  };
}
