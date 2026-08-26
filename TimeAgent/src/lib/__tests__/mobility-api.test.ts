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

  it('searches POIs by place name and returns a navigation-style result list', async () => {
    const fetcher = jest.fn(async () => jsonResponse({
      places: [
        {
          name: '서면 볼링센터',
          roadAddress: '부산 부산진구 중앙대로 672',
          jibunAddress: '부산 부산진구 부전동 227-2',
          coordinate: { latitude: 35.1577, longitude: 129.0592 },
        },
        {
          name: '삼정타워 볼링장',
          roadAddress: '부산 부산진구 중앙대로 672 8층',
          jibunAddress: '',
          coordinate: { latitude: 35.1531, longitude: 129.0597 },
        },
      ],
    }));
    const provider = new SupabaseMobilityProvider({ baseUrl, fetcher });

    const places = await provider.searchPlaces(' 서면 볼링장 ', { latitude: 35.16, longitude: 129.06 });

    expect(places).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledWith(
      `${baseUrl}/v1/places?query=${encodeURIComponent('서면 볼링장')}&latitude=35.16&longitude=129.06`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('reverse geocodes a map coordinate into a selectable place', async () => {
    const place = {
      name: '지도에서 지정한 위치',
      roadAddress: '부산 해운대구 센텀서로 30',
      jibunAddress: '부산 해운대구 우동 1468',
      coordinate: { latitude: 35.1731, longitude: 129.127 },
    };
    const fetcher = jest.fn(async () => jsonResponse({ place }));
    const provider = new SupabaseMobilityProvider({ baseUrl, fetcher });

    await expect(provider.reverseGeocode(place.coordinate)).resolves.toEqual(place);
    expect(fetcher).toHaveBeenCalledWith(
      `${baseUrl}/v1/reverse-geocode?latitude=35.1731&longitude=129.127`,
      expect.objectContaining({ method: 'GET' }),
    );
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

describe('journey estimates against the timetable', () => {
  it('sends the expected departure time and reads back basis, walk time and the first boarding', async () => {
    const fetcher = jest.fn(async () => jsonResponse({
      estimates: {
        '버스': {
          mode: '버스', minutes: 30, distanceMeters: 5200, fareWon: 1550, transferCount: 0, walkMinutes: 7,
          source: 'route', provider: 'TMAP', calculatedAt: '2026-08-26T00:00:00.000Z', basis: 'timetable', departureAt: '2026-08-26T09:00:00.000Z',
          firstBoarding: { mode: '버스', routeName: '101', routeId: 'r1', stop: { name: '서면 정류장', coordinate: { latitude: 35.152, longitude: 129.052 }, stationId: '1001' }, walkMinutesToStop: 5 },
        },
        '지하철': { mode: '지하철', minutes: 25, distanceMeters: 6400, source: 'route', provider: 'TMAP', basis: 'timetable', firstBoarding: { mode: '지하철', routeName: '2호선', stop: { name: '서면역' } } },
        '택시': { mode: '택시', minutes: 18, distanceMeters: 6000, fareWon: 9800, source: 'route', provider: 'TMAP', basis: 'traffic', firstBoarding: null },
        '자가용': { mode: '자가용', minutes: 18, distanceMeters: 6000, source: 'route', provider: 'TMAP', basis: 'weather' },
      },
      departureAt: '2026-08-26T09:00:00.000Z',
    }));
    const provider = new SupabaseMobilityProvider({ baseUrl, fetcher });

    const estimates = await provider.getTravelEstimates({
      origin: { latitude: 35.1531, longitude: 129.0597 },
      destination: { latitude: 35.1632, longitude: 129.1635 },
      modes: ['버스', '지하철', '택시', '자가용'],
      departureAt: '2026-08-26T09:00:00.000Z',
    });

    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${baseUrl}/v1/routes/estimates`);
    expect(JSON.parse(String(request.body))).toMatchObject({
      departureAt: '2026-08-26T09:00:00.000Z',
      transitSummaryOnly: true,
    });
    expect(estimates['버스']).toMatchObject({ basis: 'timetable', walkMinutes: 7, departureAt: '2026-08-26T09:00:00.000Z', fareWon: 1550, transferCount: 0 });
    expect(estimates['버스']?.firstBoarding).toEqual({
      mode: '버스', routeName: '101', routeId: 'r1', stop: { name: '서면 정류장', coordinate: { latitude: 35.152, longitude: 129.052 }, stationId: '1001' }, walkMinutesToStop: 5,
    });
    expect(estimates['지하철']?.firstBoarding).toEqual({ mode: '지하철', routeName: '2호선', stop: { name: '서면역', coordinate: null }, walkMinutesToStop: 0 });
    expect(estimates['택시']?.firstBoarding).toBeNull();
    expect(estimates['택시']?.basis).toBe('traffic');
    expect(estimates['자가용']?.basis).toBeUndefined();
  });
});

describe('realtime arrivals for the first boarding', () => {
  const boarding = { mode: '버스' as const, routeName: '101', stop: { name: '서면 정류장', coordinate: { latitude: 35.152, longitude: 129.052 } }, walkMinutesToStop: 5 };

  it('posts the boarding and reads live arrivals back', async () => {
    const fetcher = jest.fn(async () => jsonResponse({
      arrival: {
        status: 'realtime', provider: 'TAGO', checkedAt: '2026-08-26T00:00:00.000Z', stop: { name: '서면정류장', nodeId: 'BSB1001', cityCode: '26' },
        arrivals: [{ routeName: '101', arrivalInSeconds: 240, expectedAt: '2026-08-26T00:04:00.000Z', stopsAway: 2 }, { routeName: '101', arrivalInSeconds: -1, expectedAt: 'x' }],
      },
    }));
    const provider = new SupabaseMobilityProvider({ baseUrl, fetcher });
    const result = await provider.getTransitArrival({ boarding });
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${baseUrl}/v1/arrivals`);
    expect(JSON.parse(String(request.body))).toEqual({ boarding });
    expect(result).toEqual({
      status: 'realtime', provider: 'TAGO', checkedAt: '2026-08-26T00:00:00.000Z', stop: { name: '서면정류장', nodeId: 'BSB1001', cityCode: '26' },
      arrivals: [{ routeName: '101', arrivalInSeconds: 240, expectedAt: '2026-08-26T00:04:00.000Z', stopsAway: 2 }],
    });
  });

  it('passes unsupported and unavailable answers through as answers, and rejects nonsense', async () => {
    const unsupported = new SupabaseMobilityProvider({ baseUrl, fetcher: jest.fn(async () => jsonResponse({ arrival: { status: 'unsupported', provider: 'TAGO', checkedAt: '2026-08-26T00:00:00.000Z', reason: 'subway' } })) });
    expect(await unsupported.getTransitArrival({ boarding })).toEqual({ status: 'unsupported', provider: 'TAGO', checkedAt: '2026-08-26T00:00:00.000Z', reason: 'subway' });

    const unavailable = new SupabaseMobilityProvider({ baseUrl, fetcher: jest.fn(async () => jsonResponse({ arrival: { status: 'unavailable', provider: 'TAGO', checkedAt: '2026-08-26T00:00:00.000Z', reason: 'rate-limited' } })) });
    expect(await unavailable.getTransitArrival({ boarding })).toEqual({ status: 'unavailable', provider: 'TAGO', checkedAt: '2026-08-26T00:00:00.000Z', retryable: true, reason: 'rate-limited' });

    const nonsense = new SupabaseMobilityProvider({ baseUrl, fetcher: jest.fn(async () => jsonResponse({ arrival: { status: 'realtime' } })) });
    await expect(nonsense.getTransitArrival({ boarding })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('keeps a 429 from the arrivals endpoint retryable', async () => {
    const provider = new SupabaseMobilityProvider({ baseUrl, fetcher: jest.fn(async () => jsonResponse({ error: { code: 'UPSTREAM_UNAVAILABLE', retryable: true } }, 429)) });
    await expect(provider.getTransitArrival({ boarding })).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', retryable: true, status: 429 });
  });
});

describe('transit route details for the map', () => {
  it('posts the journey and reads back the itineraries with legs and shapes, dropping malformed ones', async () => {
    const leg = { mode: '버스', minutes: 23, distanceMeters: 4200, routeName: '101', from: { name: '서면 정류장', coordinate: { latitude: 35.152, longitude: 129.052 } }, to: { name: '해운대', coordinate: null }, path: [{ latitude: 35.152, longitude: 129.052 }, { latitude: 35.16, longitude: 129.16 }] };
    const good = { mode: '버스', pathType: 2, minutes: 30, distanceMeters: 5200, fareWon: 1550, transferCount: 0, walkMinutes: 7, basis: 'timetable', provider: 'TMAP', calculatedAt: '2026-08-26T00:00:00.000Z', departureAt: '2026-08-26T09:00:00.000Z', firstBoarding: { mode: '버스', routeName: '101', stop: { name: '서면 정류장', coordinate: { latitude: 35.152, longitude: 129.052 } }, walkMinutesToStop: 5 }, legs: [leg] };
    const fetcher = jest.fn(async () => jsonResponse({ routes: [good, { mode: '기차', minutes: 10, legs: [] }, { mode: '지하철', minutes: 'soon', legs: [] }], departureAt: '2026-08-26T09:00:00.000Z' }));
    const provider = new SupabaseMobilityProvider({ baseUrl, fetcher });
    const routes = await provider.getTransitRouteDetails({ origin: { latitude: 35.1531, longitude: 129.0597 }, destination: { latitude: 35.1632, longitude: 129.1635 }, departureAt: '2026-08-26T09:00:00.000Z' });
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${baseUrl}/v1/routes/transit`);
    expect(JSON.parse(String(request.body)).departureAt).toBe('2026-08-26T09:00:00.000Z');
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({ mode: '버스', minutes: 30, fareWon: 1550, walkMinutes: 7, departureAt: '2026-08-26T09:00:00.000Z' });
    expect(routes[0].legs[0]).toEqual(leg);
    expect(routes[0].firstBoarding?.routeName).toBe('101');
  });

  it('rejects a response without a routes list', async () => {
    const provider = new SupabaseMobilityProvider({ baseUrl, fetcher: jest.fn(async () => jsonResponse({ nope: true })) });
    await expect(provider.getTransitRouteDetails({ origin: { latitude: 1, longitude: 1 }, destination: { latitude: 2, longitude: 2 } })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
