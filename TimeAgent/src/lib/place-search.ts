import { Coordinate, GeocodedPlace } from './journey';
import { KoreaRegion, regionSpokenIn } from './korea-regions';
import { spokenNameVariants } from './place-transcription';
import { PlaceVerification, verifySpokenPlace } from './place-verification';
import { SavedPlace } from './saved-places';

/**
 * More than a handful of spellings stops being a second guess and becomes a sweep of the map. They
 * are searched in parallel, so this is one more round trip rather than three.
 */
export const MAX_VARIANT_SEARCHES = 3;

/** Runs one query, anchored wherever the caller says. Rejections are part of the answer, not the end. */
export type PlaceQuery = (query: string, near: Coordinate | null) => Promise<GeocodedPlace[]>;

export type SpokenPlaceSearch = {
  verification: PlaceVerification;
  /**
   * What the heard name itself found, for the case where nothing could be decided. Only these are
   * listed: results dug up under a spelling the app guessed at would be a list of places nobody
   * named, with nothing on screen to say where they came from.
   */
  results: GeocodedPlace[];
  /**
   * Set when the place was not found anywhere near the person and they have not said where it is.
   * Search is anchored to where they are standing, so a place in another province is not merely
   * hard to find — it is unreachable. Which region it is in is the one thing they know for certain,
   * so it is worth a question.
   */
  askRegion: boolean;
  /** The region read out of the spoken name, when they had already said it. */
  spokenRegion: KoreaRegion | null;
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
 * Looks up a name the assistant heard: once as spoken, again under the spellings Korean
 * pronunciation rules would have hidden it behind, and — once the person says which region — from
 * there instead of from where they happen to be standing.
 */
export async function searchSpokenPlace({
  spokenName,
  origin,
  savedPlaces = [],
  search,
  region = null,
  maxVariants = MAX_VARIANT_SEARCHES,
}: {
  spokenName: string;
  /** Where the person is. Distances shown are measured from here whatever the search was anchored to. */
  origin: Coordinate | null;
  savedPlaces?: SavedPlace[];
  search: PlaceQuery;
  /** The region they picked, when the app has already had to ask. */
  region?: KoreaRegion | null;
  maxVariants?: number;
}): Promise<SpokenPlaceSearch> {
  // Saying 서울 홍대입구역 answers the region question in advance — but only as an anchor. Left in the
  // query the region word costs the answer: it returns a hotel called 서울홍대 instead of the station.
  const spoken = region ? null : regionSpokenIn(spokenName);
  const name = spoken?.placeName ?? spokenName;
  const anchor = region ?? spoken?.region ?? null;
  const regionNamed = Boolean(anchor);
  const near = anchor?.coordinate ?? origin;

  let failure: unknown = null;
  const results = await search(name, near).catch((error: unknown) => {
    failure = error;
    return [] as GeocodedPlace[];
  });

  const settle = (verification: PlaceVerification, found: GeocodedPlace[]): SpokenPlaceSearch => {
    // Asking again after they have already said where gets the same answer twice.
    const asking = verification.kind === 'none' && !regionNamed;
    return {
      verification,
      results: found,
      askRegion: asking,
      spokenRegion: spoken?.region ?? null,
      // A question someone can answer beats an error they cannot, so the failure is dropped rather
      // than carried alongside it — there is nothing for a caller to do with both.
      failure: verification.kind === 'none' && !asking ? failure : null,
    };
  };

  const heard = verifySpokenPlace({ spokenName: name, results, origin, savedPlaces, regionNamed });
  if (heard.kind !== 'none') return settle(heard, results);

  const variantNames = spokenNameVariants(name, maxVariants);
  if (!variantNames.length) return settle(heard, results);

  const found = await Promise.all(variantNames.map((variant) => search(variant, near).catch(() => [] as GeocodedPlace[])));
  const verification = verifySpokenPlace({
    spokenName: name,
    results: dedupePlaces([...results, ...found.flat()]),
    origin,
    savedPlaces,
    variantNames,
    regionNamed,
  });
  return settle(verification, results);
}
