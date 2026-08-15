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

export type RoutinePresetName = '기본 외출 준비' | '빠른 준비' | '여유있는 준비';

/**
 * The preset shapes the actual routine list, always on top of the gender defaults, so a
 * male profile never starts a schedule with 화장 regardless of which preset is chosen.
 */
export function routinesForPreset(gender: PreparationGender, preset: RoutinePresetName): RoutineDraft[] {
  if (preset === '빠른 준비') {
    return [
      { id: 'shower', icon: 'shower', label: '샤워', minutes: 12 },
      { id: 'dress', icon: 'dress', label: '옷 입기', minutes: 5 },
      { id: 'bag', icon: 'bag', label: '짐 챙기기', minutes: 5 },
    ];
  }
  const base = defaultRoutinesForGender(gender);
  if (preset === '여유있는 준비') {
    return [...base, { id: 'relax-check', icon: 'time', label: '여유 점검', minutes: 10 }];
  }
  return base;
}

export function routineTotalMinutes(routines: readonly RoutineDraft[]) {
  return routines.reduce((sum, routine) => sum + routine.minutes, 0);
}

/** One-line summary of the currently selected preset for the settings screen. */
export function routinePresetSummary(gender: PreparationGender, preset: RoutinePresetName) {
  const total = routineTotalMinutes(routinesForPreset(gender, preset));
  if (preset === '빠른 준비') return { icon: 'quick' as const, detail: `총 ${total}분 · 샤워와 필수 준비 중심` };
  if (preset === '여유있는 준비') return { icon: 'time' as const, detail: `총 ${total}분 · 기본 구성에 여유 점검 10분 추가` };
  return { icon: 'routine' as const, detail: `총 ${total}분 · 성별 추천 기본 구성` };
}

export function preparationGenderLabel(gender: PreparationGender) {
  if (gender === 'female') return '여성 · 여성 추천';
  if (gender === 'male') return '남성 · 남성 추천';
  return '선택 안 함 · 공통 추천';
}
