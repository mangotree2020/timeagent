import { WeatherIcon, WeatherSnapshot } from './weather';

export type KmaGrid = { nx: number; ny: number };

export type WeatherCacheRecord = {
  version: 1;
  latitude: number;
  longitude: number;
  savedAt: number;
  weather: WeatherSnapshot;
};

export const WEATHER_CACHE_FRESH_MS = 10 * 60_000;
export const WEATHER_CACHE_FALLBACK_MS = 30 * 60_000;
export const WEATHER_REFRESH_DISTANCE_METERS = 750;

export function toKmaGrid(latitude: number, longitude: number): KmaGrid {
  const earthRadiusKm = 6371.00877;
  const gridKm = 5;
  const standardLatitude1 = radians(30);
  const standardLatitude2 = radians(60);
  const originLongitude = radians(126);
  const originLatitude = radians(38);
  const originX = 43;
  const originY = 136;
  const re = earthRadiusKm / gridKm;
  let sn = Math.tan(Math.PI * 0.25 + standardLatitude2 * 0.5) / Math.tan(Math.PI * 0.25 + standardLatitude1 * 0.5);
  sn = Math.log(Math.cos(standardLatitude1) / Math.cos(standardLatitude2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + standardLatitude1 * 0.5);
  sf = Math.pow(sf, sn) * Math.cos(standardLatitude1) / sn;
  let ro = Math.tan(Math.PI * 0.25 + originLatitude * 0.5);
  ro = re * sf / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + radians(latitude) * 0.5);
  ra = re * sf / Math.pow(ra, sn);
  let theta = radians(longitude) - originLongitude;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;
  return {
    nx: Math.floor(ra * Math.sin(theta) + originX + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + originY + 0.5),
  };
}

export function latestKmaObservationBase(now: Date) {
  const kstSafe = new Date(now.getTime() + 9 * 60 * 60_000 - 40 * 60_000);
  return {
    baseDate: `${kstSafe.getUTCFullYear()}${pad(kstSafe.getUTCMonth() + 1)}${pad(kstSafe.getUTCDate())}`,
    baseTime: `${pad(kstSafe.getUTCHours())}00`,
  };
}

export function latestKmaForecastBase(now: Date) {
  const kstSafe = new Date(now.getTime() + 9 * 60 * 60_000 - 20 * 60_000);
  const minute = Math.floor(kstSafe.getUTCMinutes() / 30) * 30;
  return {
    baseDate: `${kstSafe.getUTCFullYear()}${pad(kstSafe.getUTCMonth() + 1)}${pad(kstSafe.getUTCDate())}`,
    baseTime: `${pad(kstSafe.getUTCHours())}${pad(minute)}`,
  };
}

export function haversineDistanceMeters(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) {
  const earthRadiusMeters = 6_371_008.8;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function canUseFreshWeatherCache(record: WeatherCacheRecord, coordinate: { latitude: number; longitude: number }, now: number) {
  return now - record.savedAt <= WEATHER_CACHE_FRESH_MS
    && haversineDistanceMeters(record, coordinate) < WEATHER_REFRESH_DISTANCE_METERS;
}

export function canUseFallbackWeatherCache(record: WeatherCacheRecord, now: number) {
  return now - record.savedAt <= WEATHER_CACHE_FALLBACK_MS;
}

export function parseWeatherCache(raw: string | null): WeatherCacheRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WeatherCacheRecord>;
    if (parsed.version !== 1 || !finite(parsed.latitude) || !finite(parsed.longitude) || !finite(parsed.savedAt) || !isWeatherSnapshot(parsed.weather)) return null;
    return parsed as WeatherCacheRecord;
  } catch {
    return null;
  }
}

export function parseWeatherServiceResponse(payload: unknown): WeatherSnapshot {
  if (!isWeatherSnapshot(payload)) throw new Error('날씨 서버 응답 형식이 올바르지 않습니다.');
  return payload;
}

export function conditionFromKma(sky: number, precipitationType: number): { condition: string; icon: WeatherIcon } {
  if (precipitationType === 3 || precipitationType === 7) return { condition: '눈', icon: 'snow' };
  if (precipitationType === 2 || precipitationType === 6) return { condition: '비 또는 눈', icon: 'snow' };
  if (precipitationType === 1 || precipitationType === 4 || precipitationType === 5) return { condition: '비', icon: 'rain' };
  if (sky === 1) return { condition: '맑음', icon: 'clear' };
  if (sky === 3) return { condition: '구름 많음', icon: 'cloudy' };
  return { condition: '흐림', icon: 'cloudy' };
}

function isWeatherSnapshot(value: unknown): value is WeatherSnapshot {
  if (!value || typeof value !== 'object') return false;
  const weather = value as Partial<WeatherSnapshot>;
  return finite(weather.temperatureC)
    && finite(weather.apparentTemperatureC)
    && finite(weather.weatherCode)
    && typeof weather.condition === 'string'
    && (weather.icon === 'clear' || weather.icon === 'cloudy' || weather.icon === 'fog' || weather.icon === 'rain' || weather.icon === 'snow' || weather.icon === 'storm')
    && finite(weather.precipitationProbability)
    && finite(weather.minimumTemperatureC)
    && finite(weather.maximumTemperatureC)
    && typeof weather.observedAt === 'string'
    && (weather.source === 'kma' || weather.source === 'open-meteo')
    && typeof weather.stale === 'boolean'
    && finite(weather.fetchedAt)
    && (weather.locationName === undefined || typeof weather.locationName === 'string')
    && (weather.nextPrecipitationAt === undefined || weather.nextPrecipitationAt === null || typeof weather.nextPrecipitationAt === 'string');
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function radians(value: number) {
  return value * Math.PI / 180;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}
