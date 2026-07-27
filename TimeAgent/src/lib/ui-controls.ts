import { RoutineDraft } from './schedule-draft';

export type PlanBSort = '정시 도착' | '비용 우선' | '걷기 최소';

type PlanAlternative = {
  id: string;
  status: string;
  cost: string;
  walk: string;
  recommended: boolean;
  durationMinutes: number;
};

export function addRoutine(
  routines: RoutineDraft[],
  rawLabel: string,
  id: string,
): RoutineDraft[] {
  const label = rawLabel.trim();
  if (!label || routines.some((routine) => routine.label === label)) return routines;

  return [...routines, { id, icon: 'ready', label, minutes: 5 }];
}

export function sortPlanAlternatives<T extends PlanAlternative>(
  alternatives: readonly T[],
  sort: PlanBSort,
): T[] {
  return [...alternatives].sort((left, right) => {
    if (sort === '정시 도착') {
      const leftLate = left.status.includes('지각') ? 1 : 0;
      const rightLate = right.status.includes('지각') ? 1 : 0;
      if (leftLate !== rightLate) return leftLate - rightLate;
      if (left.recommended !== right.recommended) return left.recommended ? -1 : 1;
      return left.id.localeCompare(right.id);
    }

    const leftValue = sort === '비용 우선'
      ? numericValue(left.cost)
      : numericValue(left.walk);
    const rightValue = sort === '비용 우선'
      ? numericValue(right.cost)
      : numericValue(right.walk);
    if (leftValue !== rightValue) return leftValue - rightValue;
    if (left.recommended !== right.recommended) return left.recommended ? -1 : 1;
    return left.id.localeCompare(right.id);
  });
}

function numericValue(label: string) {
  const digits = label.replace(/\D/g, '');
  return digits ? Number(digits) : Number.MAX_SAFE_INTEGER;
}
