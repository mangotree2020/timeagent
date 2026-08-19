import { Coordinate, GeocodedPlace } from './journey';
import { KOREA_REGIONS, KoreaRegion, regionSpokenIn } from './korea-regions';
import { spokenNameVariants } from './place-transcription';
import { chooseNationwidePlaces, PlaceVerification, verifySpokenPlace } from './place-verification';
import { SavedPlace } from './saved-places';

/**
 * More than a handful of spellings stops being a second guess and becomes a sweep of the map. They
 * are searched in parallel, so this is one more round trip rather than three.
 */
export const MAX_VARIANT_SEARCHES = 3;

/**
 * How many spellings the nationwide sweep carries: the name as heard, and the one other spelling
 * most likely to be what it meant. Across 17 regions that is 34 queries — measured at about
 * 0.6 seconds in parallel — and it only ever runs after everything nearby has already come up empty.
 */
export const NATIONWIDE_SPELLINGS = 2;

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
  /** The region read out of the spoken name, when they had already said it. */
  spokenRegion: KoreaRegion | null;
  /** Set when the answer came from the nationwide sweep rather than from anywhere near the person. */
  searchedNationwide: boolean;
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
  maxVariants = MAX_VARIANT_SEARCHES,
}: {
  spokenName: string;
  /** Where the person is. Distances shown are measured from here whatever the search was anchored to. */
  origin: Coordinate | null;
  savedPlaces?: SavedPlace[];
  search: PlaceQuery;
  maxVariants?: number;
}): Promise<SpokenPlaceSearch> {
  // Saying 서울 홍대입구역 answers the region question in advance — but only as an anchor. Left in the
  // query the region word costs the answer: it returns a hotel called 서울홍대 instead of the station.
  const spoken = regionSpokenIn(spokenName);
  const name = spoken?.placeName ?? spokenName;
  const anchor = spoken?.region ?? null;
  const regionNamed = Boolean(anchor);
  const near = anchor?.coordinate ?? origin;

  let failure: unknown = null;
  const results = await search(name, near).catch((error: unknown) => {
    failure = error;
    return [] as GeocodedPlace[];
  });

  const settle = (
    verification: PlaceVerification,
    found: GeocodedPlace[],
    searchedNationwide = false,
  ): SpokenPlaceSearch => ({
    verification,
    results: found,
    spokenRegion: spoken?.region ?? null,
    searchedNationwide,
    // An answer someone can act on beats an error they cannot, so the failure is only reported when
    // nothing else came of the search.
    failure: verification.kind === 'none' ? failure : null,
  });

  const heard = verifySpokenPlace({ spokenName: name, results, origin, savedPlaces, regionNamed });
  if (heard.kind !== 'none') return settle(heard, results);

  // A name no sound change touches has no other spelling to try, but it can still be somewhere else
  // in the country, so the sweep below is not skipped along with the spellings.
  const variantNames = spokenNameVariants(name, maxVariants);
  if (variantNames.length) {
    const found = await Promise.all(variantNames.map((variant) => search(variant, near).catch(() => [] as GeocodedPlace[])));
    const corrected = verifySpokenPlace({
      spokenName: name,
      results: dedupePlaces([...results, ...found.flat()]),
      origin,
      savedPlaces,
      variantNames,
      regionNamed,
    });
    if (corrected.kind !== 'none') return settle(corrected, results);
  }
  if (regionNamed) return settle(heard, results);

  // Nothing near the person answers to the name, and search only ever reaches what it is pointed at.
  // Somewhere else in the country almost certainly has it, so the app goes and looks rather than
  // handing back an error or a question about provinces.
  const nationwide = await searchNationwide([name, ...variantNames].slice(0, NATIONWIDE_SPELLINGS), search);
  return settle(chooseNationwidePlaces({ spokenName: name, results: nationwide, origin, savedPlaces }), results, true);
}

/** The same name asked of every region at once, because one anchor only ever sees its own. */
async function searchNationwide(names: string[], search: PlaceQuery) {
  const found = await Promise.all(names.flatMap((name) => KOREA_REGIONS
    .map((region) => search(name, region.coordinate).catch(() => [] as GeocodedPlace[]))));
  return dedupePlaces(found.flat());
}
