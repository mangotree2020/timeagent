import { MobilityApiError, SupabaseMobilityProvider } from '@/lib/mobility-api';

const baseUrl = 'https://project.supabase.co/functions/v1/mobility';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('SupabaseMobilityProvider', () => {
  it('calls the NAVER geocoding proxy and returns normalized places', async () => {
    const fetcher = jest.fn(async () => jsonResponse({
      places: [{
        name: '서울특별시청',
        roadAddress: '서울특별시 중구 세종대로 110',
        jibunAddress: '서울특별시 중구 태평로1가 31',
        coordinate: { latitude: 37.5666103, longitude: 126.9783882 },
      }],
    }));
    const provider = new SupabaseMobilityProvider({ baseUrl, fetcher });

    const places = await provider.geocode(' 서울 중구 세종대로 110 ');

    expect(fetcher).toHaveBeenCalledWith(
      `${baseUrl}/v1/geocode?query=${encodeURIComponent('서울 중구 세종대로 110')}`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(places[0].coordinate.latitude).toBeCloseTo(37.5666);
  });

  it('calls the TMAP walking proxy and validates RoutePlan', async () => {
    const route = {
      provider: 'tmap',
      mode: 'walk',
      origin: { latitude: 37.5663, longitude: 126.9779 },
      destination: { latitude: 37.5657, longitude: 126.9769 },
      durationSeconds: 209,
      distanceMeters: 246,
      path: [
        { latitude: 37.5663, longitude: 126.9779 },
        { latitude: 37.5657, longitude: 126.9769 },
      ],
      calculatedAt: '2026-07-26T07:30:00.000Z',
      stale: false,
      maneuvers: [{
        id: 'turn-1',
        coordinate: { latitude: 37.566, longitude: 126.977 },
        instruction: '횡단보도를 건너세요.',
        type: 'crosswalk',
      }],
    } as const;
    const fetcher = jest.fn(async (_input: string, _request: RequestInit) => jsonResponse(route));
    const provider = new SupabaseMobilityProvider({ baseUrl, fetcher });

    const result = await provider.getWalkingRoute({
      origin: route.origin,
      destination: route.destination,
      startName: '서울시청',
      endName: '덕수궁',
    });

    expect(result).toEqual(route);
    const [, request] = fetcher.mock.calls[0];
    expect(request.method).toBe('POST');
    expect(JSON.parse(String(request.body))).toEqual(expect.objectContaining({
      origin: route.origin,
      destination: route.destination,
      startName: '서울시청',
      endName: '덕수궁',
    }));
  });

  it('preserves retryable upstream errors for the journey fallback', async () => {
    const fetcher = jest.fn(async () => jsonResponse({
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: '교통 정보를 일시적으로 불러오지 못했습니다.',
        retryable: true,
      },
    }, 503));
    const provider = new SupabaseMobilityProvider({ baseUrl, fetcher });

    await expect(provider.geocode('서울시청')).rejects.toMatchObject({
      name: 'MobilityApiError',
      code: 'UPSTREAM_UNAVAILABLE',
      retryable: true,
      status: 503,
    });
  });

  it('maps a fetch failure to an offline error without leaking provider details', async () => {
    const fetcher = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const provider = new SupabaseMobilityProvider({ baseUrl, fetcher });

    await expect(provider.geocode('서울시청')).rejects.toEqual(expect.objectContaining<Partial<MobilityApiError>>({
      code: 'NETWORK_UNAVAILABLE',
      retryable: true,
      status: null,
    }));
  });

  it('rejects malformed provider data instead of passing it to the UI', async () => {
    const fetcher = jest.fn(async () => jsonResponse({ provider: 'tmap', path: 'invalid' }));
    const provider = new SupabaseMobilityProvider({ baseUrl, fetcher });

    await expect(provider.getWalkingRoute({
      origin: { latitude: 37.5, longitude: 127 },
      destination: { latitude: 37.6, longitude: 127.1 },
    })).rejects.toMatchObject({ code: 'INVALID_RESPONSE', retryable: false });
  });
});
