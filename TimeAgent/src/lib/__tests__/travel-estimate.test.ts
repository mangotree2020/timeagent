import { estimateTravelMinutes } from '../planning';
import { TravelEstimate, TravelEstimates, travelEstimateLabel, travelMinutesForMode } from '../travel-estimate';

function routed(mode: TravelEstimate['mode'], minutes: number): TravelEstimate {
  return { mode, minutes, distanceMeters: 8_000, source: 'route', provider: 'TMAP', calculatedAt: '2026-08-20T07:00:00Z' };
}

const estimates: TravelEstimates = {
  '지하철': routed('지하철', 31),
  '택시': routed('택시', 19),
  '도보': routed('도보', 96),
};

describe('what the plan counts on for the journey', () => {
  it('uses the real lookup for the chosen mode, taking the quicker way inside a combined one', () => {
    expect(travelMinutesForMode('대중교통', estimates, 8_000)).toEqual(expect.objectContaining({ mode: '지하철', minutes: 31, source: 'route' }));
    expect(travelMinutesForMode('대중교통', { ...estimates, '버스': routed('버스', 28) }, 8_000)).toEqual(expect.objectContaining({ mode: '버스', minutes: 28 }));
    expect(travelMinutesForMode('승용차(택시)', estimates, 8_000)).toEqual(expect.objectContaining({ mode: '택시', minutes: 19 }));
  });

  it('measures the distance itself for a mode nothing answered for', () => {
    // Neither bus nor subway answered here. The plan still needs a departure time, and it must be
    // one that reflects this trip rather than a constant.
    const transit = travelMinutesForMode('대중교통', { '도보': estimates['도보'] }, 8_000);

    expect(transit).toEqual(expect.objectContaining({ mode: '지하철', source: 'distance' }));
    expect(transit?.minutes).toBe(estimateTravelMinutes('대중교통', 8_000));
  });

  it('reads AI 추천 as the quickest way there, once the times are real', () => {
    expect(travelMinutesForMode('AI 추천', estimates, 8_000)).toEqual(expect.objectContaining({ mode: '택시', minutes: 19 }));
  });

  it('has nothing to offer when nothing was measured and nothing was located', () => {
    expect(travelMinutesForMode('대중교통', {}, null)).toBeNull();
    expect(travelMinutesForMode('AI 추천', {}, undefined)).toBeNull();
    expect(travelMinutesForMode('대중교통', {}, Number.NaN)).toBeNull();
  });

  it('falls back to the distance for AI 추천 when no lookup landed', () => {
    const guessed = travelMinutesForMode('AI 추천', {}, 8_000);

    expect(guessed?.source).toBe('distance');
    expect(guessed?.minutes).toBe(estimateTravelMinutes('AI 추천', 8_000));
  });

  it('says which of the two kinds of number it is', () => {
    // A departure time counted back from arithmetic should not read like one off a timetable.
    expect(travelEstimateLabel({ source: 'route', provider: 'TMAP' })).toBe('TMAP 실시간 경로');
    expect(travelEstimateLabel({ source: 'distance' })).toBe('거리 기반 예상');
  });
});
