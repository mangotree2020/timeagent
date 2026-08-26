import { Coordinate, RoutePlan } from '@/lib/journey';
import { TransitBoarding, TransitStop } from '@/lib/travel-estimate';

/**
 * A full transit itinerary as the server describes it — legs, stops, drawn shapes — for the
 * screens that show the route rather than just plan with its minutes.
 */
export type TransitLeg = {
  mode: '도보' | '버스' | '지하철' | '기타';
  minutes: number;
  distanceMeters: number;
  routeName?: string;
  routeId?: string;
  from: TransitStop;
  to: TransitStop;
  stops?: TransitStop[];
  path?: Coordinate[];
};

export type TransitRouteDetail = {
  mode: '버스' | '지하철';
  pathType: number;
  minutes: number;
  distanceMeters: number;
  fareWon?: number;
  transferCount: number;
  walkMinutes: number;
  basis: 'timetable';
  provider: 'TMAP';
  calculatedAt: string;
  departureAt?: string;
  firstBoarding: TransitBoarding | null;
  legs: TransitLeg[];
};

/**
 * The route the plan was timed with, among the detailed itineraries: same first boarding when
 * there is one, else the quickest of the same mode. The detail lookup is a separate call and TMAP
 * may order it differently, so the match is by content, not position.
 */
export function pickTransitRouteDetail(
  routes: TransitRouteDetail[],
  { mode, firstBoarding }: { mode: '버스' | '지하철'; firstBoarding?: TransitBoarding | null },
): TransitRouteDetail | null {
  if (!routes.length) return null;
  if (firstBoarding) {
    const same = routes.find((route) =>
      route.firstBoarding
      && route.firstBoarding.routeName === firstBoarding.routeName
      && route.firstBoarding.stop.name === firstBoarding.stop.name);
    if (same) return same;
  }
  // Never another mode: a subway plan drawn as a bus route would be a different journey.
  return routes.filter((route) => route.mode === mode).sort((left, right) => left.minutes - right.minutes)[0] ?? null;
}

/**
 * The itinerary as a line the map can draw, from where the person is to where they are going.
 * Legs without a drawn shape are bridged by their stops' coordinates, so a missing shape leaves a
 * straight segment rather than a gap.
 */
export function routePlanFromTransit(
  route: TransitRouteDetail,
  { origin, destination }: { origin: Coordinate; destination: Coordinate },
): RoutePlan | null {
  const path: Coordinate[] = [origin];
  for (const leg of route.legs) {
    const shape = leg.path && leg.path.length >= 2
      ? leg.path
      : [leg.from.coordinate, leg.to.coordinate].filter((point): point is Coordinate => point !== null);
    for (const point of shape) {
      const last = path[path.length - 1];
      if (last.latitude !== point.latitude || last.longitude !== point.longitude) path.push(point);
    }
  }
  const last = path[path.length - 1];
  if (last.latitude !== destination.latitude || last.longitude !== destination.longitude) path.push(destination);
  if (path.length < 2) return null;
  const maneuvers = route.legs.flatMap((leg, index) => {
    if (leg.mode === '도보' || !leg.from.coordinate) return [];
    return [{
      id: `transit-${index}`,
      coordinate: leg.from.coordinate,
      instruction: `${leg.from.name}에서 ${leg.routeName ?? leg.mode} 탑승`,
      type: leg.mode === '버스' ? 'bus' : 'subway',
    }];
  });
  return {
    provider: 'tmap',
    mode: 'transit',
    origin,
    destination,
    durationSeconds: route.minutes * 60,
    distanceMeters: route.distanceMeters,
    path,
    calculatedAt: route.calculatedAt,
    stale: false,
    maneuvers,
  };
}
