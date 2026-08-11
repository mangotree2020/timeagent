import { TimelineStep } from '@/data/demo';
import { SchedulePlan } from '@/lib/planning';
import { ScheduleDraft } from '@/lib/schedule-draft';
import { shiftClock } from '@/lib/schedule';

export const PROGRESS_SESSION_STORAGE_KEY = '@on-time/progress-session';
const PROGRESS_SESSION_VERSION = 1;

export type ProgressNotificationKind = 'prep-start' | 'transition-preview' | 'transition-wrap' | 'step-end' | 'departure';

export type ScheduledProgressNotification = {
  identifier: string;
  key: string;
  kind: ProgressNotificationKind;
  stepId: string | null;
  fireAt: number;
};

export type ProgressSession = {
  version: typeof PROGRESS_SESSION_VERSION;
  sessionId: string;
  confirmedPlanId?: string;
  state: 'active' | 'completed';
  schedule: ScheduleDraft;
  plan: SchedulePlan;
  timeline: TimelineStep[];
  currentStepId: string | null;
  stepStartedAt: number;
  stepDurationSeconds: number;
  delayMinutes: number;
  route: string;
  lastRecalculatedAt: number | null;
  scheduledNotifications: ScheduledProgressNotification[];
  updatedAt: number;
};

export type ProgressDelayProposal = {
  additionalMinutes: number;
  before: {
    preparationMinutes: number;
    departure: string;
    arrival: string;
  };
  after: {
    preparationMinutes: number;
    departure: string;
    arrival: string;
  };
  createdAt: number;
};

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
  removeItem: (key: string) => Promise<unknown>;
};

export function createProgressSession({
  schedule,
  plan,
  confirmedPlanId,
  now = Date.now(),
}: {
  schedule: ScheduleDraft;
  plan: SchedulePlan;
  confirmedPlanId?: string;
  now?: number;
}): ProgressSession {
  const currentIndex = Math.max(0, plan.timeline.findIndex((step) => step.status === 'current'));
  const timeline = plan.timeline.map((step, index) => ({
    ...step,
    status: index === currentIndex ? 'current' as const : step.status === 'done' ? 'done' as const : 'upcoming' as const,
  }));
  const current = timeline[currentIndex] ?? null;

  return {
    version: PROGRESS_SESSION_VERSION,
    sessionId: `${now}-${schedule.title}-${schedule.appointmentTime}`,
    confirmedPlanId,
    state: current ? 'active' : 'completed',
    schedule,
    plan: { ...plan, timeline },
    timeline,
    currentStepId: current?.id ?? null,
    stepStartedAt: now,
    stepDurationSeconds: (current?.duration ?? 0) * 60,
    delayMinutes: 0,
    route: schedule.transport,
    lastRecalculatedAt: null,
    scheduledNotifications: [],
    updatedAt: now,
  };
}

export function getProgressRemainingSeconds(session: ProgressSession, now = Date.now()) {
  if (session.state === 'completed') return 0;
  const elapsedSeconds = Math.max(0, Math.floor((now - session.stepStartedAt) / 1000));
  return Math.max(0, session.stepDurationSeconds - elapsedSeconds);
}

export function advanceProgressSession(session: ProgressSession, now = Date.now()): ProgressSession {
  const currentIndex = session.timeline.findIndex((step) => step.id === session.currentStepId);
  if (currentIndex < 0) return { ...session, state: 'completed', currentStepId: null, stepDurationSeconds: 0, updatedAt: now };

  const nextIndex = currentIndex + 1;
  const actualDurationMinutes = Math.max(1, Math.round(Math.max(0, now - session.stepStartedAt) / 60_000));
  const timeline = session.timeline.map((step, index) => {
    if (index === currentIndex) return { ...step, status: 'done' as const, actualDurationMinutes };
    if (index === nextIndex) return { ...step, status: 'current' as const };
    return step;
  });
  const next = timeline[nextIndex] ?? null;

  return {
    ...session,
    state: next ? 'active' : 'completed',
    timeline,
    plan: { ...session.plan, timeline },
    currentStepId: next?.id ?? null,
    stepStartedAt: now,
    stepDurationSeconds: (next?.duration ?? 0) * 60,
    updatedAt: now,
  };
}

export function updateProgressWithDelay(session: ProgressSession, minutes: number, now = Date.now()): ProgressSession {
  const extraSeconds = minutes * 60;
  const timeline = session.timeline.map((step) => step.id === session.currentStepId
    ? { ...step, duration: step.duration + minutes }
    : step);
  return {
    ...session,
    timeline,
    plan: { ...session.plan, timeline },
    stepDurationSeconds: session.stepDurationSeconds + extraSeconds,
    delayMinutes: session.delayMinutes + minutes,
    lastRecalculatedAt: now,
    updatedAt: now,
  };
}

export function withScheduledProgressNotifications(
  session: ProgressSession,
  scheduledNotifications: ScheduledProgressNotification[],
): ProgressSession {
  return { ...session, scheduledNotifications };
}

export function createProgressDelayProposal(
  session: ProgressSession,
  additionalMinutes: number,
  now = Date.now(),
): ProgressDelayProposal {
  if (!Number.isInteger(additionalMinutes) || additionalMinutes <= 0) {
    throw new Error('Delay minutes must be a positive integer');
  }

  const beforeDelay = session.delayMinutes;
  const afterDelay = beforeDelay + additionalMinutes;
  return {
    additionalMinutes,
    before: {
      preparationMinutes: session.plan.preparationMinutes + beforeDelay,
      departure: shiftClock(session.plan.departure, beforeDelay),
      arrival: shiftClock(session.plan.arrival, beforeDelay),
    },
    after: {
      preparationMinutes: session.plan.preparationMinutes + afterDelay,
      departure: shiftClock(session.plan.departure, afterDelay),
      arrival: shiftClock(session.plan.arrival, afterDelay),
    },
    createdAt: now,
  };
}

export function applyProgressDelayProposal(
  session: ProgressSession,
  proposal: ProgressDelayProposal,
  now = Date.now(),
) {
  return updateProgressWithDelay(session, proposal.additionalMinutes, now);
}

export function updateProgressRoute(session: ProgressSession, route: string, now = Date.now()): ProgressSession {
  return {
    ...session,
    route,
    delayMinutes: 0,
    lastRecalculatedAt: now,
    updatedAt: now,
  };
}

export async function loadProgressSession(storage: StorageLike): Promise<ProgressSession | null> {
  const raw = await storage.getItem(PROGRESS_SESSION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isProgressSession(parsed)) return null;
    const scheduledNotifications = Array.isArray(parsed.scheduledNotifications)
      ? parsed.scheduledNotifications.filter(isScheduledProgressNotification)
      : [];
    const sessionId = typeof parsed.sessionId === 'string'
      ? parsed.sessionId
      : `legacy-${parsed.stepStartedAt}-${parsed.schedule.title}`;
    const plan = {
      ...parsed.plan,
      personalizationAdjustments: Array.isArray(parsed.plan.personalizationAdjustments)
        ? parsed.plan.personalizationAdjustments
        : [],
    };
    return { ...parsed, sessionId, plan, scheduledNotifications };
  } catch {
    return null;
  }
}

export async function saveProgressSession(storage: StorageLike, session: ProgressSession) {
  await storage.setItem(PROGRESS_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export async function clearProgressSession(storage: StorageLike) {
  await storage.removeItem(PROGRESS_SESSION_STORAGE_KEY);
}

function isProgressSession(value: unknown): value is ProgressSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<ProgressSession>;
  return session.version === PROGRESS_SESSION_VERSION
    && (typeof session.sessionId === 'string' || session.sessionId === undefined)
    && (typeof session.confirmedPlanId === 'string' || session.confirmedPlanId === undefined)
    && (session.state === 'active' || session.state === 'completed')
    && isScheduleDraft(session.schedule)
    && isSchedulePlan(session.plan)
    && Array.isArray(session.timeline)
    && session.timeline.every(isTimelineStep)
    && (typeof session.currentStepId === 'string' || session.currentStepId === null)
    && isFiniteNumber(session.stepStartedAt)
    && isFiniteNumber(session.stepDurationSeconds)
    && isFiniteNumber(session.delayMinutes)
    && typeof session.route === 'string'
    && (isFiniteNumber(session.lastRecalculatedAt) || session.lastRecalculatedAt === null)
    && isFiniteNumber(session.updatedAt);
}

function isScheduledProgressNotification(value: unknown): value is ScheduledProgressNotification {
  if (!value || typeof value !== 'object') return false;
  const notification = value as Partial<ScheduledProgressNotification>;
  return typeof notification.identifier === 'string'
    && typeof notification.key === 'string'
    && (notification.kind === 'prep-start' || notification.kind === 'step-end' || notification.kind === 'departure')
    && (typeof notification.stepId === 'string' || notification.stepId === null)
    && isFiniteNumber(notification.fireAt);
}

function isScheduleDraft(value: unknown): value is ScheduleDraft {
  if (!value || typeof value !== 'object') return false;
  const schedule = value as Partial<ScheduleDraft>;
  return schedule.version === 1
    && typeof schedule.title === 'string'
    && typeof schedule.appointmentTime === 'string'
    && typeof schedule.destination === 'string'
    && (schedule.destinationCoordinate === undefined
      || schedule.destinationCoordinate === null
      || (typeof schedule.destinationCoordinate === 'object'
        && isFiniteNumber(schedule.destinationCoordinate?.latitude)
        && isFiniteNumber(schedule.destinationCoordinate?.longitude)))
    && typeof schedule.transport === 'string'
    && Array.isArray(schedule.routines);
}

function isSchedulePlan(value: unknown): value is SchedulePlan {
  if (!value || typeof value !== 'object') return false;
  const plan = value as Partial<SchedulePlan>;
  return isFiniteNumber(plan.preparationMinutes)
    && isFiniteNumber(plan.travelMinutes)
    && isFiniteNumber(plan.bufferMinutes)
    && typeof plan.prepStart === 'string'
    && typeof plan.departure === 'string'
    && typeof plan.arrival === 'string'
    && !!plan.status
    && Array.isArray(plan.timeline)
    && plan.timeline.every(isTimelineStep);
}

function isTimelineStep(value: unknown): value is TimelineStep {
  if (!value || typeof value !== 'object') return false;
  const step = value as Partial<TimelineStep>;
  return typeof step.id === 'string'
    && typeof step.time === 'string'
    && typeof step.title === 'string'
    && isFiniteNumber(step.duration)
    && (step.actualDurationMinutes === undefined || isFiniteNumber(step.actualDurationMinutes))
    && (step.status === 'done' || step.status === 'current' || step.status === 'upcoming' || step.status === 'changed');
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
