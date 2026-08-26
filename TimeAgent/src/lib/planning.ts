import { TimelineStep } from '@/data/demo';
import { resolveTransportMode, RoutineDraft, ScheduleDraft, TransportMode } from '@/lib/schedule-draft';
import type { TravelEstimate } from '@/lib/travel-estimate';

/**
 * What each mode is worth in time before anything is known about the trip. These are the answers
 * for a destination that has never been located — a draft restored without coordinates, or a device
 * that could not say where it was.
 */
const defaultTravelMinutes: Record<TransportMode, number> = {
  'AI 추천': 24,
  '도보': 35,
  '대중교통': 26,
  '승용차(택시)': 19,
};

/**
 * Door-to-door speeds for Korean cities, and the minutes each mode costs before it moves at all:
 * walking to the stop and waiting for the bus, finding the car and parking it again.
 */
const travelSpeeds: Record<TransportMode, { kmPerHour: number; accessMinutes: number }> = {
  'AI 추천': { kmPerHour: 24, accessMinutes: 8 },
  '도보': { kmPerHour: 4.5, accessMinutes: 0 },
  '대중교통': { kmPerHour: 28, accessMinutes: 9 },
  '승용차(택시)': { kmPerHour: 27, accessMinutes: 5 },
};

/**
 * How long the journey takes, from how far it actually is. The table above answered 24 minutes for
 * 지하철 whether the appointment was two stops away or in another city, and that number is what the
 * departure time — and every preparation step before it — is counted back from.
 */
export function estimateTravelMinutes(transport: TransportMode | string, distanceMeters: number) {
  const speed = travelSpeeds[resolveTransportMode(String(transport))] ?? travelSpeeds['AI 추천'];
  return Math.max(1, Math.round(distanceMeters / 1_000 / speed.kmPerHour * 60 + speed.accessMinutes));
}

/**
 * A draft restored from an older build — or one whose transport was set from a route label — can
 * hold a mode this table never had. Falling back keeps the arithmetic finite instead of printing
 * NaN:NaN across every step of the plan.
 */
/**
 * A draft can reach the plan screen before it has a usable time — imported from a calendar, or
 * restored half-finished. Planning such a draft throws, and a throw during render takes the whole
 * screen down, so callers check first and show a way forward instead.
 */
export function isPlannableSchedule(draft: ScheduleDraft) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(draft.appointmentTime.trim());
  return Boolean(match) && Number(match![1]) <= 23 && Number(match![2]) <= 59;
}

function travelMinutesFor(draft: ScheduleDraft) {
  const distance = draft.destinationDistanceMeters;
  if (typeof distance === 'number' && Number.isFinite(distance) && distance >= 0) {
    return estimateTravelMinutes(draft.transport, distance);
  }
  return defaultTravelMinutes[resolveTransportMode(draft.transport)] ?? defaultTravelMinutes['AI 추천'];
}

export type PlanStatus = {
  kind: 'ready' | 'start-now' | 'impossible';
  label: string;
  tone: 'success' | 'warning' | 'danger';
  minutes: number;
};

export type SchedulePlan = {
  preparationMinutes: number;
  travelMinutes: number;
  /** Where travelMinutes came from — fare, transfers, first boarding — or absent for a distance guess. */
  travelEstimate?: TravelEstimate;
  bufferMinutes: number;
  prepStart: string;
  departure: string;
  arrival: string;
  status: PlanStatus;
  timeline: TimelineStep[];
  personalizationAdjustments: PlanPersonalizationAdjustment[];
};

export type DurationSuggestion = {
  minutes: number;
  samples: number;
};

/**
 * Learned times, and only for preparation. Travel is deliberately absent: how long 지하철 took last
 * Tuesday says nothing about how long it takes to a place across town, and averaging one trip into
 * the next was moving departure times for reasons nobody could see. Travel comes from the distance
 * to this appointment's own destination instead.
 */
export type PlanPersonalization = {
  routineMinutes: Record<string, DurationSuggestion>;
};

export type PlanPersonalizationAdjustment = {
  id: string;
  label: string;
  kind: 'routine' | 'travel';
  beforeMinutes: number;
  afterMinutes: number;
  samples: number;
};

type PlanningOptions = {
  now?: string;
  travelMinutes?: number;
  /** The journey lookup behind travelMinutes, kept on the plan so a saved plan still shows its evidence. */
  travelEstimate?: TravelEstimate;
  personalization?: PlanPersonalization;
};

/**
 * The duration a plan actually uses. Learned averages stand in for durations nobody has set, but a
 * number the person entered wins — otherwise editing preparation time appears to do nothing.
 */
export function effectiveRoutineMinutes(routine: RoutineDraft, personalization?: PlanPersonalization) {
  if (routine.minutesEditedByUser) return routine.minutes;
  return personalization?.routineMinutes[routine.id]?.minutes ?? routine.minutes;
}

/**
 * When someone is already too late to start on time the plan pins preparation to right now, so the
 * displayed start stops responding to edits. This is the time they would have had to begin, which
 * keeps moving as the preparation list changes and shows the edit took effect.
 */
export function targetPrepStartClock(draft: ScheduleDraft, options: PlanningOptions = {}) {
  const preparationMinutes = draft.routines.reduce(
    (total, routine) => total + effectiveRoutineMinutes(routine, options.personalization),
    0,
  );
  const travelMinutes = options.travelMinutes ?? travelMinutesFor(draft);
  const bufferMinutes = draft.priority === 'on-time' ? 10 : 5;
  const appointmentMinutes = resolveAppointmentMinutes(clockToMinutes(draft.appointmentTime), options.now);
  return minutesToClock(appointmentMinutes - bufferMinutes - travelMinutes - preparationMinutes);
}

export function createSchedulePlan(draft: ScheduleDraft, options: PlanningOptions = {}): SchedulePlan {
  const routineMinutes = draft.routines.map((routine) => ({
    ...routine,
    minutes: effectiveRoutineMinutes(routine, options.personalization),
  }));
  const preparationMinutes = routineMinutes.reduce((total, routine) => total + routine.minutes, 0);
  const travelMinutes = options.travelMinutes ?? travelMinutesFor(draft);
  const bufferMinutes = draft.priority === 'on-time' ? 10 : 5;
  const appointmentClockMinutes = clockToMinutes(draft.appointmentTime);
  const appointmentMinutes = resolveAppointmentMinutes(appointmentClockMinutes, options.now);
  const targetArrivalMinutes = appointmentMinutes - bufferMinutes;
  const targetDepartureMinutes = targetArrivalMinutes - travelMinutes;
  const targetPrepStartMinutes = targetDepartureMinutes - preparationMinutes;
  const nowMinutes = options.now ? clockToMinutes(options.now) : undefined;
  const status = createPlanStatus({
    appointmentMinutes,
    bufferMinutes,
    nowMinutes,
    prepStartMinutes: targetPrepStartMinutes,
    preparationMinutes,
    travelMinutes,
  });
  const prepStartMinutes = status.kind === 'ready' || nowMinutes === undefined ? targetPrepStartMinutes : nowMinutes;
  const departureMinutes = prepStartMinutes + preparationMinutes;
  const arrivalMinutes = departureMinutes + travelMinutes;

  let stepMinutes = prepStartMinutes;
  const timeline: TimelineStep[] = routineMinutes.map((routine, index) => {
    const step: TimelineStep = {
      id: routine.id,
      time: minutesToClock(stepMinutes),
      title: routine.label,
      duration: routine.minutes,
      status: index === 0 && status.kind !== 'ready' ? 'current' : 'upcoming',
    };
    stepMinutes += routine.minutes;
    return step;
  });

  timeline.push({
    id: 'depart',
    time: minutesToClock(departureMinutes),
    title: departureTitle(draft.transport),
    duration: travelMinutes,
    status: draft.routines.length === 0 && status.kind !== 'ready' ? 'current' : 'upcoming',
  });
  timeline.push({
    id: 'arrive',
    time: minutesToClock(arrivalMinutes),
    title: '도착 예정',
    duration: 0,
    note: status.kind === 'ready'
      ? `약속 ${bufferMinutes}분 전`
      : status.kind === 'start-now'
        ? `${status.minutes}분 여유`
        : `${Math.abs(status.minutes)}분 지각 예상`,
    status: 'upcoming',
  });

  const personalizationAdjustments: PlanPersonalizationAdjustment[] = draft.routines.flatMap((routine) => {
    const suggestion = options.personalization?.routineMinutes[routine.id];
    // A duration the person set themselves is not adjusted, so listing it here would claim a
    // change the plan never made.
    if (!suggestion || routine.minutesEditedByUser || suggestion.minutes === routine.minutes) return [];
    return [{
      id: routine.id,
      label: routine.label,
      kind: 'routine' as const,
      beforeMinutes: routine.minutes,
      afterMinutes: suggestion.minutes,
      samples: suggestion.samples,
    }];
  });

  return {
    preparationMinutes,
    travelMinutes,
    ...(options.travelEstimate ? { travelEstimate: options.travelEstimate } : {}),
    bufferMinutes,
    prepStart: minutesToClock(prepStartMinutes),
    departure: minutesToClock(departureMinutes),
    arrival: minutesToClock(arrivalMinutes),
    status,
    timeline,
    personalizationAdjustments,
  };
}

export function currentClock(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function createPlanStatus({
  appointmentMinutes,
  bufferMinutes,
  nowMinutes,
  prepStartMinutes,
  preparationMinutes,
  travelMinutes,
}: {
  appointmentMinutes: number;
  bufferMinutes: number;
  nowMinutes?: number;
  prepStartMinutes: number;
  preparationMinutes: number;
  travelMinutes: number;
}): PlanStatus {
  if (nowMinutes === undefined) {
    return { kind: 'ready', label: `${bufferMinutes}분 여유`, tone: 'success', minutes: bufferMinutes };
  }

  if (nowMinutes <= prepStartMinutes) {
    return { kind: 'ready', label: `${bufferMinutes}분 여유`, tone: 'success', minutes: bufferMinutes };
  }

  const projectedArrival = nowMinutes + preparationMinutes + travelMinutes;
  const remainingMinutes = appointmentMinutes - projectedArrival;
  if (remainingMinutes >= 0) {
    return {
      kind: 'start-now',
      label: `준비 시작이 ${nowMinutes - prepStartMinutes}분 늦었어요 · 지금 시작하면 ${remainingMinutes}분 여유`,
      tone: 'warning',
      minutes: remainingMinutes,
    };
  }

  return {
    kind: 'impossible',
    label: `${Math.abs(remainingMinutes)}분 지각 예상`,
    tone: 'danger',
    minutes: remainingMinutes,
  };
}

function resolveAppointmentMinutes(appointmentMinutes: number, now?: string) {
  if (!now) return appointmentMinutes;
  const nowMinutes = clockToMinutes(now);
  return appointmentMinutes < nowMinutes ? appointmentMinutes + 1440 : appointmentMinutes;
}

function clockToMinutes(clock: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!match) throw new Error(`Invalid clock value: ${clock}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Invalid clock value: ${clock}`);
  return hours * 60 + minutes;
}

function minutesToClock(totalMinutes: number) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function departureTitle(transport: TransportMode) {
  const resolved = resolveTransportMode(transport);
  if (resolved === '도보') return '걸어서 출발';
  if (resolved === '대중교통') return '대중교통으로 출발';
  if (resolved === '승용차(택시)') return '승용차로 출발';
  return '추천 경로로 출발';
}
