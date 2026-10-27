import type { TransactionDto } from '../services/budgetService';
import { formatMoney } from './budgetFormat';

export type MonthTotals = { key: string; label: string; income: number; expense: number };

export type CategoryInsight = {
  name: string;
  amount: number;
  /** Share of this month's spending, 0-100. */
  share: number;
  /** Change vs the same period last month, or null when there was nothing to compare. */
  changePct: number | null;
};

export type Highlight = {
  icon: 'trending-up' | 'trending-down' | 'pie-chart' | 'wallet' | 'speedometer' | 'checkmark-circle' | 'alert-circle';
  tone: 'good' | 'warn' | 'info';
  text: string;
};

export type Insights = {
  months: MonthTotals[];
  income: number;
  expense: number;
  /** Expense change vs the same days last month (fair mid-month comparison). */
  expenseChangePct: number | null;
  lastMonthExpense: number;
  savingsRate: number | null;
  avgDaily: number;
  projected: number;
  topCategories: CategoryInsight[];
  biggestExpense: TransactionDto | null;
  highlights: Highlight[];
  hasData: boolean;
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthKey(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/** First day of the oldest month shown in the 6-month trend, as YYYY-MM-DD. */
export function trendStartDate(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function buildInsights(
  txns: TransactionDto[],
  monthlyLimit: number | null,
  currency: string,
  now = new Date()
): Insights {
  const year = now.getFullYear();
  const month = now.getMonth();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const thisKey = monthKey(year, month);
  const prev = new Date(year, month - 1, 1);
  const prevKey = monthKey(prev.getFullYear(), prev.getMonth());

  // 6-month trend buckets, oldest first.
  const months: MonthTotals[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(year, month - i, 1);
    months.push({ key: monthKey(d.getFullYear(), d.getMonth()), label: MONTH_LABELS[d.getMonth()], income: 0, expense: 0 });
  }
  const byKey = new Map(months.map((m) => [m.key, m]));

  let prevToDate = 0;
  const thisByCat = new Map<string, number>();
  const prevToDateByCat = new Map<string, number>();
  let biggest: TransactionDto | null = null;

  txns.forEach((t) => {
    const amount = Number(t.amount);
    const key = t.date.slice(0, 7);
    const bucket = byKey.get(key);
    if (bucket) {
      if (t.type === 'income') bucket.income += amount;
      else bucket.expense += amount;
    }
    if (t.type !== 'expense') return;

    const cat = t.category?.trim() || 'Other';
    if (key === thisKey) {
      thisByCat.set(cat, (thisByCat.get(cat) ?? 0) + amount);
      if (!biggest || amount > Number(biggest.amount)) biggest = t;
    } else if (key === prevKey && Number(t.date.slice(8, 10)) <= dayOfMonth) {
      prevToDate += amount;
      prevToDateByCat.set(cat, (prevToDateByCat.get(cat) ?? 0) + amount);
    }
  });

  const current = byKey.get(thisKey) as MonthTotals;
  const lastMonth = byKey.get(prevKey) as MonthTotals;
  const income = current.income;
  const expense = current.expense;

  const avgDaily = expense / dayOfMonth;
  const projected = avgDaily * daysInMonth;
  const savingsRate = income > 0 ? ((income - expense) / income) * 100 : null;
  const expenseChangePct = pctChange(expense, prevToDate);

  const topCategories: CategoryInsight[] = Array.from(thisByCat, ([name, amount]) => ({
    name,
    amount,
    share: expense > 0 ? (amount / expense) * 100 : 0,
    changePct: pctChange(amount, prevToDateByCat.get(name) ?? 0),
  }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // ---- Rule-based highlights ----
  const highlights: Highlight[] = [];
  const money = (n: number) => `${currency} ${formatMoney(n)}`;

  if (expenseChangePct !== null && Math.abs(expenseChangePct) >= 1) {
    const less = expenseChangePct < 0;
    highlights.push({
      icon: less ? 'trending-down' : 'trending-up',
      tone: less ? 'good' : 'warn',
      text: `You have spent ${Math.round(Math.abs(expenseChangePct))}% ${less ? 'less' : 'more'} than at this point last month.`,
    });
  }

  if (topCategories.length > 0 && expense > 0) {
    const top = topCategories[0];
    highlights.push({
      icon: 'pie-chart',
      tone: 'info',
      text: `${top.name} is your biggest expense — ${Math.round(top.share)}% of this month's spending.`,
    });
  }

  const risers = topCategories
    .filter((c) => c.changePct !== null && c.changePct >= 25)
    .sort((a, b) => (b.changePct as number) - (a.changePct as number));
  if (risers.length > 0) {
    highlights.push({
      icon: 'alert-circle',
      tone: 'warn',
      text: `${risers[0].name} spending is up ${Math.round(risers[0].changePct as number)}% compared with last month so far.`,
    });
  }

  if (monthlyLimit && expense > 0) {
    if (expense > monthlyLimit) {
      highlights.push({
        icon: 'alert-circle',
        tone: 'warn',
        text: `You are already ${money(expense - monthlyLimit)} over your monthly limit.`,
      });
    } else if (projected > monthlyLimit) {
      highlights.push({
        icon: 'speedometer',
        tone: 'warn',
        text: `At this pace you will spend about ${money(projected)} — ${money(projected - monthlyLimit)} over your limit.`,
      });
    } else {
      highlights.push({
        icon: 'checkmark-circle',
        tone: 'good',
        text: `On track: about ${money(projected)} projected against your ${money(monthlyLimit)} limit.`,
      });
    }
  }

  if (savingsRate !== null) {
    if (savingsRate < 0) {
      highlights.push({
        icon: 'alert-circle',
        tone: 'warn',
        text: `You have spent ${money(expense - income)} more than you earned this month.`,
      });
    } else if (savingsRate >= 20) {
      highlights.push({
        icon: 'wallet',
        tone: 'good',
        text: `Nice — you are saving ${Math.round(savingsRate)}% of your income this month.`,
      });
    } else {
      highlights.push({
        icon: 'wallet',
        tone: 'info',
        text: `You are saving ${Math.round(savingsRate)}% of your income. Aiming for 20% builds a solid cushion.`,
      });
    }
  }

  return {
    months,
    income,
    expense,
    expenseChangePct,
    lastMonthExpense: lastMonth.expense,
    savingsRate,
    avgDaily,
    projected,
    topCategories,
    biggestExpense: biggest,
    highlights,
    hasData: txns.length > 0,
  };
}
