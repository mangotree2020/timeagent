import {
  createJourneyState,
  createFallbackWalkingRoute,
  getNextAppointmentAt,
  formatJourneyDistance,
  buildJourneyVoiceMessage,
  getJourneyRemaining,
  markJourneyUnavailable,
  refreshJourneyLocation,
} from '@/lib/journey';
import {
  fixtureLocation,
  FixtureLocationProvider,
  fixtureRoutePlan,
  FixtureRouteProvider,
} from '@/lib/journey-fixtures';

describe('journey domain', () => {
  it('creates a stale direct route when the route service is unavailable', () => {
    const route = createFallbackWalkingRoute({
      origin: { latitude: 35.1, longitude: 129.1 },
      destination: { latitude: 35.101, longitude: 129.101 },
      calculatedAt: '2026-07-26T00:00:00.000Z',
    });
    expect(route.stale).toBe(true);
    expect(route.path).toHaveLength(2);
    expect(route.distanceMeters).toBeGreaterThan(0);
    expect(route.durationSeconds).toBeGreaterThanOrEqual(60);
  });

  it('resolves an appointment clock to the next occurrence', () => {
    const now = new Date('2026-07-26T15:00:00+09:00').getTime();
    expect(new Date(getNextAppointmentAt('14:00', now)).toISOString())
      .toBe('2026-07-27T05:00:00.000Z');
    expect(getNextAppointmentAt('invalid', now)).toBe(now + 60 * 60_000);
  });

  it('formats walking distance for glanceable mobile metrics', () => {
    expect(formatJourneyDistance(680)).toBe('680m');
    expect(formatJourneyDistance(1_650)).toBe('1.6km');
    expect(formatJourneyDistance(11_650)).toBe('12km');
  });

  it('builds a point voice cue with action, ETA and distance', () => {
    const state = createJourneyState({
      route: fixtureRoutePlan,
      location: fixtureLocation,
      appointmentAt: fixtureLocation.capturedAt + 30 * 60_000,
      now: fixtureLocation.capturedAt,
    });
    expect(buildJourneyVoiceMessage(fixtureRoutePlan.maneuvers[0], state)).toContain('앞 횡단보도');
    expect(buildJourneyVoiceMessage(fixtureRoutePlan.maneuvers[0], state)).toContain('약 9분');
    expect(buildJourneyVoiceMessage(fixtureRoutePlan.maneuvers[0], state)).toContain('680미터');
  });
  it('starts with a normalized route, current location, ETA and next maneuver', () => {
    const now = Date.parse('2026-07-26T13:30:00+09:00');
    const state = createJourneyState({
      route: fixtureRoutePlan,
      location: fixtureLocation,
      appointmentAt: now + 15 * 60_000,
      now,
    });

    expect(state.status).toBe('ready');
    expect(state.route.provider).toBe('fixture');
    expect(state.remainingDistanceMeters).toBe(680);
    expect(state.remainingDurationSeconds).toBe(540);
    expect(state.appointmentRemainingSeconds).toBe(900);
    expect(state.scheduleStatus).toEqual({ kind: 'buffer', seconds: 360 });
    expect(state.nextManeuver?.instruction).toContain('횡단보도');
  });

  it('updates remaining distance and ETA without mutating the provider route', () => {
    const now = Date.parse('2026-07-26T13:30:00+09:00');
    const state = createJourneyState({
      route: fixtureRoutePlan,
      location: fixtureLocation,
      appointmentAt: now + 15 * 60_000,
      now,
    });
    const moved = refreshJourneyLocation(state, {
      ...fixtureLocation,
      coordinate: fixtureRoutePlan.path[2],
      capturedAt: now + 4 * 60_000,
    }, now + 4 * 60_000);

    expect(moved.remainingDistanceMeters).toBeLessThan(state.remainingDistanceMeters);
    expect(moved.remainingDurationSeconds).toBeLessThan(state.remainingDurationSeconds);
    expect(moved.route.distanceMeters).toBe(680);
    expect(moved.location.coordinate).toEqual(fixtureRoutePlan.path[2]);
  });

  it('keeps the last valid route and timestamp when the network is offline', () => {
    const now = Date.parse('2026-07-26T13:30:00+09:00');
    const state = createJourneyState({
      route: fixtureRoutePlan,
      location: fixtureLocation,
      appointmentAt: now + 15 * 60_000,
      now,
    });
    const offline = markJourneyUnavailable(state, 'offline', now + 60_000);

    expect(offline.status).toBe('offline');
    expect(offline.route).toBe(state.route);
    expect(offline.nextManeuver).toBe(state.nextManeuver);
    expect(offline.lastSuccessfulRouteAt).toBe(state.lastSuccessfulRouteAt);
    expect(offline.message).toContain('마지막 경로');
  });

  it('marks old GPS samples as stale while preserving textual guidance', () => {
    const now = Date.parse('2026-07-26T13:30:00+09:00');
    const staleLocation = { ...fixtureLocation, capturedAt: now - 45_000 };
    const state = createJourneyState({
      route: fixtureRoutePlan,
      location: staleLocation,
      appointmentAt: now + 15 * 60_000,
      now,
    });

    expect(state.status).toBe('stale');
    expect(state.message).toContain('45초 전');
    expect(state.nextManeuver).not.toBeNull();
  });

  it('exposes deterministic fixture providers behind the production ports', async () => {
    const routeProvider = new FixtureRouteProvider();
    const locationProvider = new FixtureLocationProvider();

    await expect(routeProvider.getWalkingRoute({
      origin: fixtureRoutePlan.origin,
      destination: fixtureRoutePlan.destination,
    })).resolves.toEqual(fixtureRoutePlan);
    await expect(locationProvider.getCurrentLocation()).resolves.toEqual(fixtureLocation);
  });

  it('calculates remaining path distance from the nearest segment', () => {
    const remaining = getJourneyRemaining(fixtureRoutePlan, fixtureRoutePlan.path[2]);

    expect(remaining.remainingDistanceMeters).toBeGreaterThan(0);
    expect(remaining.remainingDistanceMeters).toBeLessThan(fixtureRoutePlan.distanceMeters);
    expect(remaining.remainingDurationSeconds).toBeLessThan(fixtureRoutePlan.durationSeconds);
  });
});
