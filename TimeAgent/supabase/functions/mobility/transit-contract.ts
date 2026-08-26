/**
 * The normalized transit contract: what the app plans with instead of TMAP's raw itineraries.
 * Pure — no Deno, no fetch — so the same normalization is unit-tested from the app's Jest suite.
 */

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type TransitLegMode = "도보" | "버스" | "지하철" | "기타";

export type TransitStop = {
  name: string;
  coordinate: Coordinate | null;
  /** TMAP's own station id. Not a TAGO node id — the arrivals adapter resolves that by position. */
  stationId?: string;
};

export type TransitLeg = {
  mode: TransitLegMode;
  minutes: number;
  distanceMeters: number;
  /** "101", "2호선" — the number a person looks for on the front of the vehicle. */
  routeName?: string;
  /** TMAP route id, kept so a detail lookup can line the leg up with its shape. */
  routeId?: string;
  from: TransitStop;
  to: TransitStop;
  /** Every stop the vehicle passes, first to last, when TMAP listed them. */
  stops?: TransitStop[];
  /** The leg drawn on a map, when the detail was asked for. */
  path?: Coordinate[];
};

export type TransitRoute = {
  /** What the journey mostly is, so the app files it under a mode the person chose. */
  mode: "버스" | "지하철";
  /** TMAP's own pathType: 1 subway, 2 bus, 3 both. */
  pathType: number;
  minutes: number;
  distanceMeters: number;
  fareWon?: number;
  transferCount: number;
  walkMinutes: number;
  /** 'timetable' when the departure time was sent and TMAP answered against the timetable. */
  basis: "timetable";
  provider: "TMAP";
  calculatedAt: string;
  /** The ISO instant the timetable was asked for, or absent when TMAP answered for "now". */
  departureAt?: string;
  /** The first bus or subway the person boards: the only leg realtime arrivals are asked for. */
  firstBoarding: TransitBoarding | null;
  legs: TransitLeg[];
};

export type TransitBoarding = {
  mode: "버스" | "지하철";
  routeName: string;
  routeId?: string;
  stop: TransitStop;
  /** Minutes of walking before the person reaches this stop. */
  walkMinutesToStop: number;
};

type Raw = Record<string, unknown>;

function asRecord(value: unknown): Raw | null {
  return value && typeof value === "object" ? value as Raw : null;
}

function finite(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** `Number(null)` is 0, which is a real place in the Gulf of Guinea; a missing value is missing. */
function present(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  return finite(value);
}

export function minutesFromSeconds(seconds: number) {
  return Math.max(1, Math.round(seconds / 60));
}

function coordinateOf(value: unknown): Coordinate | null {
  const record = asRecord(value);
  const latitude = present(record?.lat);
  const longitude = present(record?.lon);
  if (latitude === null || longitude === null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function stopOf(value: unknown, fallbackName: string): TransitStop {
  const record = asRecord(value);
  const name = typeof record?.name === "string" && record.name.trim() ? record.name.trim() : fallbackName;
  return { name, coordinate: coordinateOf(record) };
}

function legMode(value: unknown): TransitLegMode {
  const mode = String(value || "").toUpperCase();
  if (mode === "WALK") return "도보";
  if (mode === "BUS" || mode === "EXPRESSBUS") return "버스";
  if (mode === "SUBWAY" || mode === "TRAIN") return "지하철";
  return "기타";
}

/** "간선:101" → "101", "수도권2호선" stays as it is; the prefix is TMAP's category, not the line. */
export function routeNameOf(value: unknown): string | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const separated = raw.includes(":") ? raw.slice(raw.indexOf(":") + 1).trim() : raw;
  return separated || undefined;
}

/** TMAP draws a leg as "lon,lat lon,lat …". */
export function parseLinestring(value: unknown): Coordinate[] {
  if (typeof value !== "string") return [];
  return value.trim().split(/\s+/).flatMap((pair) => {
    const [lon, lat] = pair.split(",").map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    return [{ latitude: lat, longitude: lon }];
  });
}

function stopsOf(value: unknown): TransitStop[] | undefined {
  const list = asRecord(value)?.stationList;
  if (!Array.isArray(list)) return undefined;
  const stops = list.flatMap((item) => {
    const record = asRecord(item);
    const name = typeof record?.stationName === "string" ? record.stationName.trim() : "";
    if (!name) return [];
    const stationId = record?.stationID !== undefined && record?.stationID !== null ? String(record.stationID) : undefined;
    return [{ name, coordinate: coordinateOf(record), stationId }];
  });
  return stops.length ? stops : undefined;
}

function normalizeLeg(value: unknown, { withShape }: { withShape: boolean }): TransitLeg | null {
  const record = asRecord(value);
  if (!record) return null;
  const seconds = finite(record.sectionTime);
  const mode = legMode(record.mode);
  const stops = stopsOf(record.passStopList);
  const from = stopOf(record.start, "출발");
  const to = stopOf(record.end, "도착");
  // TMAP puts the station id on the pass list, not on start/end; the first and last stop are them.
  if (stops?.[0] && !from.stationId) from.stationId = stops[0].stationId;
  if (stops && stops.length > 1 && !to.stationId) to.stationId = stops[stops.length - 1].stationId;
  const leg: TransitLeg = {
    mode,
    minutes: seconds === null || seconds <= 0 ? 0 : minutesFromSeconds(seconds),
    distanceMeters: Math.max(0, Math.round(finite(record.distance) ?? 0)),
    routeName: mode === "도보" ? undefined : routeNameOf(record.route),
    routeId: typeof record.routeId === "string" && record.routeId ? record.routeId : undefined,
    from,
    to,
  };
  if (stops) leg.stops = stops;
  if (withShape) {
    const path = parseLinestring(asRecord(record.passShape)?.linestring);
    if (path.length >= 2) leg.path = path;
  }
  return leg;
}

function fareOf(itinerary: Raw): number | undefined {
  const regular = asRecord(asRecord(itinerary.fare)?.regular);
  const total = finite(regular?.totalFare);
  return total !== null && total > 0 ? Math.round(total) : undefined;
}

function firstBoardingOf(legs: TransitLeg[]): TransitBoarding | null {
  let walked = 0;
  for (const leg of legs) {
    if (leg.mode === "도보") {
      walked += leg.minutes;
      continue;
    }
    if (leg.mode !== "버스" && leg.mode !== "지하철") return null;
    return {
      mode: leg.mode,
      routeName: leg.routeName ?? (leg.mode === "버스" ? "버스" : "지하철"),
      routeId: leg.routeId,
      stop: leg.from,
      walkMinutesToStop: walked,
    };
  }
  return null;
}

export type NormalizeOptions = {
  calculatedAt: string;
  departureAt?: string;
  /** Detail lookups keep the drawn shapes; the summary drops them to stay small. */
  withShape?: boolean;
};

/**
 * Every itinerary TMAP answered with, in the normalized contract, quickest first. Itineraries
 * without a usable total time are dropped rather than repaired.
 */
export function normalizeTmapItineraries(payload: unknown, options: NormalizeOptions): TransitRoute[] {
  const plan = asRecord(asRecord(asRecord(payload)?.metaData)?.plan);
  const itineraries = plan?.itineraries;
  if (!Array.isArray(itineraries)) return [];
  const routes: TransitRoute[] = [];
  for (const raw of itineraries) {
    const itinerary = asRecord(raw);
    if (!itinerary) continue;
    const seconds = finite(itinerary.totalTime);
    if (seconds === null || seconds <= 0) continue;
    const pathType = finite(itinerary.pathType) ?? 0;
    const legs = Array.isArray(itinerary.legs)
      ? itinerary.legs.map((leg) => normalizeLeg(leg, { withShape: options.withShape === true })).filter((leg): leg is TransitLeg => leg !== null)
      : [];
    const boardings = legs.filter((leg) => leg.mode === "버스" || leg.mode === "지하철");
    const mode = routeMode(pathType, boardings);
    if (!mode) continue;
    const walkSeconds = finite(itinerary.totalWalkTime);
    const walkMinutes = walkSeconds !== null && walkSeconds >= 0
      ? Math.round(walkSeconds / 60)
      : legs.filter((leg) => leg.mode === "도보").reduce((sum, leg) => sum + leg.minutes, 0);
    const transferCount = finite(itinerary.transferCount);
    const route: TransitRoute = {
      mode,
      pathType,
      minutes: minutesFromSeconds(seconds),
      distanceMeters: Math.max(0, Math.round(finite(itinerary.totalDistance) ?? 0)),
      fareWon: fareOf(itinerary),
      transferCount: transferCount !== null && transferCount >= 0 ? Math.round(transferCount) : Math.max(0, boardings.length - 1),
      walkMinutes,
      basis: "timetable",
      provider: "TMAP",
      calculatedAt: options.calculatedAt,
      firstBoarding: firstBoardingOf(legs),
      legs,
    };
    if (options.departureAt) route.departureAt = options.departureAt;
    routes.push(route);
  }
  return routes.sort((left, right) => left.minutes - right.minutes);
}

/**
 * pathType 1 is subway, 2 is bus, 3 uses both and is filed under whichever comes first — the leg
 * the person boards first is the one they wait for. Express bus, train, plane, ferry are not
 * offered: the app plans city journeys.
 */
function routeMode(pathType: number, boardings: TransitLeg[]): TransitRoute["mode"] | null {
  if (pathType === 1) return "지하철";
  if (pathType === 2) return "버스";
  if (pathType === 3) {
    const first = boardings[0]?.mode;
    return first === "버스" || first === "지하철" ? first : "지하철";
  }
  return null;
}

/**
 * One route per mode for the plan: the quickest journey boarded first by bus as 버스, by subway as
 * 지하철. A mixed journey competes under the mode it boards first — that is what the person waits
 * for. It is never relabelled as the other mode: a "subway answer" whose first boarding is a bus
 * would contradict itself on the screen. The app plans 대중교통 as the quicker of the two anyway.
 */
export function bestTransitRoutePerMode(routes: TransitRoute[]): Partial<Record<"버스" | "지하철", TransitRoute>> {
  const best: Partial<Record<"버스" | "지하철", TransitRoute>> = {};
  for (const route of routes) {
    const current = best[route.mode];
    if (!current || route.minutes < current.minutes) best[route.mode] = route;
  }
  return best;
}

/**
 * TMAP's `searchDttm` is the local Korean wall clock as `yyyymmddHHMM`. The app sends an ISO
 * instant; Korea has no daylight saving, so the conversion is a fixed nine hours.
 */
export function tmapSearchDttm(departureAt: string): string | null {
  const instant = Date.parse(departureAt);
  if (!Number.isFinite(instant)) return null;
  const kst = new Date(instant + 9 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}${pad(kst.getUTCHours())}${pad(kst.getUTCMinutes())}`;
}

/**
 * The cache key for one journey question. Coordinates are rounded to about ten metres and the
 * departure to a five-minute slot, so a retry a moment later — or a pin nudged by a step — is
 * the same question and gets the same answer, calculated-at stamp included.
 */
export function transitCacheKey(
  origin: Coordinate,
  destination: Coordinate,
  departureAt: string | undefined,
  extra = "",
): string {
  const place = (value: Coordinate) => `${value.latitude.toFixed(4)},${value.longitude.toFixed(4)}`;
  const instant = departureAt ? Date.parse(departureAt) : Number.NaN;
  const slot = Number.isFinite(instant) ? String(Math.floor(instant / (5 * 60 * 1000))) : "now";
  return `${place(origin)}|${place(destination)}|${slot}|${extra}`;
}
