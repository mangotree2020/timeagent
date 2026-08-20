import { PlanPersonalization } from '@/lib/planning';
import { ProgressSession } from '@/lib/progress-session';
import { ScheduleDraft } from '@/lib/schedule-draft';

export const PERSONALIZATION_STORAGE_KEY = '@on-time/personalization';
const PERSONALIZATION_VERSION = 1;
const MAX_APPLIED_SESSIONS = 50;

export type DurationStat = {
  key: string;
  label: string;
  averageMinutes: number;
  sampleCount: number;
  lastActualMinutes: number;
  lastPlannedMinutes: number;
  updatedAt: number;
};

export type PersonalizationProfile = {
  version: typeof PERSONALIZATION_VERSION;
  enabled: boolean;
  routines: DurationStat[];
  transports: DurationStat[];
  appliedSessionIds: string[];
};

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
  removeItem: (key: string) => Promise<unknown>;
};

export function createDefaultPersonalizationProfile(): PersonalizationProfile {
  return { version: PERSONALIZATION_VERSION, enabled: true, routines: [], transports: [], appliedSessionIds: [] };
}

export function learnFromCompletedSession(
  profile: PersonalizationProfile,
  session: ProgressSession,
): { profile: PersonalizationProfile; learnedCount: number } {
  if (!profile.enabled || session.state !== 'completed' || profile.appliedSessionIds.includes(session.sessionId)) {
    return { profile, learnedCount: 0 };
  }

  const routineById = new Map(session.schedule.routines.map((routine) => [routine.id, routine]));
  let routines = profile.routines;
  let learnedCount = 0;

  // Only preparation steps are learned. The journey is not: it now comes from a live route to the
  // appointment's own destination, and an average over trips to different places taught the plan
  // nothing anyone could act on.
  for (const step of session.timeline) {
    if (!step.actualDurationMinutes) continue;
    const routine = routineById.get(step.id);
    if (!routine) continue;
    routines = upsertStat(routines, {
      key: routine.id,
      label: routine.label,
      actualMinutes: step.actualDurationMinutes,
      plannedMinutes: step.duration,
      updatedAt: session.updatedAt,
    });
    learnedCount += 1;
  }

  return {
    learnedCount,
    profile: {
      ...profile,
      routines,
      // Emptied rather than carried: rows learned before this change would otherwise sit in the
      // settings list forever, describing journeys the planner no longer listens to.
      transports: [],
      appliedSessionIds: [...profile.appliedSessionIds, session.sessionId].slice(-MAX_APPLIED_SESSIONS),
    },
  };
}

export function createPlanPersonalization(
  profile: PersonalizationProfile,
  draft: ScheduleDraft,
): PlanPersonalization | undefined {
  if (!profile.enabled) return undefined;
  const routineKeys = new Set(draft.routines.map((routine) => routine.id));
  const routineMinutes = Object.fromEntries(profile.routines
    .filter((stat) => routineKeys.has(stat.key))
    .map((stat) => [stat.key, { minutes: recommendedMinutes(stat.averageMinutes), samples: stat.sampleCount }]));
  if (Object.keys(routineMinutes).length === 0) return undefined;
  return { routineMinutes };
}

export async function loadPersonalizationProfile(storage: StorageLike): Promise<PersonalizationProfile> {
  const raw = await storage.getItem(PERSONALIZATION_STORAGE_KEY);
  if (!raw) return createDefaultPersonalizationProfile();
  try {
    const parsed: unknown = JSON.parse(raw);
    // Journeys recorded by older builds are shed on load: the settings list must not keep showing
    // `자가용 이동` rows for a thing the planner no longer learns.
    return isProfile(parsed) ? { ...parsed, transports: [] } : createDefaultPersonalizationProfile();
  } catch {
    return createDefaultPersonalizationProfile();
  }
}

export async function savePersonalizationProfile(storage: StorageLike, profile: PersonalizationProfile) {
  await storage.setItem(PERSONALIZATION_STORAGE_KEY, JSON.stringify(profile));
}

export async function clearPersonalizationProfile(storage: StorageLike) {
  await storage.removeItem(PERSONALIZATION_STORAGE_KEY);
}

function upsertStat(
  stats: DurationStat[],
  observation: { key: string; label: string; actualMinutes: number; plannedMinutes: number; updatedAt: number },
) {
  const current = stats.find((stat) => stat.key === observation.key);
  const next: DurationStat = current
    ? {
        ...current,
        label: observation.label,
        averageMinutes: roundOne((current.averageMinutes * current.sampleCount + observation.actualMinutes) / (current.sampleCount + 1)),
        sampleCount: current.sampleCount + 1,
        lastActualMinutes: observation.actualMinutes,
        lastPlannedMinutes: observation.plannedMinutes,
        updatedAt: observation.updatedAt,
      }
    : {
        key: observation.key,
        label: observation.label,
        averageMinutes: observation.actualMinutes,
        sampleCount: 1,
        lastActualMinutes: observation.actualMinutes,
        lastPlannedMinutes: observation.plannedMinutes,
        updatedAt: observation.updatedAt,
      };
  return [...stats.filter((stat) => stat.key !== observation.key), next];
}

function recommendedMinutes(value: number) {
  return Math.min(120, Math.max(1, Math.round(value)));
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function isProfile(value: unknown): value is PersonalizationProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<PersonalizationProfile>;
  return profile.version === PERSONALIZATION_VERSION
    && typeof profile.enabled === 'boolean'
    && Array.isArray(profile.routines)
    && profile.routines.every(isStat)
    && Array.isArray(profile.transports)
    && profile.transports.every(isStat)
    && Array.isArray(profile.appliedSessionIds)
    && profile.appliedSessionIds.every((id) => typeof id === 'string');
}

function isStat(value: unknown): value is DurationStat {
  if (!value || typeof value !== 'object') return false;
  const stat = value as Partial<DurationStat>;
  return typeof stat.key === 'string'
    && typeof stat.label === 'string'
    && isPositiveNumber(stat.averageMinutes)
    && typeof stat.sampleCount === 'number' && Number.isInteger(stat.sampleCount) && stat.sampleCount > 0
    && isPositiveNumber(stat.lastActualMinutes)
    && isPositiveNumber(stat.lastPlannedMinutes)
    && typeof stat.updatedAt === 'number' && Number.isFinite(stat.updatedAt);
}

function isPositiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
