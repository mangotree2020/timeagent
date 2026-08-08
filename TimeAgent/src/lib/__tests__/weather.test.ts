import {
  buildWeatherForecastUrl,
  describeWeatherCode,
  parseWeatherForecast,
  resolveWeatherLocationName,
  weatherPreparationAdvice,
} from '../weather';

describe('weather', () => {
  test('현재 위치와 필요한 날씨 필드만 요청한다', () => {
    const url = new URL(buildWeatherForecastUrl(35.1595, 129.0603));
    expect(url.hostname).toBe('api.open-meteo.com');
    expect(url.searchParams.get('latitude')).toBe('35.16');
    expect(url.searchParams.get('longitude')).toBe('129.06');
    expect(url.searchParams.get('current')).toContain('apparent_temperature');
    expect(url.searchParams.get('daily')).toContain('precipitation_probability_max');
    expect(url.searchParams.get('forecast_days')).toBe('1');
  });

  test.each([
    [0, '맑음', 'clear'],
    [45, '안개', 'fog'],
    [61, '비', 'rain'],
    [75, '눈', 'snow'],
    [95, '천둥번개', 'storm'],
  ] as const)('WMO 코드 %i를 텍스트와 아이콘으로 함께 전달한다', (code, condition, icon) => {
    expect(describeWeatherCode(code)).toEqual({ condition, icon });
  });

  test('API 응답을 홈 날씨 모델로 변환한다', () => {
    expect(parseWeatherForecast({
      current: { temperature_2m: 26.6, apparent_temperature: 28.2, weather_code: 61, time: '2026-08-07T13:15' },
      daily: { precipitation_probability_max: [70], temperature_2m_min: [22.4], temperature_2m_max: [29.1] },
    })).toMatchObject({
      temperatureC: 26.6,
      apparentTemperatureC: 28.2,
      condition: '비',
      precipitationProbability: 70,
      minimumTemperatureC: 22.4,
      maximumTemperatureC: 29.1,
    });
  });

  test('필수 날씨 값이 없으면 잘못된 응답으로 처리한다', () => {
    expect(() => parseWeatherForecast({ current: {} })).toThrow('날씨 응답 형식');
  });

  test('역지오코딩 결과에서 사용자가 알아보기 쉬운 위치명을 선택한다', () => {
    expect(resolveWeatherLocationName({ city: '부산광역시', district: '부산진구', region: '부산광역시' })).toBe('부산진구');
    expect(resolveWeatherLocationName({ city: '서울특별시', subregion: '마포구', region: '서울특별시' })).toBe('마포구');
    expect(resolveWeatherLocationName({ city: '제주시', region: '제주특별자치도' })).toBe('제주시');
    expect(resolveWeatherLocationName({})).toBeNull();
  });

  test('비와 체감온도에 따라 준비 행동을 제안한다', () => {
    const base = parseWeatherForecast({
      current: { temperature_2m: 20, apparent_temperature: 20, weather_code: 0, time: '2026-08-07T13:15' },
      daily: { precipitation_probability_max: [10], temperature_2m_min: [15], temperature_2m_max: [24] },
    });
    expect(weatherPreparationAdvice({ ...base, icon: 'rain', precipitationProbability: 70 })).toBe('비 올 확률 70%. 우산을 챙기세요.');
    expect(weatherPreparationAdvice({ ...base, nextPrecipitationAt: '2026-08-07T15:00:00+09:00' })).toBe('15:00부터 비나 눈이 예상돼요. 우산을 챙기세요.');
    expect(weatherPreparationAdvice({ ...base, apparentTemperatureC: 3 })).toContain('겉옷');
    expect(weatherPreparationAdvice(base)).toBe('이동하기 무난한 날씨예요.');
  });
});
