import { defaultRoutinesForGender, preparationGenderLabel } from '@/lib/preparation-profile';

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
