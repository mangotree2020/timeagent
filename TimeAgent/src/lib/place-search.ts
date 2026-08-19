import { Coordinate, GeocodedPlace } from './journey';
import { spokenNameVariants } from './place-transcription';
import { PlaceVerification, verifySpokenPlace } from './place-verification';
import { SavedPlace } from './saved-places';

/**
 * More than a handful of spellings stops being a second guess and becomes a sweep of the map. They
 * are searched in parallel, so this is one more round trip rather than three.
 */
export const MAX_VARIANT_SEARCHES = 3;

export type SpokenPlaceSearch = {
  verification: PlaceVerification;
  /**
   * What the heard name itself found, for the case where nothing could be decided. Only these are
   * listed: results dug up under a spelling the app guessed at would be a list of places nobody
   * named, with nothing on screen to say where they came from.
   */
  results: GeocodedPlace[];
  /**
   * Set when the map could not answer and nothing else did either. Carried rather than thrown
   * because a name the map rejects is the strongest hint that it was written down as it sounds:
   * 동내역 comes back an error where 동래역 is a station. Reporting the failure before trying the
   * other spellings is reporting it before doing the one thing that would have worked.
   */
  failure: unknown;
};

/** Several spellings can lead to the same place; the person should be offered it once. */
export function dedupePlaces(places: GeocodedPlace[]) {
  const seen = new Set<string>();
  return places.filter((place) => {
    const key = `${place.name}@${place.coordinate.latitude},${place.coordinate.longitude}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Looks up a name the assistant heard: once as spoken, and — when that settles nothing — again under
 * the spellings Korean pronunciation rules would have hidden it behind.
 */
export async function searchSpokenPlace({
  spokenName,
  origin,
  savedPlaces = [],
  search,
  maxVariants = MAX_VARIANT_SEARCHES,
}: {
  spokenName: string;
  origin: Coordinate | null;
  savedPlaces?: SavedPlace[];
  /** Runs one query. Rejections are part of the answer here, not the end of it. */
  search: (query: string) => Promise<GeocodedPlace[]>;
  maxVariants?: number;
}): Promise<SpokenPlaceSearch> {
  let failure: unknown = null;
  const results = await search(spokenName).catch((error: unknown) => {
    failure = error;
    return [] as GeocodedPlace[];
  });

  const heard = verifySpokenPlace({ spokenName, results, origin, savedPlaces });
  if (heard.kind !== 'none') return { verification: heard, results, failure: null };

  const variantNames = spokenNameVariants(spokenName, maxVariants);
  if (!variantNames.length) return { verification: heard, results, failure };

  const found = await Promise.all(variantNames.map((variant) => search(variant).catch(() => [] as GeocodedPlace[])));
  const verification = verifySpokenPlace({
    spokenName,
    results: dedupePlaces([...results, ...found.flat()]),
    origin,
    savedPlaces,
    variantNames,
  });
  return { verification, results, failure: verification.kind === 'none' ? failure : null };
}
