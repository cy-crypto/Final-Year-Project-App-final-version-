import { api, parseJsonData } from './api';

export type HabitFrequency = 'Daily' | 'Weekly';
export type HabitCategory = 'Health' | 'Fitness' | 'Study' | 'Mindfulness' | 'Finance' | 'Other';

export type HabitDto = {
  id: string;
  name: string;
  frequency: HabitFrequency;
  category: HabitCategory;
  streakCount: number;
  bestStreak: number;
  lastCompletedDate: string | null;
  reminderTime: string | null;
};

type HabitApiDto = {
  id?: number | string;
  name?: string;
  frequency?: HabitFrequency;
  category?: HabitCategory;
  streak_count?: number;
  best_streak?: number;
  last_completed_date?: string | null;
  reminder_time?: string | null;
};

function normalizeCategory(value: unknown): HabitCategory {
  const validCategories: HabitCategory[] = ['Health', 'Fitness', 'Study', 'Mindfulness', 'Finance', 'Other'];
  return validCategories.includes(value as HabitCategory) ? (value as HabitCategory) : 'Other';
}

function normalizeFrequency(value: unknown): HabitFrequency {
  if (value === 'Weekly') {
    return 'Weekly';
  }
  return 'Daily';
}

function normalizeHabit(habit: HabitApiDto): HabitDto {
  return {
    id: String(habit.id ?? Date.now()),
    name: habit.name ?? 'Untitled Habit',
    frequency: normalizeFrequency(habit.frequency),
    category: normalizeCategory(habit.category),
    streakCount: Number(habit.streak_count ?? 0),
    bestStreak: Number(habit.best_streak ?? 0),
    lastCompletedDate: habit.last_completed_date ?? null,
    reminderTime: habit.reminder_time ?? null,
  };
}

export async function getHabits(): Promise<HabitDto[]> {
  const response = await api.get('/habits/');
  const data = parseJsonData<unknown>(response.data);
  const raw = Array.isArray(data) ? data : [];
  return raw.map((item) => normalizeHabit(item as HabitApiDto));
}

export async function createHabit(payload: {
  name: string;
  frequency: HabitFrequency;
  category: HabitCategory;
}): Promise<HabitDto> {
  const response = await api.post('/habits/', payload);
  const data = parseJsonData<HabitApiDto>(response.data);
  return normalizeHabit(data);
}

export async function completeHabit(id: string): Promise<HabitDto> {
  const response = await api.patch(`/habits/${id}/complete/`);
  const data = parseJsonData<HabitApiDto>(response.data);
  return normalizeHabit(data);
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

export async function updateHabit(id: string, name: string, frequency: string, reminderTime?: string): Promise<HabitDto> {
  const payload: any = { name, frequency };
  if (reminderTime !== undefined) {
    payload.reminder_time = reminderTime;
  }
  const response = await api.patch(`/habits/${id}/`, payload);
  const data = parseJsonData<HabitApiDto>(response.data);
  return normalizeHabit(data);
}
