import { fixtureRoutePlan } from '@/lib/journey-fixtures';

import {
  createActualWalkingAlternative,
  formatTransportDistance,
  transportEvidenceDescription,
  transportEvidenceLabel,
} from '../transport-comparison';

describe('transport comparison contract', () => {
  test('distinguishes a provider route from an estimated alternative', () => {
    expect(transportEvidenceLabel({ kind: 'actual-route', provider: 'TMAP', calculatedAt: '2026-07-26T04:10:00.000Z' }))
      .toBe('TMAP 실제 경로');
    expect(transportEvidenceLabel({ kind: 'estimate', provider: 'ON_TIME_MODEL' })).toBe('예상값');
    expect(transportEvidenceDescription({ kind: 'estimate', provider: 'ON_TIME_MODEL' })).toContain('기본 추정치');
  });

  test('creates a walking choice from the returned TMAP route', () => {
    const choice = createActualWalkingAlternative({
      route: { ...fixtureRoutePlan, durationSeconds: 660, distanceMeters: 1_250 },
      appointmentTime: '14:00',
      now: new Date(2026, 6, 26, 13, 40),
    });

    expect(choice).toMatchObject({
      id: 'walk',
      title: '도보',
      arrival: '13:51',
      status: '9분 여유',
      durationMinutes: 11,
      distanceLabel: '1.3km',
      evidence: { kind: 'actual-route', provider: 'TMAP' },
    });
  });

  test('formats short and long route distances', () => {
    expect(formatTransportDistance(246)).toBe('246m');
    expect(formatTransportDistance(11_650)).toBe('12km');
  });
});
