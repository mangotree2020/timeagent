import { corsHeaders, jsonResponse, upstreamError } from "../_shared/http.ts";

type Coordinate = {
  latitude: number;
  longitude: number;
};

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

const NAVER_GEOCODING_URL = "https://maps.apigw.ntruss.com/map-geocode/v2/geocode";
const NAVER_REVERSE_GEOCODING_URL = "https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc";
const TMAP_POI_URL = "https://apis.openapi.sk.com/tmap/pois";
const TMAP_PEDESTRIAN_URL = "https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1";

function requiredSecret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
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
    if (request.method === "GET" && path.endsWith("/v1/places")) return await searchPlaces(url);
    if (request.method === "GET" && path.endsWith("/v1/reverse-geocode")) return await reverseGeocode(url);
    if (request.method === "POST" && path.endsWith("/v1/routes/walk")) return await walkingRoute(request);
    if (request.method === "GET" && path.endsWith("/health")) {
      return jsonResponse({ status: "ok", service: "timeagent-mobility" });
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
