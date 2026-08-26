import { corsHeaders, jsonResponse, upstreamError } from "../_shared/http.ts";
import {
  matchTagoStation,
  normalizeTagoArrivals,
  normalizeTagoStations,
  tagoOutcome,
  TransitArrivalResult,
} from "./arrivals-contract.ts";
import { createProviderMetrics, outcomeForStatus, ProviderOutcome } from "./provider-metrics.ts";
import { createShortCache } from "./short-cache.ts";
import {
  bestTransitRoutePerMode,
  Coordinate,
  normalizeTmapItineraries,
  tmapSearchDttm,
  transitCacheKey,
  TransitRoute,
} from "./transit-contract.ts";

type TmapFeature = {
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
  properties?: {
    totalDistance?: number;
    totalTime?: number;
    description?: string;
    turnType?: number | string;
    pointType?: string;
  };
};

import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

// The web client id is a public identifier that already ships inside the app binary,
// so a source fallback is safe; the secret allows rotating it without a redeploy.
const DEFAULT_GOOGLE_WEB_CLIENT_ID = "18828044372-ta832lgj7vetva7u93lqilebvrhgv73j.apps.googleusercontent.com";
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
// The Android sign-in SDK hands back the ID token minted at sign-in time and never refreshes
// it, so most calls arrive after the one-hour expiry. Signature, issuer, and audience checks
// stay strict — only the expiry gets this grace, which callers should treat as the trade-off
// for keeping a low-sensitivity list (place names) reachable without a fresh sign-in.
const ID_TOKEN_EXPIRY_GRACE_SECONDS = 60 * 60 * 24 * 90;
const SAVED_PLACES_SERVER_CAP = 24;
const SAVED_PLACES_LIST_LIMIT = 8;

const NAVER_GEOCODING_URL = "https://maps.apigw.ntruss.com/map-geocode/v2/geocode";
const NAVER_REVERSE_GEOCODING_URL = "https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc";
const TMAP_POI_URL = "https://apis.openapi.sk.com/tmap/pois";
const TMAP_PEDESTRIAN_URL = "https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1";
const TMAP_CAR_URL = "https://apis.openapi.sk.com/tmap/routes?version=1";
const TMAP_TRANSIT_URL = "https://apis.openapi.sk.com/transit/routes";
const TAGO_NEARBY_STATIONS_URL = "https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getCrdntPrxmtSttnList";
const TAGO_STATION_ARRIVALS_URL = "https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList";

/** The same journey asked again within a minute is answered from memory, calculated-at intact. */
const ROUTE_CACHE_TTL_MS = 60_000;
/** Realtime arrivals are reused for twenty seconds so a screen left open respects provider limits. */
const ARRIVALS_CACHE_TTL_MS = 20_000;

const transitSummaryCache = createShortCache<TransitRoute[]>();
const transitDetailCache = createShortCache<TransitRoute[]>();
const drivingCache = createShortCache<TravelEstimate[]>();
const walkingCache = createShortCache<TravelEstimate | null>();
const arrivalsCache = createShortCache<TransitArrivalResult>();
const metrics = createProviderMetrics();

/** An upstream answer that is not an answer: never cached, filed under its status. */
class UpstreamStatusError extends Error {
  constructor(readonly status: number) {
    super(`upstream ${status}`);
  }
}

/** Runs one upstream call and files its outcome and latency under the provider, nothing else. */
async function measured<T>(provider: string, operation: string, call: () => Promise<{ status: number; value: T }>): Promise<T> {
  const startedAt = Date.now();
  try {
    const { status, value } = await call();
    metrics.record(provider, operation, outcomeForStatus(status), Date.now() - startedAt);
    return value;
  } catch (error) {
    const outcome: ProviderOutcome = error instanceof UpstreamStatusError
      ? outcomeForStatus(error.status)
      : error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "unavailable";
    metrics.record(provider, operation, outcome, Date.now() - startedAt);
    throw error;
  }
}

function requiredSecret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

// data.go.kr issues one account-wide Decoding key that every applied-for service shares, so the
// weather key already reaches TAGO once the account has applied for the bus services.
// A dedicated TAGO_SERVICE_KEY still wins when the keys are meant to be kept apart.
function tagoServiceKey(): string | undefined {
  return Deno.env.get("TAGO_SERVICE_KEY")?.trim() || Deno.env.get("KMA_SERVICE_KEY")?.trim() || undefined;
}

function coordinate(value: unknown): Coordinate | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function lineCoordinates(geometry: TmapFeature["geometry"]): Coordinate[] {
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];

  if (geometry.type === "LineString") {
    return geometry.coordinates
      .map(coordinate)
      .filter((value): value is Coordinate => value !== null);
  }

  if (geometry.type === "MultiLineString") {
    return geometry.coordinates.flatMap((line) =>
      Array.isArray(line)
        ? line.map(coordinate).filter((value): value is Coordinate => value !== null)
        : []
    );
  }

  return [];
}

// Saved places are keyed by the Google account, so every request must prove which
// account is calling. The ID token minted on the device is verified against Google
// before the subject claim is trusted as the row key.
const verifiedTokens = new Map<string, { sub: string; expiresAtMs: number }>();

async function verifyGoogleIdToken(request: Request): Promise<string | null> {
  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
  if (!token) return null;

  const cached = verifiedTokens.get(token);
  if (cached) {
    if (cached.expiresAtMs > Date.now()) return cached.sub;
    verifiedTokens.delete(token);
  }

  let sub = "";
  try {
    const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: Deno.env.get("GOOGLE_WEB_CLIENT_ID") || DEFAULT_GOOGLE_WEB_CLIENT_ID,
      clockTolerance: ID_TOKEN_EXPIRY_GRACE_SECONDS,
    });
    sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  } catch {
    return null;
  }
  if (!sub) return null;

  // The cache holds each verified token briefly so bursts of saves skip re-verification.
  verifiedTokens.set(token, { sub, expiresAtMs: Date.now() + 10 * 60 * 1000 });
  if (verifiedTokens.size > 512) {
    for (const key of verifiedTokens.keys()) {
      if (verifiedTokens.size <= 256) break;
      verifiedTokens.delete(key);
    }
  }
  return sub;
}

function savedPlacesHeaders(): Record<string, string> {
  const serviceKey = requiredSecret("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
}

function savedPlacesUrl(query: string): string {
  return `${requiredSecret("SUPABASE_URL")}/rest/v1/saved_places${query}`;
}

function unauthorized(): Response {
  return jsonResponse({ error: { code: "UNAUTHORIZED", message: "로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요." } }, 401);
}

function savedPlacesUnavailable(): Response {
  return jsonResponse(
    { error: { code: "UPSTREAM_UNAVAILABLE", message: "저장된 장소를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", retryable: true } },
    503,
  );
}

type SavedPlaceRow = {
  place_id: string;
  name: string;
  road_address: string;
  jibun_address: string;
  latitude: number;
  longitude: number;
  last_used_at: number;
};

async function listSavedPlaces(request: Request): Promise<Response> {
  const sub = await verifyGoogleIdToken(request);
  if (!sub) return unauthorized();

  const upstream = await fetch(
    savedPlacesUrl(`?user_id=eq.${encodeURIComponent(sub)}&select=place_id,name,road_address,jibun_address,latitude,longitude,last_used_at&order=last_used_at.desc&limit=${SAVED_PLACES_LIST_LIMIT}`),
    { headers: savedPlacesHeaders(), signal: AbortSignal.timeout(8_000) },
  );
  if (!upstream.ok) {
    console.error("saved-places list rejected", upstream.status, await upstream.text().catch(() => ""));
    return savedPlacesUnavailable();
  }
  const rows = await upstream.json() as SavedPlaceRow[];
  return jsonResponse({
    places: rows.map((row) => ({
      id: row.place_id,
      name: row.name,
      roadAddress: row.road_address,
      jibunAddress: row.jibun_address,
      coordinate: { latitude: row.latitude, longitude: row.longitude },
      lastUsedAt: Number(row.last_used_at),
    })),
  });
}

async function rememberSavedPlace(request: Request): Promise<Response> {
  const sub = await verifyGoogleIdToken(request);
  if (!sub) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: { code: "INVALID_BODY", message: "저장할 장소 형식이 올바르지 않습니다." } }, 400);
  }

  const place = body.place as Record<string, unknown> | undefined;
  const coordinateValue = place?.coordinate as Record<string, unknown> | undefined;
  const latitude = Number(coordinateValue?.latitude);
  const longitude = Number(coordinateValue?.longitude);
  const name = typeof place?.name === "string" ? place.name.trim() : "";
  const lastUsedAt = Number(place?.lastUsedAt);
  if (
    !name || name.length > 200
    || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    || !Number.isFinite(lastUsedAt) || lastUsedAt <= 0
  ) {
    return jsonResponse({ error: { code: "INVALID_BODY", message: "저장할 장소 형식이 올바르지 않습니다." } }, 400);
  }

  // The row key repeats the client's coordinate-based place id so the same spot
  // never duplicates, regardless of which device saved it first.
  const placeId = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  const row = {
    user_id: sub,
    place_id: placeId,
    name,
    road_address: typeof place?.roadAddress === "string" ? place.roadAddress.trim().slice(0, 300) : "",
    jibun_address: typeof place?.jibunAddress === "string" ? place.jibunAddress.trim().slice(0, 300) : "",
    latitude,
    longitude,
    last_used_at: Math.round(lastUsedAt),
    updated_at: new Date().toISOString(),
  };

  // A single database function keeps the upsert and the per-account cap pruning in one
  // transaction: concurrent saves cannot roll recency backwards or delete a fresh place.
  const upserted = await fetch(`${requiredSecret("SUPABASE_URL")}/rest/v1/rpc/remember_saved_place`, {
    method: "POST",
    headers: savedPlacesHeaders(),
    body: JSON.stringify({
      p_user_id: row.user_id,
      p_place_id: row.place_id,
      p_name: row.name,
      p_road_address: row.road_address,
      p_jibun_address: row.jibun_address,
      p_latitude: row.latitude,
      p_longitude: row.longitude,
      p_last_used_at: row.last_used_at,
      p_cap: SAVED_PLACES_SERVER_CAP,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!upserted.ok) {
    console.error("saved-places upsert rejected", upserted.status, await upserted.text().catch(() => ""));
    return savedPlacesUnavailable();
  }

  return jsonResponse({ ok: true, id: placeId });
}

/** Deleting the account must also erase the account's places from the server. */
async function deleteSavedPlaces(request: Request): Promise<Response> {
  const sub = await verifyGoogleIdToken(request);
  if (!sub) return unauthorized();

  const deleted = await fetch(savedPlacesUrl(`?user_id=eq.${encodeURIComponent(sub)}`), {
    method: "DELETE",
    headers: savedPlacesHeaders(),
    signal: AbortSignal.timeout(8_000),
  });
  if (!deleted.ok) return savedPlacesUnavailable();
  return jsonResponse({ ok: true });
}

function pilotSummariesUrl(query: string): string {
  return `${requiredSecret("SUPABASE_URL")}/rest/v1/pilot_summaries${query}`;
}

function pilotSummaryUnavailable(): Response {
  return jsonResponse(
    { error: { code: "UPSTREAM_UNAVAILABLE", message: "검증 집계를 저장하지 못했습니다.", retryable: true } },
    503,
  );
}

/** A percentage, or null while nothing has been measured. Anything else is a client that lied. */
function optionalRate(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return undefined;
  return Math.round(rate);
}

function count(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1_000_000) return undefined;
  return parsed;
}

const PILOT_SEGMENTS = ["student", "worker", "variable-routine", "prefer-not-to-answer"];

/**
 * Records where one tester account currently stands. The Plus preview screen sends this as it
 * closes, so an account writes many times over a pilot and only the latest state is kept: the
 * operator reads a roster of testers, not a pile of snapshots to de-duplicate.
 */
async function savePilotSummary(request: Request): Promise<Response> {
  const sub = await verifyGoogleIdToken(request);
  if (!sub) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: { code: "INVALID_BODY", message: "검증 집계 형식이 올바르지 않습니다." } }, 400);
  }

  const summary = body.summary as Record<string, unknown> | undefined;
  const segment = typeof summary?.segment === "string" ? summary.segment : "";
  const completedSchedules = count(summary?.completedSchedules);
  const plusOfferViews = count(summary?.plusOfferViews);
  const plusInterestSelections = count(summary?.plusInterestSelections);
  const plusInterestWithdrawals = count(summary?.plusInterestWithdrawals);
  const rates = {
    schedule_completion_rate: optionalRate(summary?.scheduleCompletionRate),
    notification_start_rate: optionalRate(summary?.notificationStartRate),
    delay_apply_rate: optionalRate(summary?.delayApplyRate),
    delay_reject_rate: optionalRate(summary?.delayRejectRate),
    on_time_arrival_rate: optionalRate(summary?.onTimeArrivalRate),
  };
  const stepError = summary?.averageStepErrorMinutes;
  const averageStepErrorMinutes = stepError === null || stepError === undefined
    ? null
    : Number.isFinite(Number(stepError)) && Number(stepError) >= 0 ? Number(stepError) : undefined;

  if (
    !PILOT_SEGMENTS.includes(segment)
    || completedSchedules === undefined
    || plusOfferViews === undefined
    || plusInterestSelections === undefined
    || plusInterestWithdrawals === undefined
    || averageStepErrorMinutes === undefined
    || Object.values(rates).some((rate) => rate === undefined)
  ) {
    return jsonResponse({ error: { code: "INVALID_BODY", message: "검증 집계 형식이 올바르지 않습니다." } }, 400);
  }

  const upserted = await fetch(pilotSummariesUrl(""), {
    method: "POST",
    headers: { ...savedPlacesHeaders(), Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      user_id: sub,
      segment,
      completed_schedules: completedSchedules,
      ...rates,
      average_step_error_minutes: averageStepErrorMinutes,
      plus_offer_views: plusOfferViews,
      plus_interest_selections: plusInterestSelections,
      plus_interest_withdrawals: plusInterestWithdrawals,
      interested: summary?.interested === true,
      selected_plan: typeof summary?.selectedPlan === "string" ? summary.selectedPlan.trim().slice(0, 40) : "미등록",
      updated_at: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!upserted.ok) {
    console.error("pilot-summary upsert rejected", upserted.status, await upserted.text().catch(() => ""));
    return pilotSummaryUnavailable();
  }

  return jsonResponse({ ok: true });
}

/** Deleting the account must also erase what it contributed to the pilot statistics. */
async function deletePilotSummary(request: Request): Promise<Response> {
  const sub = await verifyGoogleIdToken(request);
  if (!sub) return unauthorized();

  const deleted = await fetch(pilotSummariesUrl(`?user_id=eq.${encodeURIComponent(sub)}`), {
    method: "DELETE",
    headers: savedPlacesHeaders(),
    signal: AbortSignal.timeout(8_000),
  });
  if (!deleted.ok) return pilotSummaryUnavailable();
  return jsonResponse({ ok: true });
}

async function geocode(requestUrl: URL): Promise<Response> {
  const query = requestUrl.searchParams.get("query")?.trim();
  if (!query) {
    return jsonResponse({ error: { code: "INVALID_QUERY", message: "검색할 주소를 입력해 주세요." } }, 400);
  }

  const upstreamUrl = new URL(NAVER_GEOCODING_URL);
  upstreamUrl.searchParams.set("query", query);
  const upstream = await fetch(upstreamUrl, {
    headers: {
      "x-ncp-apigw-api-key-id": requiredSecret("NAVER_CLIENT_ID"),
      "x-ncp-apigw-api-key": requiredSecret("NAVER_CLIENT_SECRET"),
    },
    signal: AbortSignal.timeout(8_000),
  });

  if (!upstream.ok) return upstreamError("naver", upstream.status);
  const payload = await upstream.json();
  const places = Array.isArray(payload?.addresses)
    ? payload.addresses.flatMap((item: Record<string, unknown>) => {
        const latitude = Number(item.y);
        const longitude = Number(item.x);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
        return [{
          name: String(item.roadAddress || item.jibunAddress || query),
          roadAddress: String(item.roadAddress || ""),
          jibunAddress: String(item.jibunAddress || ""),
          coordinate: { latitude, longitude },
        }];
      })
    : [];

  return jsonResponse({ places });
}

function queryCoordinate(requestUrl: URL): Coordinate | null {
  const latitude = Number(requestUrl.searchParams.get("latitude"));
  const longitude = Number(requestUrl.searchParams.get("longitude"));
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function stripHtml(value: unknown): string {
  return String(value || "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim();
}

function joinAddress(...parts: unknown[]): string {
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join(" ").replace(/\s+/g, " ");
}

async function searchPlaces(requestUrl: URL): Promise<Response> {
  const query = requestUrl.searchParams.get("query")?.trim();
  if (!query) {
    return jsonResponse({ error: { code: "INVALID_QUERY", message: "검색할 장소명을 입력해 주세요." } }, 400);
  }

  const upstreamUrl = new URL(TMAP_POI_URL);
  upstreamUrl.searchParams.set("version", "1");
  upstreamUrl.searchParams.set("format", "json");
  upstreamUrl.searchParams.set("searchKeyword", query);
  upstreamUrl.searchParams.set("count", "10");
  upstreamUrl.searchParams.set("reqCoordType", "WGS84GEO");
  upstreamUrl.searchParams.set("resCoordType", "WGS84GEO");
  const near = queryCoordinate(requestUrl);
  if (near) {
    upstreamUrl.searchParams.set("centerLat", String(near.latitude));
    upstreamUrl.searchParams.set("centerLon", String(near.longitude));
    upstreamUrl.searchParams.set("radius", "20");
  }
  const upstream = await fetch(upstreamUrl, {
    headers: { appKey: requiredSecret("TMAP_APP_KEY") },
    signal: AbortSignal.timeout(8_000),
  });
  if (!upstream.ok) return upstreamError("tmap", upstream.status);
  const payload = await upstream.json();
  const pois = payload?.searchPoiInfo?.pois?.poi;
  const places = Array.isArray(pois) ? pois.flatMap((item: Record<string, unknown>) => {
    const latitude = Number(item.frontLat ?? item.noorLat);
    const longitude = Number(item.frontLon ?? item.noorLon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    const road = Array.isArray(item.newAddressList)
      ? item.newAddressList[0]
      : (item.newAddressList as { newAddress?: Record<string, unknown>[] } | undefined)?.newAddress?.[0];
    return [{
      name: stripHtml(item.name) || query,
      roadAddress: stripHtml(road?.fullAddressRoad) || joinAddress(item.upperAddrName, item.middleAddrName, item.lowerAddrName, item.roadName, item.firstBuildNo, item.secondBuildNo),
      jibunAddress: joinAddress(item.upperAddrName, item.middleAddrName, item.lowerAddrName, item.detailAddrName, item.firstNo, item.secondNo),
      coordinate: { latitude, longitude },
    }];
  }) : [];
  return jsonResponse({ places });
}

async function reverseGeocode(requestUrl: URL): Promise<Response> {
  const selected = queryCoordinate(requestUrl);
  if (!selected) {
    return jsonResponse({ error: { code: "INVALID_COORDINATES", message: "지도에서 선택한 위치를 확인해 주세요." } }, 400);
  }
  const upstreamUrl = new URL(NAVER_REVERSE_GEOCODING_URL);
  upstreamUrl.searchParams.set("coords", `${selected.longitude},${selected.latitude}`);
  upstreamUrl.searchParams.set("orders", "roadaddr,addr");
  upstreamUrl.searchParams.set("output", "json");
  const upstream = await fetch(upstreamUrl, {
    headers: {
      "x-ncp-apigw-api-key-id": requiredSecret("NAVER_CLIENT_ID"),
      "x-ncp-apigw-api-key": requiredSecret("NAVER_CLIENT_SECRET"),
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!upstream.ok) return upstreamError("naver", upstream.status);
  const payload = await upstream.json();
  const results: Record<string, unknown>[] = Array.isArray(payload?.results) ? payload.results : [];
  const roadResult = results.find((item) => item.name === "roadaddr");
  const addressResult = results.find((item) => item.name === "addr");
  const roadRegion = roadResult?.region as Record<string, Record<string, unknown>> | undefined;
  const addressRegion = addressResult?.region as Record<string, Record<string, unknown>> | undefined;
  const land = (roadResult?.land || addressResult?.land || {}) as Record<string, unknown>;
  const roadAddress = roadResult ? joinAddress(
    roadRegion?.area1?.name, roadRegion?.area2?.name, roadRegion?.area3?.name,
    land.name, land.number1, land.number2 ? `-${land.number2}` : "",
  ).replace(/\s+-/g, "-") : "";
  const jibunLand = (addressResult?.land || {}) as Record<string, unknown>;
  const jibunAddress = addressResult ? joinAddress(
    addressRegion?.area1?.name, addressRegion?.area2?.name, addressRegion?.area3?.name,
    jibunLand.number1, jibunLand.number2 ? `-${jibunLand.number2}` : "",
  ).replace(/\s+-/g, "-") : "";
  return jsonResponse({
    place: {
      name: stripHtml(land.name) || "지도에서 지정한 위치",
      roadAddress,
      jibunAddress,
      coordinate: selected,
    },
  });
}

type TravelMode = "도보" | "버스" | "지하철" | "자가용" | "택시";
const TRAVEL_MODES: TravelMode[] = ["도보", "버스", "지하철", "자가용", "택시"];

type TravelEstimate = {
  mode: TravelMode;
  minutes: number;
  distanceMeters: number;
  fareWon?: number;
  transferCount?: number;
  /** Minutes on foot inside the journey — to the stop, between transfers, from the last stop. */
  walkMinutes?: number;
  source: "route";
  provider: string;
  calculatedAt: string;
  /**
   * What the number rests on: 'traffic' is the road as it is now, 'timetable' is the service at
   * the departure time asked for, 'measured' is a walking route with neither.
   */
  basis: "traffic" | "timetable" | "measured";
  /** The ISO instant a timetable answer was asked for. */
  departureAt?: string;
  /** The first bus or subway boarded, when the mode has one — the leg realtime arrivals are for. */
  firstBoarding?: TransitRoute["firstBoarding"];
};

function minutesFromSeconds(seconds: number) {
  return Math.max(1, Math.round(seconds / 60));
}

/** The walking leg of the journey, from the same TMAP route the turn-by-turn guidance uses. */
async function walkingEstimate(origin: Coordinate, destination: Coordinate): Promise<TravelEstimate | null> {
  return walkingCache.getOrCreate(transitCacheKey(origin, destination, undefined, "walk"), ROUTE_CACHE_TTL_MS, () =>
    measured("TMAP", "pedestrian", async () => {
      const upstream = await fetch(TMAP_PEDESTRIAN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", appKey: requiredSecret("TMAP_APP_KEY") },
        body: JSON.stringify({
          startX: origin.longitude,
          startY: origin.latitude,
          endX: destination.longitude,
          endY: destination.latitude,
          startName: "출발지",
          endName: "도착지",
          reqCoordType: "WGS84GEO",
          resCoordType: "WGS84GEO",
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!upstream.ok) throw new UpstreamStatusError(upstream.status);
      return { status: upstream.status, value: parseWalkingEstimate(await upstream.json()) };
    }));
}

function parseWalkingEstimate(payload: unknown): TravelEstimate | null {
  const source = payload as { features?: unknown } | null;
  const features: TmapFeature[] = Array.isArray(source?.features) ? source.features as TmapFeature[] : [];
  const summary = features.find((feature) => Number.isFinite(Number(feature.properties?.totalTime)))?.properties;
  const seconds = Number(summary?.totalTime);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return {
    mode: "도보",
    minutes: minutesFromSeconds(seconds),
    distanceMeters: Math.max(0, Math.round(Number(summary?.totalDistance) || 0)),
    walkMinutes: minutesFromSeconds(seconds),
    source: "route",
    provider: "TMAP",
    calculatedAt: new Date().toISOString(),
    basis: "measured",
  };
}

/**
 * Driving, with the traffic on the road right now. The same answer serves 자가용 and 택시 — the road
 * is the road — and TMAP prices the taxi ride while it is at it.
 */
async function drivingEstimates(origin: Coordinate, destination: Coordinate): Promise<TravelEstimate[]> {
  return drivingCache.getOrCreate(transitCacheKey(origin, destination, undefined, "car"), ROUTE_CACHE_TTL_MS, () =>
    measured("TMAP", "car", async () => {
      const upstream = await fetch(TMAP_CAR_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", appKey: requiredSecret("TMAP_APP_KEY") },
        body: JSON.stringify({
          startX: origin.longitude,
          startY: origin.latitude,
          endX: destination.longitude,
          endY: destination.latitude,
          reqCoordType: "WGS84GEO",
          resCoordType: "WGS84GEO",
          searchOption: "0",
          trafficInfo: "Y",
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!upstream.ok) throw new UpstreamStatusError(upstream.status);
      return { status: upstream.status, value: parseDrivingEstimates(await upstream.json()) };
    }));
}

function parseDrivingEstimates(payload: unknown): TravelEstimate[] {
  const source = payload as { features?: unknown } | null;
  const features: TmapFeature[] = Array.isArray(source?.features) ? source.features as TmapFeature[] : [];
  const summary = features.find((feature) => Number.isFinite(Number(feature.properties?.totalTime)))?.properties as
    | Record<string, unknown>
    | undefined;
  const seconds = Number(summary?.totalTime);
  if (!Number.isFinite(seconds) || seconds <= 0) return [];
  const distanceMeters = Math.max(0, Math.round(Number(summary?.totalDistance) || 0));
  const minutes = minutesFromSeconds(seconds);
  const taxiFare = Number(summary?.taxiFare);
  const calculatedAt = new Date().toISOString();
  return [
    { mode: "자가용", minutes, distanceMeters, walkMinutes: 0, source: "route", provider: "TMAP", calculatedAt, basis: "traffic" },
    {
      mode: "택시",
      minutes,
      distanceMeters,
      walkMinutes: 0,
      fareWon: Number.isFinite(taxiFare) && taxiFare > 0 ? Math.round(taxiFare) : undefined,
      source: "route",
      provider: "TMAP",
      calculatedAt,
      basis: "traffic",
    },
  ];
}

/**
 * Bus and subway from the timetables, for the departure time the schedule implies rather than for
 * now: a 09:00 appointment next Tuesday is answered with Tuesday morning's service. The summary
 * carries the legs without their drawn shapes; the detail lookup keeps the shapes for the map.
 */
async function transitRoutes(
  origin: Coordinate,
  destination: Coordinate,
  departureAt: string | undefined,
  { detail }: { detail: boolean },
): Promise<TransitRoute[]> {
  const cache = detail ? transitDetailCache : transitSummaryCache;
  return cache.getOrCreate(transitCacheKey(origin, destination, departureAt, detail ? "detail" : "summary"), ROUTE_CACHE_TTL_MS, () =>
    measured("TMAP", detail ? "transit-detail" : "transit", async () => {
      const searchDttm = departureAt ? tmapSearchDttm(departureAt) : null;
      const upstream = await fetch(TMAP_TRANSIT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", appKey: requiredSecret("TMAP_APP_KEY") },
        body: JSON.stringify({
          startX: String(origin.longitude),
          startY: String(origin.latitude),
          endX: String(destination.longitude),
          endY: String(destination.latitude),
          count: 10,
          lang: 0,
          format: "json",
          ...(searchDttm ? { searchDttm } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!upstream.ok) throw new UpstreamStatusError(upstream.status);
      const routes = normalizeTmapItineraries(await upstream.json(), {
        calculatedAt: new Date().toISOString(),
        departureAt: searchDttm ? departureAt : undefined,
        withShape: detail,
      });
      return { status: upstream.status, value: routes };
    }));
}

async function transitEstimates(origin: Coordinate, destination: Coordinate, departureAt: string | undefined): Promise<TravelEstimate[]> {
  const best = bestTransitRoutePerMode(await transitRoutes(origin, destination, departureAt, { detail: false }));
  return (["버스", "지하철"] as const).flatMap((mode) => {
    const route = best[mode];
    if (!route) return [];
    const estimate: TravelEstimate = {
      mode,
      minutes: route.minutes,
      distanceMeters: route.distanceMeters,
      fareWon: route.fareWon,
      transferCount: route.transferCount,
      walkMinutes: route.walkMinutes,
      source: "route",
      provider: "TMAP",
      calculatedAt: route.calculatedAt,
      basis: "timetable",
      firstBoarding: route.firstBoarding,
    };
    if (route.departureAt) estimate.departureAt = route.departureAt;
    return [estimate];
  });
}

/** The ISO departure instant the client asked about, or undefined when it asked about now. */
function departureAtOf(body: Record<string, unknown>): string | undefined {
  const value = body.departureAt;
  if (typeof value !== "string") return undefined;
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) return undefined;
  // A departure already behind us is answered for now: TMAP has no timetable for the past.
  return instant < Date.now() ? undefined : new Date(instant).toISOString();
}

function coordinatePair(body: Record<string, unknown>): { origin: Coordinate; destination: Coordinate } | null {
  const origin = body.origin as Coordinate | undefined;
  const destination = body.destination as Coordinate | undefined;
  const values = [origin?.latitude, origin?.longitude, destination?.latitude, destination?.longitude];
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  return { origin: origin!, destination: destination! };
}

/**
 * How long the journey takes by each way of making it, asked of the providers rather than assumed.
 * Every mode is optional in the answer: a refusal, a timeout, or a route nobody can walk leaves that
 * mode out, and the app falls back to its own distance arithmetic for it rather than showing nothing.
 */
async function travelEstimates(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: { code: "INVALID_BODY", message: "경로 요청 형식이 올바르지 않습니다." } }, 400);
  }

  const pair = coordinatePair(body);
  if (!pair) {
    return jsonResponse({ error: { code: "INVALID_COORDINATES", message: "출발지와 도착지 좌표를 확인해 주세요." } }, 400);
  }
  const { origin, destination } = pair;
  const departureAt = departureAtOf(body);

  const requested = Array.isArray(body.modes)
    ? (body.modes as unknown[]).filter((mode): mode is TravelMode => TRAVEL_MODES.includes(mode as TravelMode))
    : TRAVEL_MODES;
  const wanted = new Set<TravelMode>(requested.length ? requested : TRAVEL_MODES);

  const [walk, driving, transit] = await Promise.all([
    wanted.has("도보") ? walkingEstimate(origin, destination).catch(() => null) : Promise.resolve(null),
    wanted.has("자가용") || wanted.has("택시") ? drivingEstimates(origin, destination).catch(() => []) : Promise.resolve([]),
    wanted.has("버스") || wanted.has("지하철") ? transitEstimates(origin, destination, departureAt).catch(() => []) : Promise.resolve([]),
  ]);

  const estimates: Record<string, TravelEstimate> = {};
  for (const estimate of [walk, ...driving, ...transit]) {
    if (estimate && wanted.has(estimate.mode)) estimates[estimate.mode] = estimate;
  }
  return jsonResponse({ estimates, departureAt: departureAt ?? null });
}

/** The full transit itineraries — legs, stops, drawn shapes — for the screens that show them. */
async function transitRouteDetails(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: { code: "INVALID_BODY", message: "경로 요청 형식이 올바르지 않습니다." } }, 400);
  }
  const pair = coordinatePair(body);
  if (!pair) {
    return jsonResponse({ error: { code: "INVALID_COORDINATES", message: "출발지와 도착지 좌표를 확인해 주세요." } }, 400);
  }
  const departureAt = departureAtOf(body);
  try {
    const routes = await transitRoutes(pair.origin, pair.destination, departureAt, { detail: true });
    return jsonResponse({ routes, departureAt: departureAt ?? null });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Missing required secret:")) throw error;
    if (error instanceof UpstreamStatusError) return upstreamError("tmap", error.status);
    return upstreamError("tmap", error instanceof DOMException && error.name === "TimeoutError" ? 504 : 503);
  }
}

function tagoUrl(base: string, params: Record<string, string>): URL {
  const url = new URL(base);
  // The secret is the portal's *Decoding* key; searchParams encodes it once.
  const key = tagoServiceKey();
  if (!key) throw new Error("Missing required secret: TAGO_SERVICE_KEY");
  url.searchParams.set("serviceKey", key);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

function arrivalOutcome(error: unknown): Extract<TransitArrivalResult, { status: "unavailable" }> {
  const checkedAt = new Date().toISOString();
  if (error instanceof DOMException && error.name === "TimeoutError") return { status: "unavailable", provider: "TAGO", checkedAt, retryable: true, reason: "timeout" };
  if (error instanceof UpstreamStatusError && error.status === 429) return { status: "unavailable", provider: "TAGO", checkedAt, retryable: true, reason: "rate-limited" };
  return { status: "unavailable", provider: "TAGO", checkedAt, retryable: true, reason: "upstream" };
}

/**
 * Realtime arrivals at the stop the chosen route boards first. Subway is not TAGO's to answer, a
 * stop it cannot find is reported as unsupported rather than guessed, and a provider that does not
 * answer is reported as unavailable so the app keeps its last valid answer with its own timestamp.
 */
async function transitArrivals(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: { code: "INVALID_BODY", message: "도착정보 요청 형식이 올바르지 않습니다." } }, 400);
  }
  const boarding = body.boarding as Record<string, unknown> | undefined;
  const stop = boarding?.stop as Record<string, unknown> | undefined;
  const coordinateValue = stop?.coordinate as Record<string, unknown> | undefined;
  const latitude = Number(coordinateValue?.latitude);
  const longitude = Number(coordinateValue?.longitude);
  const routeName = typeof boarding?.routeName === "string" ? boarding.routeName.trim() : "";
  const stopName = typeof stop?.name === "string" ? stop.name.trim() : "";
  const mode = boarding?.mode;
  if (!routeName || !stopName || !Number.isFinite(latitude) || !Number.isFinite(longitude) || (mode !== "버스" && mode !== "지하철")) {
    return jsonResponse({ error: { code: "INVALID_BODY", message: "도착정보 요청 형식이 올바르지 않습니다." } }, 400);
  }
  const checkedAt = new Date().toISOString();
  if (mode === "지하철") {
    return jsonResponse({ arrival: { status: "unsupported", provider: "TAGO", checkedAt, reason: "subway" } satisfies TransitArrivalResult });
  }
  if (!tagoServiceKey()) {
    return jsonResponse({ arrival: { status: "unsupported", provider: "TAGO", checkedAt, reason: "not-configured" } satisfies TransitArrivalResult });
  }

  const near = { latitude, longitude };
  const key = `${latitude.toFixed(4)},${longitude.toFixed(4)}|${stopName}|${routeName}`;
  const cached = arrivalsCache.get(key);
  if (cached) {
    metrics.record("TAGO", "arrivals", "cached");
    return jsonResponse({ arrival: cached });
  }
  const arrival = await arrivalsCache.getOrCreate(key, ARRIVALS_CACHE_TTL_MS, async (): Promise<TransitArrivalResult> => {
    let station;
    try {
      station = await measured("TAGO", "stations", async () => {
        const upstream = await fetch(tagoUrl(TAGO_NEARBY_STATIONS_URL, {
          gpsLati: String(latitude),
          gpsLong: String(longitude),
          numOfRows: "30",
          pageNo: "1",
          _type: "json",
        }), { signal: AbortSignal.timeout(8_000) });
        if (!upstream.ok) throw new UpstreamStatusError(upstream.status);
        const payload = await upstream.json();
        const outcome = tagoOutcome(payload);
        if (outcome !== "ok") throw new UpstreamStatusError(outcome === "rate-limited" ? 429 : 502);
        return { status: 200, value: matchTagoStation(normalizeTagoStations(payload, near), stopName) };
      });
    } catch (error) {
      return arrivalOutcome(error);
    }
    if (station === null) return { status: "unsupported", provider: "TAGO", checkedAt, reason: "no-station" };
    const found = station;
    try {
      return await measured("TAGO", "arrivals", async () => {
        const upstream = await fetch(tagoUrl(TAGO_STATION_ARRIVALS_URL, {
          cityCode: found.cityCode,
          nodeId: found.nodeId,
          numOfRows: "50",
          pageNo: "1",
          _type: "json",
        }), { signal: AbortSignal.timeout(8_000) });
        if (upstream.status === 429) return { status: 429, value: { status: "unavailable", provider: "TAGO", checkedAt, retryable: true, reason: "rate-limited" } as TransitArrivalResult };
        if (!upstream.ok) return { status: upstream.status, value: { status: "unavailable", provider: "TAGO", checkedAt, retryable: upstream.status >= 500, reason: "upstream" } as TransitArrivalResult };
        const payload = await upstream.json();
        const outcome = tagoOutcome(payload);
        if (outcome === "rate-limited") return { status: 429, value: { status: "unavailable", provider: "TAGO", checkedAt, retryable: true, reason: "rate-limited" } as TransitArrivalResult };
        if (outcome === "failed") return { status: 502, value: { status: "unavailable", provider: "TAGO", checkedAt, retryable: true, reason: "upstream" } as TransitArrivalResult };
        const arrivals = normalizeTagoArrivals(payload, { routeName, checkedAt });
        if (!arrivals.length) return { status: 200, value: { status: "unsupported", provider: "TAGO", checkedAt, reason: "no-route" } as TransitArrivalResult };
        return {
          status: 200,
          value: {
            status: "realtime",
            provider: "TAGO",
            checkedAt,
            stop: { name: found.name, nodeId: found.nodeId, cityCode: found.cityCode },
            arrivals,
          } as TransitArrivalResult,
        };
      });
    } catch (error) {
      return arrivalOutcome(error);
    }
  });
  return jsonResponse({ arrival });
}

async function walkingRoute(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: { code: "INVALID_BODY", message: "경로 요청 형식이 올바르지 않습니다." } }, 400);
  }

  const origin = body.origin as Coordinate | undefined;
  const destination = body.destination as Coordinate | undefined;
  const values = [origin?.latitude, origin?.longitude, destination?.latitude, destination?.longitude];
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) {
    return jsonResponse({ error: { code: "INVALID_COORDINATES", message: "출발지와 도착지 좌표를 확인해 주세요." } }, 400);
  }

  const upstream = await fetch(TMAP_PEDESTRIAN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      appKey: requiredSecret("TMAP_APP_KEY"),
    },
    body: JSON.stringify({
      startX: origin!.longitude,
      startY: origin!.latitude,
      endX: destination!.longitude,
      endY: destination!.latitude,
      startName: String(body.startName || "현재 위치"),
      endName: String(body.endName || "약속 장소"),
      reqCoordType: "WGS84GEO",
      resCoordType: "WGS84GEO",
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!upstream.ok) return upstreamError("tmap", upstream.status);
  const payload = await upstream.json();
  const features: TmapFeature[] = Array.isArray(payload?.features) ? payload.features : [];
  const summary = features.find((feature) =>
    Number.isFinite(Number(feature.properties?.totalTime)) ||
    Number.isFinite(Number(feature.properties?.totalDistance))
  )?.properties;
  const path = features.flatMap((feature) => lineCoordinates(feature.geometry));
  const maneuvers = features.flatMap((feature, index) => {
    const point = feature.geometry?.type === "Point"
      ? coordinate(feature.geometry.coordinates)
      : null;
    const instruction = feature.properties?.description?.trim();
    if (!point || !instruction) return [];
    return [{
      id: `tmap-${index}`,
      coordinate: point,
      instruction,
      type: String(feature.properties?.pointType || feature.properties?.turnType || "guide"),
    }];
  });

  return jsonResponse({
    provider: "tmap",
    mode: "walk",
    origin,
    destination,
    durationSeconds: Number(summary?.totalTime || 0),
    distanceMeters: Number(summary?.totalDistance || 0),
    path,
    calculatedAt: new Date().toISOString(),
    stale: false,
    maneuvers,
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "");

    if (request.method === "GET" && path.endsWith("/v1/geocode")) return await geocode(url);
    if (request.method === "GET" && path.endsWith("/v1/saved-places")) return await listSavedPlaces(request);
    if (request.method === "POST" && path.endsWith("/v1/saved-places")) return await rememberSavedPlace(request);
    if (request.method === "DELETE" && path.endsWith("/v1/saved-places")) return await deleteSavedPlaces(request);
    if (request.method === "POST" && path.endsWith("/v1/pilot-summary")) return await savePilotSummary(request);
    if (request.method === "DELETE" && path.endsWith("/v1/pilot-summary")) return await deletePilotSummary(request);
    if (request.method === "GET" && path.endsWith("/v1/places")) return await searchPlaces(url);
    if (request.method === "GET" && path.endsWith("/v1/reverse-geocode")) return await reverseGeocode(url);
    if (request.method === "POST" && path.endsWith("/v1/routes/walk")) return await walkingRoute(request);
    if (request.method === "POST" && path.endsWith("/v1/routes/estimates")) return await travelEstimates(request);
    if (request.method === "POST" && path.endsWith("/v1/routes/transit")) return await transitRouteDetails(request);
    if (request.method === "POST" && path.endsWith("/v1/arrivals")) return await transitArrivals(request);
    if (request.method === "GET" && path.endsWith("/health")) {
      // Per-provider outcomes and latency since the instance started, with nothing that was asked.
      return jsonResponse({
        status: "ok",
        service: "timeagent-mobility",
        providers: metrics.snapshot(),
        realtimeArrivals: tagoServiceKey() ? "configured" : "not-configured",
      });
    }

    return jsonResponse({ error: { code: "NOT_FOUND", message: "지원하지 않는 endpoint입니다." } }, 404);
  } catch (error) {
    const isConfigurationError = error instanceof Error && error.message.startsWith("Missing required secret:");
    console.error(isConfigurationError ? "Mobility secret is not configured" : error);
    return jsonResponse(
      {
        error: {
          code: isConfigurationError ? "SERVICE_NOT_CONFIGURED" : "SERVICE_UNAVAILABLE",
          message: "교통 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
          retryable: !isConfigurationError,
        },
      },
      503,
    );
  }
});
