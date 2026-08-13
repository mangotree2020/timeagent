import AsyncStorage from '@react-native-async-storage/async-storage';
import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react';

import { color } from '@/constants/design';
import { AppColorMode, loadAppSettings } from '@/lib/app-settings';

/**
 * Light values repeat the static tokens exactly, so a screen reads the same before and after it
 * starts using the palette. Dark values keep the same roles rather than inverting each colour.
 */
export type AppPalette = {
  background: string; surface: string; surfaceMuted: string;
  text: string; textMuted: string; border: string; navy: string;
  primary: string; deepBlue: string; primarySoft: string; bubble: string; assistantBubble: string;
  surfaceInverse: string; onInverse: string; onInverseMuted: string;
  infoSoft: string; selectedSoft: string;
  cyan: string; ice: string;
  success: string; successSoft: string;
  warning: string; warningSoft: string;
  danger: string; dangerSoft: string;
  onPrimary: string; onNavy: string;
};

const palettes: Record<AppColorMode, AppPalette> = {
  light: {
    background: color.background, surface: color.surface, surfaceMuted: color.surfaceMuted,
    text: color.text, textMuted: color.textMuted, border: color.border, navy: color.navy,
    primary: color.deepBlue, deepBlue: color.deepBlue, primarySoft: '#E7F0FF', bubble: color.surface, assistantBubble: color.surface,
    surfaceInverse: color.navy, onInverse: '#FFFFFF', onInverseMuted: color.ice,
    infoSoft: '#E6F6FB', selectedSoft: '#F3FAFD',
    cyan: color.cyan, ice: color.ice,
    success: color.success, successSoft: color.successSoft,
    warning: color.warning, warningSoft: color.warningSoft,
    danger: color.danger, dangerSoft: color.dangerSoft,
    onPrimary: color.surface, onNavy: color.surface,
  },
  dark: {
    background: '#070D1D', surface: '#111A30', surfaceMuted: '#18223A',
    text: '#F8FAFC', textMuted: '#A8B2C7', border: '#26324C', navy: '#F8FAFC',
    primary: '#3183F7', deepBlue: '#3183F7', primarySoft: '#17294A', bubble: '#3183F7', assistantBubble: '#111A30',
    surfaceInverse: '#1B2740', onInverse: '#F8FAFC', onInverseMuted: '#C3D2EE',
    infoSoft: '#12283A', selectedSoft: '#142A3D',
    cyan: '#5CC8FA', ice: '#1B2C4C',
    success: '#3DD9A0', successSoft: '#10382C',
    warning: '#F5A455', warningSoft: '#3A2712',
    danger: '#F2857C', dangerSoft: '#3B1B1A',
    onPrimary: '#FFFFFF', onNavy: '#F8FAFC',
  },
};

/** Light values for the few places that read tokens outside a component. */
export const lightPalette: AppPalette = palettes.light;

type ThemeContextValue = {
  mode: AppColorMode;
  palette: AppPalette;
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

/**
 * Builds a screen's stylesheet from the active palette and rebuilds it only when the mode changes,
 * so a screen keeps one `styles` object instead of spreading colours through its markup.
 */
export function useThemedStyles<T>(create: (palette: AppPalette) => T): T {
  const { palette } = useAppTheme();
  return useMemo(() => create(palette), [create, palette]);
}
