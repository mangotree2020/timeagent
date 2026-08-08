import { defaultRoutinesForGender, PreparationGender } from './preparation-profile';

export const SCHEDULE_DRAFT_STORAGE_KEY = '@on-time/schedule-draft';
const SCHEDULE_DRAFT_VERSION = 1;

export type ScheduleDraftStep = 0 | 1 | 2;
export type TransportMode = 'AI 추천' | '도보' | '버스' | '지하철' | '자가용' | '택시';

export type RoutineDraft = {
  id: string;
  icon: string;
  label: string;
  minutes: number;
};

export type ScheduleDraft = {
  version: typeof SCHEDULE_DRAFT_VERSION;
  step: ScheduleDraftStep;
  title: string;
  date: string;
  appointmentTime: string;
  destination: string;
  destinationAddress: string;
  destinationCoordinate: { latitude: number; longitude: number } | null;
  transport: TransportMode;
  priority: 'on-time' | 'cost';
  routines: RoutineDraft[];
};

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
  removeItem: (key: string) => Promise<unknown>;
};

export function createDefaultScheduleDraft(preparationGender: PreparationGender = 'unspecified'): ScheduleDraft {
  return {
    version: SCHEDULE_DRAFT_VERSION,
    step: 0,
    title: '친구와 볼링',
    date: '7월 23일 (오늘)',
    appointmentTime: '14:00',
    destination: '서면 볼링장',
    destinationAddress: '부산진구 중앙대로 672',
    destinationCoordinate: { latitude: 35.1531, longitude: 129.0597 },
    transport: 'AI 추천',
    priority: 'on-time',
    routines: defaultRoutinesForGender(preparationGender),
  };
}

export async function loadScheduleDraft(storage: StorageLike): Promise<ScheduleDraft | null> {
  const raw = await storage.getItem(SCHEDULE_DRAFT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    return isScheduleDraft(parsed)
      ? {
          ...parsed,
          destinationCoordinate: isCoordinate(parsed.destinationCoordinate)
            ? parsed.destinationCoordinate
            : null,
        }
      : null;
  } catch {
    return null;
  }
}

export async function saveScheduleDraft(storage: StorageLike, draft: ScheduleDraft) {
  await storage.setItem(SCHEDULE_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export async function clearScheduleDraft(storage: StorageLike) {
  await storage.removeItem(SCHEDULE_DRAFT_STORAGE_KEY);
}

function isScheduleDraft(value: unknown): value is ScheduleDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<ScheduleDraft>;

  return draft.version === SCHEDULE_DRAFT_VERSION
    && (draft.step === 0 || draft.step === 1 || draft.step === 2)
    && typeof draft.title === 'string'
    && typeof draft.date === 'string'
    && typeof draft.appointmentTime === 'string'
    && typeof draft.destination === 'string'
    && typeof draft.destinationAddress === 'string'
    && (draft.destinationCoordinate === undefined
      || draft.destinationCoordinate === null
      || isCoordinate(draft.destinationCoordinate))
    && isTransportMode(draft.transport)
    && (draft.priority === 'on-time' || draft.priority === 'cost')
    && Array.isArray(draft.routines)
    && draft.routines.every(isRoutineDraft);
}

function isCoordinate(value: unknown): value is { latitude: number; longitude: number } {
  if (!value || typeof value !== 'object') return false;
  const coordinate = value as { latitude?: unknown; longitude?: unknown };
  return typeof coordinate.latitude === 'number'
    && Number.isFinite(coordinate.latitude)
    && typeof coordinate.longitude === 'number'
    && Number.isFinite(coordinate.longitude);
}

function isTransportMode(value: unknown): value is TransportMode {
  return value === 'AI 추천'
    || value === '도보'
    || value === '버스'
    || value === '지하철'
    || value === '자가용'
    || value === '택시';
}

function isRoutineDraft(value: unknown): value is RoutineDraft {
  if (!value || typeof value !== 'object') return false;
  const routine = value as Partial<RoutineDraft>;
  return typeof routine.id === 'string'
    && typeof routine.icon === 'string'
    && typeof routine.label === 'string'
    && typeof routine.minutes === 'number'
    && Number.isFinite(routine.minutes)
    && routine.minutes > 0;
}
