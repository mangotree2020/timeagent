import {
  advanceExecutionTask,
  createExecutionTask,
  getFocusRemainingSeconds,
  loadExecutionTasks,
  startFiveMinuteFocus,
} from '../task-execution';

const memoryStorage = () => {
  let value: string | null = null;
  return {
    getItem: jest.fn(async () => value),
    setItem: jest.fn(async (_key: string, next: string) => { value = next; }),
    removeItem: jest.fn(async () => { value = null; }),
  };
};

describe('task execution', () => {
  test('큰 할 일을 최대 3개의 짧은 다음 행동으로 만든다', () => {
    const task = createExecutionTask({
      title: '보고서 작성',
      sourceText: '이번 주 보고서 작성해야 해',
      actions: [
        { label: '문서 열기', estimatedMinutes: 2 },
        { label: '제목 쓰기', estimatedMinutes: 3 },
        { label: '자료 하나 붙이기', estimatedMinutes: 5 },
        { label: '전체 교정하기', estimatedMinutes: 30 },
      ],
      now: 1_000,
    });

    expect(task.actions).toHaveLength(3);
    expect(task.actions.map((action) => action.label)).toEqual(['문서 열기', '제목 쓰기', '자료 하나 붙이기']);
    expect(task.actions.every((action) => action.estimatedMinutes >= 2 && action.estimatedMinutes <= 5)).toBe(true);
    expect(task.status).toBe('ready');
  });

  test('행동 제안이 없으면 제목을 5분 첫 행동으로 유지한다', () => {
    const task = createExecutionTask({ title: '책상 정리', sourceText: '책상 정리해야 해', actions: [], now: 1_000 });
    expect(task.actions).toEqual([
      expect.objectContaining({ label: '책상 정리 시작하기', estimatedMinutes: 5, status: 'current' }),
    ]);
  });

  test('5분 시작은 종료 시각을 고정하고 남은 시간을 0 아래로 내리지 않는다', () => {
    const task = createExecutionTask({ title: '보고서', sourceText: '보고서', actions: [{ label: '문서 열기', estimatedMinutes: 2 }], now: 1_000 });
    const started = startFiveMinuteFocus(task, 10_000);
    expect(started.status).toBe('active');
    expect(started.focusEndsAt).toBe(310_000);
    expect(getFocusRemainingSeconds(started, 70_000)).toBe(240);
    expect(getFocusRemainingSeconds(started, 400_000)).toBe(0);
  });

  test('현재 행동 완료 후 다음 행동을 지금으로 올리고 마지막에는 완료한다', () => {
    const task = createExecutionTask({
      title: '보고서', sourceText: '보고서', now: 1_000,
      actions: [{ label: '문서 열기', estimatedMinutes: 2 }, { label: '제목 쓰기', estimatedMinutes: 3 }],
    });
    const second = advanceExecutionTask(startFiveMinuteFocus(task, 10_000), 20_000);
    expect(second.status).toBe('ready');
    expect(second.actions.map((action) => action.status)).toEqual(['done', 'current']);
    const completed = advanceExecutionTask(startFiveMinuteFocus(second, 30_000), 40_000);
    expect(completed.status).toBe('completed');
    expect(completed.actions.every((action) => action.status === 'done')).toBe(true);
  });

  test('손상된 저장값은 복원하지 않는다', async () => {
    const storage = memoryStorage();
    await storage.setItem('ignored', JSON.stringify({ version: 1, tasks: [{ title: '' }] }));
    await expect(loadExecutionTasks(storage)).resolves.toEqual([]);
  });
});
