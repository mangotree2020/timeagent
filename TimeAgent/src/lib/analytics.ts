export const ANALYTICS_STORAGE_KEY = '@on-time/analytics';
const ANALYTICS_VERSION = 1;
const MAX_EVENTS = 500;

export type AnalyticsEventName =
  | 'draft_started'
  | 'draft_completed'
  | 'progress_started'
  | 'notification_opened'
  | 'delay_proposed'
  | 'delay_applied'
  | 'delay_rejected'
  | 'step_completed'
  | 'schedule_completed';

export type AnalyticsEvent = {
  id: string;
  name: AnalyticsEventName;
  at: number;
  properties: Record<string, string | number | boolean | null>;
};

export type AnalyticsStore = {
  version: typeof ANALYTICS_VERSION;
  events: AnalyticsEvent[];
};

export type AnalyticsSummary = {
  eventCount: number;
  scheduleStarts: number;
  scheduleCompletions: number;
  scheduleCompletionRate: number | null;
  averageScheduleCreationSeconds: number | null;
  notificationOpens: number;
  notificationStartRate: number | null;
  delayProposals: number;
  delayApplyRate: number | null;
  delayRejectRate: number | null;
  averageStepErrorMinutes: number | null;
  onTimeArrivalRate: number | null;
};

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
  removeItem: (key: string) => Promise<unknown>;
};

let writeQueue: Promise<void> = Promise.resolve();

export function createEmptyAnalyticsStore(): AnalyticsStore {
  return { version: ANALYTICS_VERSION, events: [] };
}

export async function loadAnalyticsStore(storage: StorageLike): Promise<AnalyticsStore> {
  const raw = await storage.getItem(ANALYTICS_STORAGE_KEY);
  if (!raw) return createEmptyAnalyticsStore();
  try {
    const value: unknown = JSON.parse(raw);
    return isAnalyticsStore(value) ? value : createEmptyAnalyticsStore();
  } catch {
    return createEmptyAnalyticsStore();
  }
}

export function recordAnalyticsEvent(
  storage: StorageLike,
  name: AnalyticsEventName,
  properties: AnalyticsEvent['properties'] = {},
  at = Date.now(),
) {
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const store = await loadAnalyticsStore(storage);
    const event: AnalyticsEvent = { id: `${at}-${store.events.length}`, name, at, properties };
    await storage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify({
      version: ANALYTICS_VERSION,
      events: [...store.events, event].slice(-MAX_EVENTS),
    } satisfies AnalyticsStore));
  });
  return writeQueue;
}

export async function clearAnalyticsStore(storage: StorageLike) {
  await writeQueue.catch(() => undefined);
  await storage.removeItem(ANALYTICS_STORAGE_KEY);
}

export function summarizeAnalytics(store: AnalyticsStore): AnalyticsSummary {
  const byName = (name: AnalyticsEventName) => store.events.filter((event) => event.name === name);
  const starts = byName('draft_started');
  const completions = byName('draft_completed');
  const creationDurations: number[] = [];
  let startCursor = 0;
  for (const completion of completions) {
    while (startCursor + 1 < starts.length && starts[startCursor + 1].at <= completion.at) startCursor += 1;
    const start = starts[startCursor];
    if (start && start.at <= completion.at) creationDurations.push((completion.at - start.at) / 1000);
  }
  const notificationOpens = byName('notification_opened').length;
  const notificationStarts = byName('progress_started').filter((event) => event.properties.source === 'notification').length;
  const proposals = byName('delay_proposed').length;
  const applied = byName('delay_applied').length;
  const rejected = byName('delay_rejected').length;
  const stepErrors = byName('step_completed').map((event) => {
    const actual = event.properties.actualMinutes;
    const planned = event.properties.plannedMinutes;
    return typeof actual === 'number' && typeof planned === 'number' ? Math.abs(actual - planned) : null;
  }).filter((value): value is number => value !== null);
  const arrivals = byName('schedule_completed').map((event) => event.properties.onTime).filter((value): value is boolean => typeof value === 'boolean');

  return {
    eventCount: store.events.length,
    scheduleStarts: starts.length,
    scheduleCompletions: completions.length,
    scheduleCompletionRate: rate(completions.length, starts.length),
    averageScheduleCreationSeconds: average(creationDurations),
    notificationOpens,
    notificationStartRate: rate(notificationStarts, notificationOpens),
    delayProposals: proposals,
    delayApplyRate: rate(applied, proposals),
    delayRejectRate: rate(rejected, proposals),
    averageStepErrorMinutes: average(stepErrors),
    onTimeArrivalRate: rate(arrivals.filter(Boolean).length, arrivals.length),
  };
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length * 10) / 10;
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? Math.min(100, Math.round(numerator / denominator * 100)) : null;
}

function isAnalyticsStore(value: unknown): value is AnalyticsStore {
  if (!value || typeof value !== 'object') return false;
  const store = value as Partial<AnalyticsStore>;
  return store.version === ANALYTICS_VERSION
    && Array.isArray(store.events)
    && store.events.every((event) => Boolean(event)
      && typeof event === 'object'
      && typeof event.id === 'string'
      && typeof event.at === 'number'
      && typeof event.name === 'string'
      && Boolean(event.properties)
      && typeof event.properties === 'object');
}
