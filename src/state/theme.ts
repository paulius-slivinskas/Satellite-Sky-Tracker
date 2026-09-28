import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

export type Theme = 'dark' | 'light';
const THEME_KEY = 'satapp_theme';
const normalizeTheme = (value: string | null | undefined): Theme =>
  value === 'light' ? 'light' : 'dark';

function readTheme(): Theme {
  try {
    return normalizeTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return typeof document === 'undefined'
      ? 'dark'
      : normalizeTheme(document.documentElement.dataset.theme);
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#0a0a0a' : '#f6f7f9');
}

export function useTheme(): readonly [Theme, (next: Theme) => void] {
  const [theme, updateTheme] = useState<Theme>(readTheme);
  useLayoutEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    const syncTheme = (event: StorageEvent) => {
      if (event.key === THEME_KEY || event.key === null) {
        updateTheme(normalizeTheme(event.newValue));
      }
    };
    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
  }, []);
  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    updateTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // A blocked or full storage area must not prevent switching the current tab.
    }
  }, []);
  return [theme, setTheme] as const;
}
