import {
  bestTransitRoutePerMode,
  normalizeTmapItineraries,
  parseLinestring,
  routeNameOf,
  tmapSearchDttm,
  transitCacheKey,
} from '../../../supabase/functions/mobility/transit-contract';

const calculatedAt = '2026-08-26T01:00:00.000Z';

function walk(seconds: number, from: string, to: string) {
  return { mode: 'WALK', sectionTime: seconds, distance: seconds * 1.2, start: { name: from, lat: 35.15, lon: 129.05 }, end: { name: to, lat: 35.151, lon: 129.051 } };
}

function bus(route: string, seconds: number, from: string, to: string, stops?: { stationName: string; stationID: string; lat: number; lon: number }[]) {
  return {
    mode: 'BUS',
    route,
    routeId: `route-${route}`,
    sectionTime: seconds,
    distance: 4200,
    start: { name: from, lat: 35.152, lon: 129.052 },
    end: { name: to, lat: 35.16, lon: 129.06 },
    passStopList: stops ? { stationList: stops } : undefined,
    passShape: { linestring: '129.052,35.152 129.056,35.156 129.06,35.16' },
  };
}

function subway(route: string, seconds: number) {
  return { mode: 'SUBWAY', route, sectionTime: seconds, distance: 6000, start: { name: '서면역', lat: 35.157, lon: 129.059 }, end: { name: '해운대역', lat: 35.163, lon: 129.158 } };
}

const payload = {
  metaData: {
    plan: {
      itineraries: [
        {
          pathType: 2, totalTime: 1800, totalDistance: 5200, totalWalkTime: 420, transferCount: 0, fare: { regular: { totalFare: 1550 } },
          legs: [
            walk(300, '출발지', '서면 정류장'),
            bus('간선:101', 1380, '서면 정류장', '해운대 정류장', [
              { stationName: '서면 정류장', stationID: '1001', lat: 35.152, lon: 129.052 },
              { stationName: '해운대 정류장', stationID: '1009', lat: 35.16, lon: 129.06 },
            ]),
            walk(120, '해운대 정류장', '도착지'),
          ],
        },
        { pathType: 1, totalTime: 1500, totalDistance: 6400, totalWalkTime: 600, transferCount: 1, fare: { regular: { totalFare: 1450 } }, legs: [walk(360, '출발지', '서면역'), subway('2호선', 900), walk(240, '해운대역', '도착지')] },
        { pathType: 3, totalTime: 1200, totalDistance: 6000, totalWalkTime: 300, transferCount: 1, fare: { regular: { totalFare: 1650 } }, legs: [walk(120, '출발지', '정류장'), bus('마을:부산진7', 300, '정류장', '서면역'), subway('2호선', 780)] },
        { pathType: 2, totalTime: 0, legs: [] },
        { pathType: 4, totalTime: 5000, legs: [] },
      ],
    },
  },
};

describe('TMAP transit normalization', () => {
  it('turns itineraries into the route contract with legs, walk time, fare, transfers and first boarding', () => {
    const routes = normalizeTmapItineraries(payload, { calculatedAt, departureAt: '2026-08-26T09:00:00.000Z' });

    expect(routes.map((route) => [route.mode, route.pathType, route.minutes])).toEqual([['버스', 3, 20], ['지하철', 1, 25], ['버스', 2, 30]]);
    const busRoute = routes.find((route) => route.pathType === 2)!;
    expect(busRoute).toMatchObject({ fareWon: 1550, transferCount: 0, walkMinutes: 7, basis: 'timetable', provider: 'TMAP', calculatedAt, departureAt: '2026-08-26T09:00:00.000Z', distanceMeters: 5200 });
    expect(busRoute.legs.map((leg) => leg.mode)).toEqual(['도보', '버스', '도보']);
    expect(busRoute.legs[1]).toMatchObject({ routeName: '101', routeId: 'route-간선:101', from: { name: '서면 정류장', stationId: '1001' }, to: { name: '해운대 정류장', stationId: '1009' } });
    expect(busRoute.legs[1].path).toBeUndefined();
    expect(busRoute.firstBoarding).toEqual({
      mode: '버스',
      routeName: '101',
      routeId: 'route-간선:101',
      stop: { name: '서면 정류장', coordinate: { latitude: 35.152, longitude: 129.052 }, stationId: '1001' },
      walkMinutesToStop: 5,
    });
  });

  it('files a mixed journey under the mode boarded first and keeps drawn shapes only on detail lookups', () => {
    const routes = normalizeTmapItineraries(payload, { calculatedAt, withShape: true });
    const mixed = routes.find((route) => route.pathType === 3)!;
    expect(mixed.mode).toBe('버스');
    expect(mixed.firstBoarding?.routeName).toBe('부산진7');
    expect(mixed.legs[1].path).toEqual([
      { latitude: 35.152, longitude: 129.052 },
      { latitude: 35.156, longitude: 129.056 },
      { latitude: 35.16, longitude: 129.06 },
    ]);
    expect(routes.every((route) => route.departureAt === undefined)).toBe(true);
  });

  it('drops itineraries without a usable time and modes the app does not plan', () => {
    const routes = normalizeTmapItineraries(payload, { calculatedAt });
    expect(routes.some((route) => route.pathType === 4)).toBe(false);
    expect(routes).toHaveLength(3);
    expect(normalizeTmapItineraries(null, { calculatedAt })).toEqual([]);
    expect(normalizeTmapItineraries({ metaData: { plan: {} } }, { calculatedAt })).toEqual([]);
  });

  it('offers one route per mode, a mixed journey competing as the mode it boards first and standing in elsewhere', () => {
    const routes = normalizeTmapItineraries(payload, { calculatedAt });
    const best = bestTransitRoutePerMode(routes);
    // The 20-minute bus-then-subway trip is boarded by bus first, so it is the bus answer.
    expect(best['버스']?.pathType).toBe(3);
    expect(best['버스']?.minutes).toBe(20);
    expect(best['지하철']?.pathType).toBe(1);
    const noMixed = bestTransitRoutePerMode(routes.filter((route) => route.pathType !== 3));
    expect(noMixed['버스']?.pathType).toBe(2);

    // A bus-first mixed journey is never relabelled as the subway answer.
    const onlyMixed = bestTransitRoutePerMode(routes.filter((route) => route.pathType === 3));
    expect(onlyMixed['버스']?.minutes).toBe(20);
    expect(onlyMixed['지하철']).toBeUndefined();
  });

  it('formats the departure instant as the Korean wall clock TMAP expects', () => {
    expect(tmapSearchDttm('2026-08-26T23:30:00.000Z')).toBe('202608270830');
    expect(tmapSearchDttm('2026-12-31T15:05:00+09:00')).toBe('202612311505');
    expect(tmapSearchDttm('not a date')).toBeNull();
  });

  it('keys the cache so a nudged pin or a moment later is the same question, but a new time slot is not', () => {
    const origin = { latitude: 35.15311, longitude: 129.05972 };
    const destination = { latitude: 35.16321, longitude: 129.16351 };
    const base = transitCacheKey(origin, destination, '2026-08-26T09:00:00.000Z', 'summary');
    expect(transitCacheKey({ latitude: 35.15313, longitude: 129.05974 }, destination, '2026-08-26T09:03:00.000Z', 'summary')).toBe(base);
    expect(transitCacheKey(origin, destination, '2026-08-26T09:06:00.000Z', 'summary')).not.toBe(base);
    expect(transitCacheKey(origin, destination, undefined, 'summary')).toContain('|now|');
    expect(transitCacheKey(origin, destination, '2026-08-26T09:00:00.000Z', 'detail')).not.toBe(base);
  });

  it('treats a null coordinate as missing rather than as the Gulf of Guinea', () => {
    const routes = normalizeTmapItineraries({ metaData: { plan: { itineraries: [{ pathType: 2, totalTime: 600, legs: [{ mode: 'BUS', route: '간선:5', sectionTime: 600, start: { name: '정류장', lat: null, lon: null }, end: { name: '끝' } }] }] } } }, { calculatedAt });
    expect(routes[0].firstBoarding?.stop.coordinate).toBeNull();
  });

  it('reads route names and line strings the way TMAP writes them', () => {
    expect(routeNameOf('간선:101')).toBe('101');
    expect(routeNameOf('수도권2호선')).toBe('수도권2호선');
    expect(routeNameOf('')).toBeUndefined();
    expect(parseLinestring('129.0,35.0 bad 129.1,35.1')).toEqual([{ latitude: 35, longitude: 129 }, { latitude: 35.1, longitude: 129.1 }]);
    expect(parseLinestring(42)).toEqual([]);
  });
});
