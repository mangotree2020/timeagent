import type { RoutineDraft } from '@/lib/schedule-draft';

export type PreparationGender = 'unspecified' | 'female' | 'male';

const defaults: Record<PreparationGender, readonly RoutineDraft[]> = {
  unspecified: [
    { id: 'shower', icon: 'shower', label: '샤워', minutes: 18 },
    { id: 'makeup', icon: 'makeup', label: '화장', minutes: 12 },
    { id: 'dress', icon: 'dress', label: '옷 입기', minutes: 8 },
    { id: 'bag', icon: 'bag', label: '짐 챙기기', minutes: 5 },
  ],
  female: [
    { id: 'shower', icon: 'shower', label: '샤워', minutes: 18 },
    { id: 'skincare', icon: 'makeup', label: '스킨케어', minutes: 8 },
    { id: 'makeup', icon: 'makeup', label: '화장', minutes: 12 },
    { id: 'hair', icon: 'ready', label: '헤어 정돈', minutes: 10 },
    { id: 'dress', icon: 'dress', label: '옷 입기', minutes: 8 },
    { id: 'bag', icon: 'bag', label: '짐 챙기기', minutes: 5 },
  ],
  male: [
    { id: 'shower', icon: 'shower', label: '샤워', minutes: 15 },
    { id: 'shave', icon: 'ready', label: '면도', minutes: 5 },
    { id: 'hair', icon: 'ready', label: '헤어 정돈', minutes: 7 },
    { id: 'dress', icon: 'dress', label: '옷 입기', minutes: 8 },
    { id: 'bag', icon: 'bag', label: '짐 챙기기', minutes: 5 },
  ],
};

export function defaultRoutinesForGender(gender: PreparationGender): RoutineDraft[] {
  return defaults[gender].map((routine) => ({ ...routine }));
}

export function preparationGenderLabel(gender: PreparationGender) {
  if (gender === 'female') return '여성 · 여성 추천';
  if (gender === 'male') return '남성 · 남성 추천';
  return '선택 안 함 · 공통 추천';
}
