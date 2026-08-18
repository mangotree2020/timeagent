import {
  describePlaceVerification,
  DISTANT_PLACE_METERS,
  formatPlaceDistance,
  verifySpokenPlace,
} from '../place-verification';
import { GeocodedPlace } from '../journey';
import { SavedPlace } from '../saved-places';

const BUSAN = { latitude: 35.1796, longitude: 129.0756 };

function place(name: string, coordinate: { latitude: number; longitude: number }): GeocodedPlace {
  return { name, roadAddress: `${name} 도로명`, jibunAddress: `${name} 지번`, coordinate };
}

const seomyeon = place('서면역', { latitude: 35.1578, longitude: 129.0592 });
const yeoksam = place('역삼역', { latitude: 37.5006, longitude: 127.0366 });
const gangnam = place('강남역', { latitude: 37.4979, longitude: 127.0276 });
const busanStation = place('부산역', { latitude: 35.1151, longitude: 129.0415 });

function saved(name: string, coordinate: { latitude: number; longitude: number }): SavedPlace {
  return { ...place(name, coordinate), id: `saved-${name}`, lastUsedAt: 1_000 };
}

describe('verifying a place the assistant heard', () => {
  it('fills in a nearby place with one matching name without interrupting', () => {
    const result = verifySpokenPlace({ spokenName: '서면역', results: [seomyeon], origin: BUSAN });
    expect(result).toEqual({ kind: 'confirmed', place: seomyeon });
  });

  it('asks rather than accepting a real place in another city', () => {
    // 서면역 misheard as 역삼역 is a real station, so a name-only check confirms Seoul from Busan.
    const result = verifySpokenPlace({ spokenName: '역삼역', results: [yeoksam], origin: BUSAN });
    expect(result.kind).toBe('choose');
    if (result.kind !== 'choose') throw new Error('expected a question');
    expect(result.reason).toBe('distant');
    expect(result.candidates[0].place).toBe(yeoksam);
    expect(result.candidates[0].distanceMeters).toBeGreaterThan(DISTANT_PLACE_METERS);
  });

  it('never rewrites the name it was given — the far place stays on offer', () => {
    const result = verifySpokenPlace({
      spokenName: '역삼역',
      results: [yeoksam, seomyeon],
      origin: BUSAN,
    });
    if (result.kind !== 'choose') throw new Error('expected a question');
    expect(result.candidates.map((item) => item.place.name)).toContain('역삼역');
  });

  it('offers what is nearby alongside the distant match', () => {
    const result = verifySpokenPlace({
      spokenName: '역삼역',
      results: [yeoksam, seomyeon, busanStation],
      origin: BUSAN,
    });
    if (result.kind !== 'choose') throw new Error('expected a question');
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates[0].place.name).toBe('역삼역');
    // The rest are ordered by how close they are.
    expect(result.candidates[1].place.name).toBe('서면역');
    expect(result.candidates[2].place.name).toBe('부산역');
  });

  it('treats somewhere this person has been as confirmation, however far it is', () => {
    const result = verifySpokenPlace({
      spokenName: '역삼역',
      results: [yeoksam],
      origin: BUSAN,
      savedPlaces: [saved('역삼역', yeoksam.coordinate)],
    });
    expect(result).toEqual({ kind: 'confirmed', place: yeoksam });
  });

  it('asks when several places answer to the same name', () => {
    const otherSeomyeon = place('서면역', { latitude: 37.4, longitude: 127.1 });
    const result = verifySpokenPlace({
      spokenName: '서면역',
      results: [seomyeon, otherSeomyeon],
      origin: BUSAN,
    });
    if (result.kind !== 'choose') throw new Error('expected a question');
    expect(result.reason).toBe('ambiguous');
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].place).toBe(seomyeon);
  });

  it('falls back to the name alone when the device cannot say where it is', () => {
    const result = verifySpokenPlace({ spokenName: '역삼역', results: [yeoksam], origin: null });
    expect(result).toEqual({ kind: 'confirmed', place: yeoksam });
  });

  it('leaves an inexact or empty result to the search list', () => {
    expect(verifySpokenPlace({ spokenName: '서면역', results: [], origin: BUSAN }).kind).toBe('none');
    expect(verifySpokenPlace({ spokenName: '서면', results: [gangnam], origin: BUSAN }).kind).toBe('none');
    expect(verifySpokenPlace({ spokenName: '  ', results: [seomyeon], origin: BUSAN }).kind).toBe('none');
  });

  it('ignores spacing differences in the name it heard', () => {
    const spaced = place('부산 역', busanStation.coordinate);
    expect(verifySpokenPlace({ spokenName: '부산역', results: [spaced], origin: BUSAN }).kind).toBe('confirmed');
  });
});

describe('a name the recogniser spelled the way it is said', () => {
  const minrak = place('민락수변공원', { latitude: 35.1533, longitude: 129.1289 });
  const dongnae = place('동래역', { latitude: 35.2100, longitude: 129.0784 });
  const nampo = place('남포동', { latitude: 35.0977, longitude: 129.0324 });

  it('accepts the map’s spelling of the word that was said', () => {
    // 민락수변공원 is pronounced [밀락…]. The person said the place; only the spelling is the
    // recogniser's, so there is nothing here to ask about.
    expect(verifySpokenPlace({ spokenName: '밀락수변공원', results: [minrak], origin: BUSAN }))
      .toEqual({ kind: 'confirmed', place: minrak });
    expect(verifySpokenPlace({ spokenName: '동내역', results: [dongnae], origin: BUSAN }))
      .toEqual({ kind: 'confirmed', place: dongnae });
  });

  it('still checks distance on a name it matched by sound', () => {
    const seoulJongno = place('종로', { latitude: 37.5729, longitude: 126.9794 });
    const result = verifySpokenPlace({ spokenName: '종노', results: [seoulJongno], origin: BUSAN });

    if (result.kind !== 'choose') throw new Error('expected a question');
    expect(result.reason).toBe('distant');
  });

  it('recognises a place already visited under its spoken spelling', () => {
    const result = verifySpokenPlace({
      spokenName: '종노',
      results: [place('종로', { latitude: 37.5729, longitude: 126.9794 })],
      origin: BUSAN,
      savedPlaces: [saved('종로', { latitude: 37.5729, longitude: 126.9794 })],
    });

    expect(result.kind).toBe('confirmed');
  });

  it('does not ask which 부산역 when both entries are the same 부산역', () => {
    // What the map returns for 부산역: the place and the station, 151m apart. Asking which one is
    // asking nothing, and it used to fill in without a word.
    const plaza = place('부산역', { latitude: 35.11554918, longitude: 129.0403223 });
    const platform = place('부산역[부산지하철1호선]', { latitude: 35.11446595, longitude: 129.03932242 });

    expect(verifySpokenPlace({ spokenName: '부산역', results: [plaza, platform], origin: BUSAN }).kind)
      .toBe('confirmed');
  });

  it('still asks when one name really does answer for two places', () => {
    // The two 동래역 stations are 1.5km apart — far enough that picking for someone picks a walk.
    const line1 = place('동래역[부산지하철1호선]', { latitude: 35.20512318, longitude: 129.078261 });
    const donghae = place('동래역[동해선]', { latitude: 35.19734652, longitude: 129.09167671 });
    const result = verifySpokenPlace({ spokenName: '동내역', results: [line1, donghae], origin: BUSAN });

    if (result.kind !== 'choose') throw new Error('expected a question');
    expect(result.reason).toBe('ambiguous');
    expect(result.candidates).toHaveLength(2);
  });

  it('matches the station the map annotates with its line', () => {
    // What the search actually returns for 동래역, and what a name-only check could never match.
    const annotated = place('동래역[부산지하철1호선]', dongnae.coordinate);

    expect(verifySpokenPlace({ spokenName: '동내역', results: [annotated], origin: BUSAN }))
      .toEqual({ kind: 'confirmed', place: annotated });
  });

  it('offers the longer name the map gave back for a spelling it guessed at', () => {
    // 남포동 comes back as 중구 남포동, and 광안리 as 광안리해수욕장.
    const district = place('중구 남포동', nampo.coordinate);
    const result = verifySpokenPlace({
      spokenName: '난포동',
      results: [district],
      origin: BUSAN,
      variantNames: ['남포동'],
    });

    if (result.kind !== 'choose') throw new Error('expected a question');
    expect(result.reason).toBe('misheard');
    expect(result.candidates[0].place).toBe(district);
  });

  it('asks about a spelling it guessed at rather than filling it in', () => {
    // 난포동 for 남포동 is an ear, not a sound change. The app found it by trying another spelling,
    // so it is a different word from the one that was said and the person has to say.
    const result = verifySpokenPlace({
      spokenName: '난포동',
      results: [nampo],
      origin: BUSAN,
      variantNames: ['남포동', '낭포동'],
    });

    if (result.kind !== 'choose') throw new Error('expected a question');
    expect(result.reason).toBe('misheard');
    expect(result.candidates[0].place).toBe(nampo);
    expect(describePlaceVerification(result, '난포동')).toContain('난포동이라는');
    expect(describePlaceVerification(result, '난포동')).toContain('비슷하게 들리는');
  });

  it('says nothing when even the other spellings found nothing that fits', () => {
    expect(verifySpokenPlace({
      spokenName: '난포동',
      results: [gangnam],
      origin: BUSAN,
      variantNames: ['남포동'],
    }).kind).toBe('none');
  });

  it('prefers what was actually said over a spelling it guessed at', () => {
    const result = verifySpokenPlace({
      spokenName: '동내역',
      results: [nampo, dongnae],
      origin: BUSAN,
      variantNames: ['남포동'],
    });

    expect(result).toEqual({ kind: 'confirmed', place: dongnae });
  });
});

describe('what the person is told', () => {
  it('reads distance the way the rest of the app does', () => {
    expect(formatPlaceDistance(null)).toBe('');
    expect(formatPlaceDistance(340)).toBe('340m');
    expect(formatPlaceDistance(1_530)).toBe('1.5km');
    expect(formatPlaceDistance(325_000)).toBe('325km');
  });

  it('says why it is asking instead of deciding', () => {
    const distant = verifySpokenPlace({ spokenName: '역삼역', results: [yeoksam], origin: BUSAN });
    if (distant.kind !== 'choose') throw new Error('expected a question');
    expect(describePlaceVerification(distant, '역삼역')).toContain('떨어져');

    const ambiguous = verifySpokenPlace({
      spokenName: '서면역',
      results: [seomyeon, place('서면역', { latitude: 37.4, longitude: 127.1 })],
      origin: BUSAN,
    });
    if (ambiguous.kind !== 'choose') throw new Error('expected a question');
    expect(describePlaceVerification(ambiguous, '서면역')).toContain('여러 곳');
    // The name is quoted back with a real particle, not the (이)라는 placeholder.
    expect(describePlaceVerification(ambiguous, '서면역')).toContain('서면역이라는');
    expect(describePlaceVerification(ambiguous, '서면역')).not.toContain('(이)');
  });
});
