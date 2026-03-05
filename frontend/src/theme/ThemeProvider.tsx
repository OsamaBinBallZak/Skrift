import React, { createContext, useContext, useLayoutEffect, useMemo, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';
type Resolved = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  resolved: Resolved;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

function applyThemeClass(resolved: Resolved) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(resolved);
  // Update color-scheme for native controls (audio/video players)
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('ui.theme') as Theme) || 'system');
  const resolved: Resolved = useMemo(() => (theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme), [theme]);

  useLayoutEffect(() => {
    applyThemeClass(resolved);
    localStorage.setItem('ui.theme', theme);
    
    // Sync with Electron's nativeTheme if available
    if (typeof window !== 'undefined' && (window as any).electronAPI?.theme?.setTheme) {
      (window as any).electronAPI.theme.setTheme(theme).catch((err: Error) => {
        console.warn('Failed to sync theme with Electron:', err);
      });
    }
    
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (theme === 'system') applyThemeClass(prefersDark() ? 'dark' : 'light');
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [theme, resolved]);

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
