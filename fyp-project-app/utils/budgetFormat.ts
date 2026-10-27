import type { Ionicons } from '@expo/vector-icons';

type IconName = keyof typeof Ionicons.glyphMap;

/** YYYY-MM-DD in the device's local time (toISOString() would shift the day in UTC+ zones). */
export function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function currentMonthRange() {
  const now = new Date();
  return {
    from: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

/** 12345.6 -> "12,346" */
export function formatMoney(value: number): string {
  const rounded = Math.round(Math.abs(value));
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function dayLabel(dateStr: string): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dateStr === toDateStr(today)) return 'Today';
  if (dateStr === toDateStr(yesterday)) return 'Yesterday';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export const CATEGORY_COLORS = ['#FF6B2C', '#F59E0B', '#6366F1', '#0EA5E9', '#10B981', '#F43F5E', '#94A3B8'];

const ICON_RULES: [RegExp, IconName][] = [
  [/food|grocer|restaurant|dining|meal|kfc|cafe/i, 'restaurant'],
  [/transport|fuel|petrol|uber|taxi|car|bus/i, 'car'],
  [/shop|cloth|mall/i, 'bag'],
  [/bill|util|electric|gas|internet|phone/i, 'flash'],
  [/health|medic|doctor|pharm/i, 'medkit'],
  [/rent|home|house/i, 'home'],
  [/educat|school|course|book/i, 'school'],
  [/entertain|movie|game|fun/i, 'game-controller'],
  [/salary|income|wage|bonus/i, 'cash'],
];

export function categoryIcon(category: string | null, type: 'income' | 'expense'): IconName {
  const name = category ?? '';
  const hit = ICON_RULES.find(([re]) => re.test(name));
  if (hit) return hit[1];
  return type === 'income' ? 'arrow-down-circle' : 'receipt';
}

export const DEFAULT_CATEGORIES = [
  'Food',
  'Transport',
  'Shopping',
  'Bills',
  'Health',
  'Education',
  'Entertainment',
  'Rent',
  'Other',
];

export type BudgetState = 'ok' | 'warning' | 'exceeded';

/** ok < 80%, warning 80-99%, exceeded >= 100%. */
export function budgetState(spent: number, limit: number): BudgetState {
  if (limit <= 0) return 'ok';
  const pct = (spent / limit) * 100;
  if (pct >= 100) return 'exceeded';
  if (pct >= 80) return 'warning';
  return 'ok';
}

export const GOAL_ICONS: { key: string; label: string; icon: IconName }[] = [
  { key: 'moon', label: 'Ummrah', icon: 'moon' },
  { key: 'airplane', label: 'Travel', icon: 'airplane' },
  { key: 'car', label: 'Car', icon: 'car-sport' },
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'laptop', label: 'Gadget', icon: 'laptop' },
  { key: 'school', label: 'Education', icon: 'school' },
  { key: 'heart', label: 'Wedding', icon: 'heart' },
  { key: 'shield', label: 'Emergency', icon: 'shield-checkmark' },
  { key: 'flag', label: 'Other', icon: 'flag' },
];

export function goalIcon(key: string): IconName {
  return GOAL_ICONS.find((g) => g.key === key)?.icon ?? 'flag';
}

/** Whole days from today until a YYYY-MM-DD date (negative once it has passed). */
export function daysUntil(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function formatDateLong(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
