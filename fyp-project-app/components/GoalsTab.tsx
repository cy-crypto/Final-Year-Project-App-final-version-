import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Font, Radius, Shadows } from '../constants/theme';
import { getGoals, GoalDto } from '../services/budgetService';
import { toApiErrorMessage } from '../services/api';
import { daysUntil, formatMoney, goalIcon } from '../utils/budgetFormat';
import { ProgressRing } from './ProgressRing';
import { GoalFormModal } from './GoalFormModal';
import { GoalDetailModal } from './GoalDetailModal';

type Props = {
  currency: string;
  /** Bumped by the parent (pull-to-refresh) to force a reload. */
  reloadKey: number;
};

export function GoalsTab({ currency, reloadKey }: Props) {
  const navigation = useNavigation();
  const [goals, setGoals] = useState<GoalDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep only the id of the open goal so the sheet always shows fresh numbers after a reload.
  const [openId, setOpenId] = useState<string | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<GoalDto | null>(null);

  const load = useCallback(async () => {
    try {
      setGoals(await getGoals());
      setError(null);
    } catch (err) {
      setError(toApiErrorMessage(err, 'Failed to load goals'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  const openGoal = goals.find((g) => g.id === openId) ?? null;
  const totalSaved = goals.reduce((s, g) => s + g.savedAmount, 0);
  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const reached = goals.filter((g) => g.savedAmount >= g.targetAmount).length;

  const openCreate = () => {
    setEditing(null);
    setFormVisible(true);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      {goals.length > 0 && (
        <View style={styles.summary}>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Saved</Text>
            <Text style={styles.summaryValue}>{formatMoney(totalSaved)}</Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Target</Text>
            <Text style={styles.summaryValue}>{formatMoney(totalTarget)}</Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Reached</Text>
            <Text style={styles.summaryValue}>{reached}/{goals.length}</Text>
          </View>
        </View>
      )}

      {goals.map((g) => {
        const pct = g.targetAmount > 0 ? (g.savedAmount / g.targetAmount) * 100 : 0;
        const done = g.savedAmount >= g.targetAmount;
        const days = g.deadline ? daysUntil(g.deadline) : null;
        const late = !done && days !== null && days < 0;
        return (
          <Pressable
            key={g.id}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
            onPress={() => setOpenId(g.id)}
          >
            <ProgressRing size={64} stroke={7} percent={pct} color={done ? Colors.success : Colors.primary}>
              <Ionicons name={done ? 'checkmark' : goalIcon(g.icon)} size={22} color={done ? Colors.success : Colors.primary} />
            </ProgressRing>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>{g.name}</Text>
              <Text style={styles.cardMeta}>
                {currency} {formatMoney(g.savedAmount)} of {formatMoney(g.targetAmount)}
              </Text>
              <Text style={[styles.cardStatus, done && { color: Colors.success }, late && { color: Colors.error }]}>
                {done
                  ? 'Goal reached'
                  : days === null
                    ? `${Math.floor(pct)}% saved`
                    : late
                      ? 'Deadline passed'
                      : days === 0
                        ? 'Due today'
                        : `${Math.floor(pct)}% · ${days} day${days === 1 ? '' : 's'} left`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textHint} />
          </Pressable>
        );
      })}

      {goals.length === 0 && (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="flag-outline" size={34} color={Colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>No goals yet</Text>
          <Text style={styles.emptyText}>
            {error ?? 'Saving for Ummrah, a trip or an emergency fund? Create a goal and track every deposit.'}
          </Text>
        </View>
      )}

      <Pressable style={styles.addBtn} onPress={openCreate}>
        <Ionicons name="add" size={22} color={Colors.white} />
        <Text style={styles.addText}>New savings goal</Text>
      </Pressable>

      <GoalDetailModal
        goal={formVisible ? null : openGoal}
        currency={currency}
        onClose={() => setOpenId(null)}
        onChanged={load}
        onEdit={(g) => {
          setEditing(g);
          setFormVisible(true);
        }}
      />

      <GoalFormModal
        visible={formVisible}
        currency={currency}
        editing={editing}
        onClose={() => setFormVisible(false)}
        onSaved={() => {
          setFormVisible(false);
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
  card: {
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
  cardTitle: { fontFamily: Font.bold, fontSize: 16, color: Colors.textPrimary },
  cardMeta: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary },
  cardStatus: { fontFamily: Font.semibold, fontSize: 13, color: Colors.primary },
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
