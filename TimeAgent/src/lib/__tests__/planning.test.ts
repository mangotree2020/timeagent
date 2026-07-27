import { createDefaultScheduleDraft } from '../schedule-draft';
import { createSchedulePlan } from '../planning';

describe('schedule planning engine', () => {
  test('works backward from the appointment using preparation, travel, and safety buffer', () => {
    const draft = {
      ...createDefaultScheduleDraft(),
      appointmentTime: '14:00',
      transport: '지하철' as const,
      priority: 'on-time' as const,
    };

    const plan = createSchedulePlan(draft);

    expect(plan.preparationMinutes).toBe(43);
    expect(plan.travelMinutes).toBe(24);
    expect(plan.bufferMinutes).toBe(10);
    expect(plan.prepStart).toBe('12:43');
    expect(plan.departure).toBe('13:26');
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
      transport: '지하철' as const,
    };

    const plan = createSchedulePlan(draft);

    expect(plan.timeline.map(({ time, title, duration }) => ({ time, title, duration }))).toEqual([
      { time: '12:43', title: '샤워', duration: 18 },
      { time: '13:01', title: '화장', duration: 12 },
      { time: '13:13', title: '옷 입기', duration: 8 },
      { time: '13:21', title: '짐 챙기기', duration: 5 },
      { time: '13:26', title: '지하철로 출발', duration: 24 },
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
      transport: '지하철' as const,
    };

    const plan = createSchedulePlan(draft, { now: '12:50' });

    expect(plan.status).toEqual({
      kind: 'start-now',
      label: '준비 시작이 7분 늦었어요 · 지금 시작하면 3분 여유',
      tone: 'warning',
      minutes: 3,
    });
    expect(plan.prepStart).toBe('12:50');
    expect(plan.departure).toBe('13:33');
    expect(plan.arrival).toBe('13:57');
  });

  test('shows the expected delay when on-time arrival is no longer possible', () => {
    const draft = {
      ...createDefaultScheduleDraft(),
      appointmentTime: '14:00',
      transport: '지하철' as const,
    };

    const plan = createSchedulePlan(draft, { now: '13:10' });

    expect(plan.status).toEqual({
      kind: 'impossible',
      label: '17분 지각 예상',
      tone: 'danger',
      minutes: -17,
    });
    expect(plan.prepStart).toBe('13:10');
    expect(plan.departure).toBe('13:53');
    expect(plan.arrival).toBe('14:17');
  });
});
