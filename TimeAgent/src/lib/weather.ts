export type WeatherIcon = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';

export type WeatherSnapshot = {
  locationName?: string;
  temperatureC: number;
  apparentTemperatureC: number;
  weatherCode: number;
  condition: string;
  icon: WeatherIcon;
  precipitationProbability: number;
  minimumTemperatureC: number;
  maximumTemperatureC: number;
  observedAt: string;
  source: 'kma' | 'open-meteo';
  stale: boolean;
  fetchedAt: number;
  nextPrecipitationAt?: string | null;
};

export type WeatherGeocodedAddress = {
  city?: string | null;
  district?: string | null;
  subregion?: string | null;
  region?: string | null;
};

type WeatherApiResponse = {
  current?: {
    temperature_2m?: unknown;
    apparent_temperature?: unknown;
    weather_code?: unknown;
    time?: unknown;
  };
  daily?: {
    precipitation_probability_max?: unknown;
    temperature_2m_min?: unknown;
    temperature_2m_max?: unknown;
  };
};

export function buildWeatherForecastUrl(latitude: number, longitude: number) {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(2),
    longitude: longitude.toFixed(2),
    current: 'temperature_2m,apparent_temperature,weather_code',
    daily: 'precipitation_probability_max,temperature_2m_min,temperature_2m_max',
    forecast_days: '1',
    timezone: 'auto',
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

export function describeWeatherCode(code: number): { condition: string; icon: WeatherIcon } {
  if (code === 0) return { condition: '맑음', icon: 'clear' };
  if (code === 1 || code === 2) return { condition: '대체로 맑음', icon: 'clear' };
  if (code === 3) return { condition: '흐림', icon: 'cloudy' };
  if (code === 45 || code === 48) return { condition: '안개', icon: 'fog' };
  if (code >= 51 && code <= 67) return { condition: '비', icon: 'rain' };
  if (code >= 71 && code <= 77) return { condition: '눈', icon: 'snow' };
  if (code >= 80 && code <= 82) return { condition: '소나기', icon: 'rain' };
  if (code === 85 || code === 86) return { condition: '눈 소나기', icon: 'snow' };
  if (code >= 95) return { condition: '천둥번개', icon: 'storm' };
  return { condition: '날씨 변화', icon: 'cloudy' };
}

export function parseWeatherForecast(payload: unknown, fetchedAt = Date.now()): WeatherSnapshot {
  const response = payload as WeatherApiResponse;
  const temperatureC = finiteNumber(response?.current?.temperature_2m);
  const apparentTemperatureC = finiteNumber(response?.current?.apparent_temperature);
  const weatherCode = finiteNumber(response?.current?.weather_code);
  const observedAt = typeof response?.current?.time === 'string' ? response.current.time : '';
  const precipitationProbability = firstFiniteNumber(response?.daily?.precipitation_probability_max);
  const minimumTemperatureC = firstFiniteNumber(response?.daily?.temperature_2m_min);
  const maximumTemperatureC = firstFiniteNumber(response?.daily?.temperature_2m_max);

  if ([temperatureC, apparentTemperatureC, weatherCode, precipitationProbability, minimumTemperatureC, maximumTemperatureC].some((value) => value === null) || !observedAt) {
    throw new Error('날씨 응답 형식이 올바르지 않습니다.');
  }

  const description = describeWeatherCode(weatherCode as number);
  return {
    temperatureC: temperatureC as number,
    apparentTemperatureC: apparentTemperatureC as number,
    weatherCode: weatherCode as number,
    condition: description.condition,
    icon: description.icon,
    precipitationProbability: precipitationProbability as number,
    minimumTemperatureC: minimumTemperatureC as number,
    maximumTemperatureC: maximumTemperatureC as number,
    observedAt,
    source: 'open-meteo',
    stale: false,
    fetchedAt,
    nextPrecipitationAt: null,
  };
}

export function weatherPreparationAdvice(weather: WeatherSnapshot) {
  if (weather.icon === 'storm') return '천둥번개가 예상돼요. 이동 시간을 여유 있게 잡으세요.';
  if (weather.icon === 'snow') return '눈이 예상돼요. 미끄럽지 않은 신발을 준비하세요.';
  if (weather.icon === 'rain' || weather.precipitationProbability >= 50) return `비 올 확률 ${Math.round(weather.precipitationProbability)}%. 우산을 챙기세요.`;
  if (weather.nextPrecipitationAt) {
    const time = weather.nextPrecipitationAt.match(/T(\d{2}):(\d{2})/)?.slice(1).join(':');
    if (time) return `${time}부터 비나 눈이 예상돼요. 우산을 챙기세요.`;
  }
  if (weather.apparentTemperatureC <= 5) return '체감온도가 낮아요. 따뜻한 겉옷을 챙기세요.';
  if (weather.apparentTemperatureC >= 28) return '체감온도가 높아요. 물을 챙기고 여유 있게 이동하세요.';
  return '이동하기 무난한 날씨예요.';
}

export function roundTemperature(value: number) {
  return Math.round(value);
}

export function resolveWeatherLocationName(address: WeatherGeocodedAddress) {
  const candidates = [address.district, address.subregion, address.city, address.region];
  for (const candidate of candidates) {
    const normalized = candidate?.trim();
    if (normalized) return normalized;
  }
  return null;
}

export function createWeatherPreviewFixture(): WeatherSnapshot {
  return {
    locationName: '부산진구',
    temperatureC: 27,
    apparentTemperatureC: 29,
    weatherCode: 61,
    condition: '비',
    icon: 'rain',
    precipitationProbability: 70,
    minimumTemperatureC: 23,
    maximumTemperatureC: 29,
    observedAt: '2026-07-23T13:00',
    source: 'kma',
    stale: false,
    fetchedAt: new Date('2026-07-23T13:00:00+09:00').getTime(),
    nextPrecipitationAt: '2026-07-23T14:00:00+09:00',
  };
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function firstFiniteNumber(value: unknown) {
  return Array.isArray(value) ? finiteNumber(value[0]) : null;
}
