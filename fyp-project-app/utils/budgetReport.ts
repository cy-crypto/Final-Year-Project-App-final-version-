import type {
  CategoryBudgetDto,
  GoalDto,
  SubscriptionDto,
  TransactionDto,
} from '../services/budgetService';
import { CATEGORY_COLORS, formatDateLong, formatMoney, toDateStr } from './budgetFormat';
import { FREQUENCY_LABEL, monthlyEquivalent } from './subscriptions';

export type ReportPeriod = 'thisMonth' | 'lastMonth' | 'last3Months' | 'thisYear';

export const REPORT_PERIODS: { key: ReportPeriod; label: string }[] = [
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'last3Months', label: 'Last 3 months' },
  { key: 'thisYear', label: 'This year' },
];

export function periodRange(period: ReportPeriod, now = new Date()): { from: string; to: string; label: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const monthName = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  switch (period) {
    case 'lastMonth': {
      const start = new Date(y, m - 1, 1);
      return { from: toDateStr(start), to: toDateStr(new Date(y, m, 0)), label: monthName(start) };
    }
    case 'last3Months': {
      const start = new Date(y, m - 2, 1);
      return {
        from: toDateStr(start),
        to: toDateStr(new Date(y, m + 1, 0)),
        label: `${start.toLocaleDateString('en-US', { month: 'short' })} – ${now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
      };
    }
    case 'thisYear':
      return { from: `${y}-01-01`, to: toDateStr(new Date(y, 11, 31)), label: String(y) };
    default: {
      const start = new Date(y, m, 1);
      return { from: toDateStr(start), to: toDateStr(new Date(y, m + 1, 0)), label: monthName(start) };
    }
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const MAX_TRANSACTION_ROWS = 400;
const MAX_DONUT_SLICES = 6;

export type ReportInput = {
  periodLabel: string;
  /** Whether the period is a single calendar month (monthly budgets only make sense then). */
  singleMonth: boolean;
  currency: string;
  preparedFor?: string;
  generatedOn?: Date;
  transactions: TransactionDto[];
  budgets: CategoryBudgetDto[];
  goals: GoalDto[];
  subscriptions: SubscriptionDto[];
};

function donutSvg(slices: { value: number }[], total: number): string {
  const r = 44;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const gap = slices.length > 1 ? 1.5 : 0;
  const arcs = slices
    .map((s, i) => {
      const len = (s.value / total) * circ;
      const arc = `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}" stroke-width="22" stroke-dasharray="${Math.max(len - gap, 0.5).toFixed(2)} ${circ.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 60 60)"/>`;
      offset += len;
      return arc;
    })
    .join('');
  return `<svg width="150" height="150" viewBox="0 0 120 120"><circle cx="60" cy="60" r="${r}" fill="none" stroke="#F1F5F9" stroke-width="22"/>${arcs}</svg>`;
}

export function buildReportHtml(input: ReportInput): string {
  const { currency, transactions } = input;
  const money = (n: number) => `${escapeHtml(currency)} ${formatMoney(n)}`;
  const generated = input.generatedOn ?? new Date();

  let income = 0;
  let expense = 0;
  const byCategory = new Map<string, number>();
  transactions.forEach((t) => {
    const amount = Number(t.amount);
    if (t.type === 'income') income += amount;
    else {
      expense += amount;
      const name = t.category?.trim() || 'Other';
      byCategory.set(name, (byCategory.get(name) ?? 0) + amount);
    }
  });
  const net = income - expense;
  const savingsRate = income > 0 ? Math.round((net / income) * 100) : null;

  // ---- category breakdown (top slices + "Other" fold) ----
  const sorted = Array.from(byCategory, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const slices =
    sorted.length > MAX_DONUT_SLICES
      ? [
          ...sorted.slice(0, MAX_DONUT_SLICES - 1),
          { name: 'Everything else', value: sorted.slice(MAX_DONUT_SLICES - 1).reduce((s, c) => s + c.value, 0) },
        ]
      : sorted;

  const categorySection =
    slices.length === 0
      ? '<p class="muted">No expenses in this period.</p>'
      : `<div class="split">
          <div class="donut">${donutSvg(slices, expense)}</div>
          <table class="grow">
            ${slices
              .map(
                (s, i) => `<tr>
                  <td><span class="dot" style="background:${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}"></span>${escapeHtml(s.name)}</td>
                  <td class="num muted">${Math.round((s.value / expense) * 100)}%</td>
                  <td class="num strong">${money(s.value)}</td>
                </tr>`
              )
              .join('')}
          </table>
        </div>`;

  // ---- budgets vs spent (monthly limits only compare against a single month) ----
  let budgetSection = '';
  if (input.singleMonth && input.budgets.length > 0) {
    const spentByCat = new Map(Array.from(byCategory, ([k, v]) => [k.toLowerCase(), v]));
    const rows = input.budgets
      .map((b) => {
        const spent = spentByCat.get(b.category.trim().toLowerCase()) ?? 0;
        const pct = b.monthlyLimit > 0 ? (spent / b.monthlyLimit) * 100 : 0;
        const color = pct >= 100 ? '#F43F5E' : pct >= 80 ? '#F59E0B' : '#10B981';
        return `<tr>
          <td class="strong">${escapeHtml(b.category)}</td>
          <td class="num">${money(spent)} / ${money(b.monthlyLimit)}</td>
          <td style="width:32%"><div class="bar"><div style="width:${Math.min(pct, 100).toFixed(0)}%;background:${color}"></div></div></td>
          <td class="num strong" style="color:${color}">${Math.round(pct)}%</td>
        </tr>`;
      })
      .join('');
    budgetSection = `<h2>Category budgets</h2><table>${rows}</table>`;
  }

  // ---- goals ----
  const goalSection =
    input.goals.length === 0
      ? ''
      : `<h2>Savings goals <span class="muted small">(current progress)</span></h2><table>${input.goals
          .map((g) => {
            const pct = g.targetAmount > 0 ? Math.min((g.savedAmount / g.targetAmount) * 100, 100) : 0;
            return `<tr>
              <td class="strong">${escapeHtml(g.name)}</td>
              <td class="num">${money(g.savedAmount)} / ${money(g.targetAmount)}</td>
              <td style="width:28%"><div class="bar"><div style="width:${pct.toFixed(0)}%;background:#FF6B2C"></div></div></td>
              <td class="num strong">${Math.floor(pct)}%</td>
              <td class="num muted small">${g.deadline ? escapeHtml(formatDateLong(g.deadline)) : '—'}</td>
            </tr>`;
          })
          .join('')}</table>`;

  // ---- subscriptions ----
  const activeSubs = input.subscriptions.filter((s) => s.isActive);
  const subsMonthly = activeSubs.reduce((sum, s) => sum + monthlyEquivalent(s.amount, s.frequency), 0);
  const subsSection =
    activeSubs.length === 0
      ? ''
      : `<h2>Subscriptions <span class="muted small">(about ${money(subsMonthly)} per month)</span></h2><table>${activeSubs
          .map(
            (s) => `<tr>
              <td class="strong">${escapeHtml(s.name)}</td>
              <td class="muted">${FREQUENCY_LABEL[s.frequency]}</td>
              <td class="muted small">Next: ${escapeHtml(formatDateLong(s.nextDueDate))}</td>
              <td class="num strong">${money(s.amount)}</td>
            </tr>`
          )
          .join('')}</table>`;

  // ---- transactions ----
  const ordered = [...transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const shown = ordered.slice(0, MAX_TRANSACTION_ROWS);
  const txnSection =
    ordered.length === 0
      ? '<p class="muted">No transactions in this period.</p>'
      : `<table class="txns">
          <tr class="head"><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th></tr>
          ${shown
            .map((t) => {
              const isIncome = t.type === 'income';
              return `<tr>
                <td class="muted nowrap">${escapeHtml(formatDateLong(t.date))}</td>
                <td>${escapeHtml(t.description?.trim() || '—')}</td>
                <td class="muted">${escapeHtml(t.category?.trim() || 'Uncategorized')}</td>
                <td class="num strong" style="color:${isIncome ? '#059669' : '#18181B'}">${isIncome ? '+' : '-'}${money(Number(t.amount))}</td>
              </tr>`;
            })
            .join('')}
        </table>${
          ordered.length > shown.length
            ? `<p class="muted small">Showing the latest ${shown.length} of ${ordered.length} transactions.</p>`
            : ''
        }`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { margin: 22px 0; }
  * { box-sizing: border-box; }
  .page { padding: 0 26px; }
  body { font-family: -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #18181B; font-size: 12px; margin: 0; }
  .header { background: #FF6B2C; color: #fff; border-radius: 14px; padding: 20px 24px; }
  .header .brand { font-size: 12px; letter-spacing: 1px; text-transform: uppercase; opacity: .9; }
  .header h1 { margin: 4px 0 2px; font-size: 26px; }
  .header .meta { font-size: 12px; opacity: .95; }
  .tiles { display: flex; gap: 10px; margin: 16px 0 4px; }
  .tile { flex: 1; border: 1px solid #F1F5F9; background: #FFF7F2; border-radius: 12px; padding: 12px 14px; }
  .tile .label { color: #64748B; font-size: 11px; }
  .tile .value { font-size: 17px; font-weight: 800; margin-top: 3px; }
  h2 { font-size: 15px; margin: 22px 0 8px; padding-bottom: 5px; border-bottom: 2px solid #FFE3D2; page-break-after: avoid; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 7px 6px; border-bottom: 1px solid #F1F5F9; text-align: left; vertical-align: middle; }
  tr { page-break-inside: avoid; }
  .txns .head th { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #64748B; border-bottom: 2px solid #E2E8F0; }
  .num { text-align: right; white-space: nowrap; }
  .nowrap { white-space: nowrap; }
  .strong { font-weight: 700; }
  .muted { color: #64748B; }
  .small { font-size: 10.5px; font-weight: 400; }
  .split { display: flex; align-items: center; gap: 18px; }
  .donut { flex: 0 0 150px; }
  .grow { flex: 1; }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 5px; margin-right: 7px; }
  .bar { height: 8px; background: #F1F5F9; border-radius: 4px; overflow: hidden; }
  .bar div { height: 100%; border-radius: 4px; }
  .footer { margin-top: 26px; text-align: center; color: #94A3B8; font-size: 10px; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="brand">Personal Companion</div>
    <h1>Budget Report</h1>
    <div class="meta">${escapeHtml(input.periodLabel)}${input.preparedFor ? ` &nbsp;·&nbsp; Prepared for ${escapeHtml(input.preparedFor)}` : ''}</div>
  </div>

  <div class="tiles">
    <div class="tile"><div class="label">Income</div><div class="value" style="color:#059669">${money(income)}</div></div>
    <div class="tile"><div class="label">Expenses</div><div class="value">${money(expense)}</div></div>
    <div class="tile"><div class="label">Net</div><div class="value" style="color:${net < 0 ? '#F43F5E' : '#18181B'}">${net < 0 ? '-' : ''}${money(Math.abs(net))}</div></div>
    <div class="tile"><div class="label">Savings rate</div><div class="value">${savingsRate === null ? '—' : `${savingsRate}%`}</div></div>
  </div>

  <h2>Spending by category</h2>
  ${categorySection}
  ${budgetSection}
  ${goalSection}
  ${subsSection}

  <h2>Transactions <span class="muted small">(${ordered.length})</span></h2>
  ${txnSection}

  <div class="footer">Generated on ${escapeHtml(formatDateLong(toDateStr(generated)))} by Personal Companion</div>
</div>
</body>
</html>`;
}
