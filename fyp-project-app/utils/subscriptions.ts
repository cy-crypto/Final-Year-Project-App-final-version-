import type { SubscriptionFrequency } from '../services/budgetService';
import { daysUntil, toDateStr } from './budgetFormat';

export const FREQUENCY_LABEL: Record<SubscriptionFrequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

function parse(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m, d };
}

/** Adds whole months, clamping to the last day (31 Jan + 1 month = 28 Feb). */
function addMonths(dateStr: string, months: number): string {
  const { y, m, d } = parse(dateStr);
  const index = m - 1 + months;
  const year = y + Math.floor(index / 12);
  const month = ((index % 12) + 12) % 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return toDateStr(new Date(year, month, Math.min(d, lastDay)));
}

/** Mirrors the backend's due-date advance so reminders line up with "Mark paid". */
export function advanceDueDate(dateStr: string, frequency: SubscriptionFrequency): string {
  if (frequency === 'weekly') {
    const { y, m, d } = parse(dateStr);
    return toDateStr(new Date(y, m - 1, d + 7));
  }
  return addMonths(dateStr, frequency === 'yearly' ? 12 : 1);
}

/** The next `count` due dates starting at (and including) `from`. */
export function upcomingDueDates(from: string, frequency: SubscriptionFrequency, count: number): string[] {
  const dates = [from];
  while (dates.length < count) {
    dates.push(advanceDueDate(dates[dates.length - 1], frequency));
  }
  return dates;
}

/** What this subscription costs per month, whatever its billing cycle. */
export function monthlyEquivalent(amount: number, frequency: SubscriptionFrequency): number {
  if (frequency === 'weekly') return (amount * 52) / 12;
  if (frequency === 'yearly') return amount / 12;
  return amount;
}

export type DueStatus = 'overdue' | 'today' | 'soon' | 'later';

export function dueInfo(nextDueDate: string): { status: DueStatus; text: string; days: number } {
  const days = daysUntil(nextDueDate);
  if (days < 0) return { status: 'overdue', days, text: `Overdue by ${-days} day${days === -1 ? '' : 's'}` };
  if (days === 0) return { status: 'today', days, text: 'Due today' };
  if (days === 1) return { status: 'soon', days, text: 'Due tomorrow' };
  if (days <= 7) return { status: 'soon', days, text: `Due in ${days} days` };
  return { status: 'later', days, text: `Due in ${days} days` };
}
