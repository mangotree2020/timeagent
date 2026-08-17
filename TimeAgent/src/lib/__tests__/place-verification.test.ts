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
  });
});
