import type { AnalyticsStore } from './analytics';

export const PLUS_INTEREST_STORAGE_KEY = '@on-time/plus-interest';
export const PLUS_ELIGIBILITY_COMPLETIONS = 3;

export type PlusPlan = 'monthly' | 'annual' | 'student-annual';

export const PLUS_PLAN_OPTIONS: readonly {
  id: PlusPlan;
  name: string;
  price: string;
  detail: string;
}[] = [
  { id: 'monthly', name: '월간 Plus', price: '월 ₩5,900', detail: '부담 없이 월 단위로 사용하는 가격 가설' },
  { id: 'annual', name: '연간 Plus', price: '연 ₩49,000', detail: '월 환산 약 ₩4,083 · 월간 대비 약 31% 할인' },
  { id: 'student-annual', name: '학생 연간', price: '연 ₩29,000', detail: '학생 인증 도입 전 가격 수요 검증' },
];

export type PlusInterestState = {
  version: 1;
  status: 'none' | 'interested';
  plan: PlusPlan | null;
  updatedAt: number | null;
};

export type PlusOfferEligibility = {
  eligible: boolean;
  completedSchedules: number;
  remainingSchedules: number;
};

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
  removeItem: (key: string) => Promise<unknown>;
};

export function createEmptyPlusInterestState(): PlusInterestState {
  return { version: 1, status: 'none', plan: null, updatedAt: null };
}

export function plusPlanLabel(plan: PlusPlan | null) {
  return PLUS_PLAN_OPTIONS.find((option) => option.id === plan)?.name ?? '미등록';
}

export function getPlusOfferEligibility(store: AnalyticsStore): PlusOfferEligibility {
  const completedSchedules = store.events.filter((event) => event.name === 'schedule_completed').length;
  const remainingSchedules = Math.max(0, PLUS_ELIGIBILITY_COMPLETIONS - completedSchedules);
  return {
    eligible: remainingSchedules === 0,
    completedSchedules,
    remainingSchedules,
  };
}

export async function loadPlusInterest(storage: StorageLike): Promise<PlusInterestState> {
  const raw = await storage.getItem(PLUS_INTEREST_STORAGE_KEY);
  if (!raw) return createEmptyPlusInterestState();
  try {
    const value: unknown = JSON.parse(raw);
    return isPlusInterestState(value) ? value : createEmptyPlusInterestState();
  } catch {
    return createEmptyPlusInterestState();
  }
}

export async function savePlusInterest(storage: StorageLike, plan: PlusPlan, at = Date.now()) {
  const state: PlusInterestState = {
    version: 1,
    status: 'interested',
    plan,
    updatedAt: at,
  };
  await storage.setItem(PLUS_INTEREST_STORAGE_KEY, JSON.stringify(state));
  return state;
}

export async function withdrawPlusInterest(storage: StorageLike) {
  await storage.removeItem(PLUS_INTEREST_STORAGE_KEY);
  return createEmptyPlusInterestState();
}

function isPlusPlan(value: unknown): value is PlusPlan {
  return value === 'monthly' || value === 'annual' || value === 'student-annual';
}

function isPlusInterestState(value: unknown): value is PlusInterestState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<PlusInterestState>;
  if (state.version !== 1) return false;
  if (state.status === 'none') return state.plan === null && state.updatedAt === null;
  return state.status === 'interested'
    && isPlusPlan(state.plan)
    && typeof state.updatedAt === 'number'
    && Number.isFinite(state.updatedAt);
}
