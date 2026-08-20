import { TransportMode } from './schedule-draft';
import { PreparationGender, RoutinePresetName } from './preparation-profile';

export const APP_SETTINGS_STORAGE_KEY = '@on-time/app-settings';
const APP_SETTINGS_VERSION = 5;

export type CoachTone = '친근하게' | '간결하게' | '단호하게';
export type RoutinePreset = RoutinePresetName;
export type PreferredTransport = Exclude<TransportMode, 'AI 추천'>;
export type AppColorMode = 'light' | 'dark';

/**
 * The display language someone picked. Nothing offers the choice at the moment — the picker was
 * taken back out while translation waits for Phase 2 — but the field stays: settings already saved
 * with it must keep loading, and Phase 2 needs somewhere to put the answer.
 */
export type AppLanguage = 'ko' | 'en' | 'ja' | 'zh';

export const APP_LANGUAGES: readonly { id: AppLanguage; label: string; flag: string }[] = [
  { id: 'ko', label: '한국어', flag: '🇰🇷' },
  { id: 'en', label: 'English', flag: '🇺🇸' },
  { id: 'ja', label: '日本語', flag: '🇯🇵' },
  { id: 'zh', label: '中文', flag: '🇨🇳' },
];

export function isAppLanguage(value: unknown): value is AppLanguage {
  return APP_LANGUAGES.some((option) => option.id === value);
}

export type AppSettings = {
  version: typeof APP_SETTINGS_VERSION;
  defaultLocation: string;
  preferredTransport: PreferredTransport;
  bufferMinutes: 3 | 5 | 10;
  routinePreset: RoutinePreset;
  preparationGender: PreparationGender;
  coachTone: CoachTone;
  voiceControl: boolean;
  notifications: boolean;
  colorMode: AppColorMode;
  language: AppLanguage;
  /** Per-step start alarms and the spoken coach that goes with them. */
  stepCoaching: boolean;
};

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
};

export function createDefaultAppSettings(): AppSettings {
  return {
    version: APP_SETTINGS_VERSION,
    defaultLocation: '부산진구 부전동',
    preferredTransport: '지하철',
    bufferMinutes: 5,
    routinePreset: '기본 외출 준비',
    preparationGender: 'unspecified',
    coachTone: '친근하게',
    voiceControl: true,
    notifications: true,
    colorMode: 'light',
    language: 'ko',
    stepCoaching: true,
  };
}

export async function loadAppSettings(storage: StorageLike): Promise<AppSettings> {
  const raw = await storage.getItem(APP_SETTINGS_STORAGE_KEY);
  if (!raw) return createDefaultAppSettings();

  try {
    const parsed: unknown = JSON.parse(raw);
    if (isAppSettings(parsed)) return parsed;
    if (isVersionFourSettings(parsed)) return { ...parsed, version: APP_SETTINGS_VERSION, language: 'ko' };
    if (isVersionThreeSettings(parsed)) return { ...parsed, version: APP_SETTINGS_VERSION, language: 'ko', stepCoaching: true };
    if (isVersionTwoSettings(parsed)) return { ...parsed, version: APP_SETTINGS_VERSION, language: 'ko', colorMode: 'light', stepCoaching: true };
    if (isLegacyAppSettings(parsed)) return { ...parsed, version: APP_SETTINGS_VERSION, preparationGender: 'unspecified', language: 'ko', colorMode: 'light', stepCoaching: true };
    return createDefaultAppSettings();
  } catch {
    return createDefaultAppSettings();
  }
}

export async function saveAppSettings(storage: StorageLike, settings: AppSettings) {
  await storage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function isAppSettings(value: unknown): value is AppSettings {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Partial<AppSettings>;
  return settings.version === APP_SETTINGS_VERSION
    && typeof settings.defaultLocation === 'string'
    && isPreferredTransport(settings.preferredTransport)
    && (settings.bufferMinutes === 3 || settings.bufferMinutes === 5 || settings.bufferMinutes === 10)
    && isRoutinePreset(settings.routinePreset)
    && isPreparationGender(settings.preparationGender)
    && (settings.coachTone === '친근하게' || settings.coachTone === '간결하게' || settings.coachTone === '단호하게')
    && typeof settings.voiceControl === 'boolean'
    && typeof settings.notifications === 'boolean'
    && (settings.colorMode === 'light' || settings.colorMode === 'dark')
    && isAppLanguage(settings.language)
    && typeof settings.stepCoaching === 'boolean';
}

function isVersionFourSettings(value: unknown): value is Omit<AppSettings, 'version' | 'language'> & { version: 4 } {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Partial<Omit<AppSettings, 'version'>> & { version?: unknown };
  return settings.version === 4
    && typeof settings.defaultLocation === 'string'
    && isPreferredTransport(settings.preferredTransport)
    && (settings.bufferMinutes === 3 || settings.bufferMinutes === 5 || settings.bufferMinutes === 10)
    && isRoutinePreset(settings.routinePreset)
    && isPreparationGender(settings.preparationGender)
    && (settings.coachTone === '친근하게' || settings.coachTone === '간결하게' || settings.coachTone === '단호하게')
    && typeof settings.voiceControl === 'boolean'
    && typeof settings.notifications === 'boolean'
    && (settings.colorMode === 'light' || settings.colorMode === 'dark')
    && typeof settings.stepCoaching === 'boolean';
}

function isVersionThreeSettings(value: unknown): value is Omit<AppSettings, 'version' | 'stepCoaching'> & { version: 3 } {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Partial<Omit<AppSettings, 'version'>> & { version?: unknown };
  return settings.version === 3
    && typeof settings.defaultLocation === 'string'
    && isPreferredTransport(settings.preferredTransport)
    && (settings.bufferMinutes === 3 || settings.bufferMinutes === 5 || settings.bufferMinutes === 10)
    && isRoutinePreset(settings.routinePreset)
    && isPreparationGender(settings.preparationGender)
    && (settings.coachTone === '친근하게' || settings.coachTone === '간결하게' || settings.coachTone === '단호하게')
    && typeof settings.voiceControl === 'boolean'
    && typeof settings.notifications === 'boolean'
    && (settings.colorMode === 'light' || settings.colorMode === 'dark');
}

function isVersionTwoSettings(value: unknown): value is Omit<AppSettings, 'version' | 'colorMode'> & { version: 2 } {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Partial<Omit<AppSettings, 'version'>> & { version?: unknown };
  return settings.version === 2
    && typeof settings.defaultLocation === 'string'
    && isPreferredTransport(settings.preferredTransport)
    && (settings.bufferMinutes === 3 || settings.bufferMinutes === 5 || settings.bufferMinutes === 10)
    && isRoutinePreset(settings.routinePreset)
    && isPreparationGender(settings.preparationGender)
    && (settings.coachTone === '친근하게' || settings.coachTone === '간결하게' || settings.coachTone === '단호하게')
    && typeof settings.voiceControl === 'boolean'
    && typeof settings.notifications === 'boolean';
}

function isLegacyAppSettings(value: unknown): value is Omit<AppSettings, 'version' | 'preparationGender'> & { version: 1 } {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Partial<Omit<AppSettings, 'version' | 'preparationGender'>> & { version?: unknown };
  return settings.version === 1
    && typeof settings.defaultLocation === 'string'
    && isPreferredTransport(settings.preferredTransport)
    && (settings.bufferMinutes === 3 || settings.bufferMinutes === 5 || settings.bufferMinutes === 10)
    && isRoutinePreset(settings.routinePreset)
    && (settings.coachTone === '친근하게' || settings.coachTone === '간결하게' || settings.coachTone === '단호하게')
    && typeof settings.voiceControl === 'boolean'
    && typeof settings.notifications === 'boolean';
}

function isRoutinePreset(value: unknown): value is RoutinePreset {
  return value === '기본 외출 준비' || value === '빠른 준비' || value === '여유있는 준비';
}

function isPreparationGender(value: unknown): value is PreparationGender {
  return value === 'unspecified' || value === 'female' || value === 'male';
}

function isPreferredTransport(value: unknown): value is PreferredTransport {
  return value === '도보'
    || value === '버스'
    || value === '지하철'
    || value === '자가용'
    || value === '택시';
}
