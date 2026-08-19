import { GeocodedPlace } from '../journey';
import { KOREA_REGIONS } from '../korea-regions';
import { dedupePlaces, searchSpokenPlace } from '../place-search';

// Where the person is standing, not where a region is anchored — 해운대 and 강남, so the fake map
// can tell a search aimed at them apart from one aimed at a province.
const BUSAN = { latitude: 35.1587, longitude: 129.1604 };
const SEOUL = { latitude: 37.4979, longitude: 127.0276 };

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
    const anchored = KOREA_REGIONS.find((region) => near
      && Math.abs(region.coordinate.latitude - near.latitude) < 0.01
      && Math.abs(region.coordinate.longitude - near.longitude) < 0.01);
    const key = anchored ? `${query}@${anchored.name}` : query;
    queries.push(key);
    const found = answers[key];
    if (!found) throw new Error('SERVICE_UNAVAILABLE');
    return found;
  };
  return { search, queries };
}

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

  it('reports the failure only once every spelling and every region has failed too', async () => {
    const map = mapWith({});
    const { verification, searchedNationwide, failure } = await searchSpokenPlace({ spokenName: '동내역', origin: BUSAN, search: map.search });

    expect(map.queries).toContain('동래역');
    expect(searchedNationwide).toBe(true);
    expect(verification.kind).toBe('none');
    expect(failure).toBeInstanceOf(Error);
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

  it('stays within its budget of extra spellings before widening the search', async () => {
    const map = mapWith({});
    await searchSpokenPlace({ spokenName: '난포동', origin: BUSAN, search: map.search, maxVariants: 2 });

    // The name and two other spellings nearby, then the name and its best spelling in all 17 regions.
    expect(map.queries.filter((query) => !query.includes('@'))).toHaveLength(3);
    expect(map.queries.filter((query) => query.includes('@'))).toHaveLength(34);
  });

  it('has no other spelling to try for a name no rule touches, and still sweeps the country', async () => {
    const map = mapWith({});
    const { verification, searchedNationwide } = await searchSpokenPlace({ spokenName: 'CGV', origin: BUSAN, search: map.search });

    expect(map.queries[0]).toBe('CGV');
    expect(searchedNationwide).toBe(true);
    expect(verification.kind).toBe('none');
  });
});

describe('a place that is nowhere near the person', () => {
  const hongdae = place('홍대입구역[2호선]', 37.5570, 126.9245);
  const daejeon = place('서구 둔산동', 36.3504, 127.3845);
  const daegu = place('동구 둔산동', 35.8714, 128.6014);

  it('goes and looks across the country instead of asking which province', async () => {
    // Search only ever reaches what it is pointed at, so a Seoul station asked from Busan is not
    // hard to find — it is unreachable. Every region gets asked at once rather than the person.
    const map = mapWith({ '홍대입구역@서울': [hongdae] });
    const { verification, searchedNationwide } = await searchSpokenPlace({
      spokenName: '홍대입구역',
      origin: BUSAN,
      search: map.search,
    });

    expect(searchedNationwide).toBe(true);
    if (verification.kind !== 'choose') throw new Error('expected a question');
    expect(verification.reason).toBe('faraway');
    expect(verification.candidates[0].place).toBe(hongdae);
    // 325km away, and shown as such rather than hidden or filled in.
    expect(verification.candidates[0].distanceMeters).toBeGreaterThan(300_000);
  });

  it('never fills in a place it went looking for somewhere nobody named', async () => {
    const map = mapWith({ '홍대입구역@서울': [hongdae] });
    const { verification } = await searchSpokenPlace({ spokenName: '홍대입구역', origin: BUSAN, search: map.search });

    expect(verification.kind).not.toBe('confirmed');
  });

  it('offers each region that answers when the same name is in more than one', async () => {
    // 둔산동 is written 서구 둔산동 in 대전 and 동구 둔산동 in 대구, and which was meant is the
    // whole question — one nationwide sweep puts both in front of the person.
    const map = mapWith({ '둔산동@대전': [daejeon], '둔산동@대구': [daegu] });
    const { verification } = await searchSpokenPlace({ spokenName: '둔산동', origin: BUSAN, search: map.search });

    if (verification.kind !== 'choose') throw new Error('expected a question');
    expect(verification.candidates.map((item) => item.place.name).sort()).toEqual(['동구 둔산동', '서구 둔산동']);
  });

  it('carries the other spelling into the sweep, for a name misheard and far away at once', async () => {
    const map = mapWith({ '동래역@부산': [place('동래역[동해선]', 35.19734652, 129.09167671)] });
    const { verification } = await searchSpokenPlace({ spokenName: '동내역', origin: SEOUL, search: map.search });

    if (verification.kind !== 'choose') throw new Error('expected a question');
    expect(verification.candidates[0].place.name).toBe('동래역[동해선]');
  });

  it('does not sweep the country when the person already said the region', async () => {
    const map = mapWith({ '홍대입구역@서울': [hongdae] });
    const { verification, searchedNationwide } = await searchSpokenPlace({
      spokenName: '서울 홍대입구역',
      origin: BUSAN,
      search: map.search,
    });

    expect(map.queries).toEqual(['홍대입구역@서울']);
    expect(searchedNationwide).toBe(false);
    expect(verification).toEqual({ kind: 'confirmed', place: hongdae });
  });

  it('keeps the sweep out of it when the name was found nearby', async () => {
    const map = mapWith({ '민락수변공원': [minrak] });
    const { searchedNationwide } = await searchSpokenPlace({ spokenName: '민락수변공원', origin: BUSAN, search: map.search });

    expect(map.queries).toEqual(['민락수변공원']);
    expect(searchedNationwide).toBe(false);
  });

  it('reports the failure once even the country has nothing', async () => {
    const map = mapWith({});
    const { verification, failure } = await searchSpokenPlace({ spokenName: '홍대입구역', origin: BUSAN, search: map.search });

    expect(verification.kind).toBe('none');
    expect(failure).toBeInstanceOf(Error);
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
