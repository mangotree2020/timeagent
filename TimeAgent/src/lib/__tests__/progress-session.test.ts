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

  test('remembers every scheduled alarm kind across a reload so each can still be cancelled', async () => {
    const { session } = createFixture();
    const kinds = ['prep-start', 'step-start', 'transition-preview', 'transition-wrap', 'one-minute-left', 'step-end', 'departure'] as const;
    const scheduled = kinds.map((kind, index) => ({
      identifier: `id-${index}`,
      key: `${kind}:step-${index}`,
      kind,
      stepId: `step-${index}`,
      fireAt: 1_000_000 + index,
    }));
    const storage = createMemoryStorage(JSON.stringify({ ...session, scheduledNotifications: scheduled }));

    const loaded = await loadProgressSession(storage);

    expect(loaded?.scheduledNotifications).toEqual(scheduled);
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

describe('starting before the planned time', () => {
  const plan = {
    preparationMinutes: 22,
    travelMinutes: 20,
    bufferMinutes: 10,
    prepStart: '09:08',
    departure: '09:30',
    arrival: '09:50',
    status: { kind: 'ready' as const, label: '10분 여유', tone: 'success' as const, minutes: 10 },
    timeline: [
      { id: 'shower', time: '09:08', title: '샤워', duration: 12, status: 'current' as const },
      { id: 'dress', time: '09:20', title: '옷 입기', duration: 10, status: 'upcoming' as const },
      { id: 'depart', time: '09:30', title: '자가용으로 출발', duration: 20, status: 'upcoming' as const },
    ],
    personalizationAdjustments: [],
  };
  const schedule = { ...createDefaultScheduleDraft(), title: '미팅', appointmentTime: '10:00' };

  it('rebases the timeline onto the moment preparation actually began', () => {
    const startedAt = new Date(2026, 7, 17, 7, 29).getTime();
    const session = createProgressSession({ schedule, plan, now: startedAt });
    expect(session.timeline.map((step) => step.time)).toEqual(['07:29', '07:41', '07:51']);
    expect(session.plan.prepStart).toBe('07:29');
    expect(session.plan.departure).toBe('07:51');
    expect(session.plan.arrival).toBe('08:11');
  });

  it('keeps the countdown and the finish time describing the same step', () => {
    const startedAt = new Date(2026, 7, 17, 7, 29).getTime();
    const session = createProgressSession({ schedule, plan, now: startedAt });
    expect(getProgressRemainingSeconds(session, startedAt)).toBe(12 * 60);
    expect(session.timeline[0].time).toBe('07:29');
    expect(session.timeline[1].time).toBe('07:41');
  });

  it('leaves the plan alone when preparation starts late, so the delay is still visible', () => {
    const startedAt = new Date(2026, 7, 17, 9, 25).getTime();
    const session = createProgressSession({ schedule, plan, now: startedAt });
    expect(session.timeline.map((step) => step.time)).toEqual(['09:08', '09:20', '09:30']);
    expect(session.plan.arrival).toBe('09:50');
  });

  it('leaves the plan alone when the clocks sit on different days', () => {
    const startedAt = new Date(2026, 7, 17, 22, 40).getTime();
    const session = createProgressSession({ schedule, plan, now: startedAt });
    expect(session.timeline[0].time).toBe('09:08');
  });
});
