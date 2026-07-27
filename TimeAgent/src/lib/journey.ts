export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type GeocodedPlace = {
  name: string;
  roadAddress: string;
  jibunAddress: string;
  coordinate: Coordinate;
};

export type RouteManeuver = {
  id: string;
  coordinate: Coordinate;
  instruction: string;
  type: string;
};

export type RoutePlan = {
  provider: 'tmap' | 'fixture';
  mode: 'walk';
  origin: Coordinate;
  destination: Coordinate;
  durationSeconds: number;
  distanceMeters: number;
  path: Coordinate[];
  calculatedAt: string;
  stale: boolean;
  maneuvers: RouteManeuver[];
};

export type JourneyLocation = {
  coordinate: Coordinate;
  accuracyMeters: number | null;
  headingDegrees: number | null;
  capturedAt: number;
};

export type WalkingRouteRequest = {
  origin: Coordinate;
  destination: Coordinate;
  startName?: string;
  endName?: string;
  signal?: AbortSignal;
};

export interface GeocodingProvider {
  geocode(query: string, signal?: AbortSignal): Promise<GeocodedPlace[]>;
}

export interface RouteProvider {
  getWalkingRoute(request: WalkingRouteRequest): Promise<RoutePlan>;
}

export interface LocationProvider {
  getCurrentLocation(): Promise<JourneyLocation>;
}

export interface MapAdapter {
  focusCurrentLocation(location: JourneyLocation): void;
  renderRoute(route: RoutePlan): void;
}

export interface VoiceGuidePort {
  speak(maneuver: RouteManeuver, journey?: JourneyState): Promise<void>;
  stop(): Promise<void>;
}

export type JourneyStatus = 'ready' | 'stale' | 'offline' | 'error' | 'permission-denied';

export type JourneyScheduleStatus =
  | { kind: 'buffer'; seconds: number }
  | { kind: 'late'; seconds: number };

export type JourneyState = {
  status: JourneyStatus;
  route: RoutePlan;
  location: JourneyLocation;
  appointmentAt: number;
  remainingDistanceMeters: number;
  remainingDurationSeconds: number;
  appointmentRemainingSeconds: number;
  expectedArrivalAt: number;
  scheduleStatus: JourneyScheduleStatus;
  nextManeuver: RouteManeuver | null;
  lastSuccessfulRouteAt: number;
  updatedAt: number;
  message: string;
};

const LOCATION_STALE_AFTER_MS = 30_000;
const EARTH_RADIUS_METERS = 6_371_000;

export function createJourneyState({
  route,
  location,
  appointmentAt,
  now = Date.now(),
}: {
  route: RoutePlan;
  location: JourneyLocation;
  appointmentAt: number;
  now?: number;
}): JourneyState {
  const remaining = getJourneyRemaining(route, location.coordinate);
  const timing = getJourneyTiming(appointmentAt, remaining.remainingDurationSeconds, now);
  const ageSeconds = Math.max(0, Math.floor((now - location.capturedAt) / 1000));
  const stale = route.stale || now - location.capturedAt > LOCATION_STALE_AFTER_MS;

  return {
    status: stale ? 'stale' : 'ready',
    route,
    location,
    appointmentAt,
    ...remaining,
    ...timing,
    nextManeuver: findNextManeuver(route, location.coordinate),
    lastSuccessfulRouteAt: Date.parse(route.calculatedAt),
    updatedAt: now,
    message: stale
      ? `현재 위치가 ${ageSeconds}초 전 정보입니다. 경로와 다음 행동은 마지막 확인값으로 안내합니다.`
      : '현재 위치와 경로가 최신 상태입니다.',
  };
}

export function refreshJourneyLocation(
  state: JourneyState,
  location: JourneyLocation,
  now = Date.now(),
): JourneyState {
  return createJourneyState({
    route: state.route,
    location,
    appointmentAt: state.appointmentAt,
    now,
  });
}

export function markJourneyUnavailable(
  state: JourneyState,
  reason: 'offline' | 'error' | 'permission-denied',
  now = Date.now(),
): JourneyState {
  const messages = {
    offline: '네트워크에 연결되지 않아 마지막 경로와 다음 행동을 유지합니다.',
    error: '경로를 갱신하지 못해 마지막 경로와 다음 행동을 유지합니다.',
    'permission-denied': '위치 권한이 없어 마지막 위치 기준 경로를 표시합니다.',
  } as const;

  return {
    ...state,
    status: reason,
    updatedAt: now,
    message: messages[reason],
  };
}

export function createFallbackWalkingRoute({
  origin,
  destination,
  calculatedAt = new Date().toISOString(),
}: {
  origin: Coordinate;
  destination: Coordinate;
  calculatedAt?: string;
}): RoutePlan {
  const distanceMeters = Math.max(1, Math.round(distanceBetween(origin, destination)));
  return {
    provider: 'fixture',
    mode: 'walk',
    origin,
    destination,
    distanceMeters,
    durationSeconds: Math.max(60, Math.round(distanceMeters / 1.2)),
    path: [origin, destination],
    calculatedAt,
    stale: true,
    maneuvers: [{
      id: 'fallback-destination',
      coordinate: destination,
      instruction: '네트워크 연결을 확인하며 목적지 방향으로 이동하세요.',
      type: 'fallback',
    }],
  };
}

export function getNextAppointmentAt(clock: string, now = Date.now()) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!match) return now + 60 * 60_000;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return now + 60 * 60_000;
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  if (next.getTime() <= now) next.setDate(next.getDate() + 1);
  return next.getTime();
}

export function formatJourneyDistance(distanceMeters: number) {
  const safe = Math.max(0, Math.round(distanceMeters));
  if (safe < 1000) return `${safe}m`;
  const kilometers = safe / 1000;
  return `${kilometers < 10 ? kilometers.toFixed(1) : Math.round(kilometers)}km`;
}

export function buildJourneyVoiceMessage(maneuver: RouteManeuver, journey: JourneyState) {
  const minutes = Math.max(1, Math.ceil(journey.remainingDurationSeconds / 60));
  const distance = journey.remainingDistanceMeters < 1000
    ? `${Math.max(0, Math.round(journey.remainingDistanceMeters))}미터`
    : `${(journey.remainingDistanceMeters / 1000).toFixed(1)}킬로미터`;
  return `${maneuver.instruction} 도착까지 약 ${minutes}분, 남은 거리는 ${distance}입니다.`;
}

export function getJourneyRemaining(route: RoutePlan, current: Coordinate) {
  if (route.path.length < 2 || route.distanceMeters <= 0 || route.durationSeconds <= 0) {
    return {
      remainingDistanceMeters: Math.max(0, route.distanceMeters),
      remainingDurationSeconds: Math.max(0, route.durationSeconds),
    };
  }

  const nearestIndex = findNearestCoordinateIndex(route.path, current);
  const totalGeometryMeters = pathDistance(route.path);
  const remainingGeometryMeters = pathDistance(route.path.slice(nearestIndex));
  const ratio = totalGeometryMeters > 0
    ? Math.min(1, Math.max(0, remainingGeometryMeters / totalGeometryMeters))
    : 1;

  return {
    remainingDistanceMeters: Math.round(route.distanceMeters * ratio),
    remainingDurationSeconds: Math.round(route.durationSeconds * ratio),
  };
}

function getJourneyTiming(appointmentAt: number, durationSeconds: number, now: number) {
  const appointmentRemainingSeconds = Math.max(0, Math.floor((appointmentAt - now) / 1000));
  const difference = appointmentRemainingSeconds - durationSeconds;
  return {
    appointmentRemainingSeconds,
    expectedArrivalAt: now + durationSeconds * 1000,
    scheduleStatus: difference >= 0
      ? { kind: 'buffer' as const, seconds: difference }
      : { kind: 'late' as const, seconds: Math.abs(difference) },
  };
}

function findNextManeuver(route: RoutePlan, current: Coordinate) {
  if (route.maneuvers.length === 0) return null;
  const nearestPathIndex = findNearestCoordinateIndex(route.path, current);
  return route.maneuvers.find((maneuver) =>
    findNearestCoordinateIndex(route.path, maneuver.coordinate) >= nearestPathIndex
  ) ?? route.maneuvers.at(-1) ?? null;
}

function findNearestCoordinateIndex(path: Coordinate[], coordinate: Coordinate) {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  path.forEach((point, index) => {
    const distance = distanceBetween(point, coordinate);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });
  return nearestIndex;
}

function pathDistance(path: Coordinate[]) {
  return path.slice(1).reduce((total, point, index) =>
    total + distanceBetween(path[index], point), 0);
}

function distanceBetween(a: Coordinate, b: Coordinate) {
  const latitudeA = degreesToRadians(a.latitude);
  const latitudeB = degreesToRadians(b.latitude);
  const latitudeDelta = degreesToRadians(b.latitude - a.latitude);
  const longitudeDelta = degreesToRadians(b.longitude - a.longitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

function degreesToRadians(value: number) {
  return value * Math.PI / 180;
}
