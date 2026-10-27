import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Font, Radius, Shadows } from '../constants/theme';
import {
  createSubscription,
  deleteSubscription,
  SubscriptionDto,
  SubscriptionFrequency,
  updateSubscription,
} from '../services/budgetService';
import { toApiErrorMessage } from '../services/api';
import { DEFAULT_CATEGORIES, formatDateLong, toDateStr } from '../utils/budgetFormat';
import { FREQUENCY_LABEL } from '../utils/subscriptions';

type Props = {
  visible: boolean;
  currency: string;
  /** Subscription being edited, or null to add one. */
  editing: SubscriptionDto | null;
  onClose: () => void;
  onSaved: () => void;
};

const FREQUENCIES: SubscriptionFrequency[] = ['weekly', 'monthly', 'yearly'];
// "Other" is a poor category for a recurring bill; Bills/Entertainment etc. are more useful chips.
const CATEGORY_CHIPS = DEFAULT_CATEGORIES.filter((c) => c !== 'Other');

export function SubscriptionFormModal({ visible, currency, editing, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [frequency, setFrequency] = useState<SubscriptionFrequency>('monthly');
  const [dueDate, setDueDate] = useState(toDateStr(new Date()));
  const [isActive, setIsActive] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(editing?.name ?? '');
    setAmount(editing ? String(editing.amount) : '');
    setCategory(editing?.category ?? '');
    setFrequency(editing?.frequency ?? 'monthly');
    setDueDate(editing?.nextDueDate ?? toDateStr(new Date()));
    setIsActive(editing?.isActive ?? true);
    setShowPicker(false);
    setError(null);
  }, [visible, editing]);

  const handleSave = async () => {
    const trimmed = name.trim();
    const value = Number(amount.trim());
    if (!trimmed) {
      setError('Give the subscription a name.');
      return;
    }
    if (!amount.trim() || Number.isNaN(value) || value <= 0) {
      setError('Amount must be greater than 0.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: trimmed,
        amount: String(value),
        category: category.trim() || null,
        frequency,
        nextDueDate: dueDate,
        isActive,
      };
      if (editing) await updateSubscription(editing.id, payload);
      else await createSubscription(payload);
      onSaved();
    } catch (err) {
      setError(toApiErrorMessage(err, 'Failed to save subscription'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!editing) return;
    Alert.alert('Delete subscription', `Stop tracking ${editing.name}? Past expenses stay in your history.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSubscription(editing.id);
            onSaved();
          } catch (err) {
            setError(toApiErrorMessage(err, 'Failed to delete subscription'));
          }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{editing ? 'Edit subscription' : 'New subscription'}</Text>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Netflix, Rent, Gym"
              placeholderTextColor={Colors.textHint}
              value={name}
              onChangeText={setName}
            />

            <Text style={[styles.label, styles.gap]}>Amount ({currency})</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 1500"
              placeholderTextColor={Colors.textHint}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />

            <Text style={[styles.label, styles.gap]}>Repeats</Text>
            <View style={styles.chips}>
              {FREQUENCIES.map((f) => (
                <Pressable
                  key={f}
                  style={[styles.chip, frequency === f && styles.chipActive]}
                  onPress={() => setFrequency(f)}
                >
                  <Text style={[styles.chipText, frequency === f && styles.chipTextActive]}>{FREQUENCY_LABEL[f]}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, styles.gap]}>Next due date</Text>
            <Pressable style={[styles.input, styles.dateBtn]} onPress={() => setShowPicker(true)}>
              <Ionicons name="calendar-outline" size={18} color={Colors.textSecondary} />
              <Text style={styles.dateText}>{formatDateLong(dueDate)}</Text>
            </Pressable>
            {showPicker && (
              <DateTimePicker
                value={new Date(`${dueDate}T00:00:00`)}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(event: any, selected?: Date) => {
                  setShowPicker(false);
                  if (event.type === 'set' && selected) setDueDate(toDateStr(selected));
                }}
              />
            )}

            <Text style={[styles.label, styles.gap]}>Category (used when you mark it paid)</Text>
            <View style={styles.chips}>
              {CATEGORY_CHIPS.map((c) => {
                const active = category.trim().toLowerCase() === c.toLowerCase();
                return (
                  <Pressable key={c} style={[styles.chip, active && styles.chipActive]} onPress={() => setCategory(active ? '' : c)}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.reminder}>
              <Ionicons name="notifications" size={18} color={Colors.primary} />
              <Text style={styles.reminderText}>You will be reminded one day before each due date.</Text>
            </View>

            {editing ? (
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Active</Text>
                  <Text style={styles.switchHint}>Pause to stop reminders without deleting.</Text>
                </View>
                <Switch
                  value={isActive}
                  onValueChange={setIsActive}
                  trackColor={{ true: Colors.primary, false: Colors.borderLight }}
                  thumbColor={Colors.white}
                />
              </View>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable style={[styles.save, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.saveText}>{editing ? 'Save changes' : 'Add subscription'}</Text>
              )}
            </Pressable>

            {editing ? (
              <Pressable style={styles.remove} onPress={handleDelete}>
                <Text style={styles.removeText}>Delete subscription</Text>
              </Pressable>
            ) : null}
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
  title: { fontFamily: Font.extrabold, fontSize: 22, color: Colors.textPrimary, marginBottom: 16 },
  label: { fontFamily: Font.bold, fontSize: 15, color: Colors.textSecondary, marginBottom: 8 },
  gap: { marginTop: 14 },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgLight,
    paddingHorizontal: 14,
    fontFamily: Font.medium,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateText: { fontFamily: Font.medium, fontSize: 16, color: Colors.textPrimary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    height: 38,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontFamily: Font.semibold, fontSize: 14, color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },
  reminder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.primarySurface,
    borderRadius: Radius.md,
    padding: 12,
    marginTop: 16,
  },
  reminderText: { flex: 1, fontFamily: Font.semibold, fontSize: 13, color: Colors.textPrimary },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  switchTitle: { fontFamily: Font.bold, fontSize: 16, color: Colors.textPrimary },
  switchHint: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary },
  error: { fontFamily: Font.semibold, fontSize: 14, color: Colors.error, marginTop: 12 },
  save: {
    height: 54,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    ...Shadows.button,
  },
  saveText: { fontFamily: Font.bold, fontSize: 17, color: Colors.white },
  remove: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  removeText: { fontFamily: Font.bold, fontSize: 15, color: Colors.error },
});
