import { TransitBoarding } from '@/lib/travel-estimate';

/**
 * Realtime arrivals for the first boarding of the chosen route, and the rules around asking for
 * them: only near departure, never more often than the provider allows, and never silently — the
 * screen always says whether a number is live, from the timetable, or the last one it managed to get.
 */

export type TransitArrival = {
  routeName: string;
  arrivalInSeconds: number;
  expectedAt: string;
  stopsAway?: number;
  vehicleType?: string;
};

export type TransitArrivalResult =
  | { status: 'realtime'; provider: string; checkedAt: string; stop: { name: string; nodeId: string; cityCode: string }; arrivals: TransitArrival[] }
  | { status: 'unsupported'; provider: string; checkedAt: string; reason: 'subway' | 'no-station' | 'no-route' | 'not-configured' }
  | { status: 'unavailable'; provider: string; checkedAt: string; retryable: boolean; reason: 'timeout' | 'rate-limited' | 'upstream' };

export type TransitArrivalRequest = {
  boarding: TransitBoarding;
  signal?: AbortSignal;
};

export interface TransitArrivalProvider {
  getTransitArrival(request: TransitArrivalRequest): Promise<TransitArrivalResult>;
}

/** Realtime lookups start this long before the planned departure. */
export const ARRIVAL_WINDOW_MINUTES = 30;
/** A screen left open reuses the same answer for at least this long. */
export const ARRIVAL_REUSE_MS = 20_000;

/**
 * Whether it is time to ask at all: from thirty minutes before the planned departure until the
 * appointment itself. Earlier, the timetable is the honest answer; later, the journey is over.
 */
export function isArrivalWindowOpen({
  departureAt,
  appointmentAt,
  now = Date.now(),
  leadMinutes = ARRIVAL_WINDOW_MINUTES,
}: {
  departureAt: number;
  appointmentAt: number;
  now?: number;
  leadMinutes?: number;
}) {
  if (!Number.isFinite(departureAt) || !Number.isFinite(appointmentAt)) return false;
  return now >= departureAt - leadMinutes * 60_000 && now <= appointmentAt;
}

/** Realtime is only asked for a bus or subway boarding with a stop the provider can locate. */
export function canAskForArrival(boarding: TransitBoarding | null | undefined): boarding is TransitBoarding {
  return !!boarding && !!boarding.stop.coordinate && !!boarding.routeName;
}

/**
 * What the screen shows for the first boarding right now. 'realtime' is a live answer; 'last-known'
 * is the last live answer after the provider stopped answering; 'timetable' is what remains when the
 * provider never had anything for this stop — or was never asked.
 */
export type ArrivalSnapshot =
  | { status: 'realtime'; checkedAt: string; arrivals: TransitArrival[]; stopName: string }
  | { status: 'last-known'; checkedAt: string; arrivals: TransitArrival[]; stopName: string; reason: string }
  | { status: 'timetable'; checkedAt?: string; reason: 'not-yet' | 'unsupported' | 'unavailable' | 'subway' | 'not-configured' };

export type ArrivalPollerState = {
  snapshot: ArrivalSnapshot;
  /** When the provider was last actually asked, for the twenty-second reuse rule. */
  lastAskedAt: number | null;
  lastValid: Extract<TransitArrivalResult, { status: 'realtime' }> | null;
};

export function createArrivalPollerState(): ArrivalPollerState {
  return { snapshot: { status: 'timetable', reason: 'not-yet' }, lastAskedAt: null, lastValid: null };
}

/** True when the reuse period has passed and the provider may be asked again. */
export function shouldAskArrival(state: ArrivalPollerState, now = Date.now(), reuseMs = ARRIVAL_REUSE_MS) {
  return state.lastAskedAt === null || now - state.lastAskedAt >= reuseMs;
}

/**
 * Folds one provider answer into the state. A live answer replaces everything; a failure keeps the
 * last live answer and says it is old; an unsupported answer yields to the timetable.
 */
export function applyArrivalResult(state: ArrivalPollerState, result: TransitArrivalResult, askedAt = Date.now()): ArrivalPollerState {
  if (result.status === 'realtime') {
    return {
      lastAskedAt: askedAt,
      lastValid: result,
      snapshot: { status: 'realtime', checkedAt: result.checkedAt, arrivals: result.arrivals, stopName: result.stop.name },
    };
  }
  if (result.status === 'unavailable' && state.lastValid) {
    return {
      ...state,
      lastAskedAt: askedAt,
      snapshot: {
        status: 'last-known',
        checkedAt: state.lastValid.checkedAt,
        arrivals: state.lastValid.arrivals,
        stopName: state.lastValid.stop.name,
        reason: result.reason,
      },
    };
  }
  const reason: Extract<ArrivalSnapshot, { status: 'timetable' }>['reason'] = result.status === 'unavailable'
    ? 'unavailable'
    : result.reason === 'subway' ? 'subway' : result.reason === 'not-configured' ? 'not-configured' : 'unsupported';
  return { ...state, lastAskedAt: askedAt, snapshot: { status: 'timetable', checkedAt: result.checkedAt, reason } };
}

/** Marks the state as having asked and failed outright (network, timeout) without a provider answer. */
export function applyArrivalFailure(state: ArrivalPollerState, askedAt = Date.now()): ArrivalPollerState {
  return applyArrivalResult(state, { status: 'unavailable', provider: 'TAGO', checkedAt: new Date(askedAt).toISOString(), retryable: true, reason: 'upstream' }, askedAt);
}

function clockOf(value: string | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** The status in words, with the time it was checked — never a colour on its own. */
export function arrivalStatusLabel(snapshot: ArrivalSnapshot) {
  if (snapshot.status === 'realtime') return `실시간 · ${clockOf(snapshot.checkedAt)} 확인`;
  if (snapshot.status === 'last-known') return `최근 저장값 · ${clockOf(snapshot.checkedAt)} 확인`;
  const checked = clockOf(snapshot.checkedAt);
  return checked ? `시간표 기준 · ${checked} 확인` : '시간표 기준';
}

/** Why the screen is showing the timetable instead of live arrivals, in words someone can act on. */
export function arrivalStatusDescription(snapshot: ArrivalSnapshot, boarding: TransitBoarding | null | undefined) {
  if (snapshot.status === 'realtime') return `${snapshot.stopName} 정류장의 실시간 도착정보예요.`;
  if (snapshot.status === 'last-known') return '실시간 정보를 새로 받지 못해 마지막으로 확인한 값을 보여드려요. 다시 확인하거나 외부 지도에서 확인해 주세요.';
  switch (snapshot.reason) {
    case 'not-yet':
      return `출발 ${ARRIVAL_WINDOW_MINUTES}분 전부터 첫 탑승편의 실시간 도착정보를 확인해요.`;
    case 'subway':
      return '지하철 실시간 도착은 아직 지원하지 않아 시간표 기준으로 안내해요. 외부 지도에서 확인할 수 있어요.';
    case 'not-configured':
      return '이 지역의 실시간 도착정보는 아직 연결되지 않았어요. 시간표 기준으로 안내해요.';
    case 'unsupported':
      return boarding
        ? `${boarding.stop.name} 정류장의 ${boarding.routeName} 실시간 정보를 제공하지 않는 지역이에요. 시간표 기준으로 안내해요.`
        : '실시간 정보를 제공하지 않는 지역이에요. 시간표 기준으로 안내해요.';
    case 'unavailable':
    default:
      return '실시간 도착정보를 불러오지 못했어요. 시간표 기준으로 안내하며, 다시 확인할 수 있어요.';
  }
}

/** "3분 후 (2정류장 전)" for one vehicle, or "곧 도착" when it is about to pull in. */
export function describeArrival(arrival: TransitArrival, now = Date.now()) {
  const remaining = Math.max(0, Math.round((Date.parse(arrival.expectedAt) - now) / 1000));
  const minutes = Math.round(remaining / 60);
  const when = remaining < 60 ? '곧 도착' : `${minutes}분 후`;
  const stops = typeof arrival.stopsAway === 'number' ? ` (${arrival.stopsAway}정류장 전)` : '';
  return `${arrival.routeName} ${when}${stops}`;
}

export type DepartureChangeProposal = {
  /** Why the plan is at risk, in one sentence. */
  reason: string;
  before: { departure: string; arrival: string };
  /** The arrival the live data projects; the departure is unchanged — a bus cannot be made earlier. */
  after: { departure: string; arrival: string };
  /** How much later than planned the projected arrival is. */
  shiftMinutes: number;
  /** Minutes past the appointment the projected arrival lands, or 0 when it is still in time. */
  lateMinutes: number;
};

function minutesOfClock(clock: string) {
  const [hours, minutes] = clock.split(':').map(Number);
  return hours * 60 + minutes;
}

function clockOfMinutes(total: number) {
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/**
 * The instant the plan says to set off, on the appointment's date — or the day before when the
 * departure clock is later than the appointment clock, which is what leaving at 23:40 for a 00:20
 * appointment means. Read against the appointment's own instant so the two never drift apart.
 */
export function plannedDepartureAt(appointmentAt: number, departureClock: string, appointmentClock: string) {
  if (!Number.isFinite(appointmentAt)) return Number.NaN;
  const departure = minutesOfClock(departureClock);
  const appointment = minutesOfClock(appointmentClock);
  if (!Number.isFinite(departure) || !Number.isFinite(appointment)) return Number.NaN;
  const minutesBefore = appointment >= departure ? appointment - departure : appointment + 1440 - departure;
  return appointmentAt - minutesBefore * 60_000;
}

/**
 * Whether the live arrivals put the plan's arrival at risk, and what the arrival becomes if they
 * are right. Never applied here: the caller shows the before and after and waits for a decision,
 * exactly as with a delay proposal.
 *
 * The timetable answer already includes an average wait at the stop, so a short wait is not a
 * delay. What the live data adds is the actual first catchable vehicle: leaving as planned and
 * walking to the stop, the person boards the first vehicle arriving after they get there, and
 * rides the rest of the route. If that projects an arrival later than the plan's by more than the
 * tolerance, the plan is at risk. The departure is never moved earlier: an earlier walk to the
 * stop meets the same bus.
 */
export function proposeDepartureFromArrivals({
  boarding,
  arrivals,
  routeMinutes,
  plannedDeparture,
  plannedArrival,
  appointmentTime,
  now = Date.now(),
  toleranceMinutes = 5,
}: {
  boarding: TransitBoarding;
  arrivals: TransitArrival[];
  /** The whole journey's minutes from the timetable, walking included. */
  routeMinutes: number;
  plannedDeparture: string;
  plannedArrival: string;
  appointmentTime: string;
  now?: number;
  toleranceMinutes?: number;
}): DepartureChangeProposal | null {
  if (!arrivals.length || !Number.isFinite(routeMinutes) || routeMinutes <= 0) return null;
  const nowDate = new Date(now);
  const nowMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
  // Every clock is read on the same axis as now: a clock more than twelve hours behind now is
  // tomorrow's, so 23:50 → 00:20 across midnight does not read as a day's delay.
  const onNowAxis = (clock: string) => {
    const minutes = minutesOfClock(clock);
    return minutes < nowMinutes - 12 * 60 ? minutes + 1440 : minutes;
  };
  const departureMinutes = onNowAxis(plannedDeparture);
  // Leaving on time and walking to the stop, the person is there at this minute of the day.
  const atStopMinutes = Math.max(nowMinutes, departureMinutes) + boarding.walkMinutesToStop;
  const catchable = arrivals
    .map((arrival) => ({ arrival, minutes: nowMinutes + Math.max(0, (Date.parse(arrival.expectedAt) - now) / 60_000) }))
    .filter((entry) => Number.isFinite(entry.minutes) && entry.minutes >= atStopMinutes)
    .sort((left, right) => left.minutes - right.minutes)[0];
  if (!catchable) return null;
  // Riding from the stop takes the route minus the walk to it; the projected arrival follows.
  // The timetable's minutes include its own assumed wait at the stop, which this cannot separate
  // out, so the tolerance below absorbs an ordinary wait rather than reporting it as a delay.
  const rideMinutes = Math.max(0, routeMinutes - boarding.walkMinutesToStop);
  const projectedArrival = Math.round(catchable.minutes + rideMinutes);
  const plannedArrivalMinutes = onNowAxis(plannedArrival);
  const shift = projectedArrival - plannedArrivalMinutes;
  if (shift <= toleranceMinutes) return null;
  const appointmentMinutes = onNowAxis(appointmentTime);
  const lateMinutes = Math.max(0, projectedArrival - appointmentMinutes);
  return {
    reason: lateMinutes > 0
      ? `${boarding.routeName}이(가) 시간표보다 늦어 이대로면 약속보다 ${lateMinutes}분 늦게 도착해요.`
      : `${boarding.routeName}이(가) 시간표보다 ${shift}분 늦게 도착해요. 도착 시각이 그만큼 늦어져요.`,
    before: { departure: plannedDeparture, arrival: plannedArrival },
    after: { departure: plannedDeparture, arrival: clockOfMinutes(projectedArrival) },
    shiftMinutes: shift,
    lateMinutes,
  };
}
