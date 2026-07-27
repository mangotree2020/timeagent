import {
  clearAnalyticsStore,
  createEmptyAnalyticsStore,
  loadAnalyticsStore,
  recordAnalyticsEvent,
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
    ];
    expect(summarizeAnalytics(store)).toMatchObject({
      scheduleCompletionRate: 100,
      averageScheduleCreationSeconds: 45,
      notificationStartRate: 100,
      delayApplyRate: 100,
      delayRejectRate: 0,
      averageStepErrorMinutes: 2,
      onTimeArrivalRate: 100,
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
