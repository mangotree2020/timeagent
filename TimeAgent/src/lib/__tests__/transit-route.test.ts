import { pickTransitRouteDetail, routePlanFromTransit, TransitRouteDetail } from '@/lib/transit-route';

const origin = { latitude: 35.1531, longitude: 129.0597 };
const destination = { latitude: 35.1632, longitude: 129.1635 };

function route(overrides: Partial<TransitRouteDetail>): TransitRouteDetail {
  return {
    mode: '버스',
    pathType: 2,
    minutes: 30,
    distanceMeters: 5200,
    transferCount: 0,
    walkMinutes: 7,
    basis: 'timetable',
    provider: 'TMAP',
    calculatedAt: '2026-08-26T00:00:00.000Z',
    firstBoarding: { mode: '버스', routeName: '101', stop: { name: '서면 정류장', coordinate: { latitude: 35.152, longitude: 129.052 } }, walkMinutesToStop: 5 },
    legs: [
      { mode: '도보', minutes: 5, distanceMeters: 400, from: { name: '출발', coordinate: origin }, to: { name: '서면 정류장', coordinate: { latitude: 35.152, longitude: 129.052 } } },
      { mode: '버스', minutes: 23, distanceMeters: 4200, routeName: '101', from: { name: '서면 정류장', coordinate: { latitude: 35.152, longitude: 129.052 } }, to: { name: '해운대 정류장', coordinate: { latitude: 35.16, longitude: 129.16 } }, path: [{ latitude: 35.152, longitude: 129.052 }, { latitude: 35.156, longitude: 129.1 }, { latitude: 35.16, longitude: 129.16 }] },
      { mode: '도보', minutes: 2, distanceMeters: 150, from: { name: '해운대 정류장', coordinate: { latitude: 35.16, longitude: 129.16 } }, to: { name: '도착', coordinate: destination } },
    ],
    ...overrides,
  };
}

describe('drawing the transit route the plan was timed with', () => {
  it('picks the itinerary with the same first boarding, else the quickest of the same mode', () => {
    const bus101 = route({});
    const bus5 = route({ minutes: 26, firstBoarding: { mode: '버스', routeName: '5', stop: { name: '부전시장', coordinate: null }, walkMinutesToStop: 3 } });
    const subway = route({ mode: '지하철', pathType: 1, minutes: 25, firstBoarding: { mode: '지하철', routeName: '2호선', stop: { name: '서면역', coordinate: null }, walkMinutesToStop: 6 } });
    expect(pickTransitRouteDetail([subway, bus5, bus101], { mode: '버스', firstBoarding: bus101.firstBoarding })).toBe(bus101);
    expect(pickTransitRouteDetail([subway, bus5, bus101], { mode: '버스', firstBoarding: null })).toBe(bus5);
    // A subway plan is not drawn as a bus route: with no subway itinerary there is nothing to draw.
    expect(pickTransitRouteDetail([bus5, bus101], { mode: '지하철', firstBoarding: null })).toBeNull();
    expect(pickTransitRouteDetail([], { mode: '버스' })).toBeNull();
  });

  it('joins the legs into one line from the person to the destination, bridging legs without a shape', () => {
    const drawn = routePlanFromTransit(route({}), { origin, destination });
    expect(drawn).toMatchObject({ provider: 'tmap', mode: 'transit', origin, destination, durationSeconds: 1800, distanceMeters: 5200, stale: false });
    expect(drawn?.path).toEqual([
      origin,
      { latitude: 35.152, longitude: 129.052 },
      { latitude: 35.156, longitude: 129.1 },
      { latitude: 35.16, longitude: 129.16 },
      destination,
    ]);
    expect(drawn?.maneuvers).toEqual([{ id: 'transit-1', coordinate: { latitude: 35.152, longitude: 129.052 }, instruction: '서면 정류장에서 101 탑승', type: 'bus' }]);
  });

  it('still draws something when no leg has coordinates', () => {
    const bare = route({ legs: [{ mode: '버스', minutes: 30, distanceMeters: 5000, from: { name: 'a', coordinate: null }, to: { name: 'b', coordinate: null } }] });
    expect(routePlanFromTransit(bare, { origin, destination })?.path).toEqual([origin, destination]);
  });
});
