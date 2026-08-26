import { createSchedulePlan } from '../planning';
import { createDefaultScheduleDraft } from '../schedule-draft';
import {
  completeConfirmedPlan,
  confirmSchedulePlan,
  currentOnTimeArrivalStreak,
  findDueConfirmedPlan,
  formatConfirmedPlanDate,
  isPlanAlarmEnabled,
  loadConfirmedPlans,
  markConfirmedPlanState,
  plansForLocalDate,
  plansForLocalDateRange,
  removeConfirmedPlan,
  replaceConfirmedPlan,
  setPlanAlarmEnabled,
  settlePastConfirmedPlans,
  spawnNextRecurringPlans,
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
    transport: '대중교통' as const,
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

  test('replaces one confirmed appointment without creating a duplicate', () => {
    const original = planAt('치과', '14:00', morning);
    const another = planAt('저녁 약속', '19:00', morning + 1);
    const replacement = {
      ...planAt('치과 시간 변경', '15:00', morning + 2),
      id: original.id,
      confirmedAt: original.confirmedAt,
    };

    const plans = replaceConfirmedPlan([original, another], original.id, replacement);

    expect(plans).toHaveLength(2);
    expect(plans.find((plan) => plan.id === original.id)?.schedule.title).toBe('치과 시간 변경');
  });

  test('removes only the selected confirmed appointment', () => {
    const first = planAt('치과', '14:00', morning);
    const second = planAt('저녁 약속', '19:00', morning + 1);

    expect(removeConfirmedPlan([first, second], first.id)).toEqual([second]);
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
    const schedule = { ...createDefaultScheduleDraft(), date: '7월 23일 (오늘)', appointmentTime: '14:00' };
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

  test('stores the arrival result and counts only the latest consecutive on-time completions', () => {
    const first = planAt('첫 약속', '10:00', morning);
    const late = planAt('늦은 약속', '11:00', morning + 1);
    const third = planAt('세 번째 약속', '12:00', morning + 2);
    const latest = planAt('최근 약속', '13:00', morning + 3);
    let plans = [first, late, third, latest];

    plans = completeConfirmedPlan(plans, first.id, { completedAt: morning + 10, onTime: true, delayMinutes: 0 });
    plans = completeConfirmedPlan(plans, late.id, { completedAt: morning + 20, onTime: false, delayMinutes: 7 });
    plans = completeConfirmedPlan(plans, third.id, { completedAt: morning + 30, onTime: true, delayMinutes: 0 });
    plans = completeConfirmedPlan(plans, latest.id, { completedAt: morning + 40, onTime: true, delayMinutes: 1 });

    expect(plans.find((plan) => plan.id === latest.id)).toMatchObject({
      state: 'completed',
      completion: { completedAt: morning + 40, onTime: true, delayMinutes: 1 },
    });
    expect(currentOnTimeArrivalStreak(plans)).toBe(2);
  });

  test('an incomplete or unknown completed result breaks the current arrival streak', () => {
    const scheduled = planAt('정시 약속', '10:00', morning);
    const onTime = completeConfirmedPlan([scheduled], scheduled.id, {
      completedAt: morning + 10,
      onTime: true,
      delayMinutes: 0,
    })[0];
    const incomplete = { ...planAt('미완료 약속', '11:00', morning + 1), state: 'incomplete' as const, appointmentAt: morning + 20 };
    const unknown = { ...planAt('이전 완료 약속', '09:00', morning - 1), state: 'completed' as const, appointmentAt: morning + 30 };

    expect(currentOnTimeArrivalStreak([onTime, incomplete])).toBe(0);
    expect(currentOnTimeArrivalStreak([onTime, unknown])).toBe(0);
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

describe('repeating confirmed plans', () => {
  const saturday = new Date('2026-08-08T09:00:00+09:00').getTime(); // 2026-08-08 (토)

  function weeklyPlan(days: number[], date = '2026-08-10 (월)', confirmedAt = saturday) {
    const schedule = {
      ...createDefaultScheduleDraft(),
      title: '필라테스',
      date,
      appointmentTime: '19:00',
      repeatWeekdays: days,
      recurrence: '매주 월·수',
      routines: [{ id: 'ready', icon: 'routine', label: '준비', minutes: 20 }],
      transport: '대중교통' as const,
    };
    const plan = createSchedulePlan(schedule, { travelMinutes: 20 });
    return confirmSchedulePlan({ schedule, plan, now: confirmedAt });
  }

  test('a repeating appointment carries a series id, a one-off does not', () => {
    expect(weeklyPlan([1, 3]).seriesId).toBe(weeklyPlan([1, 3]).id);
    expect(planAt('치과', '14:00', saturday).seriesId).toBeUndefined();
  });

  test('creates the next occurrence once the current one is over, on the next repeat weekday', () => {
    const monday = weeklyPlan([1, 3]);
    const afterMonday = monday.appointmentAt + 60_000;
    const settled = settlePastConfirmedPlans([monday], afterMonday);
    const spawned = spawnNextRecurringPlans(settled, afterMonday);

    expect(spawned).toHaveLength(2);
    const next = spawned.find((plan) => plan.id !== monday.id)!;
    expect(next.state).toBe('scheduled');
    expect(next.seriesId).toBe(monday.id);
    expect(next.schedule.date).toBe('2026-08-12 (수)');
    expect(next.schedule.appointmentTime).toBe('19:00');
    expect(new Date(next.appointmentAt).getDay()).toBe(3);
    expect(next.appointmentAt - next.prepStartAt).toBe(monday.appointmentAt - monday.prepStartAt);
    expect(next.notificationIdentifier).toBeUndefined();
  });

  test('the next occurrence keeps the minutes but not the timetable lookup', () => {
    const looked = weeklyPlan([1, 3]);
    const monday = { ...looked, plan: { ...looked.plan, travelEstimate: { mode: '버스' as const, minutes: 20, distanceMeters: 5000, source: 'route' as const, provider: 'TMAP', calculatedAt: '2026-08-10T09:00:00.000Z', basis: 'timetable' as const, departureAt: '2026-08-10T09:40:00.000Z', firstBoarding: { mode: '버스' as const, routeName: '101', stop: { name: '서면', coordinate: null }, walkMinutesToStop: 5 } } } };
    const afterMonday = monday.appointmentAt + 60_000;
    const spawned = spawnNextRecurringPlans(settlePastConfirmedPlans([monday], afterMonday), afterMonday);
    const next = spawned.find((plan) => plan.id !== monday.id)!;
    expect(next.plan.travelMinutes).toBe(20);
    expect(next.plan.travelEstimate).toBeUndefined();
    expect(spawned.find((plan) => plan.id === monday.id)?.plan.travelEstimate?.firstBoarding?.routeName).toBe('101');
  });

  test('does not create a second occurrence while one is already waiting, and leaves one-offs alone', () => {
    const monday = weeklyPlan([1, 3]);
    const afterMonday = monday.appointmentAt + 60_000;
    const once = spawnNextRecurringPlans(settlePastConfirmedPlans([monday], afterMonday), afterMonday);
    expect(spawnNextRecurringPlans(once, afterMonday + 1)).toBe(once);

    const oneOff = settlePastConfirmedPlans([planAt('치과', '14:00', saturday)], saturday + 86_400_000);
    expect(spawnNextRecurringPlans(oneOff, saturday + 86_400_000)).toBe(oneOff);
  });

  test('catches up from now when the app was away for weeks', () => {
    const monday = weeklyPlan([1]);
    const threeWeeksLater = monday.appointmentAt + 21 * 86_400_000 + 3_600_000;
    const spawned = spawnNextRecurringPlans(settlePastConfirmedPlans([monday], threeWeeksLater), threeWeeksLater);
    const next = spawned.find((plan) => plan.id !== monday.id)!;
    expect(next.appointmentAt).toBeGreaterThan(threeWeeksLater);
    expect(next.appointmentAt - threeWeeksLater).toBeLessThan(7 * 86_400_000);
    expect(new Date(next.appointmentAt).getDay()).toBe(1);
  });

  test('the created occurrence survives a save and load', async () => {
    const monday = weeklyPlan([1, 3]);
    const afterMonday = monday.appointmentAt + 60_000;
    const spawned = spawnNextRecurringPlans(settlePastConfirmedPlans([monday], afterMonday), afterMonday);
    const storage = createMemoryStorage();
    await saveConfirmedPlans(storage, spawned);
    const loaded = await loadConfirmedPlans(storage);
    expect(loaded.map((plan) => plan.seriesId)).toEqual([monday.id, monday.id]);
  });
});

describe('per-plan alarm switch', () => {
  const morning = new Date('2026-08-08T09:00:00+09:00').getTime();

  test('off silences scheduling and forgets the notification ids; on restores it', () => {
    const plan = { ...planAt('치과', '14:00', morning), notificationIdentifier: 'n1', reminderNotificationIdentifier: 'r1' };
    expect(isPlanAlarmEnabled(plan)).toBe(true);

    const off = setPlanAlarmEnabled([plan], plan.id, false)[0];
    expect(off.alarmEnabled).toBe(false);
    expect(isPlanAlarmEnabled(off)).toBe(false);
    expect(off.notificationIdentifier).toBeUndefined();
    expect(off.reminderNotificationIdentifier).toBeUndefined();

    const on = setPlanAlarmEnabled([off], plan.id, true)[0];
    expect(isPlanAlarmEnabled(on)).toBe(true);
  });

  test('the switch survives a save and load', async () => {
    const off = setPlanAlarmEnabled([planAt('치과', '14:00', morning)], `${planAt('치과', '14:00', morning).id}`, false);
    const storage = createMemoryStorage();
    await saveConfirmedPlans(storage, off);
    const loaded = await loadConfirmedPlans(storage);
    expect(loaded[0].alarmEnabled).toBe(false);
  });
});
