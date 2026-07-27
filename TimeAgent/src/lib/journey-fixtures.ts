import {
  Coordinate,
  JourneyLocation,
  LocationProvider,
  RoutePlan,
  RouteProvider,
  WalkingRouteRequest,
} from '@/lib/journey';

const origin: Coordinate = { latitude: 35.15717, longitude: 129.05865 };
const destination: Coordinate = { latitude: 35.15495, longitude: 129.06171 };

export const fixtureRoutePlan: RoutePlan = {
  provider: 'fixture',
  mode: 'walk',
  origin,
  destination,
  durationSeconds: 540,
  distanceMeters: 680,
  path: [
    origin,
    { latitude: 35.15683, longitude: 129.05925 },
    { latitude: 35.15618, longitude: 129.06004 },
    { latitude: 35.15553, longitude: 129.06093 },
    destination,
  ],
  calculatedAt: '2026-07-26T13:30:00+09:00',
  stale: false,
  maneuvers: [
    {
      id: 'fixture-crosswalk',
      coordinate: { latitude: 35.15683, longitude: 129.05925 },
      instruction: '앞 횡단보도를 건넌 뒤 직진하세요.',
      type: 'crosswalk',
    },
    {
      id: 'fixture-turn',
      coordinate: { latitude: 35.15553, longitude: 129.06093 },
      instruction: '120m 앞에서 오른쪽 골목으로 이동하세요.',
      type: 'right-turn',
    },
    {
      id: 'fixture-arrive',
      coordinate: destination,
      instruction: '목적지가 오른쪽에 있습니다.',
      type: 'arrive',
    },
  ],
};

export const fixtureLocation: JourneyLocation = {
  coordinate: origin,
  accuracyMeters: 12,
  headingDegrees: 72,
  capturedAt: Date.parse('2026-07-26T13:30:00+09:00'),
};

export class FixtureRouteProvider implements RouteProvider {
  async getWalkingRoute(_request: WalkingRouteRequest): Promise<RoutePlan> {
    return fixtureRoutePlan;
  }
}

export class FixtureLocationProvider implements LocationProvider {
  async getCurrentLocation(): Promise<JourneyLocation> {
    return fixtureLocation;
  }
}
