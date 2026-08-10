import { createSchedulePlan } from '../planning';
import { createDefaultScheduleDraft } from '../schedule-draft';
import {
  confirmSchedulePlan,
  findDueConfirmedPlan,
  formatConfirmedPlanDate,
  loadConfirmedPlans,
  markConfirmedPlanState,
  plansForLocalDate,
  plansForLocalDateRange,
  settlePastConfirmedPlans,
  saveConfirmedPlans,
} from '../confirmed-plans';

function createMemoryStorage(initialValue: string | null = null) {
  let value = initialValue;
  return {
    getItem: jest.fn(async () => value),
    setItem: jest.fn(async (_key: string, next: string) => { value = next; }),
  };
}

function planAt(title: string, appointmentTime: string, confirmedAt: number) {
  const schedule = {
    ...createDefaultScheduleDraft(),
    title,
    date: '8월 8일 (오늘)',
    appointmentTime,
    routines: [{ id: 'ready', icon: 'routine', label: '준비', minutes: 20 }],
    transport: '지하철' as const,
  };
  const plan = createSchedulePlan(schedule, { travelMinutes: 20 });
  return confirmSchedulePlan({ schedule, plan, now: confirmedAt });
}

describe('confirmed schedule plans', () => {
  const morning = new Date('2026-08-08T09:00:00+09:00').getTime();

  test('stores multiple appointments and restores them in preparation-start order', async () => {
    const storage = createMemoryStorage();
    const afternoon = planAt('치과', '14:00', morning);
    const evening = planAt('저녁 약속', '19:00', morning + 1);

    await saveConfirmedPlans(storage, [evening, afternoon]);

    await expect(loadConfirmedPlans(storage)).resolves.toEqual([afternoon, evening]);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  test('selects the earliest due plan without starting a future or completed plan', () => {
    const first = planAt('치과', '14:00', morning);
    const second = planAt('저녁 약속', '19:00', morning + 1);
    const beforeFirst = first.prepStartAt - 1;

    expect(findDueConfirmedPlan([first, second], beforeFirst)).toBeNull();
    expect(findDueConfirmedPlan([first, second], first.prepStartAt)?.id).toBe(first.id);

    const completed = markConfirmedPlanState([first, second], first.id, 'completed');
    expect(findDueConfirmedPlan(completed, second.prepStartAt)?.id).toBe(second.id);
  });

  test('resolves a preparation start that crosses to the previous date', () => {
    const late = planAt('심야 약속', '00:30', morning);

    expect(new Date(late.appointmentAt).toISOString()).toBe('2026-08-07T15:30:00.000Z');
    expect(new Date(late.prepStartAt).toISOString()).toBe('2026-08-07T14:40:00.000Z');
  });

  test('treats the explicit today label as authoritative over a stale formatted date', () => {
    const schedule = { ...createDefaultScheduleDraft(), date: '7월 23일 (오늘)' };
    const confirmed = confirmSchedulePlan({ schedule, plan: createSchedulePlan(schedule), now: morning });

    expect(new Date(confirmed.appointmentAt).toISOString()).toBe('2026-08-08T05:00:00.000Z');
  });

  test('formats the stored appointment timestamp instead of a stale draft date label', () => {
    expect(formatConfirmedPlanDate(new Date('2026-08-08T14:00:00+09:00').getTime(), morning)).toBe('오늘');
    expect(formatConfirmedPlanDate(new Date('2026-08-09T14:00:00+09:00').getTime(), morning)).toBe('내일');
    expect(formatConfirmedPlanDate(new Date('2026-08-12T14:00:00+09:00').getTime(), morning)).toBe('8월 12일');
  });

  test('shows only appointments from the requested local day', () => {
    const today = planAt('오늘 치과', '14:00', morning);
    const tomorrow = {
      ...planAt('내일 저녁', '19:00', morning + 1),
      appointmentAt: new Date('2026-08-09T19:00:00+09:00').getTime(),
    };

    expect(plansForLocalDate([tomorrow, today], morning).map((plan) => plan.id)).toEqual([today.id]);
  });

  test('shows today and tomorrow appointments in chronological order while excluding later dates', () => {
    const today = planAt('오늘 치과', '14:00', morning);
    const tomorrow = {
      ...planAt('내일 저녁', '19:00', morning + 1),
      appointmentAt: new Date('2026-08-09T19:00:00+09:00').getTime(),
    };
    const dayAfterTomorrow = {
      ...planAt('모레 점심', '12:00', morning + 2),
      appointmentAt: new Date('2026-08-10T12:00:00+09:00').getTime(),
    };

    expect(plansForLocalDateRange([dayAfterTomorrow, tomorrow, today], morning, 2).map((plan) => plan.schedule.title))
      .toEqual(['오늘 치과', '내일 저녁']);
  });

  test('closes every elapsed appointment as incomplete while preserving completed records', () => {
    const elapsed = planAt('지나간 치과', '14:00', morning);
    const completed = { ...planAt('완료한 점심', '12:00', morning + 1), state: 'completed' as const };
    const future = planAt('저녁 약속', '19:00', morning + 2);
    const now = new Date('2026-08-08T15:00:00+09:00').getTime();

    const settled = settlePastConfirmedPlans([elapsed, completed, future], now);

    expect(settled.find((plan) => plan.id === elapsed.id)?.state).toBe('incomplete');
    expect(settled.find((plan) => plan.id === completed.id)?.state).toBe('completed');
    expect(settled.find((plan) => plan.id === future.id)?.state).toBe('scheduled');
  });

  test('does not rewrite plans before their appointment time', () => {
    const future = planAt('치과', '14:00', morning);
    expect(settlePastConfirmedPlans([future], future.appointmentAt - 1)).toBeDefined();
    expect(settlePastConfirmedPlans([future], future.appointmentAt - 1)[0]).toBe(future);
  });

  test('ignores malformed saved data', async () => {
    const storage = createMemoryStorage('{"version":1,"plans":[{"id":"broken"}]}');
    await expect(loadConfirmedPlans(storage)).resolves.toEqual([]);
  });
});
