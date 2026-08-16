import { corsHeaders, jsonResponse } from "../_shared/http.ts";

type Coordinate = { latitude: number; longitude: number };
type KmaItem = {
  category?: string;
  obsrValue?: string;
  fcstValue?: string;
  fcstDate?: string;
  fcstTime?: string;
};

const KMA_BASE_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";
const cache = new Map<string, { expiresAt: number; payload: unknown }>();

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "GET") return jsonResponse({ error: { code: "METHOD_NOT_ALLOWED", message: "GET 요청만 지원합니다." } }, 405);

  try {
    const url = new URL(request.url);
    const latitude = Number(url.searchParams.get("latitude"));
    const longitude = Number(url.searchParams.get("longitude"));
    if (!validCoordinate(latitude, longitude)) {
      return jsonResponse({ error: { code: "INVALID_COORDINATES", message: "현재 위치 좌표를 확인해 주세요." } }, 400);
    }

    const rounded = { latitude: round(latitude, 2), longitude: round(longitude, 2) };
    const grid = toKmaGrid(rounded.latitude, rounded.longitude);
    const cacheKey = `${grid.nx}:${grid.ny}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return weatherResponse(cached.payload, 300);

    const openMeteo = await fetchOpenMeteo(rounded);
    const serviceKey = Deno.env.get("KMA_SERVICE_KEY")?.trim();
    let payload = openMeteo;
    if (serviceKey && isSouthKorea(rounded)) {
      try {
        payload = await fetchKmaWeather(grid, serviceKey, openMeteo);
      } catch (error) {
        console.error("KMA weather fallback", error);
      }
    }

    cache.set(cacheKey, { expiresAt: Date.now() + 8 * 60_000, payload });
    return weatherResponse(payload, 300);
  } catch (error) {
    console.error("Weather service unavailable", error);
    return jsonResponse({ error: { code: "SERVICE_UNAVAILABLE", message: "날씨 정보를 불러오지 못했습니다.", retryable: true } }, 503);
  }
});

async function fetchKmaWeather(grid: { nx: number; ny: number }, serviceKey: string, fallback: Record<string, unknown>) {
  const now = new Date();
  const observationBase = latestObservationBase(now);
  const forecastBase = latestForecastBase(now);
  const [observations, forecasts] = await Promise.all([
    fetchKmaItems("getUltraSrtNcst", observationBase, grid, serviceKey),
    fetchKmaItems("getUltraSrtFcst", forecastBase, grid, serviceKey),
  ]);
  const observation = categoryValues(observations, "obsrValue");
  const forecastGroups = groupForecasts(forecasts);
  const nearest = forecastGroups[0]?.values ?? {};
  const temperature = finiteNumber(observation.T1H);
  if (temperature === null) throw new Error("KMA temperature missing");
  const humidity = finiteNumber(observation.REH) ?? 50;
  const windSpeed = finiteNumber(observation.WSD) ?? 0;
  const precipitationType = finiteNumber(observation.PTY) ?? finiteNumber(nearest.PTY) ?? 0;
  const sky = finiteNumber(nearest.SKY) ?? 4;
  const condition = conditionFromKma(sky, precipitationType);
  const nextRain = forecastGroups.find((group) => (finiteNumber(group.values.PTY) ?? 0) > 0);

  // The daily range still comes from Open-Meteo while this reading comes from the KMA grid, and
  // the two disagree often enough that the current temperature can fall outside the range.
  const fallbackMinimum = finiteNumber(fallback.minimumTemperatureC) ?? temperature;
  const fallbackMaximum = finiteNumber(fallback.maximumTemperatureC) ?? temperature;

  return {
    ...fallback,
    temperatureC: temperature,
    minimumTemperatureC: Math.min(fallbackMinimum, temperature),
    maximumTemperatureC: Math.max(fallbackMaximum, temperature),
    apparentTemperatureC: apparentTemperature(temperature, humidity, windSpeed),
    weatherCode: weatherCode(sky, precipitationType),
    condition: condition.condition,
    icon: condition.icon,
    observedAt: kstIso(observationBase.baseDate, observationBase.baseTime),
    source: "kma",
    stale: false,
    fetchedAt: Date.now(),
    nextPrecipitationAt: nextRain ? kstIso(nextRain.date, nextRain.time) : null,
  };
}

async function fetchKmaItems(endpoint: string, base: { baseDate: string; baseTime: string }, grid: { nx: number; ny: number }, serviceKey: string): Promise<KmaItem[]> {
  const url = new URL(`${KMA_BASE_URL}/${endpoint}`);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "1000");
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("base_date", base.baseDate);
  url.searchParams.set("base_time", base.baseTime);
  url.searchParams.set("nx", String(grid.nx));
  url.searchParams.set("ny", String(grid.ny));
  const response = await fetch(url, { signal: AbortSignal.timeout(7_000) });
  if (!response.ok) throw new Error(`KMA HTTP ${response.status}`);
  const payload = await response.json();
  const header = payload?.response?.header;
  if (header?.resultCode !== "00") throw new Error(`KMA ${header?.resultCode || "invalid"}`);
  const items = payload?.response?.body?.items?.item;
  if (!Array.isArray(items)) throw new Error("KMA items missing");
  return items;
}

async function fetchOpenMeteo(coordinate: Coordinate) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", coordinate.latitude.toFixed(2));
  url.searchParams.set("longitude", coordinate.longitude.toFixed(2));
  url.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code");
  url.searchParams.set("daily", "precipitation_probability_max,temperature_2m_min,temperature_2m_max");
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("timezone", "auto");
  const response = await fetch(url, { signal: AbortSignal.timeout(7_000) });
  if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
  const payload = await response.json();
  const weatherCodeValue = Number(payload?.current?.weather_code);
  const condition = conditionFromWmo(weatherCodeValue);
  return {
    temperatureC: requiredNumber(payload?.current?.temperature_2m),
    apparentTemperatureC: requiredNumber(payload?.current?.apparent_temperature),
    weatherCode: requiredNumber(weatherCodeValue),
    condition: condition.condition,
    icon: condition.icon,
    precipitationProbability: requiredNumber(payload?.daily?.precipitation_probability_max?.[0]),
    minimumTemperatureC: requiredNumber(payload?.daily?.temperature_2m_min?.[0]),
    maximumTemperatureC: requiredNumber(payload?.daily?.temperature_2m_max?.[0]),
    observedAt: String(payload?.current?.time || ""),
    source: "open-meteo",
    stale: false,
    fetchedAt: Date.now(),
    nextPrecipitationAt: null,
  };
}

function latestObservationBase(now: Date) {
  return kstBase(new Date(now.getTime() - 40 * 60_000), 0);
}

function latestForecastBase(now: Date) {
  return kstBase(new Date(now.getTime() - 20 * 60_000), 30);
}

function kstBase(date: Date, minuteStep: number) {
  const kst = new Date(date.getTime() + 9 * 60 * 60_000);
  let minutes = kst.getUTCMinutes();
  if (minuteStep) minutes = Math.floor(minutes / minuteStep) * minuteStep;
  else minutes = 0;
  return {
    baseDate: `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}`,
    baseTime: `${pad(kst.getUTCHours())}${pad(minutes)}`,
  };
}

function groupForecasts(items: KmaItem[]) {
  const groups = new Map<string, Record<string, string>>();
  for (const item of items) {
    if (!item.fcstDate || !item.fcstTime || !item.category) continue;
    const key = `${item.fcstDate}:${item.fcstTime}`;
    groups.set(key, { ...(groups.get(key) ?? {}), [item.category]: String(item.fcstValue ?? "") });
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, values]) => {
    const [date, time] = key.split(":");
    return { date, time, values };
  });
}

function categoryValues(items: KmaItem[], valueKey: "obsrValue" | "fcstValue") {
  return Object.fromEntries(items.flatMap((item) => item.category ? [[item.category, String(item[valueKey] ?? "")]] : []));
}

function apparentTemperature(temperature: number, humidity: number, windSpeedMetersPerSecond: number) {
  if (temperature >= 27 && humidity >= 40) {
    const t = temperature * 9 / 5 + 32;
    const hi = -42.379 + 2.04901523 * t + 10.14333127 * humidity - 0.22475541 * t * humidity
      - 0.00683783 * t * t - 0.05481717 * humidity * humidity + 0.00122874 * t * t * humidity
      + 0.00085282 * t * humidity * humidity - 0.00000199 * t * t * humidity * humidity;
    return round((hi - 32) * 5 / 9, 1);
  }
  const windKph = windSpeedMetersPerSecond * 3.6;
  if (temperature <= 10 && windKph > 4.8) {
    return round(13.12 + 0.6215 * temperature - 11.37 * windKph ** 0.16 + 0.3965 * temperature * windKph ** 0.16, 1);
  }
  return temperature;
}

function conditionFromKma(sky: number, precipitationType: number) {
  if (precipitationType === 3 || precipitationType === 7) return { condition: "눈", icon: "snow" };
  if (precipitationType === 2 || precipitationType === 6) return { condition: "비 또는 눈", icon: "snow" };
  if (precipitationType > 0) return { condition: "비", icon: "rain" };
  if (sky === 1) return { condition: "맑음", icon: "clear" };
  if (sky === 3) return { condition: "구름 많음", icon: "cloudy" };
  return { condition: "흐림", icon: "cloudy" };
}

function conditionFromWmo(code: number) {
  if (code === 0) return { condition: "맑음", icon: "clear" };
  if (code <= 2) return { condition: "대체로 맑음", icon: "clear" };
  if (code === 3) return { condition: "흐림", icon: "cloudy" };
  if (code === 45 || code === 48) return { condition: "안개", icon: "fog" };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { condition: "비", icon: "rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { condition: "눈", icon: "snow" };
  if (code >= 95) return { condition: "천둥번개", icon: "storm" };
  return { condition: "날씨 변화", icon: "cloudy" };
}

function weatherCode(sky: number, precipitationType: number) {
  if (precipitationType === 3 || precipitationType === 7) return 71;
  if (precipitationType === 2 || precipitationType === 6) return 68;
  if (precipitationType > 0) return 61;
  if (sky === 1) return 0;
  if (sky === 3) return 2;
  return 3;
}

function toKmaGrid(latitude: number, longitude: number) {
  const re = 6371.00877 / 5;
  const slat1 = radians(30);
  const slat2 = radians(60);
  const olon = radians(126);
  const olat = radians(38);
  let sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(Math.tan(Math.PI / 4 + slat2 / 2) / Math.tan(Math.PI / 4 + slat1 / 2));
  let sf = Math.tan(Math.PI / 4 + slat1 / 2);
  sf = sf ** sn * Math.cos(slat1) / sn;
  let ro = re * sf / Math.tan(Math.PI / 4 + olat / 2) ** sn;
  let ra = re * sf / Math.tan(Math.PI / 4 + radians(latitude) / 2) ** sn;
  let theta = (radians(longitude) - olon) * sn;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  return { nx: Math.floor(ra * Math.sin(theta) + 43.5), ny: Math.floor(ro - ra * Math.cos(theta) + 136.5) };
}

function weatherResponse(payload: unknown, maxAge: number) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${maxAge}` } });
}

function kstIso(date: string, time: string) {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:00+09:00`;
}

function validCoordinate(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

function isSouthKorea(coordinate: Coordinate) {
  return coordinate.latitude >= 32.5 && coordinate.latitude <= 39.5 && coordinate.longitude >= 124 && coordinate.longitude <= 132;
}

function finiteNumber(value: unknown) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function requiredNumber(value: unknown) { const number = finiteNumber(value); if (number === null) throw new Error("Weather value missing"); return number; }
function radians(value: number) { return value * Math.PI / 180; }
function round(value: number, precision: number) { const factor = 10 ** precision; return Math.round(value * factor) / factor; }
function pad(value: number) { return String(value).padStart(2, "0"); }
