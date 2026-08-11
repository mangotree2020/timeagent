export const EXECUTION_TASKS_STORAGE_KEY = '@time-agent/execution-tasks';
const EXECUTION_TASKS_VERSION = 1;

export type TaskActionStatus = 'current' | 'upcoming' | 'done';
export type TaskAction = {
  id: string;
  label: string;
  estimatedMinutes: number;
  status: TaskActionStatus;
};

export type ExecutionTask = {
  version: typeof EXECUTION_TASKS_VERSION;
  id: string;
  title: string;
  sourceText: string;
  actions: TaskAction[];
  status: 'ready' | 'active' | 'completed';
  focusStartedAt: number | null;
  focusEndsAt: number | null;
  createdAt: number;
  updatedAt: number;
};

type SuggestedTaskAction = { label: string; estimatedMinutes: number };
type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
};

export function createExecutionTask({ title, sourceText, actions, now = Date.now() }: {
  title: string;
  sourceText: string;
  actions: SuggestedTaskAction[];
  now?: number;
}): ExecutionTask {
  const safeTitle = title.trim().slice(0, 120) || '새 할 일';
  const candidates = actions
    .filter((action) => action.label.trim())
    .slice(0, 3)
    .map((action, index) => ({
      id: `action-${index + 1}`,
      label: action.label.trim().slice(0, 100),
      estimatedMinutes: Math.max(2, Math.min(5, Math.round(action.estimatedMinutes) || 5)),
      status: index === 0 ? 'current' as const : 'upcoming' as const,
    }));
  const normalizedActions: TaskAction[] = candidates.length ? candidates : [{
    id: 'action-1',
    label: `${safeTitle} 시작하기`,
    estimatedMinutes: 5,
    status: 'current',
  }];
  return {
    version: EXECUTION_TASKS_VERSION,
    id: `task-${now}-${safeTitle.replace(/\s+/g, '-').slice(0, 24)}`,
    title: safeTitle,
    sourceText: sourceText.trim().slice(0, 2_000),
    actions: normalizedActions,
    status: 'ready',
    focusStartedAt: null,
    focusEndsAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function startFiveMinuteFocus(task: ExecutionTask, now = Date.now()): ExecutionTask {
  if (task.status === 'completed') return task;
  return { ...task, status: 'active', focusStartedAt: now, focusEndsAt: now + 5 * 60_000, updatedAt: now };
}

export function getFocusRemainingSeconds(task: ExecutionTask, now = Date.now()) {
  if (task.status !== 'active' || task.focusEndsAt === null) return 0;
  return Math.max(0, Math.ceil((task.focusEndsAt - now) / 1_000));
}

export function advanceExecutionTask(task: ExecutionTask, now = Date.now()): ExecutionTask {
  const currentIndex = task.actions.findIndex((action) => action.status === 'current');
  if (currentIndex < 0) return { ...task, status: 'completed', focusStartedAt: null, focusEndsAt: null, updatedAt: now };
  const nextIndex = currentIndex + 1;
  const actions = task.actions.map((action, index) => {
    if (index === currentIndex) return { ...action, status: 'done' as const };
    if (index === nextIndex) return { ...action, status: 'current' as const };
    return action;
  });
  return {
    ...task,
    actions,
    status: nextIndex < actions.length ? 'ready' : 'completed',
    focusStartedAt: null,
    focusEndsAt: null,
    updatedAt: now,
  };
}

export async function loadExecutionTasks(storage: StorageLike): Promise<ExecutionTask[]> {
  const raw = await storage.getItem(EXECUTION_TASKS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== EXECUTION_TASKS_VERSION || !Array.isArray(value.tasks)) return [];
    return value.tasks.filter(isExecutionTask);
  } catch {
    return [];
  }
}

export async function saveExecutionTasks(storage: StorageLike, tasks: ExecutionTask[]) {
  await storage.setItem(EXECUTION_TASKS_STORAGE_KEY, JSON.stringify({ version: EXECUTION_TASKS_VERSION, tasks }));
}

function isExecutionTask(value: unknown): value is ExecutionTask {
  if (!isRecord(value)
    || value.version !== EXECUTION_TASKS_VERSION
    || typeof value.id !== 'string'
    || typeof value.title !== 'string' || !value.title.trim()
    || typeof value.sourceText !== 'string'
    || !Array.isArray(value.actions) || value.actions.length < 1 || value.actions.length > 3
    || (value.status !== 'ready' && value.status !== 'active' && value.status !== 'completed')
    || !finiteNumber(value.createdAt) || !finiteNumber(value.updatedAt)) return false;
  return value.actions.every((action, index) => isRecord(action)
    && typeof action.id === 'string'
    && typeof action.label === 'string' && action.label.trim().length > 0
    && finiteNumber(action.estimatedMinutes) && action.estimatedMinutes >= 2 && action.estimatedMinutes <= 5
    && (action.status === 'current' || action.status === 'upcoming' || action.status === 'done')
    && (index !== 0 || action.status !== 'upcoming'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
