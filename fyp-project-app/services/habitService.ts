import { api, parseJsonData } from './api';

export type HabitFrequency = 'Daily' | 'Weekly';
export type HabitCategory = 'Health' | 'Fitness' | 'Study' | 'Mindfulness' | 'Finance' | 'Other';

export const HABIT_CATEGORIES: HabitCategory[] = ['Health', 'Fitness', 'Study', 'Mindfulness', 'Finance', 'Other'];

export type HabitDto = {
  id: string;
  name: string;
  description: string;
  frequency: HabitFrequency;
  category: HabitCategory;
  targetPerWeek: number;
  /** Running streak (0 once it has lapsed). */
  streakCount: number;
  bestStreak: number;
  lastCompletedDate: string | null;
  reminderTime: string | null;
  isArchived: boolean;
  doneToday: boolean;
  weekCount: number;
  last7Days: { date: string; done: boolean }[];
  rate30d: number;
  createdAt: string | null;
};

export type HabitInput = {
  name?: string;
  description?: string;
  frequency?: HabitFrequency;
  category?: HabitCategory;
  target_per_week?: number;
  reminder_time?: string | null;
  is_archived?: boolean;
};

export type HabitStats = {
  days: { date: string; done: number; expected: number; rate: number | null }[];
  today: { done: number; total: number };
  rate_7d: number | null;
  best_streak: number;
  longest_running: number;
  active_streaks: number;
  total_checkins: number;
};

type HabitApiDto = {
  id?: number | string;
  name?: string;
  description?: string;
  frequency?: HabitFrequency;
  category?: HabitCategory;
  target_per_week?: number;
  streak_count?: number;
  current_streak?: number;
  best_streak?: number;
  last_completed_date?: string | null;
  reminder_time?: string | null;
  is_archived?: boolean;
  done_today?: boolean;
  week_count?: number;
  last_7_days?: { date: string; done: boolean }[];
  rate_30d?: number;
  created_at?: string;
};

function normalizeCategory(value: unknown): HabitCategory {
  return HABIT_CATEGORIES.includes(value as HabitCategory) ? (value as HabitCategory) : 'Other';
}

function normalizeHabit(habit: HabitApiDto): HabitDto {
  return {
    id: String(habit.id ?? Date.now()),
    name: habit.name ?? 'Untitled Habit',
    description: habit.description ?? '',
    frequency: habit.frequency === 'Weekly' ? 'Weekly' : 'Daily',
    category: normalizeCategory(habit.category),
    targetPerWeek: Number(habit.target_per_week ?? 1),
    streakCount: Number(habit.current_streak ?? habit.streak_count ?? 0),
    bestStreak: Number(habit.best_streak ?? 0),
    lastCompletedDate: habit.last_completed_date ?? null,
    reminderTime: habit.reminder_time ? habit.reminder_time.slice(0, 5) : null,
    isArchived: Boolean(habit.is_archived),
    doneToday: Boolean(habit.done_today),
    weekCount: Number(habit.week_count ?? 0),
    last7Days: Array.isArray(habit.last_7_days) ? habit.last_7_days : [],
    rate30d: Number(habit.rate_30d ?? 0),
    createdAt: habit.created_at ?? null,
  };
}

export async function getHabits(archived = false): Promise<HabitDto[]> {
  const response = await api.get('/habits/', { params: { archived: archived ? 1 : undefined } });
  const data = parseJsonData<unknown>(response.data);
  const raw = Array.isArray(data) ? data : [];
  return raw.map((item) => normalizeHabit(item as HabitApiDto));
}

export async function getHabit(id: string): Promise<HabitDto> {
  const response = await api.get(`/habits/${id}/`);
  return normalizeHabit(parseJsonData<HabitApiDto>(response.data));
}

export async function createHabit(payload: HabitInput & { name: string }): Promise<HabitDto> {
  const response = await api.post('/habits/', payload);
  return normalizeHabit(parseJsonData<HabitApiDto>(response.data));
}

export async function saveHabit(id: string, payload: HabitInput): Promise<HabitDto> {
  const response = await api.patch(`/habits/${id}/`, payload);
  return normalizeHabit(parseJsonData<HabitApiDto>(response.data));
}

/** Check in for today, or for `date` (YYYY-MM-DD, last 7 days). */
export async function completeHabit(id: string, date?: string): Promise<HabitDto> {
  const response = await api.post(`/habits/${id}/complete/`, date ? { date } : {});
  return normalizeHabit(parseJsonData<HabitApiDto>(response.data));
}

export async function uncompleteHabit(id: string, date?: string): Promise<HabitDto> {
  const response = await api.post(`/habits/${id}/uncomplete/`, date ? { date } : {});
  return normalizeHabit(parseJsonData<HabitApiDto>(response.data));
}

export async function deleteHabit(id: string): Promise<void> {
  await api.delete(`/habits/${id}/`);
}

export async function getHabitHistory(id: string): Promise<string[]> {
  const response = await api.get(`/habits/${id}/history/`);
  const data = parseJsonData<unknown>(response.data);
  const raw = Array.isArray(data) ? data : [];
  return raw.map((item: any) => item.completed_date).filter(Boolean);
}

export async function getHabitStats(days = 30): Promise<HabitStats> {
  const response = await api.get('/habits/stats/', { params: { days } });
  return parseJsonData<HabitStats>(response.data);
}

export async function updateHabit(id: string, name: string, frequency: string, reminderTime?: string): Promise<HabitDto> {
  return saveHabit(id, {
    name,
    frequency: frequency as HabitFrequency,
    ...(reminderTime !== undefined ? { reminder_time: reminderTime || null } : {}),
  });
}
