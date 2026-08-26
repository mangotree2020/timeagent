import {
  Coordinate,
  GeocodedPlace,
  GeocodingProvider,
  PlaceSearchProvider,
  RouteManeuver,
  RoutePlan,
  RouteProvider,
  WalkingRouteRequest,
} from '@/lib/journey';
import {
  TransitArrival,
  TransitArrivalProvider,
  TransitArrivalRequest,
  TransitArrivalResult,
} from '@/lib/transit-arrival';
import { TransitLeg, TransitRouteDetail } from '@/lib/transit-route';
import {
  isRoutedTransportMode,
  TransitBoarding,
  TransitStop,
  TravelEstimate,
  TravelEstimateBasis,
  TravelEstimateRequest,
  TravelEstimates,
} from '@/lib/travel-estimate';

type MobilityResponse = Pick<Response, 'ok' | 'status' | 'json'>;
type MobilityFetcher = (input: string, init: RequestInit) => Promise<MobilityResponse>;

type MobilityApiErrorCode =
  | 'CONFIGURATION_ERROR'
  | 'INVALID_QUERY'
  | 'INVALID_RESPONSE'
  | 'NETWORK_UNAVAILABLE'
  | 'REQUEST_TIMEOUT'
  | 'UPSTREAM_REJECTED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'SERVICE_NOT_CONFIGURED'
  | 'SERVICE_UNAVAILABLE';

type ErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
  };
};

export class MobilityApiError extends Error {
  readonly name = 'MobilityApiError';

  constructor(
    message: string,
    readonly code: MobilityApiErrorCode,
    readonly retryable: boolean,
    readonly status: number | null,
  ) {
    super(message);
  }
}

export class SupabaseMobilityProvider implements GeocodingProvider, PlaceSearchProvider, RouteProvider, TransitArrivalProvider {
  private readonly baseUrl: string;
  private readonly fetcher: MobilityFetcher;
  private readonly timeoutMs: number;

  constructor({
    baseUrl,
    fetcher = fetch,
    timeoutMs = 10_000,
  }: {
    baseUrl: string;
    fetcher?: MobilityFetcher;
    timeoutMs?: number;
  }) {
    const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
    if (!normalizedBaseUrl.startsWith('https://')) {
      throw new MobilityApiError(
        'Mobility API HTTPS 주소가 설정되지 않았습니다.',
        'CONFIGURATION_ERROR',
        false,
        null,
      );
    }
    this.baseUrl = normalizedBaseUrl;
    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
  }

  async geocode(query: string, signal?: AbortSignal): Promise<GeocodedPlace[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      throw new MobilityApiError('검색할 주소를 입력해 주세요.', 'INVALID_QUERY', false, 400);
    }

    const payload = await this.requestJson(
      `/v1/geocode?query=${encodeURIComponent(normalizedQuery)}`,
      { method: 'GET' },
      signal,
    );
    if (!isGeocodingResponse(payload)) {
      throw new MobilityApiError('주소 검색 응답 형식이 올바르지 않습니다.', 'INVALID_RESPONSE', false, 200);
    }
    return payload.places;
  }

  async searchPlaces(query: string, near?: Coordinate, signal?: AbortSignal): Promise<GeocodedPlace[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      throw new MobilityApiError('검색할 장소명을 입력해 주세요.', 'INVALID_QUERY', false, 400);
    }
    let path = `/v1/places?query=${encodeURIComponent(normalizedQuery)}`;
    if (near) {
      path += `&latitude=${encodeURIComponent(String(near.latitude))}&longitude=${encodeURIComponent(String(near.longitude))}`;
    }
    const payload = await this.requestJson(path, { method: 'GET' }, signal);
    if (!isGeocodingResponse(payload)) {
      throw new MobilityApiError('장소 검색 응답 형식이 올바르지 않습니다.', 'INVALID_RESPONSE', false, 200);
    }
    return payload.places;
  }

  async reverseGeocode(coordinate: Coordinate, signal?: AbortSignal): Promise<GeocodedPlace> {
    const params = new URLSearchParams({
      latitude: String(coordinate.latitude),
      longitude: String(coordinate.longitude),
    });
    const payload = await this.requestJson(`/v1/reverse-geocode?${params.toString()}`, { method: 'GET' }, signal);
    if (!isRecord(payload) || !isGeocodedPlace(payload.place)) {
      throw new MobilityApiError('지도 위치의 주소 응답 형식이 올바르지 않습니다.', 'INVALID_RESPONSE', false, 200);
    }
    return payload.place;
  }

  async getWalkingRoute(request: WalkingRouteRequest): Promise<RoutePlan> {
    const payload = await this.requestJson('/v1/routes/walk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: request.origin,
        destination: request.destination,
        startName: request.startName,
        endName: request.endName,
      }),
    }, request.signal);
    if (!isRoutePlan(payload)) {
      throw new MobilityApiError('도보 경로 응답 형식이 올바르지 않습니다.', 'INVALID_RESPONSE', false, 200);
    }
    return payload;
  }

  /**
   * How long the journey takes by each way of making it. Modes the providers could not answer for
   * are simply absent, which the caller reads as "use the distance arithmetic for that one" rather
   * than as a failure worth showing anyone.
   */
  async getTravelEstimates(request: TravelEstimateRequest): Promise<TravelEstimates> {
    const payload = await this.requestJson('/v1/routes/estimates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: request.origin,
        destination: request.destination,
        modes: request.modes,
        departureAt: request.departureAt,
        // This client resolves legs only when a map or near-departure arrival actually needs them.
        transitSummaryOnly: true,
      }),
    }, request.signal);
    return parseTravelEstimates(payload);
  }

  /**
   * The full transit itineraries — legs, stops, drawn shapes — for the screens that show them.
   * Asked only when such a screen opens; the plan itself is made from the summary.
   */
  async getTransitRouteDetails(request: TravelEstimateRequest): Promise<TransitRouteDetail[]> {
    const payload = await this.requestJson('/v1/routes/transit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: request.origin, destination: request.destination, departureAt: request.departureAt }),
    }, request.signal);
    const routes = isRecord(payload) && Array.isArray(payload.routes) ? payload.routes.flatMap((route) => parseTransitRouteDetail(route) ?? []) : null;
    if (!routes) {
      throw new MobilityApiError('대중교통 경로 응답 형식이 올바르지 않습니다.', 'INVALID_RESPONSE', false, 200);
    }
    return routes;
  }

  /**
   * Live arrivals at the first stop of the chosen route. The answer is one of three shapes and all
   * three are answers: live arrivals, "this provider has nothing here", or "the provider did not
   * answer" — the caller keeps its last valid arrivals in that last case.
   */
  async getTransitArrival(request: TransitArrivalRequest): Promise<TransitArrivalResult> {
    const payload = await this.requestJson('/v1/arrivals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boarding: request.boarding }),
    }, request.signal);
    const arrival = isRecord(payload) ? parseTransitArrival(payload.arrival) : null;
    if (!arrival) {
      throw new MobilityApiError('도착정보 응답 형식이 올바르지 않습니다.', 'INVALID_RESPONSE', false, 200);
    }
    return arrival;
  }

  private async requestJson(path: string, init: RequestInit, externalSignal?: AbortSignal) {
    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw createResponseError(payload, response.status);
      return payload;
    } catch (error) {
      if (error instanceof MobilityApiError) throw error;
      if (timedOut) {
        throw new MobilityApiError('교통 정보 요청 시간이 초과되었습니다.', 'REQUEST_TIMEOUT', true, null);
      }
      throw new MobilityApiError('네트워크에 연결할 수 없습니다.', 'NETWORK_UNAVAILABLE', true, null);
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', onAbort);
    }
  }
}

export function createConfiguredMobilityProvider() {
  return new SupabaseMobilityProvider({
    baseUrl: process.env.EXPO_PUBLIC_MOBILITY_API_BASE_URL ?? '',
  });
}

function createResponseError(payload: unknown, status: number) {
  const apiError = isErrorPayload(payload) ? payload.error : undefined;
  const code = normalizeErrorCode(apiError?.code, status);
  const retryable = apiError?.retryable ?? (status === 429 || status >= 500);
  const message = apiError?.message || (retryable
    ? '교통 정보를 일시적으로 불러오지 못했습니다.'
    : '요청한 장소 또는 경로를 확인할 수 없습니다.');
  return new MobilityApiError(message, code, retryable, status);
}

function normalizeErrorCode(value: string | undefined, status: number): MobilityApiErrorCode {
  const allowed: MobilityApiErrorCode[] = [
    'CONFIGURATION_ERROR',
    'INVALID_QUERY',
    'INVALID_RESPONSE',
    'NETWORK_UNAVAILABLE',
    'REQUEST_TIMEOUT',
    'UPSTREAM_REJECTED',
    'UPSTREAM_UNAVAILABLE',
    'SERVICE_NOT_CONFIGURED',
    'SERVICE_UNAVAILABLE',
  ];
  if (value && allowed.includes(value as MobilityApiErrorCode)) return value as MobilityApiErrorCode;
  return status === 429 || status >= 500 ? 'UPSTREAM_UNAVAILABLE' : 'UPSTREAM_REJECTED';
}

function isErrorPayload(value: unknown): value is ErrorPayload {
  if (!isRecord(value) || !isRecord(value.error)) return false;
  return value.error.code === undefined || typeof value.error.code === 'string';
}

function isGeocodingResponse(value: unknown): value is { places: GeocodedPlace[] } {
  return isRecord(value)
    && Array.isArray(value.places)
    && value.places.every(isGeocodedPlace);
}

function isGeocodedPlace(place: unknown): place is GeocodedPlace {
  return isRecord(place)
    && typeof place.name === 'string'
    && typeof place.roadAddress === 'string'
    && typeof place.jibunAddress === 'string'
    && isCoordinate(place.coordinate);
}

/**
 * Reads back only what the providers actually answered. A mode with a nonsensical time is dropped
 * rather than repaired: the caller has honest arithmetic to fall back on, and a plan built on a
 * mangled number is worse than one built on an estimate that says it is an estimate.
 */
function parseTravelEstimates(value: unknown): TravelEstimates {
  const source = (value as { estimates?: unknown })?.estimates;
  if (!source || typeof source !== 'object') return {};
  const estimates: TravelEstimates = {};
  for (const [mode, raw] of Object.entries(source as Record<string, unknown>)) {
    if (!isRoutedTransportMode(mode) || !raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const minutes = Number(entry.minutes);
    const distanceMeters = Number(entry.distanceMeters);
    if (!Number.isFinite(minutes) || minutes <= 0) continue;
    const estimate: TravelEstimate = {
      mode,
      minutes: Math.round(minutes),
      distanceMeters: Number.isFinite(distanceMeters) && distanceMeters >= 0 ? Math.round(distanceMeters) : 0,
      source: 'route',
      provider: typeof entry.provider === 'string' ? entry.provider : undefined,
      calculatedAt: typeof entry.calculatedAt === 'string' ? entry.calculatedAt : undefined,
    };
    const fareWon = Number(entry.fareWon);
    if (Number.isFinite(fareWon) && fareWon > 0) estimate.fareWon = Math.round(fareWon);
    const transferCount = Number(entry.transferCount);
    if (Number.isInteger(transferCount) && transferCount >= 0) estimate.transferCount = transferCount;
    const walkMinutes = Number(entry.walkMinutes);
    if (Number.isFinite(walkMinutes) && walkMinutes >= 0) estimate.walkMinutes = Math.round(walkMinutes);
    if (isEstimateBasis(entry.basis)) estimate.basis = entry.basis;
    if (typeof entry.departureAt === 'string' && Number.isFinite(Date.parse(entry.departureAt))) estimate.departureAt = entry.departureAt;
    if (entry.firstBoarding !== undefined) estimate.firstBoarding = parseTransitBoarding(entry.firstBoarding);
    estimates[mode] = estimate;
  }
  return estimates;
}

function isEstimateBasis(value: unknown): value is TravelEstimateBasis {
  return value === 'timetable' || value === 'traffic' || value === 'measured';
}

/** The first boarding as the server described it, or null when it is missing or malformed. */
function parseTransitBoarding(value: unknown): TransitBoarding | null {
  if (!isRecord(value)) return null;
  const mode = value.mode;
  const stop = value.stop;
  if ((mode !== '버스' && mode !== '지하철') || typeof value.routeName !== 'string' || !value.routeName || !isRecord(stop)) return null;
  if (typeof stop.name !== 'string' || !stop.name) return null;
  const walkMinutesToStop = Number(value.walkMinutesToStop);
  const boarding: TransitBoarding = {
    mode,
    routeName: value.routeName,
    stop: { name: stop.name, coordinate: isCoordinate(stop.coordinate) ? stop.coordinate : null },
    walkMinutesToStop: Number.isFinite(walkMinutesToStop) && walkMinutesToStop >= 0 ? Math.round(walkMinutesToStop) : 0,
  };
  if (typeof value.routeId === 'string' && value.routeId) boarding.routeId = value.routeId;
  if (typeof stop.stationId === 'string' && stop.stationId) boarding.stop.stationId = stop.stationId;
  return boarding;
}

function parseTransitStop(value: unknown): TransitStop | null {
  if (!isRecord(value) || typeof value.name !== 'string' || !value.name) return null;
  const stop: TransitStop = { name: value.name, coordinate: isCoordinate(value.coordinate) ? value.coordinate : null };
  if (typeof value.stationId === 'string' && value.stationId) stop.stationId = value.stationId;
  return stop;
}

function parseTransitLeg(value: unknown): TransitLeg | null {
  if (!isRecord(value)) return null;
  const mode = value.mode;
  if (mode !== '도보' && mode !== '버스' && mode !== '지하철' && mode !== '기타') return null;
  const from = parseTransitStop(value.from);
  const to = parseTransitStop(value.to);
  const minutes = Number(value.minutes);
  const distanceMeters = Number(value.distanceMeters);
  if (!from || !to || !Number.isFinite(minutes) || minutes < 0) return null;
  const leg: TransitLeg = { mode, minutes: Math.round(minutes), distanceMeters: Number.isFinite(distanceMeters) && distanceMeters >= 0 ? Math.round(distanceMeters) : 0, from, to };
  if (typeof value.routeName === 'string' && value.routeName) leg.routeName = value.routeName;
  if (typeof value.routeId === 'string' && value.routeId) leg.routeId = value.routeId;
  if (Array.isArray(value.stops)) {
    const stops = value.stops.flatMap((stop) => parseTransitStop(stop) ?? []);
    if (stops.length) leg.stops = stops;
  }
  if (Array.isArray(value.path)) {
    const path = value.path.filter(isCoordinate);
    if (path.length >= 2) leg.path = path;
  }
  return leg;
}

/** One detailed itinerary as the server sent it, or null when it cannot be trusted. */
function parseTransitRouteDetail(value: unknown): TransitRouteDetail | null {
  if (!isRecord(value)) return null;
  const mode = value.mode;
  const minutes = Number(value.minutes);
  if ((mode !== '버스' && mode !== '지하철') || !Number.isFinite(minutes) || minutes <= 0 || !Array.isArray(value.legs)) return null;
  if (typeof value.calculatedAt !== 'string' || !Number.isFinite(Date.parse(value.calculatedAt))) return null;
  const legs = value.legs.flatMap((leg) => parseTransitLeg(leg) ?? []);
  const distanceMeters = Number(value.distanceMeters);
  const transferCount = Number(value.transferCount);
  const walkMinutes = Number(value.walkMinutes);
  const fareWon = Number(value.fareWon);
  const route: TransitRouteDetail = {
    mode,
    pathType: Number.isFinite(Number(value.pathType)) ? Number(value.pathType) : 0,
    minutes: Math.round(minutes),
    distanceMeters: Number.isFinite(distanceMeters) && distanceMeters >= 0 ? Math.round(distanceMeters) : 0,
    transferCount: Number.isInteger(transferCount) && transferCount >= 0 ? transferCount : 0,
    walkMinutes: Number.isFinite(walkMinutes) && walkMinutes >= 0 ? Math.round(walkMinutes) : 0,
    basis: 'timetable',
    provider: 'TMAP',
    calculatedAt: value.calculatedAt,
    firstBoarding: parseTransitBoarding(value.firstBoarding),
    legs,
  };
  if (Number.isFinite(fareWon) && fareWon > 0) route.fareWon = Math.round(fareWon);
  if (typeof value.departureAt === 'string' && Number.isFinite(Date.parse(value.departureAt))) route.departureAt = value.departureAt;
  return route;
}

function parseTransitArrival(value: unknown): TransitArrivalResult | null {
  if (!isRecord(value) || typeof value.checkedAt !== 'string' || !Number.isFinite(Date.parse(value.checkedAt))) return null;
  const provider = typeof value.provider === 'string' && value.provider ? value.provider : 'TAGO';
  const checkedAt = value.checkedAt;
  if (value.status === 'realtime') {
    const stop = value.stop;
    if (!isRecord(stop) || typeof stop.name !== 'string' || !Array.isArray(value.arrivals)) return null;
    const arrivals = value.arrivals.flatMap((item): TransitArrival[] => {
      if (!isRecord(item) || typeof item.routeName !== 'string' || !item.routeName) return [];
      const arrivalInSeconds = Number(item.arrivalInSeconds);
      if (!Number.isFinite(arrivalInSeconds) || arrivalInSeconds < 0 || typeof item.expectedAt !== 'string' || !Number.isFinite(Date.parse(item.expectedAt))) return [];
      const arrival: TransitArrival = { routeName: item.routeName, arrivalInSeconds: Math.round(arrivalInSeconds), expectedAt: item.expectedAt };
      const stopsAway = Number(item.stopsAway);
      if (Number.isInteger(stopsAway) && stopsAway >= 0) arrival.stopsAway = stopsAway;
      if (typeof item.vehicleType === 'string' && item.vehicleType) arrival.vehicleType = item.vehicleType;
      return [arrival];
    });
    return {
      status: 'realtime',
      provider,
      checkedAt,
      stop: { name: stop.name, nodeId: String(stop.nodeId ?? ''), cityCode: String(stop.cityCode ?? '') },
      arrivals,
    };
  }
  if (value.status === 'unsupported') {
    const reason = value.reason;
    if (reason !== 'subway' && reason !== 'no-station' && reason !== 'no-route' && reason !== 'not-configured') return null;
    return { status: 'unsupported', provider, checkedAt, reason };
  }
  if (value.status === 'unavailable') {
    const reason = value.reason;
    if (reason !== 'timeout' && reason !== 'rate-limited' && reason !== 'upstream') return null;
    return { status: 'unavailable', provider, checkedAt, retryable: value.retryable !== false, reason };
  }
  return null;
}

function isRoutePlan(value: unknown): value is RoutePlan {
  return isRecord(value)
    && value.provider === 'tmap'
    && value.mode === 'walk'
    && isCoordinate(value.origin)
    && isCoordinate(value.destination)
    && isNonNegativeNumber(value.durationSeconds)
    && isNonNegativeNumber(value.distanceMeters)
    && Array.isArray(value.path)
    && value.path.length >= 2
    && value.path.every(isCoordinate)
    && typeof value.calculatedAt === 'string'
    && Number.isFinite(Date.parse(value.calculatedAt))
    && typeof value.stale === 'boolean'
    && Array.isArray(value.maneuvers)
    && value.maneuvers.every(isRouteManeuver);
}

function isRouteManeuver(value: unknown): value is RouteManeuver {
  return isRecord(value)
    && typeof value.id === 'string'
    && isCoordinate(value.coordinate)
    && typeof value.instruction === 'string'
    && typeof value.type === 'string';
}

function isCoordinate(value: unknown): value is Coordinate {
  return isRecord(value)
    && isFiniteNumber(value.latitude)
    && value.latitude >= -90
    && value.latitude <= 90
    && isFiniteNumber(value.longitude)
    && value.longitude >= -180
    && value.longitude <= 180;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}
