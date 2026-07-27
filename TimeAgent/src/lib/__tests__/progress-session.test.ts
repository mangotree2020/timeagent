import { createSchedulePlan } from '../planning';
import {
  advanceProgressSession,
  applyProgressDelayProposal,
  clearProgressSession,
  createProgressDelayProposal,
  createProgressSession,
  getProgressRemainingSeconds,
  loadProgressSession,
  saveProgressSession,
  updateProgressRoute,
} from '../progress-session';
import { createDefaultScheduleDraft } from '../schedule-draft';

function createMemoryStorage(initialValue: string | null = null) {
  let value = initialValue;
  return {
    getItem: jest.fn(async () => value),
    setItem: jest.fn(async (_key: string, nextValue: string) => {
      value = nextValue;
    }),
    removeItem: jest.fn(async () => {
      value = null;
    }),
  };
}

function createFixture(now = 1_000_000) {
  const schedule = createDefaultScheduleDraft();
  const plan = createSchedulePlan(schedule);
  const session = createProgressSession({ schedule, plan, now });
  return { schedule, plan, session };
}

describe('progress session', () => {
  test('starts the first actionable step and stores its duration', () => {
    const { session } = createFixture();

    expect(session.currentStepId).toBe('shower');
    expect(session.timeline[0].status).toBe('current');
    expect(session.stepStartedAt).toBe(1_000_000);
    expect(session.stepDurationSeconds).toBe(18 * 60);
  });

  test('subtracts real elapsed time when the app resumes', () => {
    const { session } = createFixture();

    expect(getProgressRemainingSeconds(session, 1_037_900)).toBe(18 * 60 - 37);
    expect(getProgressRemainingSeconds(session, 3_000_000)).toBe(0);
    expect(session.currentStepId).toBe('shower');
  });

  test('advances only after explicit completion and starts a new timer', () => {
    const { session } = createFixture();

    const next = advanceProgressSession(session, 1_100_000);

    expect(next.timeline[0].status).toBe('done');
    expect(next.timeline[0].actualDurationMinutes).toBe(2);
    expect(next.timeline[1].status).toBe('current');
    expect(next.currentStepId).toBe('makeup');
    expect(next.stepStartedAt).toBe(1_100_000);
    expect(next.stepDurationSeconds).toBe(12 * 60);
  });

  test('previews delay changes without mutating the active session', () => {
    const { session } = createFixture();

    const proposal = createProgressDelayProposal(session, 5, 1_200_000);

    expect(session.delayMinutes).toBe(0);
    expect(proposal.before.preparationMinutes).toBe(session.plan.preparationMinutes);
    expect(proposal.after.preparationMinutes).toBe(session.plan.preparationMinutes + 5);
    expect(proposal.before.departure).toBe(session.plan.departure);
    expect(proposal.after.departure).not.toBe(proposal.before.departure);
    expect(proposal.after.arrival).not.toBe(proposal.before.arrival);
  });

  test('stores a proposed delay only after explicit application', () => {
    const { session } = createFixture();
    const proposal = createProgressDelayProposal(session, 5, 1_200_000);

    const delayed = applyProgressDelayProposal(session, proposal, 1_205_000);
    const rerouted = updateProgressRoute(delayed, '택시', 1_210_000);

    expect(delayed.delayMinutes).toBe(5);
    expect(delayed.stepDurationSeconds).toBe(session.stepDurationSeconds + 5 * 60);
    expect(delayed.timeline.find((step) => step.id === delayed.currentStepId)?.duration)
      .toBe(session.timeline.find((step) => step.id === session.currentStepId)!.duration + 5);
    expect(delayed.lastRecalculatedAt).toBe(1_205_000);
    expect(rerouted.delayMinutes).toBe(0);
    expect(rerouted.route).toBe('택시');
    expect(rerouted.lastRecalculatedAt).toBe(1_210_000);
  });

  test('migrates a saved v1 session that has no notification identifiers', async () => {
    const { session } = createFixture();
    const legacySession = { ...session } as Partial<typeof session>;
    delete legacySession.scheduledNotifications;
    const storage = createMemoryStorage(JSON.stringify(legacySession));

    await expect(loadProgressSession(storage)).resolves.toEqual({
      ...legacySession,
      scheduledNotifications: [],
    });
  });

  test('migrates legacy sessions without an id or personalization evidence', async () => {
    const { session } = createFixture();
    const legacy = {
      ...session,
      sessionId: undefined,
      plan: { ...session.plan, personalizationAdjustments: undefined },
    };
    const storage = createMemoryStorage(JSON.stringify(legacy));

    const loaded = await loadProgressSession(storage);

    expect(loaded?.sessionId).toBe(`legacy-${session.stepStartedAt}-${session.schedule.title}`);
    expect(loaded?.plan.personalizationAdjustments).toEqual([]);
  });

  test('round-trips the session and clears it when the schedule completes', async () => {
    const storage = createMemoryStorage();
    const { session } = createFixture();

    await saveProgressSession(storage, session);
    await expect(loadProgressSession(storage)).resolves.toEqual(session);

    await clearProgressSession(storage);
    await expect(loadProgressSession(storage)).resolves.toBeNull();
  });
});
