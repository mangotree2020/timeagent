import { alternatives } from '@/data/demo';

import { addRoutine, removeRoutine, sortPlanAlternatives } from '../ui-controls';

describe('interactive UI controls', () => {
  test('adds a trimmed custom routine with a stable default duration', () => {
    const routines = addRoutine([], '  우산 챙기기  ', 'routine-1');

    expect(routines).toEqual([
      { id: 'routine-1', icon: 'ready', label: '우산 챙기기', minutes: 5 },
    ]);
  });

  test('does not add an empty or duplicate routine', () => {
    const current = [{ id: 'bag', icon: 'bag', label: '짐 챙기기', minutes: 5 }];

    expect(addRoutine(current, '   ', 'empty')).toBe(current);
    expect(addRoutine(current, '짐 챙기기', 'duplicate')).toBe(current);
  });

  test('sorts plan B choices by the selected comparison control', () => {
    expect(sortPlanAlternatives(alternatives, '정시 도착').map((item) => item.id))
      .toEqual(['subway', 'taxi', 'bus']);
    expect(sortPlanAlternatives(alternatives, '비용 우선').map((item) => item.id))
      .toEqual(['subway', 'bus', 'taxi']);
    expect(sortPlanAlternatives(alternatives, '걷기 최소').map((item) => item.id))
      .toEqual(['taxi', 'bus', 'subway']);
  });
});

describe('removing a preparation step', () => {
  const routines = [
    { id: 'shower', icon: 'shower', label: '샤워', minutes: 15 },
    { id: 'dress', icon: 'dress', label: '옷 입기', minutes: 8 },
  ];

  it('drops the step someone chose to skip', () => {
    expect(removeRoutine(routines, 'shower').map((item) => item.id)).toEqual(['dress']);
  });

  it('keeps the last step, since a plan needs something to count back from', () => {
    const one = routines.slice(0, 1);
    expect(removeRoutine(one, 'shower')).toBe(one);
  });

  it('leaves the list alone when the id is not in it', () => {
    expect(removeRoutine(routines, 'missing')).toBe(routines);
  });
});
