import AsyncStorage from '@react-native-async-storage/async-storage';
import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react';

import { AppColorMode, loadAppSettings } from '@/lib/app-settings';

const palettes = {
  light: {
    background: '#F2F4F6', surface: '#FFFFFF', surfaceMuted: '#EEF2F7',
    text: '#191F28', textMuted: '#6B7684', border: '#E2E8F0', navy: '#0A0F1E',
    primary: '#1B64DA', primarySoft: '#E7F0FF', bubble: '#FFFFFF', assistantBubble: '#FFFFFF',
  },
  dark: {
    background: '#070D1D', surface: '#111A30', surfaceMuted: '#18223A',
    text: '#F8FAFC', textMuted: '#A8B2C7', border: '#26324C', navy: '#F8FAFC',
    primary: '#3183F7', primarySoft: '#17294A', bubble: '#3183F7', assistantBubble: '#111A30',
  },
} as const;

type ThemeContextValue = {
  mode: AppColorMode;
  palette: typeof palettes.light | typeof palettes.dark;
  setMode: (mode: AppColorMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<AppColorMode>('light');
  useEffect(() => { void loadAppSettings(AsyncStorage).then((settings) => setModeState(settings.colorMode)); }, []);
  const value = useMemo<ThemeContextValue>(() => ({
    mode,
    palette: palettes[mode],
    setMode(nextMode) {
      setModeState(nextMode);
    },
  }), [mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside ThemeProvider');
  return value;
}
