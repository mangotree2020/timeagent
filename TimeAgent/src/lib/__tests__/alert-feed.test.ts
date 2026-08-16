import { buildAlertFeed } from '../alert-feed';
import { ConfirmedSchedulePlan } from '../confirmed-plans';
import { createSchedulePlan } from '../planning';
import { createDefaultScheduleDraft } from '../schedule-draft';

const NOW = new Date(2026, 7, 17, 12, 0, 0).getTime();
const MINUTE = 60_000;

function plan(overrides: Partial<ConfirmedSchedulePlan> = {}): ConfirmedSchedulePlan {
  const schedule = { ...createDefaultScheduleDraft(), title: '서면 볼링장 약속', appointmentTime: '15:00' };
  return {
    version: 1,
    id: 'plan-1',
    schedule,
    plan: createSchedulePlan(schedule),
    appointmentAt: NOW + 180 * MINUTE,
    prepStartAt: NOW + 30 * MINUTE,
    confirmedAt: NOW - MINUTE,
    state: 'scheduled',
    ...overrides,
  };
}

describe('buildAlertFeed', () => {
  it('says nothing when there is nothing to say', () => {
    expect(buildAlertFeed({ plans: [], sessionActive: false, notificationStatus: 'idle', now: NOW })).toEqual([]);
  });

  it('describes the nearest upcoming schedule with its real time and countdown', () => {
    const feed = buildAlertFeed({ plans: [plan()], sessionActive: false, notificationStatus: 'scheduled', now: NOW });
    expect(feed).toHaveLength(1);
    expect(feed[0].title).toBe('준비 시작 알림');
    expect(feed[0].body).toContain('서면 볼링장 약속');
    expect(feed[0].time).toBe('30분 뒤 시작');
    expect(feed[0].action).toBe('review-plan');
  });

  it('only announces the nearest schedule, not every one of them', () => {
    const feed = buildAlertFeed({
      plans: [
        plan({ id: 'far', prepStartAt: NOW + 600 * MINUTE, appointmentAt: NOW + 700 * MINUTE }),
        plan({ id: 'near', prepStartAt: NOW + 20 * MINUTE }),
      ],
      sessionActive: false,
      notificationStatus: 'scheduled',
      now: NOW,
    });
    expect(feed.filter((alert) => alert.title === '준비 시작 알림')).toHaveLength(1);
    expect(feed[0].id).toBe('prep-near');
  });

  it('ignores schedules that are already over', () => {
    const past = plan({ appointmentAt: NOW - MINUTE, prepStartAt: NOW - 60 * MINUTE });
    expect(buildAlertFeed({ plans: [past], sessionActive: false, notificationStatus: 'idle', now: NOW })).toEqual([]);
  });

  it('leads with the running session', () => {
    const feed = buildAlertFeed({ plans: [plan()], sessionActive: true, notificationStatus: 'scheduled', now: NOW });
    expect(feed[0].id).toBe('progress-running');
    expect(feed[0].action).toBe('start-progress');
  });

  it('warns when notifications cannot be delivered, and sends the person somewhere useful', () => {
    const disabled = buildAlertFeed({ plans: [], sessionActive: false, notificationStatus: 'disabled', now: NOW });
    expect(disabled).toHaveLength(1);
    expect(disabled[0].action).toBe('fix-notification-permission');
    expect(disabled[0].tone).toBe('warning');

    const errored = buildAlertFeed({ plans: [], sessionActive: false, notificationStatus: 'error', now: NOW });
    expect(errored).toHaveLength(1);
    expect(errored[0].title).toContain('예약 실패');
  });

  it('surfaces a recent unfinished schedule but lets an old one go', () => {
    const recent = plan({ state: 'incomplete', appointmentAt: NOW - 2 * 60 * MINUTE });
    const stale = plan({ id: 'old', state: 'incomplete', appointmentAt: NOW - 40 * 60 * MINUTE });
    expect(buildAlertFeed({ plans: [recent], sessionActive: false, notificationStatus: 'idle', now: NOW }))
      .toHaveLength(1);
    expect(buildAlertFeed({ plans: [stale], sessionActive: false, notificationStatus: 'idle', now: NOW }))
      .toEqual([]);
  });

  it('gives every alert its own key so the list can render them', () => {
    const feed = buildAlertFeed({
      plans: [plan(), plan({ id: 'missed', state: 'incomplete', appointmentAt: NOW - MINUTE })],
      sessionActive: true,
      notificationStatus: 'disabled',
      now: NOW,
    });
    expect(new Set(feed.map((alert) => alert.id)).size).toBe(feed.length);
    expect(feed.length).toBeGreaterThan(2);
  });
});
