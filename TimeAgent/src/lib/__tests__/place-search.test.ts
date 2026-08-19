import { GeocodedPlace } from '../journey';
import { findKoreaRegion } from '../korea-regions';
import { dedupePlaces, searchSpokenPlace } from '../place-search';

const BUSAN = { latitude: 35.1796, longitude: 129.0756 };

function place(name: string, latitude: number, longitude: number): GeocodedPlace {
  return { name, roadAddress: `${name} 도로명`, jibunAddress: `${name} 지번`, coordinate: { latitude, longitude } };
}

const dongnaeLine1 = place('동래역[부산지하철1호선]', 35.20512318, 129.078261);
const dongnaeDonghae = place('동래역[동해선]', 35.19734652, 129.09167671);
const nampo = place('중구 남포동', 35.0977, 129.0324);
const minrak = place('민락수변공원', 35.1533, 129.1289);

/**
 * A map that answers some spellings and rejects the rest, the way the real one does. Answers can be
 * keyed by anchor too — `홍대입구역@서울` — because the real search only reaches what is near where
 * it was pointed.
 */
function mapWith(answers: Record<string, GeocodedPlace[]>) {
  const queries: string[] = [];
  const search = async (query: string, near: { latitude: number; longitude: number } | null) => {
    const anchored = KEYED_ANCHORS.find((entry) => near
      && Math.abs(entry.coordinate.latitude - near.latitude) < 0.01
      && Math.abs(entry.coordinate.longitude - near.longitude) < 0.01);
    queries.push(anchored ? `${query}@${anchored.name}` : query);
    const found = answers[anchored ? `${query}@${anchored.name}` : query];
    if (!found) throw new Error('SERVICE_UNAVAILABLE');
    return found;
  };
  return { search, queries };
}

const KEYED_ANCHORS = ['서울', '대전'].map((name) => findKoreaRegion(name)!);

describe('searching for a name the assistant heard', () => {
  it('tries other spellings when the heard one makes the map error', async () => {
    // The bug this exists to prevent: 동내역 is answered with a 503, and reporting that error is
    // giving up one query before the one that works. Both 동래역 stations come back instead.
    const map = mapWith({ '동래역': [dongnaeLine1, dongnaeDonghae] });
    const { verification, failure } = await searchSpokenPlace({ spokenName: '동내역', origin: BUSAN, search: map.search });

    expect(map.queries).toContain('동래역');
    expect(failure).toBeNull();
    if (verification.kind !== 'choose') throw new Error('expected a question');
    expect(verification.reason).toBe('ambiguous');
    // Both stations, nearest first — the order someone standing in Busan would want them in.
    expect(verification.candidates.map((item) => item.place.name)).toEqual([
      '동래역[동해선]',
      '동래역[부산지하철1호선]',
    ]);
  });

  it('turns to the region question once the other spellings have failed too', async () => {
    // Every spelling was tried and none of them found anything nearby. That is a question worth
    // asking, not an error worth showing.
    const map = mapWith({});
    const { verification, askRegion, failure } = await searchSpokenPlace({ spokenName: '동내역', origin: BUSAN, search: map.search });

    expect(map.queries).toContain('동래역');
    expect(verification.kind).toBe('none');
    expect(askRegion).toBe(true);
    expect(failure).toBeNull();
  });

  it('asks about a spelling it guessed at rather than filling it in', async () => {
    const map = mapWith({ '난포동': [], '남포동': [nampo] });
    const { verification } = await searchSpokenPlace({ spokenName: '난포동', origin: BUSAN, search: map.search });

    if (verification.kind !== 'choose') throw new Error('expected a question');
    expect(verification.reason).toBe('misheard');
    expect(verification.candidates[0].place).toBe(nampo);
  });

  it('never searches a second time when the heard name settled it', async () => {
    const map = mapWith({ '밀락수변공원': [minrak] });
    const { verification } = await searchSpokenPlace({ spokenName: '밀락수변공원', origin: BUSAN, search: map.search });

    expect(verification).toEqual({ kind: 'confirmed', place: minrak });
    expect(map.queries).toEqual(['밀락수변공원']);
  });

  it('stays within its budget of extra queries', async () => {
    const map = mapWith({});
    await searchSpokenPlace({ spokenName: '난포동', origin: BUSAN, search: map.search, maxVariants: 2 });

    expect(map.queries).toHaveLength(3);
  });

  it('has no other spelling to try for a name no rule touches, and still asks where', async () => {
    const map = mapWith({});
    const { verification, askRegion } = await searchSpokenPlace({ spokenName: 'CGV', origin: BUSAN, search: map.search });

    expect(map.queries).toEqual(['CGV']);
    expect(verification.kind).toBe('none');
    expect(askRegion).toBe(true);
  });
});

describe('a place that is nowhere near the person', () => {
  const hongdae = place('홍대입구역[2호선]', 37.5570, 126.9245);

  it('asks which region instead of listing what happened to be nearby', async () => {
    // Search is anchored where the person stands, so a Seoul station asked from Busan is not merely
    // hard to find — it is unreachable. Which province it is in, they know.
    const map = mapWith({ '홍대입구역@서울': [hongdae] });
    const { verification, askRegion, failure } = await searchSpokenPlace({
      spokenName: '홍대입구역',
      origin: BUSAN,
      search: map.search,
    });

    expect(verification.kind).toBe('none');
    expect(askRegion).toBe(true);
    expect(failure).toBeNull();
  });

  it('finds it once the region is named, however far away that is', async () => {
    const map = mapWith({ '홍대입구역@서울': [hongdae] });
    const { verification, askRegion } = await searchSpokenPlace({
      spokenName: '홍대입구역',
      origin: BUSAN,
      search: map.search,
      region: findKoreaRegion('서울'),
    });

    // 325km from the person, and confirmed anyway: being far away is what they asked for.
    expect(verification).toEqual({ kind: 'confirmed', place: hongdae });
    expect(askRegion).toBe(false);
  });

  it('takes the region out of a name that already carried it', async () => {
    // Left in the query the region word costs the answer, so it only ever moves the anchor.
    const map = mapWith({ '홍대입구역@서울': [hongdae] });
    const { verification, spokenRegion } = await searchSpokenPlace({
      spokenName: '서울 홍대입구역',
      origin: BUSAN,
      search: map.search,
    });

    expect(map.queries).toEqual(['홍대입구역@서울']);
    expect(spokenRegion?.name).toBe('서울');
    expect(verification).toEqual({ kind: 'confirmed', place: hongdae });
  });

  it('does not ask again once they have already said where', async () => {
    const map = mapWith({});
    const { askRegion, failure } = await searchSpokenPlace({
      spokenName: '홍대입구역',
      origin: BUSAN,
      search: map.search,
      region: findKoreaRegion('대전'),
    });

    expect(askRegion).toBe(false);
    expect(failure).toBeInstanceOf(Error);
  });

  it('keeps quiet about regions when the name was found nearby', async () => {
    const map = mapWith({ '민락수변공원': [minrak] });
    const { askRegion } = await searchSpokenPlace({ spokenName: '민락수변공원', origin: BUSAN, search: map.search });

    expect(askRegion).toBe(false);
  });
});

describe('dedupePlaces', () => {
  it('keeps one entry per place, however many spellings found it', () => {
    expect(dedupePlaces([dongnaeLine1, dongnaeLine1, dongnaeDonghae])).toEqual([dongnaeLine1, dongnaeDonghae]);
  });

  it('keeps places that only share a name', () => {
    expect(dedupePlaces([place('시청', 35.1, 129.0), place('시청', 37.5, 126.9)])).toHaveLength(2);
  });
});
