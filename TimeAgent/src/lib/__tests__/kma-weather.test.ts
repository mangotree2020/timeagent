import {
  canUseFallbackWeatherCache,
  canUseFreshWeatherCache,
  conditionFromKma,
  haversineDistanceMeters,
  latestKmaForecastBase,
  latestKmaObservationBase,
  parseWeatherCache,
  toKmaGrid,
} from '../kma-weather';
import { createWeatherPreviewFixture } from '../weather';

const now = new Date('2026-08-07T14:20:00+09:00').getTime();
const cache = {
  version: 1 as const,
  latitude: 35.1796,
  longitude: 129.0756,
  savedAt: now - 5 * 60_000,
  weather: createWeatherPreviewFixture(),
};

describe('kma weather optimization', () => {
  test('GPS 좌표를 기상청 격자로 변환한다', () => {
    expect(toKmaGrid(37.5665, 126.9780)).toEqual({ nx: 60, ny: 127 });
    expect(toKmaGrid(35.1796, 129.0756)).toEqual({ nx: 98, ny: 76 });
  });

  test('자료 지연을 고려해 40분 전 정시를 실황 기준으로 사용한다', () => {
    expect(latestKmaObservationBase(new Date('2026-08-07T14:20:00+09:00'))).toEqual({ baseDate: '20260807', baseTime: '1300' });
    expect(latestKmaObservationBase(new Date('2026-08-07T00:15:00+09:00'))).toEqual({ baseDate: '20260806', baseTime: '2300' });
  });

  test('초단기예보는 15분 자료 지연을 고려해 최신 30분 발표를 사용한다', () => {
    expect(latestKmaForecastBase(new Date('2026-08-07T14:20:00+09:00'))).toEqual({ baseDate: '20260807', baseTime: '1400' });
    expect(latestKmaForecastBase(new Date('2026-08-07T14:10:00+09:00'))).toEqual({ baseDate: '20260807', baseTime: '1330' });
  });

  test('10분 안이고 750m 미만 이동이면 캐시를 사용한다', () => {
    expect(canUseFreshWeatherCache(cache, { latitude: 35.181, longitude: 129.076 }, now)).toBe(true);
    expect(canUseFreshWeatherCache(cache, { latitude: 35.19, longitude: 129.0756 }, now)).toBe(false);
    expect(canUseFreshWeatherCache({ ...cache, savedAt: now - 11 * 60_000 }, cache, now)).toBe(false);
  });

  test('장애 시 최대 30분 캐시만 허용한다', () => {
    expect(canUseFallbackWeatherCache({ ...cache, savedAt: now - 29 * 60_000 }, now)).toBe(true);
    expect(canUseFallbackWeatherCache({ ...cache, savedAt: now - 31 * 60_000 }, now)).toBe(false);
  });

  test('거리 계산은 부산 중심 1km 이동을 구분한다', () => {
    expect(haversineDistanceMeters(cache, { latitude: 35.1886, longitude: 129.0756 })).toBeGreaterThan(900);
  });

  test('기상청 하늘·강수 코드를 텍스트와 아이콘으로 함께 변환한다', () => {
    expect(conditionFromKma(1, 0)).toEqual({ condition: '맑음', icon: 'clear' });
    expect(conditionFromKma(4, 1)).toEqual({ condition: '비', icon: 'rain' });
    expect(conditionFromKma(4, 3)).toEqual({ condition: '눈', icon: 'snow' });
  });

  test('손상된 캐시는 무시한다', () => {
    expect(parseWeatherCache(JSON.stringify(cache))).toEqual(cache);
    expect(parseWeatherCache('{broken')).toBeNull();
    expect(parseWeatherCache(JSON.stringify({ ...cache, latitude: '35' }))).toBeNull();
  });
});
