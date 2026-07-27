import { TransportMode } from './schedule-draft';

export const APP_SETTINGS_STORAGE_KEY = '@on-time/app-settings';
const APP_SETTINGS_VERSION = 1;

export type CoachTone = '친근하게' | '간결하게' | '단호하게';
export type RoutinePreset = '기본 외출 준비' | '빠른 준비';
export type PreferredTransport = Exclude<TransportMode, 'AI 추천'>;

export type AppSettings = {
  version: typeof APP_SETTINGS_VERSION;
  defaultLocation: string;
  preferredTransport: PreferredTransport;
  bufferMinutes: 3 | 5 | 10;
  routinePreset: RoutinePreset;
  coachTone: CoachTone;
  voiceControl: boolean;
  notifications: boolean;
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
    coachTone: '친근하게',
    voiceControl: true,
    notifications: true,
  };
}

export async function loadAppSettings(storage: StorageLike): Promise<AppSettings> {
  const raw = await storage.getItem(APP_SETTINGS_STORAGE_KEY);
  if (!raw) return createDefaultAppSettings();

  try {
    const parsed: unknown = JSON.parse(raw);
    return isAppSettings(parsed) ? parsed : createDefaultAppSettings();
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
    && (settings.routinePreset === '기본 외출 준비' || settings.routinePreset === '빠른 준비')
    && (settings.coachTone === '친근하게' || settings.coachTone === '간결하게' || settings.coachTone === '단호하게')
    && typeof settings.voiceControl === 'boolean'
    && typeof settings.notifications === 'boolean';
}

function isPreferredTransport(value: unknown): value is PreferredTransport {
  return value === '도보'
    || value === '버스'
    || value === '지하철'
    || value === '자가용'
    || value === '택시';
}
