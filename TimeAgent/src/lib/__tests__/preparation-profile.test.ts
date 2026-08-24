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

  it('describes the selected preset with its own icon, and does not repeat its name', () => {
    // The settings row is titled 사용할 준비 루틴 and prints the preset name itself, so the summary
    // is what choosing it means — a second copy of the name would fill the line and say nothing.
    expect(routinePresetSummary('male', '빠른 준비')).toEqual({ icon: 'quick', totalMinutes: 22, description: '샤워와 필수 준비 중심' });
    expect(routinePresetSummary('male', '기본 외출 준비')).toEqual({ icon: 'routine', totalMinutes: 40, description: '성별 추천 기본 구성' });
    expect(routinePresetSummary('male', '여유있는 준비')).toEqual({ icon: 'time', totalMinutes: 50, description: '기본 구성에 여유 점검 10분 추가' });
    for (const preset of ['빠른 준비', '기본 외출 준비', '여유있는 준비'] as const) {
      expect(routinePresetSummary('male', preset).description).not.toContain(preset);
    }
  });
});

describe('male defaults never include 화장', () => {
  test('every male list starts with 면도 instead of 화장, in all presets', () => {
    for (const preset of ['기본 외출 준비', '빠른 준비', '여유있는 준비'] as const) {
      const routines = routinesForPreset('male', preset);
      expect(routines.some((routine) => routine.id === 'makeup')).toBe(false);
      if (preset !== '빠른 준비') expect(routines.some((routine) => routine.label === '면도')).toBe(true);
    }
    expect(defaultRoutinesForGender('male').map((routine) => routine.label)).toContain('면도');
  });
});
