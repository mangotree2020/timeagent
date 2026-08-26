/**
 * Realtime arrivals for the first boarding of a chosen route, in the app's contract rather than
 * TAGO's. Pure — the fetches live in the function, so this is unit-tested from Jest.
 *
 * TAGO (국토교통부 버스 도착정보) knows stops by its own node id, which TMAP never mentions. The
 * adapter therefore first lists stops near the boarding coordinate and matches by name, then
 * asks for that node's arrivals and keeps the ones for the route the person will board.
 */

import type { Coordinate } from "./transit-contract.ts";

export type TransitArrival = {
  routeName: string;
  /** Seconds until the vehicle reaches the stop, as the provider reported it. */
  arrivalInSeconds: number;
  /** ISO instant the vehicle is expected, computed from the check time. */
  expectedAt: string;
  stopsAway?: number;
  vehicleType?: string;
};

export type TransitArrivalResult =
  | { status: "realtime"; provider: "TAGO"; checkedAt: string; stop: { name: string; nodeId: string; cityCode: string }; arrivals: TransitArrival[] }
  /** The provider has nothing for this stop, mode, or region; the timetable stays in force. */
  | { status: "unsupported"; provider: "TAGO"; checkedAt: string; reason: "subway" | "no-station" | "no-route" | "not-configured" }
  /** The provider was asked and did not answer usefully; the caller keeps its last valid answer. */
  | { status: "unavailable"; provider: "TAGO"; checkedAt: string; retryable: boolean; reason: "timeout" | "rate-limited" | "upstream" };

type Raw = Record<string, unknown>;

function asRecord(value: unknown): Raw | null {
  return value && typeof value === "object" ? value as Raw : null;
}

/** TAGO wraps a single item as an object and several as an array. */
export function tagoItems(payload: unknown): Raw[] {
  const items = asRecord(asRecord(asRecord(asRecord(payload)?.response)?.body)?.items)?.item;
  if (Array.isArray(items)) return items.map(asRecord).filter((item): item is Raw => item !== null);
  const single = asRecord(items);
  return single ? [single] : [];
}

/** "00" on success; "22" when the daily or per-second quota is exhausted; anything else is a fault. */
export function tagoResultCode(payload: unknown): string {
  const header = asRecord(asRecord(asRecord(payload)?.response)?.header);
  return String(header?.resultCode ?? "").trim();
}

/** Whether a TAGO header means the call went through, hit the quota, or failed some other way. */
export function tagoOutcome(payload: unknown): "ok" | "rate-limited" | "failed" {
  const code = tagoResultCode(payload);
  if (!code || code === "00" || code === "0") return "ok";
  if (code === "22") return "rate-limited";
  return "failed";
}

export type TagoStation = {
  nodeId: string;
  cityCode: string;
  name: string;
  coordinate: Coordinate | null;
  distanceMeters: number | null;
};

export function normalizeTagoStations(payload: unknown, near: Coordinate): TagoStation[] {
  return tagoItems(payload).flatMap((item) => {
    const nodeId = String(item.nodeid ?? "").trim();
    const cityCode = String(item.citycode ?? "").trim();
    const name = String(item.nodenm ?? "").trim();
    if (!nodeId || !cityCode || !name) return [];
    const latitude = Number(item.gpslati);
    const longitude = Number(item.gpslong);
    const coordinate = item.gpslati !== null && item.gpslati !== undefined && Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { latitude, longitude }
      : null;
    return [{
      nodeId,
      cityCode,
      name,
      coordinate,
      distanceMeters: coordinate ? Math.round(distanceBetween(near, coordinate)) : null,
    }];
  });
}

/** Stop names differ by spacing and suffix between providers: "서면역" and "서면역 (중)" are one stop. */
export function normalizeStopName(name: string) {
  return name.replace(/\(.*?\)/g, "").replace(/[\s·.,-]/g, "").replace(/(정류장|정류소|역|앞)$/g, "").toLowerCase();
}

/**
 * The TAGO stop that is TMAP's boarding stop. A stop with the same name within 300 m is it — the
 * two providers place the same stop a few dozen metres apart. A stop whose name only partly matches
 * is accepted within the same distance. A stop with a different name is accepted only when it is
 * practically on top of the boarding point (60 m), since a wrong stop would show arrivals for a bus
 * the person cannot catch, which is worse than showing the timetable. A same-named stop a kilometre
 * away is a different stop.
 */
export function matchTagoStation(
  stations: TagoStation[],
  boardingName: string,
  { namedMeters = 300, unnamedMeters = 60 }: { namedMeters?: number; unnamedMeters?: number } = {},
): TagoStation | null {
  const wanted = normalizeStopName(boardingName);
  const within = (station: TagoStation, meters: number) => (station.distanceMeters ?? Infinity) <= meters;
  const byDistance = [...stations].sort((left, right) => (left.distanceMeters ?? Infinity) - (right.distanceMeters ?? Infinity));
  const named = byDistance.find((station) => wanted && normalizeStopName(station.name) === wanted && within(station, namedMeters));
  if (named) return named;
  const partial = byDistance.find((station) => {
    const name = normalizeStopName(station.name);
    return wanted && name && (name.includes(wanted) || wanted.includes(name)) && within(station, namedMeters);
  });
  if (partial) return partial;
  const nearest = byDistance[0];
  return nearest && within(nearest, unnamedMeters) ? nearest : null;
}

/** "101", "101번", "급행101" all refer to bus 101 on the front of the vehicle. */
export function normalizeRouteName(name: string) {
  return name.replace(/번$/, "").replace(/\s/g, "").toLowerCase();
}

export function normalizeTagoArrivals(
  payload: unknown,
  { routeName, checkedAt }: { routeName: string; checkedAt: string },
): TransitArrival[] {
  const wanted = normalizeRouteName(routeName);
  const checked = Date.parse(checkedAt);
  return tagoItems(payload).flatMap((item) => {
    const routeNo = String(item.routeno ?? "").trim();
    if (!routeNo || normalizeRouteName(routeNo) !== wanted) return [];
    const seconds = Number(item.arrtime);
    if (item.arrtime === null || item.arrtime === undefined || !Number.isFinite(seconds) || seconds < 0) return [];
    const stopsAway = Number(item.arrprevstationcnt);
    const arrival: TransitArrival = {
      routeName: routeNo,
      arrivalInSeconds: Math.round(seconds),
      expectedAt: new Date((Number.isFinite(checked) ? checked : Date.now()) + Math.round(seconds) * 1000).toISOString(),
    };
    if (Number.isInteger(stopsAway) && stopsAway >= 0) arrival.stopsAway = stopsAway;
    const vehicleType = String(item.vehicletp ?? "").trim();
    if (vehicleType) arrival.vehicleType = vehicleType;
    return [arrival];
  }).sort((left, right) => left.arrivalInSeconds - right.arrivalInSeconds);
}

function distanceBetween(left: Coordinate, right: Coordinate) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const dLat = toRadians(right.latitude - left.latitude);
  const dLon = toRadians(right.longitude - left.longitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(left.latitude)) * Math.cos(toRadians(right.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}
