import { AnalyticsStore, summarizeAnalytics } from './analytics';
import { PlusInterestState, plusPlanLabel } from './monetization';

export type PilotSegment = 'student' | 'worker' | 'variable-routine' | 'prefer-not-to-answer';

export const PILOT_SEGMENT_STORAGE_KEY = '@on-time/pilot-segment';

export const PILOT_SEGMENTS: readonly { id: PilotSegment; label: string; detail: string }[] = [
  { id: 'student', label: '학생', detail: '수업·시험·면접·아르바이트 일정 중심' },
  { id: 'worker', label: '직장인·프리랜서', detail: '출근·외부 미팅·연속 일정 중심' },
  { id: 'variable-routine', label: '준비 루틴 변동형', detail: '준비 시간이나 행동 전환이 자주 달라짐' },
  { id: 'prefer-not-to-answer', label: '응답하지 않음', detail: '사용자 유형을 결과에 포함하지 않음' },
];

export type PilotSummary = {
  segment: PilotSegment;
  segmentLabel: string;
  completedSchedules: number;
  scheduleCompletionRate: number | null;
  notificationStartRate: number | null;
  delayApplyRate: number | null;
  delayRejectRate: number | null;
  averageStepErrorMinutes: number | null;
  onTimeArrivalRate: number | null;
  plusOfferViews: number;
  plusInterestSelections: number;
  plusInterestWithdrawals: number;
  interestStatusLabel: '관심 등록' | '미등록';
  selectedPlanLabel: string;
};

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
};

export function pilotSegmentLabel(segment: PilotSegment) {
  return PILOT_SEGMENTS.find((option) => option.id === segment)?.label ?? '응답하지 않음';
}

function isPilotSegment(value: unknown): value is PilotSegment {
  return PILOT_SEGMENTS.some((option) => option.id === value);
}

/**
 * The segment someone picked last time. It is asked once and remembered, so the Plus screen never
 * re-opens with the question already answered looking unanswered.
 */
export async function loadPilotSegment(storage: StorageLike): Promise<PilotSegment | null> {
  const raw = await storage.getItem(PILOT_SEGMENT_STORAGE_KEY);
  return isPilotSegment(raw) ? raw : null;
}

export async function savePilotSegment(storage: StorageLike, segment: PilotSegment) {
  await storage.setItem(PILOT_SEGMENT_STORAGE_KEY, segment);
  return segment;
}

export function buildPilotSummary(
  analytics: AnalyticsStore,
  interest: PlusInterestState,
  segment: PilotSegment,
): PilotSummary {
  const metrics = summarizeAnalytics(analytics);
  return {
    segment,
    segmentLabel: pilotSegmentLabel(segment),
    completedSchedules: analytics.events.filter((event) => event.name === 'schedule_completed').length,
    scheduleCompletionRate: metrics.scheduleCompletionRate,
    notificationStartRate: metrics.notificationStartRate,
    delayApplyRate: metrics.delayApplyRate,
    delayRejectRate: metrics.delayRejectRate,
    averageStepErrorMinutes: metrics.averageStepErrorMinutes,
    onTimeArrivalRate: metrics.onTimeArrivalRate,
    plusOfferViews: metrics.plusOfferViews,
    plusInterestSelections: metrics.plusInterestSelections,
    plusInterestWithdrawals: metrics.plusInterestWithdrawals,
    interestStatusLabel: interest.status === 'interested' ? '관심 등록' : '미등록',
    selectedPlanLabel: plusPlanLabel(interest.plan),
  };
}

/**
 * What actually leaves the device. Counts and rates only: the labels the screen reads out are made
 * from these on the way in, so nothing here carries a schedule name, a place, a time, or anything
 * that could point back at one person's day.
 */
export function pilotSummaryPayload(summary: PilotSummary) {
  return {
    segment: summary.segment,
    completedSchedules: summary.completedSchedules,
    scheduleCompletionRate: summary.scheduleCompletionRate,
    notificationStartRate: summary.notificationStartRate,
    delayApplyRate: summary.delayApplyRate,
    delayRejectRate: summary.delayRejectRate,
    averageStepErrorMinutes: summary.averageStepErrorMinutes,
    onTimeArrivalRate: summary.onTimeArrivalRate,
    plusOfferViews: summary.plusOfferViews,
    plusInterestSelections: summary.plusInterestSelections,
    plusInterestWithdrawals: summary.plusInterestWithdrawals,
    interested: summary.interestStatusLabel === '관심 등록',
    selectedPlan: summary.selectedPlanLabel,
  };
}
