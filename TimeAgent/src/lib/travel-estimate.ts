import { Coordinate } from '@/lib/journey';
import { estimateTravelMinutes } from '@/lib/planning';
import { TransportMode } from '@/lib/schedule-draft';

/** The modes a route provider can actually answer for. `AI 추천` is a choice between them, not a mode. */
export const ROUTED_TRANSPORT_MODES = ['도보', '버스', '지하철', '자가용', '택시'] as const;
export type RoutedTransportMode = typeof ROUTED_TRANSPORT_MODES[number];

export function isRoutedTransportMode(value: unknown): value is RoutedTransportMode {
  return ROUTED_TRANSPORT_MODES.includes(value as RoutedTransportMode);
}

export type TravelEstimate = {
  mode: RoutedTransportMode;
  minutes: number;
  distanceMeters: number;
  /** Won as a fare figure from the provider, in KRW. Absent where the mode has no fare to quote. */
  fareWon?: number;
  transferCount?: number;
  /** 'route' came from a road or timetable lookup; 'distance' is this app doing arithmetic. */
  source: 'route' | 'distance';
  provider?: string;
  calculatedAt?: string;
};

export type TravelEstimates = Partial<Record<RoutedTransportMode, TravelEstimate>>;

export type TravelEstimateRequest = {
  origin: Coordinate;
  destination: Coordinate;
  modes?: readonly RoutedTransportMode[];
  signal?: AbortSignal;
};

export interface TravelEstimateProvider {
  getTravelEstimates(request: TravelEstimateRequest): Promise<TravelEstimates>;
}

/**
 * What the plan should count on for one mode. A real lookup wins; when it is missing — the provider
 * refused, the network was down, nothing has been located — the distance arithmetic answers instead,
 * and says so, because a departure time computed from a guess should not look like one read off a
 * timetable.
 */
export function travelMinutesForMode(
  transport: TransportMode,
  estimates: TravelEstimates,
  distanceMeters: number | null | undefined,
): TravelEstimate | null {
  if (transport === 'AI 추천') return quickestEstimate(estimates, distanceMeters);
  // The person chooses between public transport and a car; the providers still answer per way of
  // travelling, and the combined mode takes the quickest of its own ways.
  const candidates: readonly RoutedTransportMode[] = transport === '대중교통'
    ? ['버스', '지하철']
    : transport === '승용차(택시)'
      ? ['자가용', '택시']
      : isRoutedTransportMode(transport) ? [transport] : [];
  if (!candidates.length) return null;
  const answered = candidates.map((mode) => estimates[mode]).filter((estimate): estimate is TravelEstimate => Boolean(estimate));
  if (answered.length) return answered.reduce((quickest, estimate) => (estimate.minutes < quickest.minutes ? estimate : quickest));
  if (typeof distanceMeters !== 'number' || !Number.isFinite(distanceMeters) || distanceMeters < 0) return null;
  return {
    mode: candidates[transport === '대중교통' ? 1 : 0],
    minutes: estimateTravelMinutes(transport, distanceMeters),
    distanceMeters,
    source: 'distance',
  };
}

/**
 * What `AI 추천` means once the times are real: the quickest way there. Ties and gaps are decided by
 * whatever the providers actually answered, so a mode nobody could price simply does not compete.
 */
function quickestEstimate(estimates: TravelEstimates, distanceMeters: number | null | undefined): TravelEstimate | null {
  const answered = ROUTED_TRANSPORT_MODES.map((mode) => estimates[mode]).filter((estimate): estimate is TravelEstimate => Boolean(estimate));
  if (answered.length) {
    return answered.reduce((quickest, estimate) => (estimate.minutes < quickest.minutes ? estimate : quickest));
  }
  if (typeof distanceMeters !== 'number' || !Number.isFinite(distanceMeters) || distanceMeters < 0) return null;
  return {
    mode: '지하철',
    minutes: estimateTravelMinutes('AI 추천', distanceMeters),
    distanceMeters,
    source: 'distance',
  };
}

export function travelEstimateLabel(estimate: Pick<TravelEstimate, 'source' | 'provider'>) {
  return estimate.source === 'route' ? `${estimate.provider ?? 'TMAP'} 실시간 경로` : '거리 기반 예상';
}
