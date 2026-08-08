import { RoutePlan } from '@/lib/journey';
import { arrivalStatus, shiftClock } from '@/lib/schedule';

export type TransportEvidence =
  | { kind: 'actual-route'; provider: 'TMAP'; calculatedAt: string }
  | { kind: 'estimate'; provider: 'ON_TIME_MODEL'; calculatedAt?: never };

export type TransportAlternative = {
  id: string;
  title: string;
  arrival: string;
  status: string;
  note: string;
  cost: string;
  walk: string;
  transfer: string;
  durationMinutes: number;
  distanceLabel: string;
  recommended: boolean;
  evidence: TransportEvidence;
};

export function transportEvidenceLabel(evidence: TransportEvidence) {
  return evidence.kind === 'actual-route' ? 'TMAP 실제 경로' : '예상값';
}

export function transportEvidenceDescription(evidence: TransportEvidence) {
  if (evidence.kind === 'actual-route') {
    return `TMAP이 확인한 도보 경로 · ${formatCalculatedAt(evidence.calculatedAt)} 갱신`;
  }
  return '실시간 교통 조회 전 TimeAgent 기본 추정치';
}

export function createActualWalkingAlternative({
  route,
  appointmentTime,
  now = new Date(),
}: {
  route: RoutePlan;
  appointmentTime: string;
  now?: Date;
}): TransportAlternative {
  const durationMinutes = Math.max(1, Math.ceil(route.durationSeconds / 60));
  const arrival = shiftClock(clockFromDate(now), durationMinutes);
  return {
    id: 'walk',
    title: '도보',
    arrival,
    status: arrivalStatus(arrival, appointmentTime).label,
    note: 'TMAP이 현재 위치에서 찾은 경로예요',
    cost: '0원',
    walk: `도보 ${durationMinutes}분`,
    transfer: '환승 없음',
    durationMinutes,
    distanceLabel: formatTransportDistance(route.distanceMeters),
    recommended: false,
    evidence: {
      kind: 'actual-route',
      provider: 'TMAP',
      calculatedAt: route.calculatedAt,
    },
  };
}

export function formatTransportDistance(distanceMeters: number) {
  if (distanceMeters < 1_000) return `${Math.round(distanceMeters)}m`;
  const kilometers = distanceMeters / 1_000;
  return `${kilometers >= 10 ? kilometers.toFixed(0) : kilometers.toFixed(1)}km`;
}

function clockFromDate(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatCalculatedAt(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '방금';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
