import { fixtureLocation, fixtureRoutePlan } from '@/lib/journey-fixtures';
import { createJourneyState } from '@/lib/journey';

import {
  advanceBackgroundJourneySession,
  BACKGROUND_JOURNEY_STORAGE_KEY,
  clearBackgroundJourneySession,
  createBackgroundJourneySession,
  loadBackgroundJourneySession,
  saveBackgroundJourneySession,
  withBackgroundVoiceDelivery,
} from '../background-journey-session';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); },
    values,
  };
}

describe('background journey session', () => {
  const journey = createJourneyState({
    route: fixtureRoutePlan,
    location: fixtureLocation,
    appointmentAt: Date.now() + 60 * 60_000,
  });

  test('announces each new maneuver once with ETA and distance', () => {
    const session = createBackgroundJourneySession({ journey, destinationName: '테스트 목적지', now: 100 });
    const first = advanceBackgroundJourneySession(session, fixtureLocation, 200);
    expect(first.announcement?.message).toContain('도착까지 약');
    expect(first.announcement?.message).toContain('남은 거리는');

    const duplicate = advanceBackgroundJourneySession(first.session, fixtureLocation, 300);
    expect(duplicate.announcement).toBeNull();
  });

  test('persists delivery state and clears the opt-in session', async () => {
    const storage = memoryStorage();
    const session = withBackgroundVoiceDelivery(
      createBackgroundJourneySession({ journey, destinationName: '테스트 목적지', now: 100 }),
      'spoken',
      200,
    );
    await saveBackgroundJourneySession(storage, session);
    expect((await loadBackgroundJourneySession(storage))?.lastVoiceDelivery).toBe('spoken');
    expect(storage.values.has(BACKGROUND_JOURNEY_STORAGE_KEY)).toBe(true);
    await clearBackgroundJourneySession(storage);
    expect(await loadBackgroundJourneySession(storage)).toBeNull();
  });

  test('marks the session arrived near the destination so tracking can stop', () => {
    const session = createBackgroundJourneySession({ journey, destinationName: '테스트 목적지', now: 100 });
    const arrived = advanceBackgroundJourneySession(session, {
      ...fixtureLocation,
      coordinate: fixtureRoutePlan.destination,
      capturedAt: 200,
    }, 200);
    expect(arrived.arrived).toBe(true);
  });

  test('rejects malformed persisted sessions', async () => {
    const storage = memoryStorage();
    storage.values.set(BACKGROUND_JOURNEY_STORAGE_KEY, JSON.stringify({ version: 1, route: {} }));
    expect(await loadBackgroundJourneySession(storage)).toBeNull();
  });
});
