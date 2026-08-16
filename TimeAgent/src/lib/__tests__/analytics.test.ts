import {
  AnalyticsEvent,
  AnalyticsEventName,
  clearAnalyticsStore,
  createEmptyAnalyticsStore,
  loadAnalyticsStore,
  recordAnalyticsEvent,
  formatDurationSeconds,
  summarizeAnalytics,
} from '../analytics';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { values.delete(key); }),
  };
}

describe('analytics', () => {
  it('aggregates the product MVP metrics', () => {
    const store = createEmptyAnalyticsStore();
    store.events = [
      { id: '1', name: 'draft_started', at: 1_000, properties: {} },
      { id: '2', name: 'draft_completed', at: 46_000, properties: {} },
      { id: '3', name: 'progress_started', at: 47_000, properties: { source: 'notification' } },
      { id: '4', name: 'notification_opened', at: 48_000, properties: {} },
      { id: '5', name: 'delay_proposed', at: 49_000, properties: {} },
      { id: '6', name: 'delay_applied', at: 50_000, properties: {} },
      { id: '7', name: 'step_completed', at: 51_000, properties: { plannedMinutes: 10, actualMinutes: 12 } },
      { id: '8', name: 'schedule_completed', at: 52_000, properties: { onTime: true } },
      { id: '9', name: 'plus_offer_viewed', at: 53_000, properties: { eligible: true, completedSchedules: 3 } },
      { id: '10', name: 'plus_interest_selected', at: 54_000, properties: { plan: 'annual', previousPlan: null } },
      { id: '11', name: 'pilot_summary_shared', at: 55_000, properties: { segment: 'worker', completedSchedules: 1 } },
    ];
    expect(summarizeAnalytics(store)).toMatchObject({
      scheduleCompletionRate: 100,
      averageScheduleCreationSeconds: 45,
      notificationStartRate: 100,
      delayApplyRate: 100,
      delayRejectRate: 0,
      averageStepErrorMinutes: 2,
      onTimeArrivalRate: 100,
      plusOfferViews: 1,
      plusInterestSelections: 1,
      plusInterestRate: 100,
      pilotSummaryShares: 1,
    });
  });

  it('returns null where a metric has no denominator', () => {
    expect(summarizeAnalytics(createEmptyAnalyticsStore())).toMatchObject({
      scheduleCompletionRate: null,
      notificationStartRate: null,
      averageStepErrorMinutes: null,
      onTimeArrivalRate: null,
    });
  });

  it('serializes writes and can clear local measurement data', async () => {
    const storage = memoryStorage();
    await Promise.all([
      recordAnalyticsEvent(storage, 'draft_started', {}, 1),
      recordAnalyticsEvent(storage, 'draft_completed', {}, 2),
    ]);
    expect((await loadAnalyticsStore(storage)).events).toHaveLength(2);
    await clearAnalyticsStore(storage);
    expect(await loadAnalyticsStore(storage)).toEqual(createEmptyAnalyticsStore());
  });

  it('falls back safely for invalid stored data', async () => {
    const storage = memoryStorage();
    await storage.setItem('@on-time/analytics', '{bad');
    expect(await loadAnalyticsStore(storage)).toEqual(createEmptyAnalyticsStore());
  });
});

describe('schedule creation metrics', () => {
  const event = (name: AnalyticsEventName, at: number): AnalyticsEvent =>
    ({ id: `${name}-${at}`, name, at, properties: {} });

  it('never counts more completions than starts', () => {
    // Voice confirmations and re-confirmed edits record a completion with no start of their own.
    const store = {
      ...createEmptyAnalyticsStore(),
      events: [
        event('draft_started', 1_000),
        event('draft_completed', 61_000),
        event('draft_completed', 62_000),
        event('draft_completed', 63_000),
      ],
    };
    const summary = summarizeAnalytics(store);
    expect(summary.scheduleStarts).toBe(1);
    expect(summary.scheduleCompletions).toBe(1);
    expect(summary.scheduleCompletionRate).toBe(100);
  });

  it('pairs each start with the completion that followed it', () => {
    const store = {
      ...createEmptyAnalyticsStore(),
      events: [
        event('draft_started', 0),
        event('draft_completed', 120_000),
        event('draft_started', 200_000),
      ],
    };
    const summary = summarizeAnalytics(store);
    expect(summary.scheduleStarts).toBe(2);
    expect(summary.scheduleCompletions).toBe(1);
    expect(summary.scheduleCompletionRate).toBe(50);
    expect(summary.averageScheduleCreationSeconds).toBe(120);
  });

  it('leaves an abandoned draft out of the average creation time', () => {
    const store = {
      ...createEmptyAnalyticsStore(),
      events: [
        event('draft_started', 0),
        event('draft_completed', 60_000),
        event('draft_started', 100_000),
        event('draft_completed', 100_000 + 20 * 3_600_000),
      ],
    };
    const summary = summarizeAnalytics(store);
    expect(summary.scheduleCompletions).toBe(2);
    expect(summary.averageScheduleCreationSeconds).toBe(60);
  });
});

describe('formatDurationSeconds', () => {
  it('reads as a duration rather than a raw second count', () => {
    expect(formatDurationSeconds(42.35)).toBe('42.4초');
    expect(formatDurationSeconds(90)).toBe('1분 30초');
    expect(formatDurationSeconds(180)).toBe('3분');
    expect(formatDurationSeconds(16_996.4)).toBe('4시간 43분');
    expect(formatDurationSeconds(7_200)).toBe('2시간');
  });
});
