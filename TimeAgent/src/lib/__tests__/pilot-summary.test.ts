import { AnalyticsStore, createEmptyAnalyticsStore } from '../analytics';
import { PlusInterestState } from '../monetization';
import {
  buildPilotSummary,
  formatPilotSummaryText,
  pilotSegmentLabel,
} from '../pilot-summary';

function fixtureAnalytics(): AnalyticsStore {
  const store = createEmptyAnalyticsStore();
  store.events = [
    { id: '1', name: 'draft_started', at: 1_000, properties: { title: '비공개 면접', location: '서울시청' } },
    { id: '2', name: 'draft_completed', at: 31_000, properties: {} },
    { id: '3', name: 'schedule_completed', at: 40_000, properties: { onTime: true, destination: '집 주소' } },
    { id: '4', name: 'schedule_completed', at: 50_000, properties: { onTime: false } },
    { id: '5', name: 'schedule_completed', at: 60_000, properties: { onTime: true } },
    { id: '6', name: 'plus_offer_viewed', at: 70_000, properties: { eligible: true } },
    { id: '7', name: 'plus_interest_selected', at: 80_000, properties: { plan: 'student-annual' } },
  ];
  return store;
}

const interest: PlusInterestState = {
  version: 1,
  status: 'interested',
  plan: 'student-annual',
  updatedAt: 90_000,
};

describe('Phase 0 pilot summary', () => {
  it('builds only aggregate BM validation fields', () => {
    expect(buildPilotSummary(fixtureAnalytics(), interest, 'student')).toEqual(expect.objectContaining({
      segment: 'student',
      segmentLabel: '학생',
      completedSchedules: 3,
      plusOfferViews: 1,
      plusInterestSelections: 1,
      plusInterestWithdrawals: 0,
      interestStatusLabel: '관심 등록',
      selectedPlanLabel: '학생 연간',
      scheduleCompletionRate: 100,
      onTimeArrivalRate: 67,
    }));
  });

  it('formats a transparent report without raw schedule, location, identifier, or timestamps', () => {
    const text = formatPilotSummaryText(buildPilotSummary(fixtureAnalytics(), interest, 'student'));

    expect(text).toContain('[TimeAgent Phase 0 테스트 결과]');
    expect(text).toContain('사용자 유형: 학생');
    expect(text).toContain('완료 일정: 3회');
    expect(text).toContain('선택 가격안: 학생 연간');
    expect(text).toContain('일정명·장소·위치·음성·연락처·기기 식별자는 포함하지 않았습니다.');
    expect(text).not.toContain('비공개 면접');
    expect(text).not.toContain('서울시청');
    expect(text).not.toContain('집 주소');
    expect(text).not.toContain('90000');
  });

  it('supports a prefer-not-to-answer segment and measurement-waiting values', () => {
    const summary = buildPilotSummary(createEmptyAnalyticsStore(), {
      version: 1,
      status: 'none',
      plan: null,
      updatedAt: null,
    }, 'prefer-not-to-answer');

    expect(pilotSegmentLabel('prefer-not-to-answer')).toBe('응답하지 않음');
    expect(formatPilotSummaryText(summary)).toContain('정시 도착률: 측정 대기');
  });
});
