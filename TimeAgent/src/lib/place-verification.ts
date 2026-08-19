import { Coordinate, GeocodedPlace } from './journey';
import { haversineDistanceMeters } from './kma-weather';
import { withNamingParticle } from './local-notifications';
import { soundsLikeSpokenPlace, spokenPlaceContains } from './place-transcription';
import { SavedPlace } from './saved-places';

/**
 * Beyond this, a result is in a different city from where the person is standing. Speech recognition
 * turns 서면역 into 역삼역 — a real station, in Seoul — and a name-only match confirms it without
 * hesitating. Distance is what tells the two apart.
 */
export const DISTANT_PLACE_METERS = 50_000;

/** How many options to put in front of someone. More than three is a list, not a question. */
export const MAX_PLACE_CANDIDATES = 3;

/**
 * Within this, entries under one name are one place written down more than once, and asking which
 * is asking nothing: 부산역 comes back as both 부산역 and 부산역[부산지하철1호선], 151m apart, and
 * 서면역 as its two lines 96m apart. Beyond it the name really does answer for two places — the two
 * 동래역 stations are 1.5km apart, which is a walk someone should get to decide.
 */
export const SAME_PLACE_METERS = 300;

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
   * away; `ambiguous` means several places answer to the same name; `misheard` means nothing
   * answered to the name as heard and these came back under a spelling that sounds close to it;
   * `faraway` means nothing near the person answered at all and these were found by looking across
   * the country.
   */
  | { kind: 'choose'; reason: 'distant' | 'ambiguous' | 'misheard' | 'faraway'; candidates: PlaceCandidate[] }
  | { kind: 'none' };

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
  variantNames = [],
  regionNamed = false,
}: {
  spokenName: string;
  results: GeocodedPlace[];
  /** Where the person is, or their last known position. Null when neither is available. */
  origin: Coordinate | null;
  savedPlaces?: SavedPlace[];
  /**
   * Set once the person has said which region the place is in. Distance from them is then expected
   * rather than suspicious — they are making an appointment somewhere else, which is allowed.
   */
  regionNamed?: boolean;
  /**
   * Spellings the heard name may have been written as, when the search was run under those too.
   * A result that answers only to one of these is never filled in on its own: it is a different
   * word from the one that was said, however close it sounds.
   */
  variantNames?: string[];
}): PlaceVerification {
  if (!spokenName.trim() || !results.length) return { kind: 'none' };

  const visited = savedPlaces.map((place) => place.name);
  const candidates: PlaceCandidate[] = results.map((place) => ({
    place,
    distanceMeters: distanceFrom(origin, place),
    visitedBefore: visited.some((name) => soundsLikeSpokenPlace(name, place.name)),
  }));

  // Matched by how the name is said, not how it is spelled: 민락수변공원 is what the map calls the
  // place someone said, even though the recogniser wrote down 밀락수변공원.
  const heard = candidates.filter((item) => soundsLikeSpokenPlace(item.place.name, spokenName));
  const ranked = rankCandidates(heard.length ? heard : candidates);

  if (heard.length > 1 && !isOnePlace(ranked)) {
    return { kind: 'choose', reason: 'ambiguous', candidates: ranked.slice(0, MAX_PLACE_CANDIDATES) };
  }
  if (!heard.length) {
    const corrected = candidates.filter((item) => variantNames.some((variant) => (
      soundsLikeSpokenPlace(item.place.name, variant) || spokenPlaceContains(item.place.name, variant)
    )));
    if (!corrected.length) return { kind: 'none' };
    return { kind: 'choose', reason: 'misheard', candidates: rankCandidates(corrected).slice(0, MAX_PLACE_CANDIDATES) };
  }

  const best = ranked[0];
  // Somewhere this person has already been is confirmation enough, however far away it is.
  if (best.visitedBefore) return { kind: 'confirmed', place: best.place };
  // With no idea where the person is, distance cannot be judged, and a single exact name is all
  // there is to go on.
  if (best.distanceMeters === null) return { kind: 'confirmed', place: best.place };
  // They named the region, so the answer being far away is the answer they asked for.
  if (regionNamed) return { kind: 'confirmed', place: best.place };
  if (best.distanceMeters <= DISTANT_PLACE_METERS) return { kind: 'confirmed', place: best.place };

  // A city away. Offer it alongside whatever is nearby that also answered, and let the person say.
  const nearby = rankCandidates(candidates.filter((item) => item !== best));
  return {
    kind: 'choose',
    reason: 'distant',
    candidates: [best, ...nearby].slice(0, MAX_PLACE_CANDIDATES),
  };
}

/**
 * What to offer once the search has been run across the whole country because nothing near the
 * person answered. These are never filled in on their own however clear they look: the app went
 * looking somewhere the person never said, and a destination 300km away is theirs to confirm.
 *
 * Names that are the word itself come first — 홍대입구역 before 홍대입구역 9번출구 — and where nothing
 * matches outright, the longer names that contain it are all there is: 둔산동 is only ever written
 * 서구 둔산동 in 대전 and 동구 둔산동 in 대구, which is the whole answer to which one was meant.
 */
export function chooseNationwidePlaces({
  spokenName,
  results,
  origin,
  savedPlaces = [],
}: {
  spokenName: string;
  results: GeocodedPlace[];
  origin: Coordinate | null;
  savedPlaces?: SavedPlace[];
}): PlaceVerification {
  if (!spokenName.trim() || !results.length) return { kind: 'none' };

  const visited = savedPlaces.map((place) => place.name);
  const candidate = (place: GeocodedPlace): PlaceCandidate => ({
    place,
    distanceMeters: distanceFrom(origin, place),
    visitedBefore: visited.some((name) => soundsLikeSpokenPlace(name, place.name)),
  });

  const named = results.filter((place) => soundsLikeSpokenPlace(place.name, spokenName));
  const containing = results.filter((place) => !named.includes(place) && spokenPlaceContains(place.name, spokenName));
  const pool = named.length ? named : containing;
  if (!pool.length) return { kind: 'none' };

  // Least extra material first: 서구 둔산동 is the place, 동구 둔산동 옻골마을 is somewhere inside it.
  const ranked = pool.map(candidate).sort((left, right) => {
    if (left.visitedBefore !== right.visitedBefore) return left.visitedBefore ? -1 : 1;
    const byLength = left.place.name.length - right.place.name.length;
    if (byLength !== 0) return byLength;
    if (left.distanceMeters === null || right.distanceMeters === null) return 0;
    return left.distanceMeters - right.distanceMeters;
  });
  return { kind: 'choose', reason: 'faraway', candidates: ranked.slice(0, MAX_PLACE_CANDIDATES) };
}

/**
 * Whether every entry that answered to the name sits close enough to be one place. The nearest is
 * the one that gets filled in, so the question is whether choosing differently would take anyone
 * anywhere else.
 */
function isOnePlace(candidates: PlaceCandidate[]) {
  const first = candidates[0].place.coordinate;
  return candidates.every((item) => haversineDistanceMeters(first, item.place.coordinate) <= SAME_PLACE_METERS);
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
  if (verification.reason === 'faraway') {
    // Say where the app went looking. A place hundreds of kilometres away is a surprising answer
    // unless the person is told the search widened to find it.
    return `${withNamingParticle(spokenName)} 곳이 이 근처에는 없어서 전국에서 찾았어요. 맞는 곳을 골라 주세요.`;
  }
  if (verification.reason === 'misheard') {
    // Say that the name was not found rather than that it was wrong: the person said it correctly
    // and the app is the one guessing here.
    return `${withNamingParticle(spokenName)} 이름으로는 찾지 못해서 비슷하게 들리는 이름으로 찾아봤어요. 맞는 곳이 있으면 골라 주세요.`;
  }
  const distance = formatPlaceDistance(verification.candidates[0]?.distanceMeters ?? null);
  return distance
    ? `들린 이름과 맞는 곳이 현재 위치에서 ${distance} 떨어져 있어요. 맞는지 확인해 주세요.`
    : '들린 이름과 맞는 곳이 현재 위치에서 멀리 있어요. 맞는지 확인해 주세요.';
}
