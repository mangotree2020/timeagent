import { Coordinate, GeocodedPlace } from '@/lib/journey';

export const SAVED_PLACES_STORAGE_KEY = '@on-time/saved-places';
const MAX_SAVED_PLACES = 8;

/**
 * Each signed-in account keeps its own list so one person's places never appear for the next
 * person who signs in on the same device. The bare key remains the signed-out list.
 */
export function savedPlacesStorageKey(userId?: string | null) {
  return userId ? `${SAVED_PLACES_STORAGE_KEY}/${userId}` : SAVED_PLACES_STORAGE_KEY;
}

export type SavedPlace = GeocodedPlace & {
  id: string;
  lastUsedAt: number;
};

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
};

export async function loadSavedPlaces(storage: StorageLike, userId?: string | null): Promise<SavedPlace[]> {
  const raw = await storage.getItem(savedPlacesStorageKey(userId));
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(isSavedPlace).sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, MAX_SAVED_PLACES);
  } catch {
    return [];
  }
}

export async function rememberPlace(storage: StorageLike, place: GeocodedPlace, now = Date.now(), userId?: string | null): Promise<SavedPlace[]> {
  const saved = await loadSavedPlaces(storage, userId);
  const normalized = normalizePlace(place);
  const next: SavedPlace[] = [{
    ...normalized,
    id: placeId(normalized.coordinate),
    lastUsedAt: now,
  }, ...saved.filter((item) => !samePlace(item, normalized))].slice(0, MAX_SAVED_PLACES);
  await storage.setItem(savedPlacesStorageKey(userId), JSON.stringify(next));
  return next;
}

export function placeId(coordinate: Coordinate) {
  return `${coordinate.latitude.toFixed(6)},${coordinate.longitude.toFixed(6)}`;
}

/** Validates the payload of the saved-places server endpoint into usable places. */
export function parseRemoteSavedPlaces(value: unknown): SavedPlace[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { places?: unknown }).places)) return [];
  return (value as { places: unknown[] }).places
    .filter(isSavedPlace)
    .map((place) => ({ ...place, id: placeId(place.coordinate) }))
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, MAX_SAVED_PLACES);
}

/**
 * Server places joined with what this device already knows. The same spot keeps its most recent
 * use regardless of which device recorded it, so the list reads the same everywhere.
 */
export function mergeSavedPlaces(local: SavedPlace[], remote: SavedPlace[]): SavedPlace[] {
  const merged = new Map<string, SavedPlace>();
  for (const place of [...local, ...remote]) {
    const key = placeId(place.coordinate);
    const existing = merged.get(key);
    if (!existing || place.lastUsedAt > existing.lastUsedAt) merged.set(key, { ...place, id: key });
  }
  return [...merged.values()].sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, MAX_SAVED_PLACES);
}

/** Merges the server list into local storage and returns what the UI should show. */
export async function mergeRemoteSavedPlaces(storage: StorageLike, remote: SavedPlace[], userId?: string | null): Promise<SavedPlace[]> {
  const local = await loadSavedPlaces(storage, userId);
  const merged = mergeSavedPlaces(local, remote);
  await storage.setItem(savedPlacesStorageKey(userId), JSON.stringify(merged));
  return merged;
}

function samePlace(a: GeocodedPlace, b: GeocodedPlace) {
  return placeId(a.coordinate) === placeId(b.coordinate)
    || (!!a.name.trim() && a.name.trim() === b.name.trim() && displayAddress(a) === displayAddress(b));
}

function normalizePlace(place: GeocodedPlace): GeocodedPlace {
  return {
    name: place.name.trim() || '지도에서 지정한 위치',
    roadAddress: place.roadAddress.trim(),
    jibunAddress: place.jibunAddress.trim(),
    coordinate: place.coordinate,
  };
}

export function displayAddress(place: GeocodedPlace) {
  return place.roadAddress || place.jibunAddress || `${place.coordinate.latitude.toFixed(5)}, ${place.coordinate.longitude.toFixed(5)}`;
}

function isSavedPlace(value: unknown): value is SavedPlace {
  if (!value || typeof value !== 'object') return false;
  const place = value as Partial<SavedPlace>;
  return typeof place.id === 'string'
    && typeof place.name === 'string'
    && typeof place.roadAddress === 'string'
    && typeof place.jibunAddress === 'string'
    && typeof place.lastUsedAt === 'number'
    && Number.isFinite(place.lastUsedAt)
    && isCoordinate(place.coordinate);
}

function isCoordinate(value: unknown): value is Coordinate {
  if (!value || typeof value !== 'object') return false;
  const coordinate = value as Partial<Coordinate>;
  return typeof coordinate.latitude === 'number'
    && Number.isFinite(coordinate.latitude)
    && coordinate.latitude >= -90
    && coordinate.latitude <= 90
    && typeof coordinate.longitude === 'number'
    && Number.isFinite(coordinate.longitude)
    && coordinate.longitude >= -180
    && coordinate.longitude <= 180;
}
