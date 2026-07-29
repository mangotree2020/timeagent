import { createEmptyAnalyticsStore } from '../analytics';
import {
  PLUS_INTEREST_STORAGE_KEY,
  createEmptyPlusInterestState,
  getPlusOfferEligibility,
  loadPlusInterest,
  savePlusInterest,
  withdrawPlusInterest,
} from '../monetization';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { values.delete(key); }),
  };
}

describe('Plus Phase 0 monetization', () => {
  it('requires three completed schedules and reports the next action', () => {
    const analytics = createEmptyAnalyticsStore();
    analytics.events = [
      { id: '1', name: 'schedule_completed', at: 1, properties: { onTime: true } },
      { id: '2', name: 'schedule_completed', at: 2, properties: { onTime: false } },
    ];

    expect(getPlusOfferEligibility(analytics)).toEqual({
      eligible: false,
      completedSchedules: 2,
      remainingSchedules: 1,
    });

    analytics.events.push({ id: '3', name: 'schedule_completed', at: 3, properties: { onTime: true } });
    expect(getPlusOfferEligibility(analytics)).toEqual({
      eligible: true,
      completedSchedules: 3,
      remainingSchedules: 0,
    });
  });

  it('round-trips an explicitly selected plan and withdrawal', async () => {
    const storage = memoryStorage();

    await savePlusInterest(storage, 'annual', 1234);
    await expect(loadPlusInterest(storage)).resolves.toEqual({
      version: 1,
      status: 'interested',
      plan: 'annual',
      updatedAt: 1234,
    });

    await withdrawPlusInterest(storage);
    expect(storage.removeItem).toHaveBeenCalledWith(PLUS_INTEREST_STORAGE_KEY);
    await expect(loadPlusInterest(storage)).resolves.toEqual(createEmptyPlusInterestState());
  });

  it('falls back safely for malformed or incompatible local state', async () => {
    const storage = memoryStorage();
    await storage.setItem(PLUS_INTEREST_STORAGE_KEY, JSON.stringify({
      version: 2,
      status: 'interested',
      plan: 'lifetime',
      updatedAt: 'tomorrow',
    }));

    await expect(loadPlusInterest(storage)).resolves.toEqual(createEmptyPlusInterestState());
  });
});
