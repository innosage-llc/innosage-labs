import React, { createContext, useContext, useMemo, type ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark';

export interface ThemePalette {
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  controlBorder: string;
  accent: string;
  onAccent: string;
  danger: string;
  onDanger: string;
  success: string;
}

export const lightPalette: ThemePalette = {
  background: '#FFFBFE',
  surface: '#F3EDF7',
  text: '#1D1B20',
  muted: '#49454F',
  border: '#E7E0EC',
  controlBorder: '#79747E',
  accent: '#6750A4',
  onAccent: '#ffffff',
  danger: '#b91c1c',
  onDanger: '#ffffff',
  success: '#15803d',
};

export const darkPalette: ThemePalette = {
  background: '#141218',
  surface: '#211F26',
  text: '#E6E0E9',
  muted: '#CAC4D0',
  border: '#49454F',
  controlBorder: '#938F99',
  accent: '#D0BCFF',
  onAccent: '#381E72',
  danger: '#F2B8B5',
  onDanger: '#601410',
  success: '#B7DDB4',
};

export const palettes: Record<ThemeMode, ThemePalette> = {
  light: lightPalette,
  dark: darkPalette,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const typography = {
  title: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700' as const,
  },
  heading: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600' as const,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400' as const,
  },
  caption: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '400' as const,
  },
} as const;

export interface ThemeContextValue {
  mode: ThemeMode;
  palette: ThemePalette;
  spacing: typeof spacing;
  typography: typeof typography;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'light',
  palette: lightPalette,
  spacing,
  typography,
});

export interface ThemeProviderProps {
  mode?: ThemeMode;
  children: ReactNode;
}

export function ThemeProvider({ mode = 'light', children }: ThemeProviderProps) {
  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      palette: palettes[mode] ?? lightPalette,
      spacing,
      typography,
    }),
    [mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
