import { Colors } from '../constants/theme';
import type { IconName } from '../components/module/ModuleUI';
import type { HabitCategory, HabitDto } from '../services/habitService';

export const CATEGORY_META: Record<HabitCategory, { icon: IconName; color: string; bg: string }> = {
  Health: { icon: 'heart', color: Colors.accentRose, bg: Colors.tintRose },
  Fitness: { icon: 'barbell', color: Colors.accentTeal, bg: Colors.tintSky },
  Study: { icon: 'book', color: Colors.accentBlue, bg: Colors.tintIndigo },
  Mindfulness: { icon: 'leaf', color: Colors.success, bg: Colors.tintGreen },
  Finance: { icon: 'wallet', color: Colors.accentAmber, bg: Colors.tintAmber },
  Other: { icon: 'sparkles', color: Colors.primary, bg: Colors.primarySurface },
};

export const HABIT_SUGGESTIONS: { name: string; category: HabitCategory; frequency: 'Daily' | 'Weekly'; target?: number }[] = [
  { name: 'Drink 8 glasses of water', category: 'Health', frequency: 'Daily' },
  { name: 'Read 10 pages', category: 'Study', frequency: 'Daily' },
  { name: 'Walk 30 minutes', category: 'Fitness', frequency: 'Daily' },
  { name: 'Pray on time', category: 'Mindfulness', frequency: 'Daily' },
  { name: 'Meditate 10 minutes', category: 'Mindfulness', frequency: 'Daily' },
  { name: 'Go to the gym', category: 'Fitness', frequency: 'Weekly', target: 3 },
  { name: 'No-spend day', category: 'Finance', frequency: 'Weekly', target: 2 },
  { name: 'Sleep before 11 PM', category: 'Health', frequency: 'Daily' },
];

/** Daily habits are "to do" until checked today; weekly ones until this week's target is met. */
export function isDue(habit: HabitDto) {
  if (habit.doneToday) return false;
  return habit.frequency === 'Daily' || habit.weekCount < habit.targetPerWeek;
}

export function progressLabel(habit: HabitDto) {
  if (habit.frequency === 'Weekly') {
    const week = `${Math.min(habit.weekCount, habit.targetPerWeek)}/${habit.targetPerWeek} this week`;
    return habit.streakCount > 0 ? `${week} · ${habit.streakCount}-week streak` : week;
  }
  return habit.streakCount > 0 ? `${habit.streakCount}-day streak` : habit.doneToday ? 'Streak started' : 'No streak yet';
}

export function frequencyLabel(habit: Pick<HabitDto, 'frequency' | 'targetPerWeek'>) {
  return habit.frequency === 'Daily' ? 'Every day' : `${habit.targetPerWeek}× a week`;
}

export function formatReminder(hhmm: string | null) {
  if (!hhmm) return 'No reminder';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function shortWeekday(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'narrow' });
}
