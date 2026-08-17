import { Coordinate, GeocodedPlace } from './journey';
import { haversineDistanceMeters } from './kma-weather';
import { withNamingParticle } from './local-notifications';
import { SavedPlace } from './saved-places';

/**
 * Beyond this, a result is in a different city from where the person is standing. Speech recognition
 * turns 서면역 into 역삼역 — a real station, in Seoul — and a name-only match confirms it without
 * hesitating. Distance is what tells the two apart.
 */
export const DISTANT_PLACE_METERS = 50_000;

/** How many options to put in front of someone. More than three is a list, not a question. */
export const MAX_PLACE_CANDIDATES = 3;

export type PlaceCandidate = {
  place: GeocodedPlace;
  /** Null when the device could not say where it is; distance then cannot be part of the decision. */
  distanceMeters: number | null;
  /** A place this person has been to before is a stronger signal than any string match. */
  visitedBefore: boolean;
};

export type PlaceVerification =
  /** Near, unambiguous, and safe to fill in without interrupting. */
  | { kind: 'confirmed'; place: GeocodedPlace }
  /**
   * Found something, but not something to act on alone. `distant` means the only match is a city
   * away; `ambiguous` means several places answer to the same name.
   */
  | { kind: 'choose'; reason: 'distant' | 'ambiguous'; candidates: PlaceCandidate[] }
  | { kind: 'none' };

function normalizePlaceName(value: string) {
  return value.replace(/\s+/g, '').toLowerCase();
}

function distanceFrom(origin: Coordinate | null, place: GeocodedPlace) {
  return origin ? haversineDistanceMeters(origin, place.coordinate) : null;
}

/**
 * Decides what to do with what the map returned for a spoken place name. Search is used to check a
 * name, never to replace one: an uncertain answer becomes a question, not a silent substitution.
 */
export function verifySpokenPlace({
  spokenName,
  results,
  origin,
  savedPlaces = [],
}: {
  spokenName: string;
  results: GeocodedPlace[];
  /** Where the person is, or their last known position. Null when neither is available. */
  origin: Coordinate | null;
  savedPlaces?: SavedPlace[];
}): PlaceVerification {
  const spoken = normalizePlaceName(spokenName);
  if (!spoken || !results.length) return { kind: 'none' };

  const visited = new Set(savedPlaces.map((place) => normalizePlaceName(place.name)));
  const candidates: PlaceCandidate[] = results.map((place) => ({
    place,
    distanceMeters: distanceFrom(origin, place),
    visitedBefore: visited.has(normalizePlaceName(place.name)),
  }));

  const exact = candidates.filter((item) => normalizePlaceName(item.place.name) === spoken);
  const pool = exact.length ? exact : candidates;
  const ranked = rankCandidates(pool);

  if (exact.length > 1) {
    return { kind: 'choose', reason: 'ambiguous', candidates: ranked.slice(0, MAX_PLACE_CANDIDATES) };
  }
  if (exact.length !== 1) return { kind: 'none' };

  const best = ranked[0];
  // Somewhere this person has already been is confirmation enough, however far away it is.
  if (best.visitedBefore) return { kind: 'confirmed', place: best.place };
  // With no idea where the person is, distance cannot be judged, and a single exact name is all
  // there is to go on.
  if (best.distanceMeters === null) return { kind: 'confirmed', place: best.place };
  if (best.distanceMeters <= DISTANT_PLACE_METERS) return { kind: 'confirmed', place: best.place };

  // A city away. Offer it alongside whatever is nearby that also answered, and let the person say.
  const nearby = rankCandidates(candidates.filter((item) => item !== best));
  return {
    kind: 'choose',
    reason: 'distant',
    candidates: [best, ...nearby].slice(0, MAX_PLACE_CANDIDATES),
  };
}

/** Places already visited first, then the closest, then whatever order the map returned. */
function rankCandidates(candidates: PlaceCandidate[]) {
  return [...candidates].sort((left, right) => {
    if (left.visitedBefore !== right.visitedBefore) return left.visitedBefore ? -1 : 1;
    if (left.distanceMeters === null || right.distanceMeters === null) return 0;
    return left.distanceMeters - right.distanceMeters;
  });
}

export function formatPlaceDistance(distanceMeters: number | null) {
  if (distanceMeters === null) return '';
  if (distanceMeters < 1_000) return `${Math.round(distanceMeters / 10) * 10}m`;
  const kilometers = distanceMeters / 1_000;
  return `${kilometers >= 10 ? Math.round(kilometers) : kilometers.toFixed(1)}km`;
}

/**
 * Says why the app is asking rather than deciding, in terms of what the person can see on the
 * cards: one is far away, or several share the name.
 */
export function describePlaceVerification(verification: Extract<PlaceVerification, { kind: 'choose' }>, spokenName: string) {
  if (verification.reason === 'ambiguous') {
    return `${withNamingParticle(spokenName)} 이름의 장소가 여러 곳이에요. 어디인지 골라 주세요.`;
  }
  const distance = formatPlaceDistance(verification.candidates[0]?.distanceMeters ?? null);
  return distance
    ? `들린 이름과 맞는 곳이 현재 위치에서 ${distance} 떨어져 있어요. 맞는지 확인해 주세요.`
    : '들린 이름과 맞는 곳이 현재 위치에서 멀리 있어요. 맞는지 확인해 주세요.';
}
