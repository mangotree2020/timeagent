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

/**
 * What each mode is assumed to cost in time and ground speed before a live traffic lookup. The
 * minutes match the planner's own defaults so plan B and the plan itself never disagree, and the
 * speeds are ordinary urban averages used only to describe the distance that implies.
 */
const TRANSPORT_ESTIMATES = {
  '지하철': { minutes: 24, kmPerHour: 32, note: '가장 확실한 경로예요', cost: '교통카드 요금', walk: '역까지 도보 포함', transfer: '환승 정보 미확인' },
  '버스': { minutes: 32, kmPerHour: 18, note: '비용은 낮지만 늦을 수 있어요', cost: '교통카드 요금', walk: '정류장까지 도보 포함', transfer: '환승 정보 미확인' },
  '택시': { minutes: 18, kmPerHour: 26, note: '가장 빠르게 도착해요', cost: '미터 요금', walk: '도보 없음', transfer: '환승 없음' },
  '자가용': { minutes: 20, kmPerHour: 28, note: '주차 시간을 함께 고려하세요', cost: '유류비·주차비', walk: '주차장까지 도보', transfer: '환승 없음' },
  '도보': { minutes: 35, kmPerHour: 4.5, note: '날씨가 좋으면 걸을 만해요', cost: '0원', walk: '전 구간 도보', transfer: '환승 없음' },
} as const;

export type EstimatedTransportMode = keyof typeof TRANSPORT_ESTIMATES;

/**
 * The alternatives someone can actually switch to, timed against their own appointment. These used
 * to be fixed sample data, so a 10:00 appointment was offered a 13:58 arrival labelled "정시 도착
 * 가능" — every number on the screen belonged to a different schedule.
 */
export function createEstimatedAlternatives({
  departure,
  appointmentTime,
  exclude,
}: {
  /** When the plan says to leave. Each mode answers "and then when do I arrive?" */
  departure: string;
  appointmentTime: string;
  exclude?: string;
}): TransportAlternative[] {
  const modes = (Object.keys(TRANSPORT_ESTIMATES) as EstimatedTransportMode[])
    .filter((mode) => mode !== exclude);
  const alternatives = modes.map((mode) => {
    const estimate = TRANSPORT_ESTIMATES[mode];
    const arrival = shiftClock(departure, estimate.minutes);
    return {
      id: mode,
      title: mode,
      arrival,
      status: arrivalStatus(arrival, appointmentTime).label,
      note: estimate.note,
      cost: estimate.cost,
      walk: estimate.walk,
      transfer: estimate.transfer,
      durationMinutes: estimate.minutes,
      distanceLabel: `약 ${formatTransportDistance(estimate.minutes / 60 * estimate.kmPerHour * 1_000)}`,
      recommended: false,
      evidence: { kind: 'estimate', provider: 'ON_TIME_MODEL' } as const,
    };
  });
  // Recommend the quickest option that still gets there in time, rather than simply the quickest.
  const onTime = alternatives.filter((item) => arrivalStatus(item.arrival, appointmentTime).minutes >= 0);
  const best = (onTime.length ? onTime : alternatives)
    .reduce((quickest, item) => (item.durationMinutes < quickest.durationMinutes ? item : quickest));
  return alternatives.map((item) => (item.id === best.id ? { ...item, recommended: true } : item));
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
