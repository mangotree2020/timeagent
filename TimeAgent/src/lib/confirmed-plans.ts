import { formatAppointmentDateValue, resolveAppointmentDate, toLocalDate } from './appointment-date';
import { nextRepeatDateAfter, normalizeRepeatWeekdays } from './appointment-recurrence';
import { SchedulePlan } from './planning';
import { ScheduleDraft } from './schedule-draft';

export const CONFIRMED_PLANS_STORAGE_KEY = '@on-time/confirmed-plans';
const CONFIRMED_PLANS_VERSION = 1;

export type ConfirmedPlanState = 'scheduled' | 'active' | 'completed' | 'incomplete';

export type ConfirmedSchedulePlan = {
  version: typeof CONFIRMED_PLANS_VERSION;
  id: string;
  schedule: ScheduleDraft;
  plan: SchedulePlan;
  appointmentAt: number;
  prepStartAt: number;
  confirmedAt: number;
  state: ConfirmedPlanState;
  completion?: {
    completedAt: number;
    onTime: boolean;
    delayMinutes: number;
  };
  notificationIdentifier?: string;
  /** The five-minutes-before message, so it can be cancelled with the plan. */
  reminderNotificationIdentifier?: string;
  /**
   * Shared by every occurrence of a repeating appointment, so the next one can be created exactly
   * once when this one is over. Absent on a one-off.
   */
  seriesId?: string;
};

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
};

export function confirmSchedulePlan({
  schedule,
  plan,
  now = Date.now(),
}: {
  schedule: ScheduleDraft;
  plan: SchedulePlan;
  now?: number;
}): ConfirmedSchedulePlan {
  const appointmentAt = resolveScheduleDateTime(schedule.date, schedule.appointmentTime, now);
  const prepStartAt = resolveScheduleDateTime(schedule.date, plan.prepStart, now)
    - (clockMinutes(plan.prepStart) > clockMinutes(schedule.appointmentTime) ? 24 * 60 * 60_000 : 0);
  const id = `${appointmentAt}-${now}-${schedule.title.trim()}`;
  const repeats = normalizeRepeatWeekdays(schedule.repeatWeekdays).length > 0;
  return {
    version: CONFIRMED_PLANS_VERSION,
    id,
    schedule: { ...schedule, routines: schedule.routines.map((routine) => ({ ...routine })) },
    plan: { ...plan, timeline: plan.timeline.map((step) => ({ ...step })) },
    appointmentAt,
    prepStartAt,
    confirmedAt: now,
    state: 'scheduled',
    ...(repeats ? { seriesId: id } : {}),
  };
}

/**
 * Creates the next occurrence of every repeating appointment whose current one is over, so a
 * weekly appointment keeps its place in the list without being re-entered. Each series grows by
 * at most one scheduled occurrence at a time: nothing is created while a later occurrence already
 * exists, and deleting that occurrence ends the series. Returns the same array when nothing changed.
 */
export function spawnNextRecurringPlans(plans: ConfirmedSchedulePlan[], now = Date.now()) {
  const created: ConfirmedSchedulePlan[] = [];
  for (const plan of plans) {
    const days = normalizeRepeatWeekdays(plan.schedule.repeatWeekdays);
    if (!days.length || (plan.state !== 'completed' && plan.state !== 'incomplete')) continue;
    const seriesId = plan.seriesId ?? plan.id;
    const hasLater = [...plans, ...created].some((other) => (
      other !== plan && (other.seriesId ?? other.id) === seriesId && other.appointmentAt > plan.appointmentAt
    ));
    if (hasLater) continue;
    const nextDate = nextRepeatDateAfter(days, toLocalDate(plan.appointmentAt), plan.schedule.appointmentTime, now);
    const dateText = formatAppointmentDateValue(nextDate);
    const appointmentAt = resolveScheduleDateTime(dateText, plan.schedule.appointmentTime, now);
    created.push({
      version: CONFIRMED_PLANS_VERSION,
      id: `${seriesId}@${appointmentAt}`,
      schedule: { ...plan.schedule, date: dateText, routines: plan.schedule.routines.map((routine) => ({ ...routine })) },
      plan: { ...plan.plan, timeline: plan.plan.timeline.map((step) => ({ ...step })) },
      appointmentAt,
      prepStartAt: appointmentAt - (plan.appointmentAt - plan.prepStartAt),
      confirmedAt: now,
      state: 'scheduled',
      seriesId,
    });
  }
  if (!created.length) return plans;
  return created.reduce((list, plan) => addConfirmedPlan(list, plan), plans);
}

export function addConfirmedPlan(plans: ConfirmedSchedulePlan[], plan: ConfirmedSchedulePlan) {
  return [...plans.filter((item) => item.id !== plan.id), plan]
    .sort((left, right) => left.prepStartAt - right.prepStartAt || left.confirmedAt - right.confirmedAt);
}

export function replaceConfirmedPlan(
  plans: ConfirmedSchedulePlan[],
  id: string,
  replacement: ConfirmedSchedulePlan,
) {
  return plans.map((plan) => plan.id === id ? replacement : plan)
    .sort((left, right) => left.prepStartAt - right.prepStartAt || left.confirmedAt - right.confirmedAt);
}

export function removeConfirmedPlan(plans: ConfirmedSchedulePlan[], id: string) {
  return plans.filter((plan) => plan.id !== id);
}

export function findDueConfirmedPlan(plans: ConfirmedSchedulePlan[], now = Date.now()) {
  return plans
    .filter((plan) => plan.state === 'scheduled' && plan.prepStartAt <= now)
    .sort((left, right) => left.prepStartAt - right.prepStartAt)[0] ?? null;
}

export function markConfirmedPlanState(
  plans: ConfirmedSchedulePlan[],
  id: string,
  state: ConfirmedPlanState,
) {
  return plans.map((plan) => plan.id === id ? { ...plan, state } : plan);
}

export function completeConfirmedPlan(
  plans: ConfirmedSchedulePlan[],
  id: string,
  completion: NonNullable<ConfirmedSchedulePlan['completion']>,
) {
  return plans.map((plan) => plan.id === id ? { ...plan, state: 'completed' as const, completion } : plan);
}

export function currentOnTimeArrivalStreak(plans: ConfirmedSchedulePlan[]) {
  const closed = plans
    .filter((plan) => plan.state === 'completed' || plan.state === 'incomplete')
    .sort((left, right) => (
      (right.completion?.completedAt ?? right.appointmentAt)
      - (left.completion?.completedAt ?? left.appointmentAt)
    ));
  let streak = 0;
  for (const plan of closed) {
    if (plan.state !== 'completed' || plan.completion?.onTime !== true) break;
    streak += 1;
  }
  return streak;
}

export function plansForLocalDate(plans: ConfirmedSchedulePlan[], dateOrTimestamp: Date | number) {
  const date = typeof dateOrTimestamp === 'number' ? new Date(dateOrTimestamp) : dateOrTimestamp;
  return plans
    .filter((plan) => isSameLocalDate(new Date(plan.appointmentAt), date))
    .sort((left, right) => left.appointmentAt - right.appointmentAt || left.confirmedAt - right.confirmedAt);
}

export function plansForLocalDateRange(
  plans: ConfirmedSchedulePlan[],
  dateOrTimestamp: Date | number,
  days = 2,
) {
  const date = typeof dateOrTimestamp === 'number' ? new Date(dateOrTimestamp) : dateOrTimestamp;
  const rangeStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeEnd.getDate() + Math.max(1, Math.floor(days)));
  return plans
    .filter((plan) => plan.appointmentAt >= rangeStart.getTime() && plan.appointmentAt < rangeEnd.getTime())
    .sort((left, right) => left.appointmentAt - right.appointmentAt || left.confirmedAt - right.confirmedAt);
}

export function settlePastConfirmedPlans(plans: ConfirmedSchedulePlan[], now = Date.now()) {
  return plans.map((plan) => (
    (plan.state === 'scheduled' || plan.state === 'active') && plan.appointmentAt <= now
      ? { ...plan, state: 'incomplete' as const }
      : plan
  ));
}

export async function loadConfirmedPlans(storage: StorageLike): Promise<ConfirmedSchedulePlan[]> {
  const raw = await storage.getItem(CONFIRMED_PLANS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== CONFIRMED_PLANS_VERSION || !Array.isArray(parsed.plans)) return [];
    return parsed.plans.filter(isConfirmedSchedulePlan)
      .sort((left, right) => left.prepStartAt - right.prepStartAt || left.confirmedAt - right.confirmedAt);
  } catch {
    return [];
  }
}

export async function saveConfirmedPlans(storage: StorageLike, plans: ConfirmedSchedulePlan[]) {
  await storage.setItem(CONFIRMED_PLANS_STORAGE_KEY, JSON.stringify({
    version: CONFIRMED_PLANS_VERSION,
    plans: [...plans].sort((left, right) => left.prepStartAt - right.prepStartAt || left.confirmedAt - right.confirmedAt),
  }));
}

export function resolveScheduleDateTime(dateText: string, clock: string, now = Date.now()) {
  const { year, month, day } = resolveAppointmentDate(dateText, now);
  const minutes = clockMinutes(clock);
  return new Date(year, month, day, Math.floor(minutes / 60), minutes % 60, 0, 0).getTime();
}

/** Five minutes' warning, in one sentence, for both the notification and the spoken reminder. */
export function describePrepStartReminder(plan: ConfirmedSchedulePlan) {
  return `5분 뒤 ${plan.plan.prepStart}에 ${plan.schedule.title} 준비를 시작해요.`;
}

export const PREP_START_REMINDER_MINUTES = 5;

export function formatConfirmedPlanDate(appointmentAt: number, now = Date.now()) {
  const appointment = new Date(appointmentAt);
  const reference = new Date(now);
  if (isSameLocalDate(appointment, reference)) return '오늘';
  const tomorrow = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + 1);
  if (isSameLocalDate(appointment, tomorrow)) return '내일';
  return `${appointment.getMonth() + 1}월 ${appointment.getDate()}일`;
}

function clockMinutes(clock: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!match) throw new Error(`Invalid clock value: ${clock}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Invalid clock value: ${clock}`);
  return hours * 60 + minutes;
}

function isSameLocalDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function isConfirmedSchedulePlan(value: unknown): value is ConfirmedSchedulePlan {
  if (!isRecord(value) || !isRecord(value.schedule) || !isRecord(value.plan)) return false;
  return value.version === CONFIRMED_PLANS_VERSION
    && typeof value.id === 'string'
    && typeof value.schedule.title === 'string'
    && typeof value.schedule.date === 'string'
    && typeof value.schedule.appointmentTime === 'string'
    && Array.isArray(value.schedule.routines)
    && typeof value.plan.prepStart === 'string'
    && typeof value.plan.departure === 'string'
    && typeof value.plan.arrival === 'string'
    && Array.isArray(value.plan.timeline)
    && isFiniteNumber(value.appointmentAt)
    && isFiniteNumber(value.prepStartAt)
    && isFiniteNumber(value.confirmedAt)
    && (value.state === 'scheduled' || value.state === 'active' || value.state === 'completed' || value.state === 'incomplete')
    && (value.completion === undefined || (
      isRecord(value.completion)
      && isFiniteNumber(value.completion.completedAt)
      && typeof value.completion.onTime === 'boolean'
      && isFiniteNumber(value.completion.delayMinutes)
    ))
    && (value.notificationIdentifier === undefined || typeof value.notificationIdentifier === 'string')
    && (value.reminderNotificationIdentifier === undefined || typeof value.reminderNotificationIdentifier === 'string')
    && (value.seriesId === undefined || typeof value.seriesId === 'string');
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
