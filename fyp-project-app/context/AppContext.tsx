import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  completeHabit as completeHabitRequest,
  createHabit as createHabitRequest,
  deleteHabit as deleteHabitRequest,
  getHabits as getHabitsRequest,
  saveHabit as saveHabitRequest,
  uncompleteHabit as uncompleteHabitRequest,
  updateHabit as updateHabitRequest,
  type HabitDto,
  type HabitFrequency,
  type HabitInput,
} from '../services/habitService';
import { toApiErrorMessage } from '../services/api';
import {
  createTask as createTaskRequest,
  deleteTask as deleteTaskRequest,
  getTask as getTaskRequest,
  getTaskReport as getTaskReportRequest,
  getTasks as getTasksRequest,
  logTaskTime,
  sendTaskReminderEmail,
  toggleTask as toggleTaskRequest,
  updateTask as updateTaskRequest,
  type Task,
  type TaskFilters,
  type TaskInput,
  type TaskReport,
} from '../services/taskService';
import { syncHabitReminders, syncTaskReminders } from '../services/reminderService';

export type { Task, TaskInput, TaskFilters, TaskReport };

export type Habit = HabitDto;

type WeatherSnapshot = {
  city: string;
  temperatureC: number;
  condition: string;
  updatedAt: string;
};

type AppContextValue = {
  tasks: Task[];
  tasksLoading: boolean;
  tasksError: string | null;
  habits: Habit[];
  habitsLoading: boolean;
  habitsError: string | null;
  weather: WeatherSnapshot | null;
  fetchTasks: (force?: boolean) => Promise<void>;
  fetchHabits: (force?: boolean) => Promise<void>;
  preloadDashboardData: () => Promise<void>;
  addTask: (input: TaskInput) => Promise<Task | null>;
  addHabit: (input: HabitInput & { name: string }) => Promise<Habit | null>;
  saveHabit: (id: string, input: HabitInput) => Promise<Habit | null>;
  /** Check a habit in (or undo it) for today or one of the last 7 days. */
  setHabitDone: (id: string, done: boolean, date?: string) => Promise<void>;
  replaceHabit: (habit: Habit) => void;
  updateHabit: (id: string, name: string, frequency: HabitFrequency, reminderTime?: string) => Promise<boolean>;
  deleteHabit: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<boolean>;
  toggleTask: (id: string) => Promise<void>;
  /** Toggles today's check-in. */
  completeHabit: (id: string) => Promise<void>;
  setWeather: (value: WeatherSnapshot) => void;
  getTask: (id: string) => Promise<Task>;
  updateTask: (id: string, data: TaskInput) => Promise<Task>;
  /** Replaces a task in the shared list after a screen changed it directly (e.g. attachments). */
  replaceTask: (task: Task) => void;
  logTime: (taskId: string, seconds: number) => Promise<Task>;
  sendReminderEmail: (taskId: string) => Promise<string>;
  getTaskReport: (period: 'daily' | 'weekly' | 'monthly') => Promise<TaskReport>;
  searchTasks: (query: string, filters?: TaskFilters) => Promise<Task[]>;
  getTasksByPriority: (priority: string) => Promise<Task[]>;
  getTasksByStatus: (status: string) => Promise<Task[]>;
  getTasksByCategory: (category: string) => Promise<Task[]>;
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitsLoading, setHabitsLoading] = useState(false);
  const [habitsError, setHabitsError] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const tasksRef = useRef<Task[]>([]);
  const habitsRef = useRef<Habit[]>([]);
  const tasksLastFetchedAtRef = useRef<number>(0);
  const habitsLastFetchedAtRef = useRef<number>(0);
  const tasksFetchInFlightRef = useRef<Promise<void> | null>(null);
  const habitsFetchInFlightRef = useRef<Promise<void> | null>(null);

  const fetchTasks = useCallback(async (force = false) => {
    if (!force && tasksRef.current.length > 0 && Date.now() - tasksLastFetchedAtRef.current < 15000) {
      return;
    }

    if (tasksFetchInFlightRef.current) {
      return tasksFetchInFlightRef.current;
    }

    const runner = (async () => {
      setTasksLoading(true);
      setTasksError(null);

      try {
        const remoteTasks = await getTasksRequest();
        setTasks(remoteTasks);
        tasksRef.current = remoteTasks;
        tasksLastFetchedAtRef.current = Date.now();
        syncTaskReminders(remoteTasks);
      } catch (error) {
        console.warn('Failed to fetch tasks from backend', error);
        setTasksError(toApiErrorMessage(error, 'Could not load tasks from server.'));
      } finally {
        setTasksLoading(false);
        tasksFetchInFlightRef.current = null;
      }
    })();

    tasksFetchInFlightRef.current = runner;
    return runner;
  }, []);

  const fetchHabits = useCallback(async (force = false) => {
    if (!force && habitsRef.current.length > 0 && Date.now() - habitsLastFetchedAtRef.current < 15000) {
      return;
    }

    if (habitsFetchInFlightRef.current) {
      return habitsFetchInFlightRef.current;
    }

    const runner = (async () => {
      setHabitsLoading(true);
      setHabitsError(null);

      try {
        const remoteHabits = await getHabitsRequest();
        setHabits(remoteHabits);
        habitsRef.current = remoteHabits;
        habitsLastFetchedAtRef.current = Date.now();
        syncHabitReminders(remoteHabits);
      } catch (error) {
        console.warn('Failed to fetch habits from backend', error);
        setHabitsError(toApiErrorMessage(error, 'Could not load habits from server.'));
      } finally {
        setHabitsLoading(false);
        habitsFetchInFlightRef.current = null;
      }
    })();

    habitsFetchInFlightRef.current = runner;
    return runner;
  }, []);

  const preloadDashboardData = useCallback(async () => {
    await Promise.all([fetchTasks(true), fetchHabits(true)]);
  }, [fetchHabits, fetchTasks]);

  // Every task change goes through here so the shared list, the ref and the reminders stay in sync.
  const commitTasks = useCallback((update: (prev: Task[]) => Task[]) => {
    const next = update(tasksRef.current);
    tasksRef.current = next;
    setTasks(next);
    syncTaskReminders(next);
  }, []);

  const replaceTask = useCallback(
    (task: Task) => commitTasks((prev) => prev.map((t) => (t.id === task.id ? task : t))),
    [commitTasks]
  );

  const addTask = useCallback(async (input: TaskInput) => {
    const clean = input.title?.trim();
    if (!clean) {
      setTasksError('Title is required.');
      return null;
    }

    setTasksError(null);
    try {
      const created = await createTaskRequest({ ...input, title: clean });
      commitTasks((prev) => [created, ...prev]);
      return created;
    } catch (error) {
      console.warn('Failed to create task in backend', error);
      setTasksError(toApiErrorMessage(error, 'Could not create task. Please try again.'));
      return null;
    }
  }, [commitTasks]);

  const commitHabits = useCallback((update: (prev: Habit[]) => Habit[]) => {
    const next = update(habitsRef.current);
    habitsRef.current = next;
    setHabits(next);
    syncHabitReminders(next);
  }, []);

  const replaceHabit = useCallback(
    (habit: Habit) =>
      commitHabits((prev) =>
        habit.isArchived ? prev.filter((h) => h.id !== habit.id) : prev.some((h) => h.id === habit.id) ? prev.map((h) => (h.id === habit.id ? habit : h)) : [habit, ...prev]
      ),
    [commitHabits]
  );

  const addHabit = useCallback(async (input: HabitInput & { name: string }) => {
    if (!input.name.trim()) {
      setHabitsError('Habit name is required.');
      return null;
    }
    setHabitsError(null);
    try {
      const created = await createHabitRequest({ ...input, name: input.name.trim() });
      commitHabits((prev) => [created, ...prev]);
      return created;
    } catch (error) {
      console.warn('Failed to create habit in backend', error);
      setHabitsError(toApiErrorMessage(error, 'Could not create habit. Please try again.'));
      return null;
    }
  }, [commitHabits]);

  const saveHabit = useCallback(async (id: string, input: HabitInput) => {
    setHabitsError(null);
    try {
      const updated = await saveHabitRequest(id, input);
      replaceHabit(updated);
      return updated;
    } catch (error) {
      setHabitsError(toApiErrorMessage(error, 'Could not save the habit.'));
      return null;
    }
  }, [replaceHabit]);

  // Optimistic for today's check-in; the server's answer (streaks, counts) replaces it.
  const setHabitDone = useCallback(async (id: string, done: boolean, date?: string) => {
    const before = habitsRef.current.find((h) => h.id === id);
    if (before && !date) replaceHabit({ ...before, doneToday: done });
    try {
      replaceHabit(done ? await completeHabitRequest(id, date) : await uncompleteHabitRequest(id, date));
    } catch (error) {
      if (before) replaceHabit(before);
      setHabitsError(toApiErrorMessage(error, 'Could not update the habit.'));
    }
  }, [replaceHabit]);

  const deleteTask = useCallback(async (id: string) => {
    setTasksError(null);
    try {
      await deleteTaskRequest(id);
      commitTasks((prev) => prev.filter((task) => task.id !== id));
      return true;
    } catch (error) {
      console.warn('Failed to delete task in backend', error);
      setTasksError(toApiErrorMessage(error, 'Could not delete task. Please try again.'));
      return false;
    }
  }, [commitTasks]);

  // Optimistic: the checkbox flips at once and rolls back if the server rejects it.
  const toggleTask = useCallback(async (id: string) => {
    const before = tasksRef.current.find((t) => t.id === id);
    if (!before) return;
    const flipped: Task['status'] = before.done ? 'pending' : 'done';
    replaceTask({ ...before, status: flipped, done: flipped === 'done' });
    try {
      replaceTask(await toggleTaskRequest(id));
    } catch (error) {
      replaceTask(before);
      setTasksError(toApiErrorMessage(error, 'Could not update the task.'));
    }
  }, [replaceTask]);

  const completeHabit = useCallback(async (id: string) => {
    const habit = habitsRef.current.find((h) => h.id === id);
    await setHabitDone(id, !habit?.doneToday);
  }, [setHabitDone]);

const updateHabit = useCallback(async (id: string, name: string, frequency: HabitFrequency, reminderTime?: string) => {
    setHabitsLoading(true);
    setHabitsError(null);

    try {
      const updated = await updateHabitRequest(id, name, frequency, reminderTime);
      replaceHabit(updated);
      return true;
    } catch (error) {
      console.warn('Failed to update habit in backend', error);
      setHabitsError(toApiErrorMessage(error, 'Could not update habit. Please try again.'));
      return false;
    } finally {
      setHabitsLoading(false);
    }
  }, [replaceHabit]);

  const deleteHabit = useCallback(async (id: string) => {
    setHabitsLoading(true);
    setHabitsError(null);

    try {
      await deleteHabitRequest(id);
      commitHabits((prev) => prev.filter((habit) => habit.id !== id));
    } catch (error) {
      console.warn('Failed to delete habit in backend', error);
      setHabitsError(toApiErrorMessage(error, 'Could not delete habit. Please try again.'));
    } finally {
      setHabitsLoading(false);
    }
  }, [commitHabits]);

  const getTask = useCallback(async (id: string) => {
    const task = await getTaskRequest(id);
    if (tasksRef.current.some((t) => t.id === id)) {
      replaceTask(task);
    }
    return task;
  }, [replaceTask]);

  const updateTask = useCallback(async (id: string, data: TaskInput) => {
    const updated = await updateTaskRequest(id, data);
    replaceTask(updated);
    return updated;
  }, [replaceTask]);

  const logTime = useCallback(async (taskId: string, seconds: number) => {
    const updated = await logTaskTime(taskId, seconds);
    replaceTask(updated);
    return updated;
  }, [replaceTask]);

  const sendReminderEmail = useCallback((taskId: string) => sendTaskReminderEmail(taskId), []);

  const getTaskReport = useCallback((period: 'daily' | 'weekly' | 'monthly') => getTaskReportRequest(period), []);

  const searchTasks = useCallback(
    (query: string, filters: TaskFilters = {}) => getTasksRequest({ ...filters, search: query }),
    []
  );

  const getTasksByPriority = useCallback(
    (priority: string) => getTasksRequest({ priority: priority as Task['priority'] }),
    []
  );

  const getTasksByStatus = useCallback(
    (status: string) => getTasksRequest({ status: status as Task['status'] }),
    []
  );

  const getTasksByCategory = useCallback((category: string) => getTasksRequest({ category }), []);

  const value = useMemo(
    () => ({
      tasks,
      tasksLoading,
      tasksError,
      habits,
      habitsLoading,
      habitsError,
      weather,
      fetchTasks,
      fetchHabits,
      preloadDashboardData,
      addTask,
      addHabit,
      saveHabit,
      setHabitDone,
      replaceHabit,
      updateHabit,
      deleteHabit,
      deleteTask,
      toggleTask,
      completeHabit,
      setWeather,
      replaceTask,
      getTask,
      updateTask,
      logTime,
      sendReminderEmail,
      getTaskReport,
      searchTasks,
      getTasksByPriority,
      getTasksByStatus,
      getTasksByCategory,
    }),
    [
      tasks,
      tasksLoading,
      tasksError,
      habits,
      habitsLoading,
      habitsError,
      weather,
      fetchTasks,
      fetchHabits,
      preloadDashboardData,
      addTask,
      addHabit,
      saveHabit,
      setHabitDone,
      replaceHabit,
      updateHabit,
      deleteHabit,
      deleteTask,
      toggleTask,
      completeHabit,
      replaceTask,
      getTask,
      updateTask,
      logTime,
      sendReminderEmail,
      getTaskReport,
      searchTasks,
      getTasksByPriority,
      getTasksByStatus,
      getTasksByCategory,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used inside AppProvider');
  }

  return context;
}
