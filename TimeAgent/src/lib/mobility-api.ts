import {
  Coordinate,
  GeocodedPlace,
  GeocodingProvider,
  RouteManeuver,
  RoutePlan,
  RouteProvider,
  WalkingRouteRequest,
} from '@/lib/journey';

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

export class SupabaseMobilityProvider implements GeocodingProvider, RouteProvider {
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
    && value.places.every((place) => isRecord(place)
      && typeof place.name === 'string'
      && typeof place.roadAddress === 'string'
      && typeof place.jibunAddress === 'string'
      && isCoordinate(place.coordinate));
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
