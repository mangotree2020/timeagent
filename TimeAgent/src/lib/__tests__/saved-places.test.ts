import {
  loadSavedPlaces,
  mergeRemoteSavedPlaces,
  mergeSavedPlaces,
  parseRemoteSavedPlaces,
  placeId,
  rememberPlace,
  SAVED_PLACES_STORAGE_KEY,
  SavedPlace,
} from '@/lib/saved-places';

function createMemoryStorage(initialValue: string | null = null) {
  let value = initialValue;
  return {
    getItem: jest.fn(async () => value),
    setItem: jest.fn(async (_key: string, next: string) => { value = next; }),
  };
}

function createMemoryMapStorage() {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, next: string) => { values.set(key, next); }),
  };
}

const cityHall = {
  name: '서울특별시청',
  roadAddress: '서울특별시 중구 세종대로 110',
  jibunAddress: '서울특별시 중구 태평로1가 31',
  coordinate: { latitude: 37.56661, longitude: 126.978388 },
};

describe('saved places', () => {
  test('stores a selected place for later reuse', async () => {
    const storage = createMemoryStorage();
    await rememberPlace(storage, cityHall, 100);

    await expect(loadSavedPlaces(storage)).resolves.toEqual([
      expect.objectContaining({ name: cityHall.name, lastUsedAt: 100 }),
    ]);
    expect(storage.setItem).toHaveBeenCalledWith(SAVED_PLACES_STORAGE_KEY, expect.any(String));
  });

  test('moves a repeated place to the front without duplicating it', async () => {
    const storage = createMemoryStorage();
    await rememberPlace(storage, cityHall, 100);
    await rememberPlace(storage, { ...cityHall, name: '서울시청' }, 200);

    const saved = await loadSavedPlaces(storage);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toEqual(expect.objectContaining({ name: '서울시청', lastUsedAt: 200 }));
  });

  test('keeps only the thirty most recently selected places', async () => {
    const storage = createMemoryStorage();
    for (let index = 0; index < 32; index += 1) {
      await rememberPlace(storage, {
        ...cityHall,
        name: `장소 ${index}`,
        roadAddress: `주소 ${index}`,
        coordinate: { latitude: 35 + index / 100, longitude: 129 },
      }, index);
    }

    const saved = await loadSavedPlaces(storage);
    expect(saved).toHaveLength(30);
    expect(saved[0].name).toBe('장소 31');
    expect(saved.at(-1)?.name).toBe('장소 2');
  });

  test('ignores malformed persisted data', async () => {
    await expect(loadSavedPlaces(createMemoryStorage('{broken'))).resolves.toEqual([]);
    await expect(loadSavedPlaces(createMemoryStorage('[{"name":"missing fields"}]'))).resolves.toEqual([]);
  });

  function savedPlace(name: string, latitude: number, lastUsedAt: number): SavedPlace {
    const coordinate = { latitude, longitude: 129 };
    return { id: placeId(coordinate), name, roadAddress: '', jibunAddress: '', coordinate, lastUsedAt };
  }

  test('merges server places so the same spot keeps its most recent use from any device', () => {
    const local = [savedPlace('회사', 35.1, 300), savedPlace('집', 35.2, 100)];
    const remote = [savedPlace('우리 집', 35.2, 400), savedPlace('치과', 35.3, 200)];

    const merged = mergeSavedPlaces(local, remote);
    expect(merged.map((place) => place.name)).toEqual(['우리 집', '회사', '치과']);
  });

  test('caps the merged list at the thirty most recent places', () => {
    const local = Array.from({ length: 20 }, (_, index) => savedPlace(`local ${index}`, 35 + index / 100, 100 + index));
    const remote = Array.from({ length: 20 }, (_, index) => savedPlace(`remote ${index}`, 36 + index / 100, 200 + index));

    const merged = mergeSavedPlaces(local, remote);
    expect(merged).toHaveLength(30);
    expect(merged[0].name).toBe('remote 19');
  });

  test('persists the merged server list so the next launch starts from it', async () => {
    const storage = createMemoryStorage();
    await rememberPlace(storage, cityHall, 100);

    const merged = await mergeRemoteSavedPlaces(storage, [savedPlace('치과', 35.3, 200)]);
    expect(merged.map((place) => place.name)).toEqual(['치과', cityHall.name]);
    await expect(loadSavedPlaces(storage)).resolves.toHaveLength(2);
  });

  test('keeps each signed-in account\'s places apart on a shared device', async () => {
    const storage = createMemoryMapStorage();
    await rememberPlace(storage, cityHall, 100, 'user-a');
    await rememberPlace(storage, { ...cityHall, name: 'B의 장소', coordinate: { latitude: 35.3, longitude: 129 } }, 200, 'user-b');

    await expect(loadSavedPlaces(storage, 'user-a')).resolves.toEqual([
      expect.objectContaining({ name: cityHall.name }),
    ]);
    await expect(loadSavedPlaces(storage, 'user-b')).resolves.toEqual([
      expect.objectContaining({ name: 'B의 장소' }),
    ]);
    await expect(loadSavedPlaces(storage)).resolves.toEqual([]);
  });

  test('accepts only well-formed places from the server payload', () => {
    const good = savedPlace('치과', 35.3, 200);
    expect(parseRemoteSavedPlaces({ places: [good, { name: 'broken' }] })).toEqual([good]);
    expect(parseRemoteSavedPlaces({ places: 'nope' })).toEqual([]);
    expect(parseRemoteSavedPlaces(null)).toEqual([]);
  });
});
