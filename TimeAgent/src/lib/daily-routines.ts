import { ConfirmedSchedulePlan, resolveScheduleDateTime } from './confirmed-plans';
import { withObjectParticle } from './local-notifications';
import { RoutineDraft, ScheduleDraft } from './schedule-draft';

/**
 * Preparation that is done once a day — a shower, make-up, a shave — goes into one appointment
 * of the day. Once a confirmed appointment that day carries such a step, every other appointment
 * the same day starts from what it leaves behind: dressing and packing, not another shower.
 */
export const ONCE_PER_DAY_ROUTINE_IDS: readonly string[] = ['shower', 'skincare', 'makeup', 'shave', 'hair'];

export type OncePerDaySkip = {
  /** The appointment that day whose preparation already carries these steps. */
  firstPlan: ConfirmedSchedulePlan;
  /** What was taken out, each with its place among the steps that stayed, so it can go back there. */
  removed: { routine: RoutineDraft; index: number }[];
};

export function isOncePerDayRoutine(routine: Pick<RoutineDraft, 'id'>) {
  return ONCE_PER_DAY_ROUTINE_IDS.includes(routine.id);
}

/**
 * The other confirmed appointments on the same local day, earliest first. A plan being edited does
 * not count against itself.
 */
export function findSameDayPlans(
  schedule: Pick<ScheduleDraft, 'date' | 'appointmentTime'>,
  plans: readonly ConfirmedSchedulePlan[],
  { excludeId = null, now = Date.now() }: { excludeId?: string | null; now?: number } = {},
) {
  let appointmentAt: number;
  try {
    appointmentAt = resolveScheduleDateTime(schedule.date, schedule.appointmentTime, now);
  } catch {
    return [];
  }
  const day = new Date(appointmentAt);
  return plans
    .filter((plan) => plan.id !== excludeId && sameLocalDay(new Date(plan.appointmentAt), day))
    .sort((left, right) => left.appointmentAt - right.appointmentAt);
}

/**
 * Takes out the once-a-day steps that another appointment the same day already carries. A step the
 * person put back on purpose (`keepOnSameDay`) stays. At least one step is always kept: a plan with
 * nothing to prepare has no preparation time to count back from.
 */
export function dropOncePerDayRoutines(routines: readonly RoutineDraft[], covered: ReadonlySet<string>) {
  const removed: OncePerDaySkip['removed'] = [];
  const kept: RoutineDraft[] = [];
  routines.forEach((routine) => {
    const covers = isOncePerDayRoutine(routine) && covered.has(routine.id) && !routine.keepOnSameDay;
    if (covers && routines.length - removed.length > 1) removed.push({ routine, index: kept.length });
    else kept.push(routine);
  });
  return { routines: removed.length ? kept : [...routines], removed };
}

/** Once-a-day steps that the given plans already carry. */
export function coveredOncePerDayRoutineIds(plans: readonly ConfirmedSchedulePlan[]) {
  return new Set(plans.flatMap((plan) => plan.schedule.routines.filter(isOncePerDayRoutine).map((routine) => routine.id)));
}

/**
 * Applies the rule to a draft about to become a plan. Returns the same draft when no other
 * appointment that day carries any of its once-a-day steps.
 */
export function applyOncePerDayRule(
  schedule: ScheduleDraft,
  plans: readonly ConfirmedSchedulePlan[],
  options: { excludeId?: string | null; now?: number } = {},
): { schedule: ScheduleDraft; skip: OncePerDaySkip | null } {
  const sameDay = findSameDayPlans(schedule, plans, options);
  if (!sameDay.length) return { schedule, skip: null };
  const { routines, removed } = dropOncePerDayRoutines(schedule.routines, coveredOncePerDayRoutineIds(sameDay));
  if (!removed.length) return { schedule, skip: null };
  const removedIds = new Set(removed.map((entry) => entry.routine.id));
  const firstPlan = sameDay.find((plan) => plan.schedule.routines.some((routine) => removedIds.has(routine.id))) ?? sameDay[0];
  return { schedule: { ...schedule, routines }, skip: { firstPlan, removed } };
}

/** Puts one removed step back where it was, marked so the rule leaves it alone from then on. */
export function restoreOncePerDayRoutine(routines: readonly RoutineDraft[], entry: OncePerDaySkip['removed'][number]) {
  if (routines.some((routine) => routine.id === entry.routine.id)) return [...routines];
  const next = [...routines];
  next.splice(Math.min(entry.index, next.length), 0, { ...entry.routine, keepOnSameDay: true });
  return next;
}

/** `오늘 10:00 치과 준비에 샤워·화장이 이미 있어 이번 계획에서는 뺐어요.` */
export function describeOncePerDaySkip(skip: OncePerDaySkip) {
  const labels = skip.removed.map((entry) => entry.routine.label).join('·');
  const subject = withObjectParticle(labels).replace(/를$/, '가').replace(/을$/, '이');
  return `오늘 ${skip.firstPlan.schedule.appointmentTime} ${skip.firstPlan.schedule.title} 준비에 ${subject} 이미 있어 이번 계획에서는 뺐어요.`;
}

function sameLocalDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}
