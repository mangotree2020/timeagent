import { loadSavedPlaces, rememberPlace, SAVED_PLACES_STORAGE_KEY } from '@/lib/saved-places';

function createMemoryStorage(initialValue: string | null = null) {
  let value = initialValue;
  return {
    getItem: jest.fn(async () => value),
    setItem: jest.fn(async (_key: string, next: string) => { value = next; }),
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

  test('keeps only the eight most recently selected places', async () => {
    const storage = createMemoryStorage();
    for (let index = 0; index < 10; index += 1) {
      await rememberPlace(storage, {
        ...cityHall,
        name: `장소 ${index}`,
        roadAddress: `주소 ${index}`,
        coordinate: { latitude: 35 + index / 100, longitude: 129 },
      }, index);
    }

    const saved = await loadSavedPlaces(storage);
    expect(saved).toHaveLength(8);
    expect(saved[0].name).toBe('장소 9');
    expect(saved.at(-1)?.name).toBe('장소 2');
  });

  test('ignores malformed persisted data', async () => {
    await expect(loadSavedPlaces(createMemoryStorage('{broken'))).resolves.toEqual([]);
    await expect(loadSavedPlaces(createMemoryStorage('[{"name":"missing fields"}]'))).resolves.toEqual([]);
  });
});
