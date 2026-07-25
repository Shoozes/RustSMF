import { useCallback, useMemo, useState } from 'react';
import {
  getAppTheme,
  loadAppTheme,
  saveAppTheme,
  type AppThemeId,
} from '../theme';

export function useAppTheme() {
  const [themeId, setThemeIdState] = useState<AppThemeId>(() => loadAppTheme());

  const setThemeId = useCallback((nextThemeId: AppThemeId) => {
    setThemeIdState(nextThemeId);
    saveAppTheme(nextThemeId);
  }, []);

  const theme = useMemo(() => getAppTheme(themeId), [themeId]);

  return {
    theme,
    themeId,
    setThemeId,
  };
}
