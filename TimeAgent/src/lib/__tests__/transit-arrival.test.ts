import {
  applyArrivalFailure,
  applyArrivalResult,
  arrivalStatusDescription,
  arrivalStatusLabel,
  canAskForArrival,
  createArrivalPollerState,
  describeArrival,
  isArrivalWindowOpen,
  plannedDepartureAt,
  proposeDepartureFromArrivals,
  shouldAskArrival,
  TransitArrivalResult,
} from '@/lib/transit-arrival';
import { TransitBoarding } from '@/lib/travel-estimate';

const boarding: TransitBoarding = {
  mode: '버스',
  routeName: '101',
  stop: { name: '서면 정류장', coordinate: { latitude: 35.152, longitude: 129.052 } },
  walkMinutesToStop: 5,
};

const at = (clock: string) => new Date(`2026-08-26T${clock}:00+09:00`).getTime();
const iso = (clock: string) => new Date(at(clock)).toISOString();

function live(clock: string, arrivals: { routeName: string; minutes: number; stopsAway?: number }[]): Extract<TransitArrivalResult, { status: 'realtime' }> {
  return {
    status: 'realtime',
    provider: 'TAGO',
    checkedAt: iso(clock),
    stop: { name: '서면 정류장', nodeId: 'BSB1001', cityCode: '26' },
    arrivals: arrivals.map((entry) => ({
      routeName: entry.routeName,
      arrivalInSeconds: entry.minutes * 60,
      expectedAt: new Date(at(clock) + entry.minutes * 60_000).toISOString(),
      stopsAway: entry.stopsAway,
    })),
  };
}

describe('when realtime arrivals are asked for', () => {
  it('opens thirty minutes before the planned departure and closes at the appointment', () => {
    const departureAt = at('09:00');
    const appointmentAt = at('09:40');
    expect(isArrivalWindowOpen({ departureAt, appointmentAt, now: at('08:29') })).toBe(false);
    expect(isArrivalWindowOpen({ departureAt, appointmentAt, now: at('08:30') })).toBe(true);
    expect(isArrivalWindowOpen({ departureAt, appointmentAt, now: at('09:39') })).toBe(true);
    expect(isArrivalWindowOpen({ departureAt, appointmentAt, now: at('09:41') })).toBe(false);
    expect(isArrivalWindowOpen({ departureAt: Number.NaN, appointmentAt, now: at('09:00') })).toBe(false);
  });

  it('only asks for a boarding the provider can locate', () => {
    expect(canAskForArrival(boarding)).toBe(true);
    expect(canAskForArrival({ ...boarding, stop: { name: '서면', coordinate: null } })).toBe(false);
    expect(canAskForArrival(null)).toBe(false);
  });

  it('never asks the provider more often than every twenty seconds while the screen stays open', () => {
    let state = createArrivalPollerState();
    expect(shouldAskArrival(state, at('09:00'))).toBe(true);
    state = applyArrivalResult(state, live('09:00', [{ routeName: '101', minutes: 4 }]), at('09:00'));
    expect(shouldAskArrival(state, at('09:00') + 19_000)).toBe(false);
    expect(shouldAskArrival(state, at('09:00') + 20_000)).toBe(true);
  });
});

describe('what the screen shows for the first boarding', () => {
  it('shows live arrivals as realtime with the time they were checked', () => {
    const state = applyArrivalResult(createArrivalPollerState(), live('09:00', [{ routeName: '101', minutes: 4, stopsAway: 2 }]), at('09:00'));
    expect(state.snapshot.status).toBe('realtime');
    expect(arrivalStatusLabel(state.snapshot)).toBe('실시간 · 09:00 확인');
    expect(arrivalStatusDescription(state.snapshot, boarding)).toContain('서면 정류장');
    if (state.snapshot.status !== 'realtime') throw new Error('expected realtime');
    expect(describeArrival(state.snapshot.arrivals[0], at('09:01'))).toBe('101 3분 후 (2정류장 전)');
    expect(describeArrival(state.snapshot.arrivals[0], at('09:04'))).toBe('101 곧 도착 (2정류장 전)');
  });

  it('keeps the last valid arrivals, labelled as such, when the provider stops answering', () => {
    let state = applyArrivalResult(createArrivalPollerState(), live('09:00', [{ routeName: '101', minutes: 4 }]), at('09:00'));
    state = applyArrivalResult(state, { status: 'unavailable', provider: 'TAGO', checkedAt: iso('09:01'), retryable: true, reason: 'timeout' }, at('09:01'));
    expect(state.snapshot.status).toBe('last-known');
    expect(arrivalStatusLabel(state.snapshot)).toBe('최근 저장값 · 09:00 확인');
    expect(arrivalStatusDescription(state.snapshot, boarding)).toContain('다시 확인');
    state = applyArrivalFailure(state, at('09:02'));
    expect(state.snapshot.status).toBe('last-known');
    expect(state.lastAskedAt).toBe(at('09:02'));
  });

  it('falls back to the timetable, saying why, when there is nothing live for this stop', () => {
    const fresh = createArrivalPollerState();
    expect(arrivalStatusLabel(fresh.snapshot)).toBe('시간표 기준');
    expect(arrivalStatusDescription(fresh.snapshot, boarding)).toContain('출발 30분 전');

    const subway = applyArrivalResult(fresh, { status: 'unsupported', provider: 'TAGO', checkedAt: iso('09:00'), reason: 'subway' }, at('09:00'));
    expect(subway.snapshot).toEqual({ status: 'timetable', checkedAt: iso('09:00'), reason: 'subway' });
    expect(arrivalStatusLabel(subway.snapshot)).toBe('시간표 기준 · 09:00 확인');
    expect(arrivalStatusDescription(subway.snapshot, boarding)).toContain('외부 지도');

    const region = applyArrivalResult(fresh, { status: 'unsupported', provider: 'TAGO', checkedAt: iso('09:00'), reason: 'no-station' }, at('09:00'));
    expect(arrivalStatusDescription(region.snapshot, boarding)).toContain('101');

    const failedFirst = applyArrivalResult(fresh, { status: 'unavailable', provider: 'TAGO', checkedAt: iso('09:00'), retryable: true, reason: 'upstream' }, at('09:00'));
    expect(failedFirst.snapshot).toEqual({ status: 'timetable', checkedAt: iso('09:00'), reason: 'unavailable' });
    expect(arrivalStatusDescription(failedFirst.snapshot, boarding)).toContain('다시 확인');
  });
});
describe('what the live arrivals mean for the plan', () => {

  // A 30-minute timetable journey: 5 minutes' walk to the stop, then 25 on the bus and after it.
  const planned = { routeMinutes: 30, plannedDeparture: '09:00', plannedArrival: '09:30', appointmentTime: '09:40' };

  it('proposes nothing when the first catchable bus keeps the planned arrival within tolerance', () => {
    // At the stop by 09:05; a bus at 09:07 gets there at 09:32 — two minutes late, inside tolerance.
    const arrivals = live('08:50', [{ routeName: '101', minutes: 17 }]).arrivals;
    expect(proposeDepartureFromArrivals({ boarding, arrivals, ...planned, now: at('08:50') })).toBeNull();
  });

  it('ignores buses that pass before the person reaches the stop', () => {
    // 09:03 is missed (at the stop 09:05); 09:06 is caught → 09:31, within tolerance.
    const arrivals = live('08:50', [{ routeName: '101', minutes: 13 }, { routeName: '101', minutes: 16 }]).arrivals;
    expect(proposeDepartureFromArrivals({ boarding, arrivals, ...planned, now: at('08:50') })).toBeNull();
  });

  it('describes a later arrival as a change to apply, not a change already made, and never moves the departure', () => {
    // First catchable bus 09:12 → arrival 09:37: seven minutes later than planned, still in time.
    const arrivals = live('08:50', [{ routeName: '101', minutes: 22 }, { routeName: '101', minutes: 40 }]).arrivals;
    const proposal = proposeDepartureFromArrivals({ boarding, arrivals, ...planned, now: at('08:50') });
    expect(proposal).toEqual({
      reason: '101이(가) 시간표보다 7분 늦게 도착해요. 도착 시각이 그만큼 늦어져요.',
      before: { departure: '09:00', arrival: '09:30' },
      after: { departure: '09:00', arrival: '09:37' },
      shiftMinutes: 7,
      lateMinutes: 0,
    });
  });

  it('says how late the person would be when the projected arrival passes the appointment', () => {
    // First catchable bus 09:20 → arrival 09:45: five minutes after the 09:40 appointment.
    const arrivals = live('08:50', [{ routeName: '101', minutes: 30 }]).arrivals;
    const proposal = proposeDepartureFromArrivals({ boarding, arrivals, ...planned, now: at('08:50') });
    expect(proposal?.reason).toBe('101이(가) 시간표보다 늦어 이대로면 약속보다 5분 늦게 도착해요.');
    expect(proposal?.after).toEqual({ departure: '09:00', arrival: '09:45' });
    expect(proposal?.lateMinutes).toBe(5);
  });

  it('counts from now once the planned departure has passed', () => {
    // It is 09:10, the plan said 09:00; at the stop 09:15, bus at 09:25 → arrival 09:50.
    const arrivals = live('09:10', [{ routeName: '101', minutes: 15 }]).arrivals;
    const proposal = proposeDepartureFromArrivals({ boarding, arrivals, ...planned, now: at('09:10') });
    expect(proposal?.after.arrival).toBe('09:50');
    expect(proposal?.lateMinutes).toBe(10);
  });

  it('reads clocks across midnight on one axis instead of as a day of delay', () => {
    // 23:50 departure, 00:20 arrival, 00:30 appointment; at the stop 23:55, bus 00:00 → arrival 00:25.
    const night = { routeMinutes: 30, plannedDeparture: '23:50', plannedArrival: '00:20', appointmentTime: '00:30' };
    const arrivals = live('23:50', [{ routeName: '101', minutes: 10 }]).arrivals;
    expect(proposeDepartureFromArrivals({ boarding, arrivals, ...night, now: at('23:50') })).toBeNull();
    // Bus at 00:15 → arrival 00:40: ten minutes past the appointment, not a day.
    const late = live('23:50', [{ routeName: '101', minutes: 25 }]).arrivals;
    const proposal = proposeDepartureFromArrivals({ boarding, arrivals: late, ...night, now: at('23:50') });
    expect(proposal?.after.arrival).toBe('00:40');
    expect(proposal?.lateMinutes).toBe(10);
    expect(proposal?.shiftMinutes).toBe(20);
  });

  it('has nothing to say without arrivals, without a route time, or when every vehicle has already passed', () => {
    expect(proposeDepartureFromArrivals({ boarding, arrivals: [], ...planned, now: at('08:50') })).toBeNull();
    const soon = live('08:50', [{ routeName: '101', minutes: 30 }]).arrivals;
    expect(proposeDepartureFromArrivals({ boarding, arrivals: soon, ...planned, routeMinutes: 0, now: at('08:50') })).toBeNull();
    const passed = live('09:10', [{ routeName: '101', minutes: 1 }]).arrivals;
    expect(proposeDepartureFromArrivals({ boarding, arrivals: passed, ...planned, now: at('09:10') })).toBeNull();
  });
});

describe('when the plan says to set off', () => {
  it('places the departure on the appointment day, or the day before across midnight', () => {
    const appointmentAt = at('09:40');
    expect(plannedDepartureAt(appointmentAt, '09:00', '09:40')).toBe(at('09:00'));
    const afterMidnight = new Date('2026-08-27T00:20:00+09:00').getTime();
    expect(plannedDepartureAt(afterMidnight, '23:40', '00:20')).toBe(new Date('2026-08-26T23:40:00+09:00').getTime());
    expect(plannedDepartureAt(Number.NaN, '09:00', '09:40')).toBeNaN();
  });
});
