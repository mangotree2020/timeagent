import { GeocodedPlace } from '../journey';
import { dedupePlaces, searchSpokenPlace } from '../place-search';

const BUSAN = { latitude: 35.1796, longitude: 129.0756 };

function place(name: string, latitude: number, longitude: number): GeocodedPlace {
  return { name, roadAddress: `${name} 도로명`, jibunAddress: `${name} 지번`, coordinate: { latitude, longitude } };
}

const dongnaeLine1 = place('동래역[부산지하철1호선]', 35.20512318, 129.078261);
const dongnaeDonghae = place('동래역[동해선]', 35.19734652, 129.09167671);
const nampo = place('중구 남포동', 35.0977, 129.0324);
const minrak = place('민락수변공원', 35.1533, 129.1289);

/** A map that answers some spellings and rejects the rest, the way the real one does. */
function mapWith(answers: Record<string, GeocodedPlace[]>) {
  const queries: string[] = [];
  const search = async (query: string) => {
    queries.push(query);
    const found = answers[query];
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

  it('reports the failure only once the other spellings have failed too', async () => {
    const map = mapWith({});
    const { verification, failure } = await searchSpokenPlace({ spokenName: '동내역', origin: BUSAN, search: map.search });

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

  it('stays within its budget of extra queries', async () => {
    const map = mapWith({});
    await searchSpokenPlace({ spokenName: '난포동', origin: BUSAN, search: map.search, maxVariants: 2 });

    expect(map.queries).toHaveLength(3);
  });

  it('has nothing more to try for a name no rule touches', async () => {
    const map = mapWith({});
    const { verification, failure } = await searchSpokenPlace({ spokenName: 'CGV', origin: BUSAN, search: map.search });

    expect(map.queries).toEqual(['CGV']);
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
