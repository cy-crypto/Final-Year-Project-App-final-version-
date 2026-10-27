import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Font, Radius, Shadows } from '../constants/theme';
import {
  addGoalContribution,
  deleteGoal,
  deleteGoalContribution,
  getGoalContributions,
  GoalContributionDto,
  GoalDto,
} from '../services/budgetService';
import { toApiErrorMessage } from '../services/api';
import { daysUntil, formatDateLong, formatMoney, goalIcon, toDateStr } from '../utils/budgetFormat';
import { ProgressRing } from './ProgressRing';

type Props = {
  goal: GoalDto | null;
  currency: string;
  onClose: () => void;
  /** Called after any change so the list can reload. */
  onChanged: () => void;
  onEdit: (goal: GoalDto) => void;
};

export function GoalDetailModal({ goal, currency, onClose, onChanged, onEdit }: Props) {
  const [history, setHistory] = useState<GoalContributionDto[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goalId = goal?.id;

  const loadHistory = useCallback(async () => {
    if (!goalId) return;
    setLoadingHistory(true);
    try {
      setHistory(await getGoalContributions(goalId));
    } catch {
      // history is secondary — leave the list as is
    } finally {
      setLoadingHistory(false);
    }
  }, [goalId]);

  useEffect(() => {
    setAmount('');
    setNote('');
    setError(null);
    setHistory([]);
    if (goalId) loadHistory();
  }, [goalId, loadHistory]);

  if (!goal) return null;

  const pct = goal.targetAmount > 0 ? (goal.savedAmount / goal.targetAmount) * 100 : 0;
  const remaining = Math.max(goal.targetAmount - goal.savedAmount, 0);
  const done = goal.savedAmount >= goal.targetAmount;
  const days = goal.deadline ? daysUntil(goal.deadline) : null;
  const monthsLeft = days !== null && days > 0 ? Math.max(1, Math.ceil(days / 30)) : null;

  const handleAdd = async () => {
    const value = Number(amount.trim());
    if (!amount.trim() || Number.isNaN(value) || value <= 0) {
      setError('Enter an amount greater than 0.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addGoalContribution(goal.id, {
        amount: String(value),
        note: note.trim() || undefined,
        date: toDateStr(new Date()),
      });
      setAmount('');
      setNote('');
      await loadHistory();
      onChanged();
    } catch (err) {
      setError(toApiErrorMessage(err, 'Failed to add money'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveContribution = (c: GoalContributionDto) => {
    Alert.alert('Remove deposit', `Remove ${currency} ${formatMoney(c.amount)} from this goal?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteGoalContribution(goal.id, c.id);
            await loadHistory();
            onChanged();
          } catch (err) {
            setError(toApiErrorMessage(err, 'Failed to remove deposit'));
          }
        },
      },
    ]);
  };

  const handleDeleteGoal = () => {
    Alert.alert('Delete goal', `Delete "${goal.name}" and its deposit history?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteGoal(goal.id);
            onChanged();
            onClose();
          } catch (err) {
            setError(toApiErrorMessage(err, 'Failed to delete goal'));
          }
        },
      },
    ]);
  };

  const deadlineText =
    days === null
      ? 'No deadline'
      : days < 0
        ? `Deadline passed (${formatDateLong(goal.deadline as string)})`
        : days === 0
          ? 'Due today'
          : `${days} day${days === 1 ? '' : 's'} left · ${formatDateLong(goal.deadline as string)}`;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <View style={styles.headerIcon}>
                <Ionicons name={goalIcon(goal.icon)} size={22} color={Colors.primary} />
              </View>
              <Text style={styles.title} numberOfLines={1}>{goal.name}</Text>
              <Pressable onPress={() => onEdit(goal)} hitSlop={10} style={styles.headerBtn}>
                <Ionicons name="create-outline" size={22} color={Colors.textPrimary} />
              </Pressable>
              <Pressable onPress={handleDeleteGoal} hitSlop={10} style={styles.headerBtn}>
                <Ionicons name="trash-outline" size={22} color={Colors.error} />
              </Pressable>
            </View>

            <View style={styles.ringRow}>
              <ProgressRing size={120} stroke={13} percent={pct} color={done ? Colors.success : Colors.primary}>
                <Text style={styles.ringPct}>{Math.floor(pct)}%</Text>
                <Text style={styles.ringSub}>{done ? 'reached' : 'saved'}</Text>
              </ProgressRing>
              <View style={styles.ringInfo}>
                <Text style={styles.infoLabel}>Saved</Text>
                <Text style={styles.infoValue}>{currency} {formatMoney(goal.savedAmount)}</Text>
                <Text style={styles.infoLabel}>Target</Text>
                <Text style={styles.infoValueSm}>{currency} {formatMoney(goal.targetAmount)}</Text>
              </View>
            </View>

            <View style={styles.infoCard}>
              <Ionicons name={done ? 'checkmark-circle' : 'time-outline'} size={20} color={done ? Colors.success : Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoCardTitle}>
                  {done ? 'Goal reached — congratulations!' : `${currency} ${formatMoney(remaining)} to go`}
                </Text>
                <Text style={styles.infoCardText}>{deadlineText}</Text>
                {!done && monthsLeft ? (
                  <Text style={styles.infoCardText}>
                    Save about {currency} {formatMoney(remaining / monthsLeft)} a month to make it.
                  </Text>
                ) : null}
              </View>
            </View>

            <Text style={styles.section}>Add money</Text>
            <View style={styles.addRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Amount"
                placeholderTextColor={Colors.textHint}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
              />
              <Pressable style={[styles.addBtn, saving && { opacity: 0.7 }]} onPress={handleAdd} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.white} /> : <Ionicons name="add" size={26} color={Colors.white} />}
              </Pressable>
            </View>
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              placeholder="Note (optional)"
              placeholderTextColor={Colors.textHint}
              value={note}
              onChangeText={setNote}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Text style={[styles.section, { marginTop: 18 }]}>History</Text>
            {loadingHistory && history.length === 0 ? (
              <ActivityIndicator color={Colors.primary} style={{ marginVertical: 12 }} />
            ) : history.length === 0 ? (
              <Text style={styles.empty}>No deposits yet. Add your first one above.</Text>
            ) : (
              history.map((c) => (
                <View key={c.id} style={styles.historyRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyAmount}>+{currency} {formatMoney(c.amount)}</Text>
                    <Text style={styles.historyMeta} numberOfLines={1}>
                      {formatDateLong(c.date)}
                      {c.note ? ` · ${c.note}` : ''}
                    </Text>
                  </View>
                  <Pressable onPress={() => handleRemoveContribution(c)} hitSlop={10}>
                    <Ionicons name="close-circle-outline" size={22} color={Colors.textHint} />
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.surfaceLight,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 28,
    maxHeight: '92%',
  },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.borderLight, marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  headerIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: Font.extrabold, fontSize: 21, color: Colors.textPrimary },
  headerBtn: { padding: 4 },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 14 },
  ringPct: { fontFamily: Font.extrabold, fontSize: 26, color: Colors.textPrimary },
  ringSub: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary },
  ringInfo: { flex: 1, gap: 2 },
  infoLabel: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary },
  infoValue: { fontFamily: Font.extrabold, fontSize: 22, color: Colors.primary, marginBottom: 6 },
  infoValueSm: { fontFamily: Font.bold, fontSize: 16, color: Colors.textPrimary },
  infoCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: Colors.primarySurface,
    borderRadius: Radius.md,
    padding: 12,
    marginBottom: 18,
  },
  infoCardTitle: { fontFamily: Font.bold, fontSize: 15, color: Colors.textPrimary },
  infoCardText: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  section: { fontFamily: Font.extrabold, fontSize: 17, color: Colors.textPrimary, marginBottom: 10 },
  addRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgLight,
    paddingHorizontal: 14,
    fontFamily: Font.medium,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  addBtn: { width: 50, height: 50, borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', ...Shadows.button },
  error: { fontFamily: Font.semibold, fontSize: 14, color: Colors.error, marginTop: 10 },
  empty: { fontFamily: Font.medium, fontSize: 14, color: Colors.textSecondary, paddingVertical: 8 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSoft,
  },
  historyAmount: { fontFamily: Font.bold, fontSize: 15, color: Colors.success },
  historyMeta: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary, marginTop: 1 },
});
