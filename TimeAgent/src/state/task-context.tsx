import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  advanceExecutionTask,
  createExecutionTask,
  ExecutionTask,
  loadExecutionTasks,
  saveExecutionTasks,
  startFiveMinuteFocus,
} from '@/lib/task-execution';

type TaskContextValue = {
  tasks: ExecutionTask[];
  currentTask: ExecutionTask | null;
  status: 'loading' | 'saving' | 'saved' | 'error';
  addTask: (input: { title: string; sourceText: string; actions: { label: string; estimatedMinutes: number }[] }) => Promise<ExecutionTask>;
  startTask: (id: string) => Promise<void>;
  completeCurrentAction: (id: string) => Promise<void>;
};

const TaskContext = createContext<TaskContextValue | null>(null);

export function TaskProvider({ children }: PropsWithChildren) {
  const [tasks, setTasks] = useState<ExecutionTask[]>([]);
  const [status, setStatus] = useState<TaskContextValue['status']>('loading');
  const tasksRef = useRef(tasks);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  const applyTasks = useCallback((next: ExecutionTask[]) => {
    tasksRef.current = next;
    setTasks(next);
  }, []);

  const persist = useCallback(async (next: ExecutionTask[]) => {
    applyTasks(next);
    setStatus('saving');
    writeQueue.current = writeQueue.current.catch(() => undefined).then(() => saveExecutionTasks(AsyncStorage, next));
    try {
      await writeQueue.current;
      setStatus('saved');
    } catch {
      setStatus('error');
      throw new Error('할 일을 저장하지 못했습니다.');
    }
  }, [applyTasks]);

  useEffect(() => {
    let active = true;
    loadExecutionTasks(AsyncStorage)
      .then((saved) => { if (active) applyTasks(saved); })
      .catch(() => { if (active) setStatus('error'); })
      .finally(() => { if (active) setStatus((current) => current === 'error' ? 'error' : 'saved'); });
    return () => { active = false; };
  }, [applyTasks]);

  const addTask = useCallback(async (input: { title: string; sourceText: string; actions: { label: string; estimatedMinutes: number }[] }) => {
    const task = createExecutionTask(input);
    await persist([task, ...tasksRef.current.filter((item) => item.status !== 'completed')]);
    return task;
  }, [persist]);

  const updateTask = useCallback(async (id: string, update: (task: ExecutionTask) => ExecutionTask) => {
    await persist(tasksRef.current.map((task) => task.id === id ? update(task) : task));
  }, [persist]);

  const startTask = useCallback((id: string) => updateTask(id, (task) => startFiveMinuteFocus(task)), [updateTask]);
  const completeCurrentAction = useCallback((id: string) => updateTask(id, (task) => advanceExecutionTask(task)), [updateTask]);
  const currentTask = useMemo(() => tasks.find((task) => task.status === 'active')
    ?? tasks.find((task) => task.status === 'ready')
    ?? null, [tasks]);

  const value = useMemo(() => ({ tasks, currentTask, status, addTask, startTask, completeCurrentAction }), [addTask, completeCurrentAction, currentTask, startTask, status, tasks]);
  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

export function useTaskExecution() {
  const value = useContext(TaskContext);
  if (!value) throw new Error('useTaskExecution must be used inside TaskProvider');
  return value;
}
