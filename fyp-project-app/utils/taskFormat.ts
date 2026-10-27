import { Colors } from '../constants/theme';
import type { IconName } from '../components/module/ModuleUI';
import type { Task, TaskPriority, TaskStatus } from '../services/taskService';

export const PRIORITY_META: Record<TaskPriority, { label: string; color: string; bg: string }> = {
  high: { label: 'High', color: Colors.error, bg: Colors.tintRose },
  medium: { label: 'Medium', color: Colors.warning, bg: Colors.tintAmber },
  low: { label: 'Low', color: Colors.success, bg: Colors.tintGreen },
};

export const STATUS_META: Record<TaskStatus, { label: string; icon: IconName }> = {
  pending: { label: 'To do', icon: 'ellipse-outline' },
  in_progress: { label: 'In progress', icon: 'time-outline' },
  done: { label: 'Done', icon: 'checkmark-circle' },
};

export const TASK_CATEGORIES = ['Work', 'Personal', 'Study', 'Health', 'Shopping', 'Home'];

export const CATEGORY_ICONS: Record<string, IconName> = {
  work: 'briefcase-outline',
  personal: 'person-outline',
  study: 'book-outline',
  health: 'heart-outline',
  shopping: 'cart-outline',
  home: 'home-outline',
};

export function categoryIcon(category?: string): IconName {
  return CATEGORY_ICONS[(category ?? '').trim().toLowerCase()] ?? 'checkbox-outline';
}

export function toDateStr(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayStr() {
  return toDateStr(new Date());
}

export function addDays(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return toDateStr(new Date(y, m - 1, d + days));
}

export function isOverdue(task: Task) {
  return !task.done && !!task.deadline && task.deadline < todayStr();
}

/** "Today", "Tomorrow", "Overdue · 3 Nov" or "Mon, 3 Nov". */
export function dueLabel(task: Task) {
  if (!task.deadline) return 'No deadline';
  const today = todayStr();
  if (task.deadline === today) return 'Due today';
  if (task.deadline === addDays(today, 1)) return 'Due tomorrow';
  const [y, m, d] = task.deadline.split('-').map(Number);
  const text = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  return isOverdue(task) ? `Overdue · ${text}` : text;
}

export function formatLongDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${total}s`;
}

export function formatClock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Open tasks first (by deadline, then priority), finished ones last. */
export function sortTasks(tasks: Task[]) {
  const rank: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const da = a.deadline ?? '9999-12-31';
    const db = b.deadline ?? '9999-12-31';
    if (da !== db) return da < db ? -1 : 1;
    return rank[a.priority] - rank[b.priority];
  });
}
