import {
  clearScheduleDraft,
  createDefaultScheduleDraft,
  isGeneratedScheduleTitle,
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

  test('uses the selected gender profile only for a new draft default', () => {
    expect(createDefaultScheduleDraft('female').routines.map((item) => item.label)).toContain('스킨케어');
    expect(createDefaultScheduleDraft('male').routines.map((item) => item.label)).toContain('면도');
    expect(createDefaultScheduleDraft().routines.map((item) => item.label)).not.toContain('면도');
  });

  test('starts a new draft at least 30 minutes later with a weekday period title', () => {
    const now = new Date('2026-08-11T17:07:30+09:00');

    expect(createDefaultScheduleDraft('unspecified', now)).toEqual(expect.objectContaining({
      title: '화요일 오후 약속',
      date: '8월 11일 (오늘)',
      appointmentTime: '17:40',
    }));
  });

  test('moves the date and title to tomorrow when the minimum lead crosses midnight', () => {
    const now = new Date('2026-08-11T23:43:00+09:00');

    expect(createDefaultScheduleDraft('unspecified', now)).toEqual(expect.objectContaining({
      title: '수요일 오전 약속',
      date: '8월 12일 (내일)',
      appointmentTime: '00:15',
    }));
  });

  test('recognizes only the generated weekday period title as replaceable input', () => {
    expect(isGeneratedScheduleTitle('화요일 오후 약속')).toBe(true);
    expect(isGeneratedScheduleTitle(' 화요일 오후 약속 ')).toBe(true);
    expect(isGeneratedScheduleTitle('화요일 오후 치과 약속')).toBe(false);
    expect(isGeneratedScheduleTitle('부모님 저녁 식사')).toBe(false);
  });

  test('keeps the demo destination as a fully selected place', () => {
    expect(createDefaultScheduleDraft()).toEqual(expect.objectContaining({
      destination: '서면 볼링장',
      destinationAddress: '부산진구 중앙대로 672',
      destinationCoordinate: { latitude: 35.1531, longitude: 129.0597 },
    }));
  });
});
