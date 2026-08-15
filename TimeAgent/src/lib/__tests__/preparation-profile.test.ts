import { defaultRoutinesForGender, preparationGenderLabel, routinePresetSummary, routineTotalMinutes, routinesForPreset } from '@/lib/preparation-profile';

describe('gender-based preparation defaults', () => {
  it('keeps a common default when gender is not selected', () => {
    expect(preparationGenderLabel('unspecified')).toBe('선택 안 함 · 공통 추천');
    expect(defaultRoutinesForGender('unspecified').map((item) => item.label)).toEqual([
      '샤워', '화장', '옷 입기', '짐 챙기기',
    ]);
  });

  it('provides distinct female and male starting lists', () => {
    const female = defaultRoutinesForGender('female');
    const male = defaultRoutinesForGender('male');

    expect(female.map((item) => item.label)).toEqual([
      '샤워', '스킨케어', '화장', '헤어 정돈', '옷 입기', '짐 챙기기',
    ]);
    expect(male.map((item) => item.label)).toEqual([
      '샤워', '면도', '헤어 정돈', '옷 입기', '짐 챙기기',
    ]);
    expect(female).not.toEqual(male);
  });

  it('returns a fresh list so editing one schedule cannot mutate the next', () => {
    const first = defaultRoutinesForGender('female');
    first[0].minutes = 1;
    expect(defaultRoutinesForGender('female')[0].minutes).toBe(18);
  });
});

describe('routine presets', () => {
  it('keeps the gender defaults out of the quick preset and 화장 out of a male list', () => {
    const quick = routinesForPreset('male', '빠른 준비');
    expect(quick.map((item) => item.label)).toEqual(['샤워', '옷 입기', '짐 챙기기']);
    expect(routineTotalMinutes(quick)).toBe(22);

    for (const preset of ['기본 외출 준비', '빠른 준비', '여유있는 준비'] as const) {
      expect(routinesForPreset('male', preset).map((item) => item.label)).not.toContain('화장');
    }
  });

  it('adds a relaxed buffer routine on top of the gender defaults', () => {
    const relaxed = routinesForPreset('female', '여유있는 준비');
    expect(relaxed.at(-1)).toEqual(expect.objectContaining({ label: '여유 점검', minutes: 10 }));
    expect(relaxed.map((item) => item.label)).toContain('화장');
    expect(routinesForPreset('male', '기본 외출 준비').map((item) => item.label)).toContain('면도');
  });

  it('summarizes the selected preset with its own icon and real total minutes', () => {
    expect(routinePresetSummary('male', '빠른 준비')).toEqual({ icon: 'quick', detail: '총 22분 · 샤워와 필수 준비 중심' });
    expect(routinePresetSummary('male', '기본 외출 준비')).toEqual({ icon: 'routine', detail: '총 40분 · 성별 추천 기본 구성' });
    expect(routinePresetSummary('male', '여유있는 준비')).toEqual({ icon: 'time', detail: '총 50분 · 기본 구성에 여유 점검 10분 추가' });
  });
});
