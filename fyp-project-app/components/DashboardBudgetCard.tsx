import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Font, Radius, Shadows } from '../constants/theme';
import {
  BudgetSettingsDto,
  CategoryBudgetDto,
  getCategoryBudgets,
  getSettings,
  getSubscriptions,
  getTransactions,
  SubscriptionDto,
  TransactionDto,
} from '../services/budgetService';
import type { RootStackParamList } from '../navigation/types';
import { budgetState, currentMonthRange, formatMoney } from '../utils/budgetFormat';
import { dueInfo } from '../utils/subscriptions';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Props = {
  /** Bumped by the dashboard's pull-to-refresh. */
  reloadKey: number;
};

export function DashboardBudgetCard({ reloadKey }: Props) {
  const navigation = useNavigation<Nav>();

  const [txns, setTxns] = useState<TransactionDto[]>([]);
  const [settings, setSettings] = useState<BudgetSettingsDto | null>(null);
  const [budgets, setBudgets] = useState<CategoryBudgetDto[]>([]);
  const [subs, setSubs] = useState<SubscriptionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const { from, to } = currentMonthRange();
      const [t, cfg, b, s] = await Promise.all([
        getTransactions({ dateFrom: from, dateTo: to }),
        getSettings().catch(() => null),
        getCategoryBudgets().catch(() => [] as CategoryBudgetDto[]),
        getSubscriptions().catch(() => [] as SubscriptionDto[]),
      ]);
      setTxns(t);
      setSettings(cfg);
      setBudgets(b);
      setSubs(s);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  const currency = settings?.currency ?? 'PKR';
  const limit = settings?.monthlyLimit ? Number(settings.monthlyLimit) : null;
  const monthName = new Date().toLocaleDateString('en-US', { month: 'long' });

  const { income, expense, topCategory } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    const byCat = new Map<string, number>();
    txns.forEach((t) => {
      const amount = Number(t.amount);
      if (t.type === 'income') inc += amount;
      else {
        exp += amount;
        const name = t.category?.trim() || 'Other';
        byCat.set(name, (byCat.get(name) ?? 0) + amount);
      }
    });
    const top = Array.from(byCat).sort((a, b) => b[1] - a[1])[0];
    return {
      income: inc,
      expense: exp,
      topCategory: top ? { name: top[0], share: exp > 0 ? Math.round((top[1] / exp) * 100) : 0 } : null,
    };
  }, [txns]);

  const overBudget = budgets.filter((b) => budgetState(b.spent, b.monthlyLimit) === 'exceeded');
  const nearBudget = budgets.filter((b) => budgetState(b.spent, b.monthlyLimit) === 'warning');

  const dueSoon = subs
    .filter((s) => s.isActive && dueInfo(s.nextDueDate).days <= 2)
    .sort((a, b) => (a.nextDueDate < b.nextDueDate ? -1 : 1))[0];

  const pct = limit ? (expense / limit) * 100 : 0;
  const overLimit = limit !== null && expense > limit;
  const net = income - expense;

  const goBudget = () => navigation.navigate('Budget');

  if (loading) {
    return (
      <View style={[styles.card, styles.centered]}>
        <ActivityIndicator color={Colors.white} />
      </View>
    );
  }

  if (failed) {
    return (
      <Pressable style={[styles.card, styles.centered]} onPress={() => { setLoading(true); load(); }}>
        <Ionicons name="refresh" size={20} color={Colors.white} />
        <Text style={styles.failText}>Couldn't load your budget. Tap to retry.</Text>
      </Pressable>
    );
  }

  const alertText = overBudget.length
    ? `${overBudget[0].category} is over budget${overBudget.length > 1 ? ` (+${overBudget.length - 1} more)` : ''}`
    : dueSoon
      ? `${dueSoon.name} ${dueInfo(dueSoon.nextDueDate).text.toLowerCase()} · ${currency} ${formatMoney(dueSoon.amount)}`
      : nearBudget.length
        ? `${nearBudget[0].category} budget is almost used`
        : null;
  const alertIsWarning = overBudget.length > 0;

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.95 }]} onPress={goBudget}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.titleIcon}>
            <Ionicons name="wallet" size={18} color={Colors.primary} />
          </View>
          <View>
            <Text style={styles.title}>Budget</Text>
            <Text style={styles.subtitle}>{monthName}</Text>
          </View>
        </View>
        <View style={styles.viewRow}>
          <Text style={styles.viewText}>Details</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.white} />
        </View>
      </View>

      {/* Spent this month */}
      <View>
        <Text style={styles.label}>Spent this month</Text>
        <View style={styles.amountRow}>
          <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
            {currency} {formatMoney(expense)}
          </Text>
          {limit ? (
            <View style={[styles.pctChip, overLimit && styles.pctChipOver]}>
              <Text style={[styles.pctText, overLimit && { color: Colors.error }]}>{Math.round(pct)}% used</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Limit progress */}
      {limit ? (
        <View style={styles.progressBlock}>
          <View style={styles.track}>
            <View style={[styles.fill, overLimit && styles.fillOver, { width: `${Math.min(pct, 100)}%` }]} />
          </View>
          <View style={styles.limitRow}>
            <Text style={styles.limitText}>Limit {currency} {formatMoney(limit)}</Text>
            <Text style={styles.limitStrong}>
              {overLimit ? `${formatMoney(expense - limit)} over` : `${formatMoney(limit - expense)} left`}
            </Text>
          </View>
        </View>
      ) : (
        <Pressable onPress={() => navigation.navigate('BudgetSettings')} hitSlop={6}>
          <Text style={styles.hint}>Set a monthly limit to track your progress →</Text>
        </Pressable>
      )}

      {/* Income / Net / Top category */}
      <View style={styles.stats}>
        <Stat label="Income" value={formatMoney(income)} color={Colors.success} />
        <View style={styles.divider} />
        <Stat
          label="Net"
          value={`${net < 0 ? '-' : ''}${formatMoney(net)}`}
          color={net < 0 ? Colors.error : Colors.textPrimary}
        />
        <View style={styles.divider} />
        <Stat
          label="Top spend"
          value={topCategory ? topCategory.name : '—'}
          sub={topCategory ? `${topCategory.share}% of spending` : undefined}
        />
      </View>

      {alertText ? (
        <View style={[styles.alert, alertIsWarning && styles.alertWarning]}>
          <Ionicons
            name={alertIsWarning ? 'alert-circle' : dueSoon ? 'notifications' : 'information-circle'}
            size={20}
            color={alertIsWarning ? Colors.error : Colors.accentAmber}
          />
          <Text style={[styles.alertText, alertIsWarning && { color: Colors.error }]} numberOfLines={2}>
            {alertText}
          </Text>
        </View>
      ) : null}

      {txns.length === 0 ? (
        <Pressable style={styles.addBtn} onPress={() => navigation.navigate('AddTransaction')}>
          <Ionicons name="add" size={18} color={Colors.primary} />
          <Text style={styles.addText}>Add your first transaction</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text
        style={[styles.statValue, color ? { color } : null]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
      {sub ? <Text style={styles.statSub} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // Same softened orange as every hero card in the app.
    backgroundColor: Colors.heroOrange,
    borderRadius: Radius.xl,
    padding: 18,
    gap: 16,
    overflow: 'hidden',
    ...Shadows.button,
  },
  centered: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 8 },
  failText: { fontFamily: Font.semibold, fontSize: 15, color: Colors.white },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  titleIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: Font.bold, fontSize: 17, color: Colors.white },
  subtitle: { fontFamily: Font.medium, fontSize: 13, color: 'rgba(255,255,255,0.92)' },
  viewRow: { flexDirection: 'row', alignItems: 'center' },
  viewText: { fontFamily: Font.bold, fontSize: 14, color: Colors.white },

  label: { fontFamily: Font.medium, fontSize: 14, color: 'rgba(255,255,255,0.95)', marginBottom: 2 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  amount: { flex: 1, fontFamily: Font.extrabold, fontSize: 32, color: Colors.white, letterSpacing: -0.6 },
  pctChip: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  pctChipOver: { backgroundColor: Colors.white },
  pctText: { fontFamily: Font.bold, fontSize: 13, color: Colors.white },

  progressBlock: { gap: 8 },
  track: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5, backgroundColor: Colors.white },
  fillOver: { backgroundColor: Colors.white },
  limitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  limitText: { fontFamily: Font.medium, fontSize: 14, color: 'rgba(255,255,255,0.95)' },
  limitStrong: { fontFamily: Font.bold, fontSize: 14, color: Colors.white },
  hint: { fontFamily: Font.semibold, fontSize: 14, color: Colors.white, textDecorationLine: 'underline' },

  stats: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.md,
    paddingVertical: 12,
  },
  stat: { flex: 1, paddingHorizontal: 12, gap: 2 },
  divider: { width: 1, backgroundColor: Colors.borderLight },
  statLabel: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary },
  statValue: { fontFamily: Font.extrabold, fontSize: 17, color: Colors.textPrimary },
  statSub: { fontFamily: Font.medium, fontSize: 12, color: Colors.textSecondary },

  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.tintAmber,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  alertWarning: { backgroundColor: Colors.tintRose },
  alertText: { flex: 1, fontFamily: Font.bold, fontSize: 14, color: Colors.textPrimary },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    height: 46,
  },
  addText: { fontFamily: Font.bold, fontSize: 15, color: Colors.primary },
});
