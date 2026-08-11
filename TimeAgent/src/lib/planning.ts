import { TimelineStep } from '@/data/demo';
import { ScheduleDraft, TransportMode } from '@/lib/schedule-draft';

const defaultTravelMinutes: Record<TransportMode, number> = {
  'AI 추천': 24,
  '도보': 35,
  '버스': 32,
  '지하철': 24,
  '자가용': 20,
  '택시': 18,
};

export type PlanStatus = {
  kind: 'ready' | 'start-now' | 'impossible';
  label: string;
  tone: 'success' | 'warning' | 'danger';
  minutes: number;
};

export type SchedulePlan = {
  preparationMinutes: number;
  travelMinutes: number;
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

export type PlanPersonalization = {
  routineMinutes: Record<string, DurationSuggestion>;
  travelMinutes?: DurationSuggestion;
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
  personalization?: PlanPersonalization;
};

export function createSchedulePlan(draft: ScheduleDraft, options: PlanningOptions = {}): SchedulePlan {
  const routineMinutes = draft.routines.map((routine) => ({
    ...routine,
    minutes: options.personalization?.routineMinutes[routine.id]?.minutes ?? routine.minutes,
  }));
  const preparationMinutes = routineMinutes.reduce((total, routine) => total + routine.minutes, 0);
  const baseTravelMinutes = options.travelMinutes ?? defaultTravelMinutes[draft.transport];
  const travelMinutes = options.personalization?.travelMinutes?.minutes ?? baseTravelMinutes;
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
    if (!suggestion || suggestion.minutes === routine.minutes) return [];
    return [{
      id: routine.id,
      label: routine.label,
      kind: 'routine' as const,
      beforeMinutes: routine.minutes,
      afterMinutes: suggestion.minutes,
      samples: suggestion.samples,
    }];
  });
  const travelSuggestion = options.personalization?.travelMinutes;
  if (travelSuggestion && travelSuggestion.minutes !== baseTravelMinutes) {
    personalizationAdjustments.push({
      id: `transport-${draft.transport}`,
      label: `${draft.transport} 이동`,
      kind: 'travel',
      beforeMinutes: baseTravelMinutes,
      afterMinutes: travelSuggestion.minutes,
      samples: travelSuggestion.samples,
    });
  }

  return {
    preparationMinutes,
    travelMinutes,
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
  if (transport === '도보') return '걸어서 출발';
  return transport === 'AI 추천' ? '추천 경로로 출발' : `${transport}로 출발`;
}
