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
  durationMinutes?: number;
  recurrence?: string;
};

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
  removeItem: (key: string) => Promise<unknown>;
};

export function createDefaultScheduleDraft(
  preparationGender: PreparationGender = 'unspecified',
  now: Date | number = Date.now(),
): ScheduleDraft {
  const current = typeof now === 'number' ? new Date(now) : new Date(now.getTime());
  const appointment = defaultAppointmentDate(current);

  return {
    version: SCHEDULE_DRAFT_VERSION,
    step: 0,
    title: generatedScheduleTitle(appointment),
    date: formattedDefaultDate(appointment, current),
    appointmentTime: localClock(appointment),
    destination: '서면 볼링장',
    destinationAddress: '부산진구 중앙대로 672',
    destinationCoordinate: { latitude: 35.1531, longitude: 129.0597 },
    transport: 'AI 추천',
    priority: 'on-time',
    routines: defaultRoutinesForGender(preparationGender),
    durationMinutes: 60,
    recurrence: '반복 없음',
  };
}

export function isGeneratedScheduleTitle(title: string) {
  return /^[일월화수목금토]요일 (오전|오후) 약속$/.test(title.trim());
}

function defaultAppointmentDate(now: Date) {
  const minimum = now.getTime() + 30 * 60_000;
  const fiveMinutes = 5 * 60_000;
  return new Date(Math.ceil(minimum / fiveMinutes) * fiveMinutes);
}

function generatedScheduleTitle(appointment: Date) {
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][appointment.getDay()];
  const period = appointment.getHours() < 12 ? '오전' : '오후';
  return `${weekday}요일 ${period} 약속`;
}

function formattedDefaultDate(appointment: Date, now: Date) {
  const relative = isSameLocalDate(appointment, now) ? '오늘' : '내일';
  return `${appointment.getMonth() + 1}월 ${appointment.getDate()}일 (${relative})`;
}

function localClock(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function isSameLocalDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
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
    && draft.routines.every(isRoutineDraft)
    && (draft.durationMinutes === undefined
      || (Number.isInteger(draft.durationMinutes) && draft.durationMinutes >= 5 && draft.durationMinutes <= 1440))
    && (draft.recurrence === undefined || typeof draft.recurrence === 'string');
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
