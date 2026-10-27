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
      {/* decorative shapes */}
      <View style={[styles.blob, styles.blobA]} />
      <View style={[styles.blob, styles.blobB]} />

      <View style={styles.header}>
        <View style={styles.badge}>
          <Ionicons name="wallet" size={14} color={Colors.primary} />
          <Text style={styles.badgeText}>Budget · {monthName}</Text>
        </View>
        <View style={styles.viewRow}>
          <Text style={styles.viewText}>Details</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.white} />
        </View>
      </View>

      <Text style={styles.label}>Spent this month</Text>
      <View style={styles.amountRow}>
        <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
          {currency} {formatMoney(expense)}
        </Text>
        {limit ? (
          <View style={[styles.pctChip, overLimit && styles.pctChipOver]}>
            <Text style={[styles.pctText, overLimit && { color: Colors.error }]}>{Math.round(pct)}%</Text>
          </View>
        ) : null}
      </View>

      {limit ? (
        <>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.min(pct, 100)}%` }]} />
          </View>
          <View style={styles.limitRow}>
            <Text style={styles.limitText}>of {currency} {formatMoney(limit)} limit</Text>
            <Text style={styles.limitText}>
              {overLimit ? `${formatMoney(expense - limit)} over` : `${formatMoney(limit - expense)} left`}
            </Text>
          </View>
        </>
      ) : (
        <Pressable onPress={() => navigation.navigate('BudgetSettings')} hitSlop={6}>
          <Text style={styles.hint}>Set a monthly limit to track your progress →</Text>
        </Pressable>
      )}

      <View style={styles.pills}>
        <Pill icon="arrow-down" label="Income" value={formatMoney(income)} />
        <Pill icon={net >= 0 ? 'trending-up' : 'trending-down'} label="Net" value={`${net < 0 ? '-' : ''}${formatMoney(net)}`} />
        <Pill icon="pie-chart" label="Top" value={topCategory ? `${topCategory.name} ${topCategory.share}%` : '—'} />
      </View>

      {alertText ? (
        <View style={styles.alert}>
          <Ionicons
            name={alertIsWarning ? 'alert-circle' : dueSoon ? 'notifications' : 'information-circle'}
            size={18}
            color={alertIsWarning ? Colors.error : Colors.primary}
          />
          <Text style={[styles.alertText, alertIsWarning && { color: Colors.error }]} numberOfLines={1}>
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

function Pill({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.pill}>
      <View style={styles.pillTop}>
        <Ionicons name={icon} size={13} color="rgba(255,255,255,0.9)" />
        <Text style={styles.pillLabel}>{label}</Text>
      </View>
      <Text style={styles.pillValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.xl,
    padding: 16,
    gap: 8,
    overflow: 'hidden',
    ...Shadows.button,
  },
  centered: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 8 },
  failText: { fontFamily: Font.semibold, fontSize: 14, color: Colors.white },
  blob: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)' },
  blobA: { width: 190, height: 190, top: -70, right: -50 },
  blobB: { width: 120, height: 120, bottom: -50, left: -30 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.white,
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: { fontFamily: Font.bold, fontSize: 12, color: Colors.primary },
  viewRow: { flexDirection: 'row', alignItems: 'center' },
  viewText: { fontFamily: Font.bold, fontSize: 13, color: Colors.white },

  label: { fontFamily: Font.medium, fontSize: 13, color: 'rgba(255,255,255,0.92)' },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  amount: { flex: 1, fontFamily: Font.extrabold, fontSize: 30, color: Colors.white, letterSpacing: -0.6 },
  pctChip: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 4 },
  pctChipOver: { backgroundColor: Colors.white },
  pctText: { fontFamily: Font.extrabold, fontSize: 14, color: Colors.white },

  track: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden', marginTop: 2 },
  fill: { height: '100%', borderRadius: 5, backgroundColor: Colors.white },
  limitRow: { flexDirection: 'row', justifyContent: 'space-between' },
  limitText: { fontFamily: Font.semibold, fontSize: 12, color: 'rgba(255,255,255,0.95)' },
  hint: { fontFamily: Font.semibold, fontSize: 13, color: Colors.white, textDecorationLine: 'underline' },

  pills: { flexDirection: 'row', gap: 8, marginTop: 6 },
  pill: { flex: 1, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: Radius.md, paddingVertical: 8, paddingHorizontal: 10, gap: 2 },
  pillTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pillLabel: { fontFamily: Font.medium, fontSize: 11, color: 'rgba(255,255,255,0.92)' },
  pillValue: { fontFamily: Font.extrabold, fontSize: 14, color: Colors.white },

  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 2,
  },
  alertText: { flex: 1, fontFamily: Font.bold, fontSize: 13, color: Colors.textPrimary },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    height: 40,
    marginTop: 4,
  },
  addText: { fontFamily: Font.bold, fontSize: 14, color: Colors.primary },
});
