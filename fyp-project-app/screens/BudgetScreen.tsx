import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import {
  getSettings,
  getSubscriptions,
  getTransactions,
  BudgetSettingsDto,
  SubscriptionDto,
  TransactionDto,
} from '../services/budgetService';
import { toApiErrorMessage } from '../services/api';
import { Colors, Font, Radius, Shadows } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';
import { CategoryDonut } from '../components/CategoryDonut';
import { TransactionRow } from '../components/TransactionRow';
import { BudgetsTab } from '../components/BudgetsTab';
import { GoalsTab } from '../components/GoalsTab';
import { InsightsTab } from '../components/InsightsTab';
import { ReportModal } from '../components/ReportModal';
import { currentMonthRange, formatMoney } from '../utils/budgetFormat';
import { dueInfo, monthlyEquivalent } from '../utils/subscriptions';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type TabKey = 'overview' | 'budgets' | 'goals' | 'insights';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'budgets', label: 'Budgets' },
  { key: 'goals', label: 'Goals' },
  { key: 'insights', label: 'Insights' },
];

export function BudgetScreen() {
  const navigation = useNavigation<Nav>();

  const [tab, setTab] = useState<TabKey>('overview');
  const [monthTxns, setMonthTxns] = useState<TransactionDto[]>([]);
  const [settings, setSettings] = useState<BudgetSettingsDto | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [reportVisible, setReportVisible] = useState(false);

  const load = useCallback(async () => {
    try {
      const { from, to } = currentMonthRange();
      const [txns, cfg, subs] = await Promise.all([
        getTransactions({ dateFrom: from, dateTo: to }),
        getSettings().catch(() => null),
        getSubscriptions().catch(() => [] as SubscriptionDto[]),
      ]);
      setMonthTxns(txns);
      setSettings(cfg);
      setSubscriptions(subs);
      setError(null);
    } catch (err) {
      setError(toApiErrorMessage(err, 'Failed to load budget'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', load);
    return unsubscribe;
  }, [navigation, load]);

  const currency = settings?.currency ?? 'PKR';
  const monthlyLimit = settings?.monthlyLimit ? Number(settings.monthlyLimit) : null;

  const { income, expense, donutRows } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    const byCategory = new Map<string, number>();
    monthTxns.forEach((t) => {
      const amount = Number(t.amount);
      if (t.type === 'income') {
        inc += amount;
      } else {
        exp += amount;
        const name = t.category?.trim() || 'Other';
        byCategory.set(name, (byCategory.get(name) ?? 0) + amount);
      }
    });
    return {
      income: inc,
      expense: exp,
      donutRows: Array.from(byCategory, ([label, value]) => ({ label, value })),
    };
  }, [monthTxns]);

  const activeSubs = subscriptions.filter((s) => s.isActive).sort((a, b) => (a.nextDueDate < b.nextDueDate ? -1 : 1));
  const subsMonthly = activeSubs.reduce((sum, s) => sum + monthlyEquivalent(s.amount, s.frequency), 0);
  const nextSub = activeSubs[0];
  const net = income - expense;
  const limitPct = monthlyLimit ? Math.min((expense / monthlyLimit) * 100, 100) : 0;
  const overLimit = monthlyLimit !== null && expense > monthlyLimit;
  const monthName = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const openTransaction = (t: TransactionDto) => navigation.navigate('AddTransaction', { transaction: t });

  const renderOverview = () => (
    <>
      {/* Balance hero */}
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>{monthName} · Net balance</Text>
        <Text style={styles.heroValue}>
          {net < 0 ? '-' : ''}
          {currency} {formatMoney(net)}
        </Text>
        <View style={styles.heroRow}>
          <View style={styles.heroStat}>
            <View style={styles.heroIcon}>
              <Ionicons name="arrow-down" size={16} color={Colors.primary} />
            </View>
            <View>
              <Text style={styles.heroStatLabel}>Income</Text>
              <Text style={styles.heroStatValue}>{formatMoney(income)}</Text>
            </View>
          </View>
          <View style={styles.heroStat}>
            <View style={styles.heroIcon}>
              <Ionicons name="arrow-up" size={16} color={Colors.primary} />
            </View>
            <View>
              <Text style={styles.heroStatLabel}>Expenses</Text>
              <Text style={styles.heroStatValue}>{formatMoney(expense)}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Monthly limit */}
      {monthlyLimit ? (
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Monthly limit</Text>
            <Text style={[styles.limitPct, overLimit && { color: Colors.error }]}>
              {Math.round((expense / monthlyLimit) * 100)}%
            </Text>
          </View>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                { width: `${limitPct}%`, backgroundColor: overLimit ? Colors.error : Colors.primary },
              ]}
            />
          </View>
          <Text style={styles.limitText}>
            {currency} {formatMoney(expense)} of {formatMoney(monthlyLimit)}
            {overLimit ? ` · over by ${formatMoney(expense - monthlyLimit)}` : ''}
          </Text>
        </View>
      ) : null}

      {/* Subscriptions entry */}
      <Pressable style={({ pressed }) => [styles.subsCard, pressed && { opacity: 0.85 }]} onPress={() => navigation.navigate('Subscriptions')}>
        <View style={styles.subsIcon}>
          <Ionicons name="repeat" size={22} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.subsTitle}>Subscriptions & bills</Text>
          <Text style={styles.subsMeta} numberOfLines={1}>
            {activeSubs.length === 0
              ? 'Add recurring payments and get reminded'
              : `${activeSubs.length} active · ${currency} ${formatMoney(subsMonthly)}/month`}
          </Text>
          {nextSub ? (
            <Text style={[styles.subsNext, dueInfo(nextSub.nextDueDate).status === 'overdue' && { color: Colors.error }]} numberOfLines={1}>
              Next: {nextSub.name} · {dueInfo(nextSub.nextDueDate).text.toLowerCase()}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.textHint} />
      </Pressable>

      {/* Spending donut */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Spending by category</Text>
        <CategoryDonut rows={donutRows} currency={currency} />
      </View>

      {/* Recent */}
      <View style={styles.rowBetween}>
        <Text style={styles.sectionTitle}>Recent transactions</Text>
        <Pressable onPress={() => navigation.navigate('Transactions')} hitSlop={8}>
          <Text style={styles.link}>See all</Text>
        </Pressable>
      </View>
      {monthTxns.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>{error ?? 'No transactions this month yet. Tap + to add one.'}</Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {monthTxns.slice(0, 5).map((t) => (
            <TransactionRow key={t.id} item={t} currency={currency} onPress={() => openTransaction(t)} />
          ))}
        </View>
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {navigation.canGoBack() ? (
          <Pressable style={styles.iconBtn} onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Budget</Text>
          <Text style={styles.subtitle}>Your money, under control.</Text>
        </View>
        <Pressable style={styles.iconBtn} onPress={() => setReportVisible(true)} hitSlop={8}>
          <Ionicons name="document-text-outline" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={() => navigation.navigate('BudgetSettings')} hitSlop={8}>
          <Ionicons name="settings-outline" size={24} color={Colors.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                setReloadKey((k) => k + 1);
                load();
              }}
              tintColor={Colors.primary}
            />
          }
        >
          {tab === 'overview' ? (
            renderOverview()
          ) : tab === 'budgets' ? (
            <BudgetsTab currency={currency} reloadKey={reloadKey} />
          ) : tab === 'goals' ? (
            <GoalsTab currency={currency} reloadKey={reloadKey} />
          ) : (
            <InsightsTab currency={currency} monthlyLimit={monthlyLimit} reloadKey={reloadKey} />
          )}
        </ScrollView>
      )}

      {tab === 'overview' && (
        <Pressable style={styles.fab} onPress={() => navigation.navigate('AddTransaction')}>
          <Ionicons name="add" size={32} color={Colors.white} />
        </Pressable>
      )}
      <ReportModal visible={reportVisible} onClose={() => setReportVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Font.extrabold, fontSize: 28, color: Colors.textPrimary, letterSpacing: -0.4, paddingLeft: 4 },
  subtitle: { fontFamily: Font.medium, fontSize: 15, color: Colors.textSecondary, paddingLeft: 4 },

  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    padding: 4,
    borderRadius: Radius.pill,
    backgroundColor: Colors.tintSlate,
    marginBottom: 12,
  },
  tab: { flex: 1, height: 42, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: Colors.primary, ...Shadows.button },
  tabText: { fontFamily: Font.semibold, fontSize: 14, color: Colors.textSecondary },
  tabTextActive: { color: Colors.white, fontFamily: Font.bold },

  content: { paddingHorizontal: 16, paddingBottom: 120, gap: 14 },

  hero: { backgroundColor: Colors.primary, borderRadius: Radius.xl, padding: 16, gap: 4, ...Shadows.button },
  heroLabel: { fontFamily: Font.semibold, fontSize: 14, color: 'rgba(255,255,255,0.9)' },
  heroValue: { fontFamily: Font.extrabold, fontSize: 30, color: Colors.white, letterSpacing: -0.6 },
  heroRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  heroStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: Radius.md,
    padding: 10,
  },
  heroIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  heroStatLabel: { fontFamily: Font.medium, fontSize: 12, color: 'rgba(255,255,255,0.9)' },
  heroStatValue: { fontFamily: Font.extrabold, fontSize: 16, color: Colors.white },

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
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  limitPct: { fontFamily: Font.extrabold, fontSize: 17, color: Colors.primary },
  track: { height: 10, borderRadius: 5, backgroundColor: Colors.primarySurface, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
  limitText: { fontFamily: Font.medium, fontSize: 14, color: Colors.textSecondary },

  sectionTitle: { fontFamily: Font.extrabold, fontSize: 18, color: Colors.textPrimary },
  link: { fontFamily: Font.bold, fontSize: 15, color: Colors.primary },
  emptyText: { fontFamily: Font.medium, fontSize: 15, lineHeight: 22, color: Colors.textSecondary, textAlign: 'center' },

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
  subsIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  subsTitle: { fontFamily: Font.bold, fontSize: 16, color: Colors.textPrimary },
  subsMeta: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary },
  subsNext: { fontFamily: Font.semibold, fontSize: 13, color: Colors.primary, marginTop: 1 },

  fab: {
    position: 'absolute',
    right: 24,
    bottom: 28,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.button,
  },
});
