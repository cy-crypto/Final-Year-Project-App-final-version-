import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Font, Radius, Shadows } from '../constants/theme';
import { CategoryBudgetDto, getCategoryBudgets } from '../services/budgetService';
import { toApiErrorMessage } from '../services/api';
import { budgetState, categoryIcon, formatMoney } from '../utils/budgetFormat';
import { CategoryBudgetModal } from './CategoryBudgetModal';

type Props = {
  currency: string;
  /** Bumped by the parent (pull-to-refresh) to force a reload. */
  reloadKey: number;
};

const STATE_COLOR = {
  ok: Colors.success,
  warning: Colors.accentAmber,
  exceeded: Colors.error,
} as const;

export function BudgetsTab({ currency, reloadKey }: Props) {
  const navigation = useNavigation();
  const [budgets, setBudgets] = useState<CategoryBudgetDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<CategoryBudgetDto | null>(null);

  const load = useCallback(async () => {
    try {
      setBudgets(await getCategoryBudgets());
      setError(null);
    } catch (err) {
      setError(toApiErrorMessage(err, 'Failed to load budgets'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  const openAdd = () => {
    setEditing(null);
    setModalVisible(true);
  };

  const openEdit = (b: CategoryBudgetDto) => {
    setEditing(b);
    setModalVisible(true);
  };

  const totalLimit = budgets.reduce((s, b) => s + b.monthlyLimit, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const remaining = totalLimit - totalSpent;
  const overCount = budgets.filter((b) => budgetState(b.spent, b.monthlyLimit) === 'exceeded').length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      {budgets.length > 0 && (
        <View style={styles.summary}>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Budgeted</Text>
            <Text style={styles.summaryValue}>{formatMoney(totalLimit)}</Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Spent</Text>
            <Text style={styles.summaryValue}>{formatMoney(totalSpent)}</Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>{remaining < 0 ? 'Over by' : 'Left'}</Text>
            <Text style={[styles.summaryValue, remaining < 0 && { color: Colors.error }]}>
              {formatMoney(remaining)}
            </Text>
          </View>
        </View>
      )}

      {overCount > 0 && (
        <View style={styles.banner}>
          <Ionicons name="warning" size={18} color={Colors.error} />
          <Text style={styles.bannerText}>
            {overCount} categor{overCount === 1 ? 'y is' : 'ies are'} over budget this month.
          </Text>
        </View>
      )}

      {budgets.map((b) => {
        const state = budgetState(b.spent, b.monthlyLimit);
        const color = STATE_COLOR[state];
        const pct = b.monthlyLimit > 0 ? (b.spent / b.monthlyLimit) * 100 : 0;
        const left = b.monthlyLimit - b.spent;
        return (
          <Pressable
            key={b.id}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
            onPress={() => openEdit(b)}
          >
            <View style={styles.cardTop}>
              <View style={styles.icon}>
                <Ionicons name={categoryIcon(b.category, 'expense')} size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>{b.category}</Text>
                <Text style={styles.cardMeta}>
                  {currency} {formatMoney(b.spent)} of {formatMoney(b.monthlyLimit)}
                </Text>
              </View>
              <Text style={[styles.pct, { color }]}>{Math.round(pct)}%</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.min(pct, 100)}%`, backgroundColor: color }]} />
            </View>
            <Text style={[styles.status, { color: state === 'ok' ? Colors.textSecondary : color }]}>
              {state === 'exceeded'
                ? `Over budget by ${currency} ${formatMoney(-left)}`
                : state === 'warning'
                  ? `Almost there — ${currency} ${formatMoney(left)} left`
                  : `${currency} ${formatMoney(left)} left this month`}
            </Text>
          </Pressable>
        );
      })}

      {budgets.length === 0 && (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="pie-chart-outline" size={34} color={Colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>No category budgets yet</Text>
          <Text style={styles.emptyText}>
            {error ?? 'Set a monthly limit for Food, Transport and more. We will warn you before you overspend.'}
          </Text>
        </View>
      )}

      <Pressable style={styles.addBtn} onPress={openAdd}>
        <Ionicons name="add" size={22} color={Colors.white} />
        <Text style={styles.addText}>Add category budget</Text>
      </Pressable>

      <CategoryBudgetModal
        visible={modalVisible}
        currency={currency}
        editing={editing}
        takenCategories={budgets.map((b) => b.category)}
        onClose={() => setModalVisible(false)}
        onSaved={() => {
          setModalVisible(false);
          load();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 48, alignItems: 'center' },
  summary: {
    flexDirection: 'row',
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 8,
    ...Shadows.button,
  },
  summaryCol: { flex: 1, alignItems: 'center', gap: 2 },
  summaryLabel: { fontFamily: Font.medium, fontSize: 13, color: 'rgba(255,255,255,0.9)' },
  summaryValue: { fontFamily: Font.extrabold, fontSize: 18, color: Colors.white },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.tintRose,
    borderRadius: Radius.md,
    padding: 12,
  },
  bannerText: { flex: 1, fontFamily: Font.semibold, fontSize: 14, color: Colors.error },
  card: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 12,
    gap: 10,
    ...Shadows.card,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: Font.bold, fontSize: 16, color: Colors.textPrimary },
  cardMeta: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary },
  pct: { fontFamily: Font.extrabold, fontSize: 16 },
  track: { height: 8, borderRadius: 4, backgroundColor: Colors.tintSlate, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  status: { fontFamily: Font.semibold, fontSize: 13 },
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    ...Shadows.button,
  },
  addText: { fontFamily: Font.bold, fontSize: 16, color: Colors.white },
});
