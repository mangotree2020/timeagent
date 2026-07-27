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
  test('learns routine and transport averages once per completed session', () => {
    const initial = createDefaultPersonalizationProfile();
    const session = completedSession();

    const learned = learnFromCompletedSession(initial, session);
    const duplicate = learnFromCompletedSession(learned.profile, session);

    expect(learned.learnedCount).toBe(2);
    expect(learned.profile.routines[0]).toMatchObject({ key: 'shower', averageMinutes: 22, sampleCount: 1 });
    expect(learned.profile.transports[0]).toMatchObject({ key: 'AI 추천', averageMinutes: 27, sampleCount: 1 });
    expect(duplicate.learnedCount).toBe(0);
    expect(duplicate.profile).toBe(learned.profile);
  });

  test('uses learned averages in the next plan and exposes the reason', () => {
    const schedule = createDefaultScheduleDraft();
    const learned = learnFromCompletedSession(createDefaultPersonalizationProfile(), completedSession()).profile;

    const plan = createSchedulePlan(schedule, { personalization: createPlanPersonalization(learned, schedule) });

    expect(plan.timeline.find((step) => step.id === 'shower')?.duration).toBe(22);
    expect(plan.travelMinutes).toBe(27);
    expect(plan.personalizationAdjustments).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'shower', beforeMinutes: 18, afterMinutes: 22, samples: 1 }),
      expect.objectContaining({ id: 'transport-AI 추천', beforeMinutes: 24, afterMinutes: 27, samples: 1 }),
    ]));
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
