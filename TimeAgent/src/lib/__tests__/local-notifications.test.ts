import { buildProgressNotificationRequests } from '../local-notifications';
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

  test('returns no notifications for a completed session', () => {
    let session = createFixture();
    while (session.state === 'active') session = advanceProgressSession(session, session.updatedAt + 1_000);

    expect(buildProgressNotificationRequests(session, session.updatedAt)).toEqual([]);
  });
});
