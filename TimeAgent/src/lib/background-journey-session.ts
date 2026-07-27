import {
  buildJourneyVoiceMessage,
  createJourneyState,
  JourneyLocation,
  JourneyState,
  refreshJourneyLocation,
  RoutePlan,
} from '@/lib/journey';

export const BACKGROUND_JOURNEY_STORAGE_KEY = '@on-time/background-journey';

export type BackgroundVoiceDelivery = 'idle' | 'spoken' | 'notification-fallback' | 'failed';

export type BackgroundJourneySession = {
  version: 1;
  destinationName: string;
  route: RoutePlan;
  appointmentAt: number;
  lastLocation: JourneyLocation;
  lastSpokenManeuverId: string | null;
  lastVoiceDelivery: BackgroundVoiceDelivery;
  enabledAt: number;
  updatedAt: number;
};

export type BackgroundJourneyAdvance = {
  session: BackgroundJourneySession;
  journey: JourneyState;
  arrived: boolean;
  announcement: null | {
    maneuverId: string;
    message: string;
  };
};

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
  removeItem: (key: string) => Promise<unknown>;
};

export function createBackgroundJourneySession({
  journey,
  destinationName,
  now = Date.now(),
}: {
  journey: JourneyState;
  destinationName: string;
  now?: number;
}): BackgroundJourneySession {
  return {
    version: 1,
    destinationName,
    route: journey.route,
    appointmentAt: journey.appointmentAt,
    lastLocation: journey.location,
    lastSpokenManeuverId: null,
    lastVoiceDelivery: 'idle',
    enabledAt: now,
    updatedAt: now,
  };
}

export function advanceBackgroundJourneySession(
  session: BackgroundJourneySession,
  location: JourneyLocation,
  now = Date.now(),
): BackgroundJourneyAdvance {
  const previousJourney = createJourneyState({
    route: session.route,
    location: session.lastLocation,
    appointmentAt: session.appointmentAt,
    now,
  });
  const journey = refreshJourneyLocation(previousJourney, location, now);
  const maneuver = journey.nextManeuver;
  const shouldAnnounce = !!maneuver && maneuver.id !== session.lastSpokenManeuverId;
  return {
    journey,
    arrived: journey.remainingDistanceMeters <= 30,
    announcement: shouldAnnounce ? {
      maneuverId: maneuver.id,
      message: buildJourneyVoiceMessage(maneuver, journey),
    } : null,
    session: {
      ...session,
      lastLocation: location,
      lastSpokenManeuverId: shouldAnnounce ? maneuver.id : session.lastSpokenManeuverId,
      updatedAt: now,
    },
  };
}

export function withBackgroundVoiceDelivery(
  session: BackgroundJourneySession,
  delivery: BackgroundVoiceDelivery,
  now = Date.now(),
) {
  return { ...session, lastVoiceDelivery: delivery, updatedAt: now };
}

export async function loadBackgroundJourneySession(storage: StorageLike) {
  const raw = await storage.getItem(BACKGROUND_JOURNEY_STORAGE_KEY);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isBackgroundJourneySession(value) ? value : null;
  } catch {
    return null;
  }
}

export async function saveBackgroundJourneySession(
  storage: StorageLike,
  session: BackgroundJourneySession,
) {
  await storage.setItem(BACKGROUND_JOURNEY_STORAGE_KEY, JSON.stringify(session));
}

export async function clearBackgroundJourneySession(storage: StorageLike) {
  await storage.removeItem(BACKGROUND_JOURNEY_STORAGE_KEY);
}

function isBackgroundJourneySession(value: unknown): value is BackgroundJourneySession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<BackgroundJourneySession>;
  return session.version === 1
    && typeof session.destinationName === 'string'
    && isRoutePlan(session.route)
    && isFiniteNumber(session.appointmentAt)
    && isJourneyLocation(session.lastLocation)
    && (typeof session.lastSpokenManeuverId === 'string' || session.lastSpokenManeuverId === null)
    && ['idle', 'spoken', 'notification-fallback', 'failed'].includes(session.lastVoiceDelivery ?? '')
    && isFiniteNumber(session.enabledAt)
    && isFiniteNumber(session.updatedAt);
}

function isRoutePlan(value: unknown): value is RoutePlan {
  if (!value || typeof value !== 'object') return false;
  const route = value as Partial<RoutePlan>;
  return (route.provider === 'tmap' || route.provider === 'fixture')
    && route.mode === 'walk'
    && isCoordinate(route.origin)
    && isCoordinate(route.destination)
    && isFiniteNumber(route.durationSeconds)
    && isFiniteNumber(route.distanceMeters)
    && Array.isArray(route.path)
    && route.path.length >= 2
    && route.path.every(isCoordinate)
    && typeof route.calculatedAt === 'string'
    && typeof route.stale === 'boolean'
    && Array.isArray(route.maneuvers)
    && route.maneuvers.every((maneuver) => !!maneuver
      && typeof maneuver === 'object'
      && typeof maneuver.id === 'string'
      && isCoordinate(maneuver.coordinate)
      && typeof maneuver.instruction === 'string'
      && typeof maneuver.type === 'string');
}

function isJourneyLocation(value: unknown): value is JourneyLocation {
  if (!value || typeof value !== 'object') return false;
  const location = value as Partial<JourneyLocation>;
  return isCoordinate(location.coordinate)
    && (location.accuracyMeters === null || isFiniteNumber(location.accuracyMeters))
    && (location.headingDegrees === null || isFiniteNumber(location.headingDegrees))
    && isFiniteNumber(location.capturedAt);
}

function isCoordinate(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const coordinate = value as { latitude?: unknown; longitude?: unknown };
  return isFiniteNumber(coordinate.latitude)
    && coordinate.latitude >= -90
    && coordinate.latitude <= 90
    && isFiniteNumber(coordinate.longitude)
    && coordinate.longitude >= -180
    && coordinate.longitude <= 180;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
