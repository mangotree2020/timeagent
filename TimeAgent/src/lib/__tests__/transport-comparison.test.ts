import { fixtureRoutePlan } from '@/lib/journey-fixtures';

import {
  createActualWalkingAlternative,
  createEstimatedAlternatives,
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

describe('createEstimatedAlternatives', () => {
  const base = { departure: '09:30', appointmentTime: '10:00' };

  it('times every option against the appointment being planned', () => {
    const options = createEstimatedAlternatives(base);
    const subway = options.find((item) => item.id === '지하철');
    expect(subway?.arrival).toBe('09:54');
    expect(subway?.status).toBe('6분 여유');

    const walking = options.find((item) => item.id === '도보');
    expect(walking?.arrival).toBe('10:05');
    expect(walking?.status).toBe('5분 지각 예상');
  });

  it('leaves out the mode already chosen', () => {
    const options = createEstimatedAlternatives({ ...base, exclude: '지하철' });
    expect(options.map((item) => item.id)).not.toContain('지하철');
    expect(options.length).toBeGreaterThan(2);
  });

  it('recommends the quickest option that still arrives in time', () => {
    const options = createEstimatedAlternatives(base);
    expect(options.filter((item) => item.recommended)).toHaveLength(1);
    expect(options.find((item) => item.recommended)?.id).toBe('택시');
  });

  it('still recommends something when nothing arrives in time', () => {
    const options = createEstimatedAlternatives({ departure: '09:55', appointmentTime: '10:00' });
    const recommended = options.filter((item) => item.recommended);
    expect(recommended).toHaveLength(1);
    expect(recommended[0].id).toBe('택시');
    expect(recommended[0].status).toContain('지각');
  });

  it('describes distance as an estimate consistent with the time it quotes', () => {
    const taxi = createEstimatedAlternatives(base).find((item) => item.id === '택시');
    expect(taxi?.durationMinutes).toBe(18);
    expect(taxi?.distanceLabel).toBe('약 7.8km');
    expect(taxi?.evidence.kind).toBe('estimate');
  });
});
