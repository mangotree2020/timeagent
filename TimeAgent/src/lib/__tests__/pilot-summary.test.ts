import { AnalyticsStore, createEmptyAnalyticsStore } from '../analytics';
import { PlusInterestState } from '../monetization';
import {
  PILOT_SEGMENT_STORAGE_KEY,
  buildPilotSummary,
  loadPilotSegment,
  pilotSegmentLabel,
  pilotSummaryPayload,
  savePilotSegment,
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

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => Promise.resolve(values.get(key) ?? null),
    setItem: (key: string, value: string) => { values.set(key, value); return Promise.resolve(); },
  };
}

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

  it('sends counts and rates without a schedule, a place, an identifier, or a timestamp', () => {
    // What leaves the device is read by an operator as pilot statistics, so this is the line that
    // matters: the analytics store holds titles and destinations, and none of them may cross it.
    const payload = pilotSummaryPayload(buildPilotSummary(fixtureAnalytics(), interest, 'student'));

    expect(payload).toEqual({
      segment: 'student',
      completedSchedules: 3,
      scheduleCompletionRate: 100,
      notificationStartRate: null,
      delayApplyRate: null,
      delayRejectRate: null,
      averageStepErrorMinutes: null,
      onTimeArrivalRate: 67,
      plusOfferViews: 1,
      plusInterestSelections: 1,
      plusInterestWithdrawals: 0,
      interested: true,
      selectedPlan: '학생 연간',
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('비공개 면접');
    expect(serialized).not.toContain('서울시청');
    expect(serialized).not.toContain('집 주소');
    expect(serialized).not.toContain('90000');
  });

  it('reports a segment nobody answered as unanswered rather than guessing one', () => {
    const summary = buildPilotSummary(createEmptyAnalyticsStore(), {
      version: 1,
      status: 'none',
      plan: null,
      updatedAt: null,
    }, 'prefer-not-to-answer');

    expect(pilotSegmentLabel('prefer-not-to-answer')).toBe('응답하지 않음');
    expect(pilotSummaryPayload(summary)).toEqual(expect.objectContaining({
      segment: 'prefer-not-to-answer',
      interested: false,
      selectedPlan: '미등록',
      onTimeArrivalRate: null,
    }));
  });

  it('remembers the segment so the question is asked once', async () => {
    const storage = memoryStorage();
    expect(await loadPilotSegment(storage)).toBeNull();

    await savePilotSegment(storage, 'worker');

    expect(storage.values.get(PILOT_SEGMENT_STORAGE_KEY)).toBe('worker');
    expect(await loadPilotSegment(storage)).toBe('worker');
  });

  it('ignores a stored segment that is not one of the offered answers', async () => {
    const storage = memoryStorage({ [PILOT_SEGMENT_STORAGE_KEY]: 'ceo' });

    expect(await loadPilotSegment(storage)).toBeNull();
  });
});
