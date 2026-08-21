import {
  applyProgressNotificationAction,
  buildProgressNotificationRequests,
  FOLLOW_UP_CUE_DELAY_MS,
  ONE_MINUTE_WARNING_MIN_STEP_MINUTES,
  PROGRESS_ONE_MINUTE_MESSAGE,
  PROGRESS_ADVANCE_ACTION,
  PROGRESS_EXTEND_ACTION,
  PROGRESS_EXTEND_MINUTES,
  PROGRESS_STEP_ACTION_CATEGORY,
  PROGRESS_STEP_ACTIONS,
  buildStepCoachMessage,
  withDirectionParticle,
  withNamingParticle,
  withObjectParticle,
} from '../local-notifications';
import { advanceProgressSession, createProgressSession } from '../progress-session';
import { createSchedulePlan } from '../planning';
import { createDefaultScheduleDraft } from '../schedule-draft';

function createFixture(now = 1_000_000) {
  const schedule = createDefaultScheduleDraft();
  const plan = createSchedulePlan(schedule);
  return createProgressSession({ schedule, plan, now });
}

describe('local notification plan', () => {
  test('schedules preparation start, remaining step endings, and departure in time order', () => {
    const session = createFixture();

    const requests = buildProgressNotificationRequests(session, 1_000_000);

    expect(requests[0]).toMatchObject({ kind: 'prep-start', stepId: 'shower', fireAt: 1_001_000 });
    expect(requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'step-end:shower', kind: 'step-end' }),
      expect.objectContaining({ key: 'departure:depart', kind: 'departure' }),
    ]));
    expect(requests.every((request) => request.fireAt > 1_000_000)).toBe(true);
    expect(requests.map((request) => request.fireAt)).toEqual(
      [...requests.map((request) => request.fireAt)].sort((left, right) => left - right),
    );
  });

  test('does not recreate preparation or completed-step notifications after explicit completion', () => {
    const session = createFixture();
    const next = advanceProgressSession(session, 1_100_000);

    const requests = buildProgressNotificationRequests(next, 1_100_000);

    expect(requests.some((request) => request.kind === 'prep-start')).toBe(false);
    expect(requests.some((request) => request.stepId === 'shower')).toBe(false);
    expect(requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'step-end:makeup' }),
      expect.objectContaining({ key: 'departure:depart' }),
    ]));
  });

  test('adds 15-minute preview and 5-minute wrap-up before a long step transition', () => {
    const session = createFixture();
    const requests = buildProgressNotificationRequests(session, 1_000_000);
    const longStep = session.timeline.find((step) => step.duration >= 20);
    expect(longStep).toBeDefined();
    expect(requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: `transition-preview:${longStep!.id}`, kind: 'transition-preview', stepId: longStep!.id }),
      expect.objectContaining({ key: `transition-wrap:${longStep!.id}`, kind: 'transition-wrap', stepId: longStep!.id }),
    ]));
    const preview = requests.find((request) => request.key === `transition-preview:${longStep!.id}`)!;
    const wrap = requests.find((request) => request.key === `transition-wrap:${longStep!.id}`)!;
    const end = requests.find((request) => request.key === `step-end:${longStep!.id}`)!;
    expect(end.fireAt - preview.fireAt).toBe(15 * 60_000);
    expect(end.fireAt - wrap.fireAt).toBe(5 * 60_000);
    expect(preview.body).toContain('마무리');
    expect(wrap.body).toContain('다음 행동');
  });

  test('returns no notifications for a completed session', () => {
    let session = createFixture();
    while (session.state === 'active') session = advanceProgressSession(session, session.updatedAt + 1_000);

    expect(buildProgressNotificationRequests(session, session.updatedAt)).toEqual([]);
  });

  test('attaches the Korean direction particle that matches the preceding word', () => {
    expect(withDirectionParticle('화장')).toBe('화장으로');
    expect(withDirectionParticle('짐 챙기기')).toBe('짐 챙기기로');
    expect(withDirectionParticle('옷 입기')).toBe('옷 입기로');
    expect(withDirectionParticle('걸어서 출발')).toBe('걸어서 출발로');
    expect(withDirectionParticle('지하철')).toBe('지하철로');
    expect(withDirectionParticle('버스')).toBe('버스로');
    expect(withDirectionParticle('')).toBe('');
    expect(withDirectionParticle('bus')).toBe('bus로');
  });

  test('says one minute is left, one minute before each step that has one to give', () => {
    const session = createFixture();
    const requests = buildProgressNotificationRequests(session, 1_000_000);

    const warnings = requests.filter((request) => request.kind === 'one-minute-left');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.every((request) => request.title === PROGRESS_ONE_MINUTE_MESSAGE)).toBe(true);
    for (const warning of warnings) {
      const end = requests.find((request) => request.key === `step-end:${warning.stepId}`)!;
      expect(end.fireAt - warning.fireAt).toBe(60_000);
    }
    // A step too short for a last minute would hear the warning at its own start.
    const short = session.timeline.filter((step) => step.duration < ONE_MINUTE_WARNING_MIN_STEP_MINUTES);
    expect(short.every((step) => !warnings.some((warning) => warning.stepId === step.id))).toBe(true);
  });

  test('tells the person that turning the ending alarm off completes the step', () => {
    const requests = buildProgressNotificationRequests(createFixture(), 1_000_000);
    const endings = requests.filter((request) => request.kind === 'step-end');

    expect(endings.length).toBeGreaterThan(0);
    expect(endings.every((request) => request.body.includes('알람을 끄면 완료'))).toBe(true);
  });

  test('reads the step alarm body without a broken particle', () => {
    const requests = buildProgressNotificationRequests(createFixture(), 1_000_000);
    const bodies = requests.filter((request) => request.kind === 'step-end').map((request) => request.body);

    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.some((body) => body.includes('기으로') || body.includes('발으로'))).toBe(false);
    expect(requests.every((request) => !request.title.includes('(으)로') && !request.body.includes('(으)로'))).toBe(true);
  });

  test('offers the next-step and extend choices on the alarm that ends a step', () => {
    const requests = buildProgressNotificationRequests(createFixture(), 1_000_000);

    const stepEnd = requests.find((request) => request.kind === 'step-end')!;
    expect(stepEnd.actionCategory).toBe(PROGRESS_STEP_ACTION_CATEGORY);
    expect(PROGRESS_STEP_ACTIONS.map((action) => action.identifier))
      .toEqual([PROGRESS_ADVANCE_ACTION, PROGRESS_EXTEND_ACTION]);
    expect(PROGRESS_STEP_ACTIONS.every((action) => action.title.trim().length > 0)).toBe(true);

    const departure = requests.find((request) => request.kind === 'departure')!;
    expect(departure.actionCategory).toBeNull();
  });

  test('moves to the next step when the alarm is dismissed with the next-step choice', () => {
    const session = createFixture();
    const currentStepId = session.currentStepId!;

    const result = applyProgressNotificationAction(session, PROGRESS_ADVANCE_ACTION, currentStepId, 1_400_000);

    expect(result.applied).toBe(true);
    if (!result.applied) return;
    expect(result.session.currentStepId).not.toBe(currentStepId);
    expect(result.session.timeline.find((step) => step.id === currentStepId)?.status).toBe('done');
  });

  test('extends the current step when the alarm is dismissed with the extend choice', () => {
    const session = createFixture();
    const currentStepId = session.currentStepId!;
    const before = session.stepDurationSeconds;

    const result = applyProgressNotificationAction(session, PROGRESS_EXTEND_ACTION, currentStepId, 1_400_000);

    expect(result.applied).toBe(true);
    if (!result.applied) return;
    expect(result.session.currentStepId).toBe(currentStepId);
    expect(result.session.stepDurationSeconds).toBe(before + PROGRESS_EXTEND_MINUTES * 60);
    expect(result.session.delayMinutes).toBe(session.delayMinutes + PROGRESS_EXTEND_MINUTES);
  });

  test('ignores an alarm choice for a step the user already moved past', () => {
    const session = createFixture();
    const staleStepId = session.currentStepId!;
    const moved = advanceProgressSession(session, 1_200_000);

    const result = applyProgressNotificationAction(moved, PROGRESS_ADVANCE_ACTION, staleStepId, 1_300_000);

    expect(result).toEqual({ applied: false, reason: 'stale-step' });
  });

  test('ignores alarm choices once the plan is finished or the action is unknown', () => {
    let session = createFixture();
    const stepId = session.currentStepId!;
    expect(applyProgressNotificationAction(session, 'something-else', stepId, 1_200_000))
      .toEqual({ applied: false, reason: 'unknown-action' });

    while (session.state === 'active') session = advanceProgressSession(session, session.updatedAt + 1_000);
    expect(applyProgressNotificationAction(session, PROGRESS_ADVANCE_ACTION, stepId, session.updatedAt))
      .toEqual({ applied: false, reason: 'completed' });
  });

  test('raises a start alarm for each upcoming step so every action gets its own cue', () => {
    const session = createFixture();

    const requests = buildProgressNotificationRequests(session, 1_000_000, { stepCoaching: true });

    const upcoming = session.timeline.slice(1).filter((step) => step.id !== 'depart' && step.duration > 0);
    expect(upcoming.length).toBeGreaterThan(1);
    for (const step of upcoming) {
      const start = requests.find((request) => request.key === `step-start:${step.id}`)!;
      expect(start).toMatchObject({ kind: 'step-start', stepId: step.id });
      const end = requests.find((request) => request.key === `step-end:${step.id}`)!;
      expect(start.fireAt).toBeLessThan(end.fireAt);
      expect(start.title).toContain(step.title);
    }
    // The running step and the departure already have their own cue.
    expect(requests.some((request) => request.key === `step-start:${session.currentStepId}`)).toBe(false);
    expect(requests.some((request) => request.key === 'step-start:depart')).toBe(false);
  });

  test('lets the end alarm sound alone before the next start or departure cue follows', () => {
    const session = createFixture();
    const requests = buildProgressNotificationRequests(session, 1_000_000, { stepCoaching: true });

    for (let index = 1; index < session.timeline.length; index += 1) {
      const previous = session.timeline[index - 1];
      const step = session.timeline[index];
      const end = requests.find((request) => request.key === `step-end:${previous.id}`);
      const cue = requests.find((request) => request.key === (step.id === 'depart' ? 'departure:depart' : `step-start:${step.id}`));
      if (!end || !cue) continue;
      expect(cue.fireAt - end.fireAt).toBe(FOLLOW_UP_CUE_DELAY_MS);
    }
    expect(requests.filter((request) => request.kind === 'departure' || request.kind === 'step-start').length).toBeGreaterThan(1);
  });

  test('leaves out the per-step start alarms when the step coach is off', () => {
    const requests = buildProgressNotificationRequests(createFixture(), 1_000_000, { stepCoaching: false });

    expect(requests.some((request) => request.kind === 'step-start')).toBe(false);
    expect(requests.some((request) => request.kind === 'step-end')).toBe(true);
  });

  test('speaks a step coach line that names the action and what follows it', () => {
    const session = createFixture();
    const [first, second] = session.timeline;

    const spoken = buildStepCoachMessage(first, second);
    expect(spoken).toContain(first.title);
    expect(spoken).toContain(second.title);
    expect(spoken).toContain(`${first.duration}분`);

    const last = buildStepCoachMessage(first, null);
    expect(last).toContain(first.title);
    expect(last).not.toContain('undefined');
    expect(last.trim().length).toBeGreaterThan(0);
  });
});

describe('withObjectParticle', () => {
  it('picks 을 after a final consonant and 를 after a vowel', () => {
    expect(withObjectParticle('샤워')).toBe('샤워를');
    expect(withObjectParticle('화장')).toBe('화장을');
    expect(withObjectParticle('옷 입기')).toBe('옷 입기를');
    expect(withObjectParticle('짐 챙김')).toBe('짐 챙김을');
  });

  it('does not leave the 을(를) placeholder in user-facing text', () => {
    expect(withObjectParticle('부산역')).not.toContain('(');
    expect(withObjectParticle('Gangnam')).toBe('Gangnam를');
    expect(withObjectParticle('  ')).toBe('');
  });
});

describe('withNamingParticle', () => {
  it('quotes a name back with the particle that fits it', () => {
    expect(withNamingParticle('남산타워')).toBe('남산타워라는');
    expect(withNamingParticle('부산역')).toBe('부산역이라는');
    expect(withNamingParticle(' 서면 ')).toBe('서면이라는');
  });

  it('does not leave the (이)라는 placeholder in user-facing text', () => {
    expect(withNamingParticle('해운대')).not.toContain('(');
    expect(withNamingParticle('')).toBe('');
  });
});
