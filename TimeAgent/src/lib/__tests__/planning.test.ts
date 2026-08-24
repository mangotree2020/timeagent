import { createDefaultScheduleDraft } from '../schedule-draft';
import { createSchedulePlan, estimateTravelMinutes, isPlannableSchedule, targetPrepStartClock } from '../planning';

describe('schedule planning engine', () => {
  test('keeps walking as a first-class transport mode', () => {
    const draft = { ...createDefaultScheduleDraft(), transport: '도보' as const };
    const plan = createSchedulePlan(draft);
    expect(plan.travelMinutes).toBe(35);
    expect(plan.timeline.find((step) => step.id === 'depart')?.title).toBe('걸어서 출발');
  });

  test('works backward from the appointment using preparation, travel, and safety buffer', () => {
    const draft = {
      ...createDefaultScheduleDraft(),
      appointmentTime: '14:00',
      transport: '대중교통' as const,
      priority: 'on-time' as const,
    };

    const plan = createSchedulePlan(draft);

    expect(plan.preparationMinutes).toBe(43);
    expect(plan.travelMinutes).toBe(26);
    expect(plan.bufferMinutes).toBe(10);
    expect(plan.prepStart).toBe('12:41');
    expect(plan.departure).toBe('13:24');
    expect(plan.arrival).toBe('13:50');
    expect(plan.status).toEqual({
      kind: 'ready',
      label: '10분 여유',
      tone: 'success',
      minutes: 10,
    });
  });

  test('creates routine, departure, and arrival steps from the entered values', () => {
    const draft = {
      ...createDefaultScheduleDraft(),
      appointmentTime: '14:00',
      transport: '대중교통' as const,
    };

    const plan = createSchedulePlan(draft);

    expect(plan.timeline.map(({ time, title, duration }) => ({ time, title, duration }))).toEqual([
      { time: '12:41', title: '샤워', duration: 18 },
      { time: '12:59', title: '화장', duration: 12 },
      { time: '13:11', title: '옷 입기', duration: 8 },
      { time: '13:19', title: '짐 챙기기', duration: 5 },
      { time: '13:24', title: '대중교통으로 출발', duration: 26 },
      { time: '13:50', title: '도착 예정', duration: 0 },
    ]);
  });

  test('handles a plan that crosses midnight', () => {
    const draft = {
      ...createDefaultScheduleDraft(),
      appointmentTime: '00:30',
      routines: [{ id: 'ready', icon: 'ready', label: '준비', minutes: 20 }],
    };

    const plan = createSchedulePlan(draft, { now: '23:00', travelMinutes: 15 });

    expect(plan.prepStart).toBe('23:45');
    expect(plan.departure).toBe('00:05');
    expect(plan.arrival).toBe('00:20');
    expect(plan.status.kind).toBe('ready');
  });

  test('asks the user to start now when the buffer shrinks but arrival is still possible', () => {
    const draft = {
      ...createDefaultScheduleDraft(),
      appointmentTime: '14:00',
      transport: '대중교통' as const,
    };

    const plan = createSchedulePlan(draft, { now: '12:50' });

    expect(plan.status).toEqual({
      kind: 'start-now',
      label: '준비 시작이 9분 늦었어요 · 지금 시작하면 1분 여유',
      tone: 'warning',
      minutes: 1,
    });
    expect(plan.prepStart).toBe('12:50');
    expect(plan.departure).toBe('13:33');
    expect(plan.arrival).toBe('13:59');
  });

  test('shows the expected delay when on-time arrival is no longer possible', () => {
    const draft = {
      ...createDefaultScheduleDraft(),
      appointmentTime: '14:00',
      transport: '대중교통' as const,
    };

    const plan = createSchedulePlan(draft, { now: '13:10' });

    expect(plan.status).toEqual({
      kind: 'impossible',
      label: '19분 지각 예상',
      tone: 'danger',
      minutes: -19,
    });
    expect(plan.prepStart).toBe('13:10');
    expect(plan.departure).toBe('13:53');
    expect(plan.arrival).toBe('14:19');
  });
});

describe('preparation durations someone set themselves', () => {
  const draft = (routines: { id: string; minutes: number; minutesEditedByUser?: boolean }[]) => ({
    ...createDefaultScheduleDraft(),
    appointmentTime: '18:00',
    transport: '대중교통' as const,
    routines: routines.map((routine) => ({ icon: 'ready', label: routine.id, ...routine })),
  });
  const learned = { routineMinutes: { shower: { minutes: 3, samples: 4 } } };

  it('uses the learned average only until someone sets the duration', () => {
    const untouched = createSchedulePlan(draft([{ id: 'shower', minutes: 20 }]), { personalization: learned });
    expect(untouched.preparationMinutes).toBe(3);

    // The reported bug: editing preparation time changed nothing because the average won.
    const edited = createSchedulePlan(
      draft([{ id: 'shower', minutes: 20, minutesEditedByUser: true }]),
      { personalization: learned },
    );
    expect(edited.preparationMinutes).toBe(20);
    expect(edited.timeline[0].duration).toBe(20);
  });

  it('does not claim an adjustment it did not make', () => {
    const untouched = createSchedulePlan(draft([{ id: 'shower', minutes: 20 }]), { personalization: learned });
    expect(untouched.personalizationAdjustments.map((item) => item.id)).toEqual(['shower']);

    const edited = createSchedulePlan(
      draft([{ id: 'shower', minutes: 20, minutesEditedByUser: true }]),
      { personalization: learned },
    );
    expect(edited.personalizationAdjustments).toEqual([]);
  });

  it('moves the time preparation should have started as the list changes', () => {
    const short = targetPrepStartClock(draft([{ id: 'shower', minutes: 20, minutesEditedByUser: true }]), { now: '17:50' });
    const long = targetPrepStartClock(draft([{ id: 'shower', minutes: 40, minutesEditedByUser: true }]), { now: '17:50' });
    expect(short).toBe('17:04');
    expect(long).toBe('16:44');
  });
  it('plans a route label that is not a stored transport mode without producing NaN', () => {
    // Plan B offers labels like "다음 버스"; before they were mapped back to a mode, every clock
    // computed from the schedule came out as NaN:NaN.
    const unknown = { ...createDefaultScheduleDraft(), transport: '다음 버스' as never };
    const plan = createSchedulePlan(unknown);
    expect(Number.isFinite(plan.travelMinutes)).toBe(true);
    expect(plan.prepStart).toMatch(/^\d{2}:\d{2}$/);
    expect(plan.timeline.every((step) => /^\d{2}:\d{2}$/.test(step.time))).toBe(true);
    expect(targetPrepStartClock(unknown)).toMatch(/^\d{2}:\d{2}$/);
  });

  it('reports a schedule without a usable appointment time as unplannable', () => {
    expect(isPlannableSchedule(createDefaultScheduleDraft())).toBe(true);
    expect(isPlannableSchedule({ ...createDefaultScheduleDraft(), appointmentTime: '' })).toBe(false);
    expect(isPlannableSchedule({ ...createDefaultScheduleDraft(), appointmentTime: '오후 3시' })).toBe(false);
    expect(isPlannableSchedule({ ...createDefaultScheduleDraft(), appointmentTime: '25:00' })).toBe(false);
    expect(isPlannableSchedule({ ...createDefaultScheduleDraft(), appointmentTime: '9:05' })).toBe(true);
  });
});

describe('how long the journey is given', () => {
  it('times the trip from how far the destination actually is', () => {
    // The old table said 지하철 was 24 minutes to anywhere. Two stops away and a city away are not
    // the same trip, and this number is what the departure time is counted back from.
    const near = { ...createDefaultScheduleDraft(), transport: '대중교통' as const, destinationDistanceMeters: 2_000 };
    const far = { ...near, destinationDistanceMeters: 30_000 };

    expect(createSchedulePlan(near).travelMinutes).toBeLessThan(createSchedulePlan(far).travelMinutes);
    expect(createSchedulePlan(near).travelMinutes).toBe(estimateTravelMinutes('대중교통', 2_000));
  });

  it('answers the same distance differently for each way of covering it', () => {
    const walking = estimateTravelMinutes('도보', 5_000);
    const bus = estimateTravelMinutes('대중교통', 5_000);
    const taxi = estimateTravelMinutes('승용차(택시)', 5_000);

    expect(walking).toBeGreaterThan(bus);
    expect(bus).toBeGreaterThan(taxi);
  });

  it('counts what a mode costs before it moves, so a short trip is not free', () => {
    // Waiting for a bus is most of a two-stop journey, and a plan that ignores it leaves too late.
    expect(estimateTravelMinutes('대중교통', 300)).toBeGreaterThanOrEqual(10);
    expect(estimateTravelMinutes('도보', 300)).toBeGreaterThanOrEqual(1);
  });

  it('falls back to the per-mode default when nothing has been located', () => {
    const unlocated = { ...createDefaultScheduleDraft(), transport: '대중교통' as const, destinationDistanceMeters: null };

    expect(createSchedulePlan(unlocated).travelMinutes).toBe(26);
  });
});
