import { AnalyticsStore, summarizeAnalytics } from './analytics';
import { PlusInterestState, plusPlanLabel } from './monetization';

export type PilotSegment = 'student' | 'worker' | 'variable-routine' | 'prefer-not-to-answer';

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

export function pilotSegmentLabel(segment: PilotSegment) {
  return PILOT_SEGMENTS.find((option) => option.id === segment)?.label ?? '응답하지 않음';
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

export function formatPilotSummaryText(summary: PilotSummary) {
  return [
    '[TimeAgent Phase 0 테스트 결과]',
    `사용자 유형: ${summary.segmentLabel}`,
    `완료 일정: ${summary.completedSchedules}회`,
    `첫 일정 생성 완료율: ${formatRate(summary.scheduleCompletionRate)}`,
    `알림에서 준비 시작률: ${formatRate(summary.notificationStartRate)}`,
    `지연안 적용 / 거절: ${formatRate(summary.delayApplyRate)} / ${formatRate(summary.delayRejectRate)}`,
    `평균 단계 시간 오차: ${summary.averageStepErrorMinutes === null ? '측정 대기' : `${summary.averageStepErrorMinutes}분`}`,
    `정시 도착률: ${formatRate(summary.onTimeArrivalRate)}`,
    `Plus 화면 확인: ${summary.plusOfferViews}회`,
    `Plus 관심 / 철회: ${summary.plusInterestSelections}회 / ${summary.plusInterestWithdrawals}회`,
    `현재 관심 상태: ${summary.interestStatusLabel}`,
    `선택 가격안: ${summary.selectedPlanLabel}`,
    '',
    '이 기기의 집계값만 사용했습니다.',
    '일정명·장소·위치·음성·연락처·기기 식별자는 포함하지 않았습니다.',
  ].join('\n');
}

function formatRate(value: number | null) {
  return value === null ? '측정 대기' : `${value}%`;
}
