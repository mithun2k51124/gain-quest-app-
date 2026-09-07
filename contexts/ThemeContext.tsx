// contexts/ThemeContext.tsx
// Provides live theme switching across the entire app.

import React, { createContext, useContext, useEffect, useState } from 'react';
import { LIGHT_THEME, DARK_THEME, Theme } from '../constants/theme';
import { getSetting, setSetting } from '../db/database';

interface ThemeContextValue {
  C: Theme;
  isDark: boolean;
  toggleDark: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  C: LIGHT_THEME,
  isDark: false,
  toggleDark: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  // Load saved preference once on mount
  useEffect(() => {
    try {
      const saved = getSetting('dark_mode', 'false');
      setIsDark(saved === 'true');
    } catch (_) {}
  }, []);

  const toggleDark = () => {
    setIsDark(prev => {
      const next = !prev;
      try { setSetting('dark_mode', next ? 'true' : 'false'); } catch (_) {}
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ C: isDark ? DARK_THEME : LIGHT_THEME, isDark, toggleDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
