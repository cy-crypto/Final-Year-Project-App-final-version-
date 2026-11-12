import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Font, Radius, Shadows } from '../constants/theme';
import { getSubscriptions, getTransactions, SubscriptionDto, TransactionDto } from '../services/budgetService';
import { monthlyEquivalent } from '../utils/subscriptions';
import { toApiErrorMessage } from '../services/api';
import { currentMonthRange, formatMoney } from '../utils/budgetFormat';
import { buildInsights, Highlight, trendStartDate } from '../utils/budgetInsights';
import { SpendingCalendar } from './SpendingCalendar';

type Props = {
  currency: string;
  monthlyLimit: number | null;
  /** Bumped by the parent (pull-to-refresh) to force a reload. */
  reloadKey: number;
};

const TONE: Record<Highlight['tone'], { bg: string; fg: string }> = {
  good: { bg: '#ECFDF5', fg: Colors.success },
  warn: { bg: Colors.tintOrange, fg: Colors.primary },
  info: { bg: Colors.tintIndigo, fg: Colors.accentBlue },
};

const CHART_HEIGHT = 130;

export function InsightsTab({ currency, monthlyLimit, reloadKey }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const openMonthTxns = (filters: { type?: 'income' | 'expense'; category?: string }) => {
    const { from, to } = currentMonthRange();
    navigation.navigate('Transactions', { ...filters, dateFrom: from, dateTo: to });
  };
  const [txns, setTxns] = useState<TransactionDto[]>([]);
  const [subs, setSubs] = useState<SubscriptionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, subList] = await Promise.all([
        getTransactions({ dateFrom: trendStartDate(), dateTo: currentMonthRange().to }),
        getSubscriptions().catch(() => [] as SubscriptionDto[]),
      ]);
      setTxns(list);
      setSubs(subList);
      setError(null);
    } catch (err) {
      setError(toApiErrorMessage(err, 'Failed to load insights'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  const data = useMemo(() => buildInsights(txns, monthlyLimit, currency), [txns, monthlyLimit, currency]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (!data.hasData) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Ionicons name="bulb-outline" size={34} color={Colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>No insights yet</Text>
        <Text style={styles.emptyText}>
          {error ?? 'Add a few income and expense transactions and your trends will show up here.'}
        </Text>
      </View>
    );
  }

  const activeSubs = subs.filter((s) => s.isActive);
  const subsMonthly = activeSubs.reduce((sum, s) => sum + monthlyEquivalent(s.amount, s.frequency), 0);
  const change = data.expenseChangePct;
  const spendingUp = change !== null && change > 0;
  const maxBar = Math.max(1, ...data.months.flatMap((m) => [m.income, m.expense]));

  return (
    <View style={{ gap: 14 }}>
      {/* Hero comparison */}
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Spent this month</Text>
        <Text style={styles.heroValue}>{currency} {formatMoney(data.expense)}</Text>
        <View style={styles.heroRow}>
          {change !== null ? (
            <View style={styles.chip}>
              <Ionicons name={spendingUp ? 'arrow-up' : 'arrow-down'} size={14} color={Colors.primary} />
              <Text style={styles.chipText}>{Math.abs(Math.round(change))}% vs same days last month</Text>
            </View>
          ) : (
            <Text style={styles.heroNote}>No earlier data to compare yet</Text>
          )}
        </View>
        <Text style={styles.heroNote}>Last month in total: {currency} {formatMoney(data.lastMonthExpense)}</Text>
      </View>

      {/* Stat grid */}
      <View style={styles.grid}>
        <Stat icon="calendar" label="Avg per day" value={`${formatMoney(data.avgDaily)}`} onPress={() => openMonthTxns({ type: 'expense' })} />
        <Stat icon="speedometer" label="Projected month" value={`${formatMoney(data.projected)}`} onPress={() => openMonthTxns({ type: 'expense' })} />
        <Stat icon="arrow-down-circle" label="Income" value={`${formatMoney(data.income)}`} onPress={() => openMonthTxns({ type: 'income' })} />
        <Stat
          icon="wallet"
          label="Savings rate"
          value={data.savingsRate === null ? '—' : `${Math.round(data.savingsRate)}%`}
          negative={data.savingsRate !== null && data.savingsRate < 0}
          onPress={() => openMonthTxns({})}
        />
      </View>

      {/* Subscriptions */}
      <Pressable
        style={({ pressed }) => [styles.subsCard, pressed && { opacity: 0.85 }]}
        onPress={() => navigation.navigate('Subscriptions')}
      >
        <View style={styles.statIcon}>
          <Ionicons name="repeat" size={18} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.statLabel}>Subscriptions</Text>
          <Text style={styles.subsValue} numberOfLines={1}>
            {activeSubs.length === 0
              ? 'None yet · tap to add'
              : `${activeSubs.length} active · ${currency} ${formatMoney(subsMonthly)}/month`}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.textHint} />
      </Pressable>

      {/* Highlights */}
      {data.highlights.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Highlights</Text>
          {data.highlights.map((h, i) => (
            <View key={i} style={styles.highlight}>
              <View style={[styles.highlightIcon, { backgroundColor: TONE[h.tone].bg }]}>
                <Ionicons name={h.icon} size={18} color={TONE[h.tone].fg} />
              </View>
              <Text style={styles.highlightText}>{h.text}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 6-month trend */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>Last 6 months</Text>
          <View style={styles.legend}>
            <LegendDot color={Colors.success} label="Income" />
            <LegendDot color={Colors.primary} label="Expense" />
          </View>
        </View>
        <View style={styles.chart}>
          {data.months.map((m, i) => {
            const current = i === data.months.length - 1;
            return (
              <View key={m.key} style={styles.barGroup}>
                <View style={styles.bars}>
                  <View style={[styles.bar, { height: Math.max((m.income / maxBar) * CHART_HEIGHT, m.income > 0 ? 3 : 0), backgroundColor: Colors.success, opacity: current ? 1 : 0.55 }]} />
                  <View style={[styles.bar, { height: Math.max((m.expense / maxBar) * CHART_HEIGHT, m.expense > 0 ? 3 : 0), backgroundColor: Colors.primary, opacity: current ? 1 : 0.55 }]} />
                </View>
                <Text style={[styles.barLabel, current && styles.barLabelActive]}>{m.label}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Spending calendar */}
      <SpendingCalendar currency={currency} reloadKey={reloadKey} />

      {/* Top categories */}
      {data.topCategories.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Top categories this month</Text>
          {data.topCategories.map((c) => (
            <Pressable
              key={c.name}
              style={({ pressed }) => [{ gap: 6 }, pressed && { opacity: 0.6 }]}
              onPress={() => openMonthTxns({ type: 'expense', category: c.name })}
            >
              <View style={styles.rowBetween}>
                <Text style={styles.catName} numberOfLines={1}>{c.name}</Text>
                <View style={styles.catRight}>
                  {c.changePct !== null && (
                    <Text style={[styles.catChange, { color: c.changePct > 0 ? Colors.error : Colors.success }]}>
                      {c.changePct > 0 ? '+' : '-'}{Math.abs(Math.round(c.changePct))}%
                    </Text>
                  )}
                  <Text style={styles.catAmount}>{formatMoney(c.amount)}</Text>
                </View>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.max(c.share, 2)}%` }]} />
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {data.biggestExpense && (
        <Pressable
          style={({ pressed }) => [styles.biggest, pressed && { opacity: 0.85 }]}
          onPress={() => data.biggestExpense && navigation.navigate('AddTransaction', { transaction: data.biggestExpense })}
        >
          <View style={styles.biggestIcon}>
            <Ionicons name="flame" size={20} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.biggestLabel}>Biggest expense this month</Text>
            <Text style={styles.biggestValue} numberOfLines={1}>
              {currency} {formatMoney(Number(data.biggestExpense.amount))} ·{' '}
              {data.biggestExpense.description?.trim() || data.biggestExpense.category || 'Uncategorized'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textHint} />
        </Pressable>
      )}
    </View>
  );
}

function Stat({
  icon,
  label,
  value,
  negative,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  negative?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.stat, pressed && { opacity: 0.85 }]} onPress={onPress} disabled={!onPress}>
      <View style={styles.statIcon}>
        <Ionicons name={icon} size={18} color={Colors.primary} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, negative && { color: Colors.error }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </Pressable>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 48, alignItems: 'center' },
  empty: {
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 28,
    ...Shadows.card,
  },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: Font.extrabold, fontSize: 18, color: Colors.textPrimary },
  emptyText: { fontFamily: Font.medium, fontSize: 14, lineHeight: 21, color: Colors.textSecondary, textAlign: 'center' },

  hero: { backgroundColor: Colors.heroOrange, borderRadius: Radius.xl, padding: 18, gap: 6, ...Shadows.button },
  heroLabel: { fontFamily: Font.semibold, fontSize: 15, color: 'rgba(255,255,255,0.95)' },
  heroValue: { fontFamily: Font.extrabold, fontSize: 32, color: Colors.white, letterSpacing: -0.6 },
  heroRow: { flexDirection: 'row', marginTop: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.white,
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { fontFamily: Font.bold, fontSize: 13, color: Colors.primary },
  heroNote: { fontFamily: Font.medium, fontSize: 14, color: 'rgba(255,255,255,0.95)' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: {
    width: '48.5%',
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 12,
    gap: 2,
    ...Shadows.card,
  },
  statIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  subsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 12,
    ...Shadows.card,
  },
  subsValue: { fontFamily: Font.extrabold, fontSize: 16, color: Colors.textPrimary },
  statLabel: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary },
  statValue: { fontFamily: Font.extrabold, fontSize: 19, color: Colors.textPrimary },

  card: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 14,
    gap: 12,
    ...Shadows.card,
  },
  cardTitle: { fontFamily: Font.extrabold, fontSize: 16, color: Colors.textPrimary },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },

  highlight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  highlightIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  highlightText: { flex: 1, fontFamily: Font.medium, fontSize: 14, lineHeight: 20, color: Colors.textPrimary },

  legend: { flexDirection: 'row', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontFamily: Font.medium, fontSize: 12, color: Colors.textSecondary },
  chart: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 6 },
  barGroup: { flex: 1, alignItems: 'center', gap: 6 },
  bars: { height: CHART_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  bar: { width: 12, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  barLabel: { fontFamily: Font.medium, fontSize: 12, color: Colors.textSecondary },
  barLabelActive: { fontFamily: Font.extrabold, color: Colors.textPrimary },

  catName: { flex: 1, fontFamily: Font.semibold, fontSize: 15, color: Colors.textPrimary },
  catRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catChange: { fontFamily: Font.bold, fontSize: 12 },
  catAmount: { fontFamily: Font.bold, fontSize: 15, color: Colors.textPrimary },
  track: { height: 8, borderRadius: 4, backgroundColor: Colors.primarySurface, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: Colors.primary },

  biggest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.primarySurface,
    borderRadius: Radius.md,
    padding: 12,
  },
  biggestIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  biggestLabel: { fontFamily: Font.medium, fontSize: 12, color: Colors.textSecondary },
  biggestValue: { fontFamily: Font.bold, fontSize: 14, color: Colors.textPrimary, marginTop: 1 },
});
