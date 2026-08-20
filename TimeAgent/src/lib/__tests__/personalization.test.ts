import { createDefaultPersonalizationProfile, createPlanPersonalization, learnFromCompletedSession, loadPersonalizationProfile, savePersonalizationProfile } from '../personalization';
import { createSchedulePlan } from '../planning';
import { createProgressSession } from '../progress-session';
import { createDefaultScheduleDraft } from '../schedule-draft';

function completedSession() {
  const schedule = createDefaultScheduleDraft();
  const plan = createSchedulePlan(schedule);
  const session = createProgressSession({ schedule, plan, now: 1_000 });
  return {
    ...session,
    state: 'completed' as const,
    currentStepId: null,
    updatedAt: 500_000,
    timeline: session.timeline.map((step) => ({
      ...step,
      status: 'done' as const,
      actualDurationMinutes: step.id === 'shower' ? 22 : step.id === 'depart' ? 27 : undefined,
    })),
  };
}

describe('actual duration personalization', () => {
  test('learns preparation averages once per completed session, and journeys not at all', () => {
    // The journey is answered by a live route to this appointment's own destination, so the depart
    // step is not a lesson — and rows learned by older builds are shed rather than shown forever.
    const initial = { ...createDefaultPersonalizationProfile(), transports: [
      { key: '자가용', label: '자가용 이동', averageMinutes: 31, lastActualMinutes: 31, lastPlannedMinutes: 20, sampleCount: 2, updatedAt: 1 },
    ] };
    const session = completedSession();

    const learned = learnFromCompletedSession(initial, session);
    const duplicate = learnFromCompletedSession(learned.profile, session);

    expect(learned.learnedCount).toBe(1);
    expect(learned.profile.routines[0]).toMatchObject({ key: 'shower', averageMinutes: 22, sampleCount: 1 });
    expect(learned.profile.transports).toEqual([]);
    expect(duplicate.learnedCount).toBe(0);
    expect(duplicate.profile).toBe(learned.profile);
  });

  test('uses learned averages for preparation, and never for the journey', () => {
    // A trip that took 27 minutes last time was a trip to somewhere else. Averaging it into the next
    // plan moved the departure time for a reason nobody could see on screen, so travel is left to
    // the distance to this appointment's own destination.
    const schedule = createDefaultScheduleDraft();
    const learned = learnFromCompletedSession(createDefaultPersonalizationProfile(), completedSession()).profile;

    const plan = createSchedulePlan(schedule, { personalization: createPlanPersonalization(learned, schedule) });

    expect(plan.timeline.find((step) => step.id === 'shower')?.duration).toBe(22);
    expect(plan.travelMinutes).toBe(24);
    expect(plan.personalizationAdjustments).toEqual([
      expect.objectContaining({ id: 'shower', beforeMinutes: 18, afterMinutes: 22, samples: 1 }),
    ]);
  });

  test('offers nothing at all when only a journey was learned', () => {
    const schedule = { ...createDefaultScheduleDraft(), routines: [] };
    const learned = learnFromCompletedSession(createDefaultPersonalizationProfile(), completedSession()).profile;

    expect(createPlanPersonalization(learned, schedule)).toBeUndefined();
  });

  test('does not apply suggestions after the user disables learning', () => {
    const schedule = createDefaultScheduleDraft();
    const learned = learnFromCompletedSession(createDefaultPersonalizationProfile(), completedSession()).profile;

    expect(createPlanPersonalization({ ...learned, enabled: false }, schedule)).toBeUndefined();
  });

  test('round-trips valid profiles and falls back for invalid storage', async () => {
    let raw: string | null = null;
    const storage = {
      getItem: jest.fn(async () => raw),
      setItem: jest.fn(async (_key: string, value: string) => { raw = value; }),
      removeItem: jest.fn(async () => { raw = null; }),
    };
    const profile = learnFromCompletedSession(createDefaultPersonalizationProfile(), completedSession()).profile;

    await savePersonalizationProfile(storage, profile);
    await expect(loadPersonalizationProfile(storage)).resolves.toEqual(profile);
    raw = '{"version":99}';
    await expect(loadPersonalizationProfile(storage)).resolves.toEqual(createDefaultPersonalizationProfile());
  });
});
