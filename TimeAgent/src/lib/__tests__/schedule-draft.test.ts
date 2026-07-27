import {
  clearScheduleDraft,
  createDefaultScheduleDraft,
  loadScheduleDraft,
  saveScheduleDraft,
  SCHEDULE_DRAFT_STORAGE_KEY,
} from '../schedule-draft';

function createMemoryStorage(initialValue: string | null = null) {
  let value = initialValue;

  return {
    getItem: jest.fn(async () => value),
    setItem: jest.fn(async (_key: string, nextValue: string) => {
      value = nextValue;
    }),
    removeItem: jest.fn(async () => {
      value = null;
    }),
  };
}

describe('schedule draft persistence', () => {
  test('restores the current wizard step and entered schedule values', async () => {
    const storage = createMemoryStorage();
    const draft = {
      ...createDefaultScheduleDraft(),
      step: 2 as const,
      title: '부모님 저녁 식사',
      appointmentTime: '18:30',
      destination: '광안리 식당',
      transport: '버스' as const,
    };

    await saveScheduleDraft(storage, draft);

    await expect(loadScheduleDraft(storage)).resolves.toEqual(draft);
    expect(storage.setItem).toHaveBeenCalledWith(
      SCHEDULE_DRAFT_STORAGE_KEY,
      JSON.stringify(draft),
    );
  });

  test('ignores an incompatible or broken saved draft', async () => {
    const storage = createMemoryStorage('{"version":99,"step":2}');

    await expect(loadScheduleDraft(storage)).resolves.toBeNull();
  });

  test('removes the temporary draft after schedule generation', async () => {
    const storage = createMemoryStorage();
    await saveScheduleDraft(storage, createDefaultScheduleDraft());

    await clearScheduleDraft(storage);

    await expect(loadScheduleDraft(storage)).resolves.toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(SCHEDULE_DRAFT_STORAGE_KEY);
  });
});
