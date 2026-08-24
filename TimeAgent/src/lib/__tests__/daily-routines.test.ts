import { confirmSchedulePlan } from '../confirmed-plans';
import {
  applyOncePerDayRule,
  coveredOncePerDayRoutineIds,
  describeOncePerDaySkip,
  dropOncePerDayRoutines,
  findSameDayPlans,
  restoreOncePerDayRoutine,
} from '../daily-routines';
import { createSchedulePlan } from '../planning';
import { createDefaultScheduleDraft, RoutineDraft } from '../schedule-draft';

const now = new Date(2026, 7, 23, 8, 0).getTime(); // 2026-08-23 (일) 08:00
const routines: RoutineDraft[] = [
  { id: 'shower', icon: 'shower', label: '샤워', minutes: 18 },
  { id: 'makeup', icon: 'makeup', label: '화장', minutes: 12 },
  { id: 'dress', icon: 'dress', label: '옷 입기', minutes: 8 },
  { id: 'bag', icon: 'bag', label: '짐 챙기기', minutes: 5 },
];

function draftAt(date: string, appointmentTime: string, title = '약속', steps = routines) {
  return { ...createDefaultScheduleDraft('female', now), title, date, appointmentTime, routines: steps.map((routine) => ({ ...routine })) };
}

function confirmed(date: string, appointmentTime: string, title: string, steps = routines) {
  const schedule = draftAt(date, appointmentTime, title, steps);
  return confirmSchedulePlan({ schedule, plan: createSchedulePlan(schedule, { travelMinutes: 20 }), now });
}

describe('once-a-day preparation', () => {
  test('finds the other appointments of the same day, earliest first, and not another day', () => {
    const morning = confirmed('2026-08-23 (일)', '10:00', '치과');
    const evening = confirmed('2026-08-23 (일)', '19:00', '저녁');
    const tomorrow = confirmed('2026-08-24 (월)', '09:00', '회의');
    expect(findSameDayPlans(draftAt('2026-08-23 (일)', '14:00'), [evening, tomorrow, morning], { now })).toEqual([morning, evening]);
    expect(findSameDayPlans(draftAt('2026-08-24 (월)', '14:00'), [morning, evening], { now })).toEqual([]);
  });

  test('an appointment being edited does not count as its own other appointment', () => {
    const morning = confirmed('2026-08-23 (일)', '10:00', '치과');
    expect(findSameDayPlans(draftAt('2026-08-23 (일)', '14:00'), [morning], { now, excludeId: morning.id })).toEqual([]);
  });

  test('takes out only the once-a-day steps another plan already carries, remembering their place', () => {
    const result = dropOncePerDayRoutines(routines, new Set(['shower', 'makeup']));
    expect(result.routines.map((routine) => routine.id)).toEqual(['dress', 'bag']);
    expect(result.removed.map((entry) => [entry.routine.id, entry.index])).toEqual([['shower', 0], ['makeup', 0]]);

    const showerOnly = dropOncePerDayRoutines(routines, new Set(['shower']));
    expect(showerOnly.routines.map((routine) => routine.id)).toEqual(['makeup', 'dress', 'bag']);
    expect(dropOncePerDayRoutines(routines, new Set()).routines.map((routine) => routine.id)).toEqual(['shower', 'makeup', 'dress', 'bag']);
  });

  test('always keeps at least one step and leaves a step the person put back', () => {
    const result = dropOncePerDayRoutines([routines[0], routines[1]], new Set(['shower', 'makeup']));
    expect(result.routines.map((routine) => routine.id)).toEqual(['makeup']);
    expect(dropOncePerDayRoutines([{ ...routines[0], keepOnSameDay: true }, routines[2]], new Set(['shower'])).routines.map((routine) => routine.id)).toEqual(['shower', 'dress']);
  });

  test('collects the once-a-day steps the day already has', () => {
    const morning = confirmed('2026-08-23 (일)', '10:00', '치과', [routines[0], routines[2]]);
    expect([...coveredOncePerDayRoutineIds([morning])]).toEqual(['shower']);
  });

  test('applies whenever another appointment that day already carries the step, whatever the order', () => {
    const noon = confirmed('2026-08-23 (일)', '12:57', '볼링');
    const later = applyOncePerDayRule(draftAt('2026-08-23 (일)', '14:45'), [noon], { now });
    expect(later.schedule.routines.map((routine) => routine.id)).toEqual(['dress', 'bag']);
    expect(later.skip?.firstPlan).toBe(noon);
    expect(describeOncePerDaySkip(later.skip!)).toBe('오늘 12:57 볼링 준비에 샤워·화장이 이미 있어 이번 계획에서는 뺐어요.');

    // An appointment added before the existing one still leaves the shower with the existing one.
    const earlier = applyOncePerDayRule(draftAt('2026-08-23 (일)', '09:00'), [noon], { now });
    expect(earlier.schedule.routines.map((routine) => routine.id)).toEqual(['dress', 'bag']);
  });

  test('keeps the steps when no appointment that day carries them, or on another day', () => {
    const noon = confirmed('2026-08-23 (일)', '12:57', '볼링', [routines[2], routines[3]]);
    const same = draftAt('2026-08-23 (일)', '14:45');
    expect(applyOncePerDayRule(same, [noon], { now }).schedule).toBe(same);
    const showerAtNoon = confirmed('2026-08-23 (일)', '12:57', '볼링');
    const tomorrow = draftAt('2026-08-24 (월)', '14:45');
    expect(applyOncePerDayRule(tomorrow, [showerAtNoon], { now }).schedule).toBe(tomorrow);
  });

  test('a third appointment still sees the shower the first one carries', () => {
    const noon = confirmed('2026-08-23 (일)', '12:57', '볼링');
    const second = confirmed('2026-08-23 (일)', '15:00', '카페', [routines[2], routines[3]]);
    const third = applyOncePerDayRule(draftAt('2026-08-23 (일)', '19:00'), [second, noon], { now });
    expect(third.schedule.routines.map((routine) => routine.id)).toEqual(['dress', 'bag']);
    expect(third.skip?.firstPlan).toBe(noon);
  });

  test('a removed step goes back where it was, marked to stay, and only once', () => {
    const noon = confirmed('2026-08-23 (일)', '12:57', '볼링');
    const later = applyOncePerDayRule(draftAt('2026-08-23 (일)', '14:45'), [noon], { now });
    const restored = restoreOncePerDayRoutine(later.schedule.routines, later.skip!.removed[1]);
    expect(restored.map((routine) => routine.id)).toEqual(['makeup', 'dress', 'bag']);
    expect(restored[0].keepOnSameDay).toBe(true);
    expect(restoreOncePerDayRoutine(restored, later.skip!.removed[1]).map((routine) => routine.id)).toEqual(['makeup', 'dress', 'bag']);
    // Re-applying the rule at plan time leaves the restored step alone.
    const reapplied = applyOncePerDayRule({ ...later.schedule, routines: restored }, [noon], { now });
    expect(reapplied.schedule.routines.map((routine) => routine.id)).toEqual(['makeup', 'dress', 'bag']);
  });
});
