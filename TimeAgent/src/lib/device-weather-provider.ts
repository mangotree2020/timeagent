import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import {
  canUseFallbackWeatherCache,
  canUseFreshWeatherCache,
  parseWeatherCache,
  parseWeatherServiceResponse,
  WeatherCacheRecord,
} from '@/lib/kma-weather';
import {
  buildWeatherForecastUrl,
  parseWeatherForecast,
  resolveWeatherLocationName,
  WeatherSnapshot,
} from '@/lib/weather';

export const WEATHER_CACHE_STORAGE_KEY = '@on-time/weather-cache';

export class WeatherPermissionNeededError extends Error {
  readonly name = 'WeatherPermissionNeededError';
}

export async function loadCurrentDeviceWeather(): Promise<WeatherSnapshot> {
  const permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted) throw new WeatherPermissionNeededError('현재 위치 권한이 필요합니다.');

  const now = Date.now();
  const cache = parseWeatherCache(await AsyncStorage.getItem(WEATHER_CACHE_STORAGE_KEY));
  const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000, requiredAccuracy: 1_500 });
  if (cache && lastKnown && canUseFreshWeatherCache(cache, lastKnown.coords, now)) {
    return localizeCachedWeather(cache, lastKnown.coords);
  }

  const position = lastKnown ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  const coordinate = { latitude: position.coords.latitude, longitude: position.coords.longitude };
  if (cache && canUseFreshWeatherCache(cache, coordinate, now)) {
    return localizeCachedWeather(cache, coordinate);
  }

  try {
    const [weather, locationName] = await Promise.all([
      loadWeatherFromBestProvider(coordinate.latitude, coordinate.longitude),
      reverseGeocodeWeatherLocation(coordinate),
    ]);
    const localizedWeather = locationName ? { ...weather, locationName } : weather;
    const record: WeatherCacheRecord = { version: 1, ...coordinate, savedAt: now, weather: localizedWeather };
    await AsyncStorage.setItem(WEATHER_CACHE_STORAGE_KEY, JSON.stringify(record));
    return localizedWeather;
  } catch (error) {
    if (cache && canUseFallbackWeatherCache(cache, now)) {
      return { ...await localizeCachedWeather(cache, coordinate), stale: true };
    }
    throw error;
  }
}

async function localizeCachedWeather(record: WeatherCacheRecord, coordinate: { latitude: number; longitude: number }) {
  if (record.weather.locationName) return record.weather;
  const locationName = await reverseGeocodeWeatherLocation(coordinate);
  if (!locationName) return record.weather;
  const weather = { ...record.weather, locationName };
  await AsyncStorage.setItem(WEATHER_CACHE_STORAGE_KEY, JSON.stringify({ ...record, weather })).catch(() => undefined);
  return weather;
}

async function reverseGeocodeWeatherLocation(coordinate: { latitude: number; longitude: number }) {
  try {
    const [address] = await Location.reverseGeocodeAsync(coordinate);
    return address ? resolveWeatherLocationName(address) : null;
  } catch {
    return null;
  }
}

async function loadWeatherFromBestProvider(latitude: number, longitude: number) {
  const serviceBaseUrl = configuredWeatherServiceUrl();
  if (serviceBaseUrl) {
    try {
      return await fetchWeatherService(serviceBaseUrl, latitude, longitude);
    } catch {
      // Keep the home usable when the Korean forecast proxy is temporarily unavailable.
    }
  }
  return fetchOpenMeteo(latitude, longitude);
}

async function fetchWeatherService(baseUrl: string, latitude: number, longitude: number) {
  const url = new URL(baseUrl);
  url.searchParams.set('latitude', latitude.toFixed(2));
  url.searchParams.set('longitude', longitude.toFixed(2));
  return parseWeatherServiceResponse(await fetchJson(url.toString()));
}

async function fetchOpenMeteo(latitude: number, longitude: number) {
  return parseWeatherForecast(await fetchJson(buildWeatherForecastUrl(latitude, longitude)));
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`날씨 서버 오류: ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function configuredWeatherServiceUrl() {
  const explicit = process.env.EXPO_PUBLIC_WEATHER_API_BASE_URL?.trim().replace(/\/+$/, '');
  if (explicit?.startsWith('https://')) return explicit;
  return '';
}
