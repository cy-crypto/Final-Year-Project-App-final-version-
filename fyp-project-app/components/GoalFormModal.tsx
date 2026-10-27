import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Font, Radius, Shadows } from '../constants/theme';
import { createGoal, GoalDto, updateGoal } from '../services/budgetService';
import { toApiErrorMessage } from '../services/api';
import { formatDateLong, GOAL_ICONS, toDateStr } from '../utils/budgetFormat';

type Props = {
  visible: boolean;
  currency: string;
  /** Goal being edited, or null to create one. */
  editing: GoalDto | null;
  onClose: () => void;
  onSaved: () => void;
};

export function GoalFormModal({ visible, currency, editing, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('flag');
  const [target, setTarget] = useState('');
  const [deadline, setDeadline] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(editing?.name ?? '');
    setIcon(editing?.icon ?? 'flag');
    setTarget(editing ? String(editing.targetAmount) : '');
    setDeadline(editing?.deadline ?? null);
    setShowPicker(false);
    setError(null);
  }, [visible, editing]);

  const handleSave = async () => {
    const trimmed = name.trim();
    const amount = Number(target.trim());
    if (!trimmed) {
      setError('Give your goal a name.');
      return;
    }
    if (!target.trim() || Number.isNaN(amount) || amount <= 0) {
      setError('Target must be greater than 0.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = { name: trimmed, icon, targetAmount: String(amount), deadline };
      if (editing) await updateGoal(editing.id, payload);
      else await createGoal(payload);
      onSaved();
    } catch (err) {
      setError(toApiErrorMessage(err, 'Failed to save goal'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{editing ? 'Edit goal' : 'New savings goal'}</Text>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>What are you saving for?</Text>
            <View style={styles.chips}>
              {GOAL_ICONS.map((g) => (
                <Pressable
                  key={g.key}
                  style={[styles.iconChip, icon === g.key && styles.iconChipActive]}
                  onPress={() => {
                    setIcon(g.key);
                    if (!name.trim() && g.key !== 'flag') setName(g.label);
                  }}
                >
                  <Ionicons name={g.icon} size={20} color={icon === g.key ? Colors.white : Colors.primary} />
                  <Text style={[styles.iconChipText, icon === g.key && { color: Colors.white }]}>{g.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { marginTop: 14 }]}>Goal name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Ummrah 2027"
              placeholderTextColor={Colors.textHint}
              value={name}
              onChangeText={setName}
            />

            <Text style={[styles.label, { marginTop: 14 }]}>Target amount ({currency})</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 500000"
              placeholderTextColor={Colors.textHint}
              keyboardType="decimal-pad"
              value={target}
              onChangeText={setTarget}
            />

            <Text style={[styles.label, { marginTop: 14 }]}>Deadline (optional)</Text>
            <View style={styles.dateRow}>
              <Pressable style={[styles.input, styles.dateBtn]} onPress={() => setShowPicker(true)}>
                <Ionicons name="calendar-outline" size={18} color={Colors.textSecondary} />
                <Text style={[styles.dateText, !deadline && { color: Colors.textHint }]}>
                  {deadline ? formatDateLong(deadline) : 'No deadline'}
                </Text>
              </Pressable>
              {deadline ? (
                <Pressable onPress={() => setDeadline(null)} hitSlop={10}>
                  <Ionicons name="close-circle" size={24} color={Colors.textHint} />
                </Pressable>
              ) : null}
            </View>

            {showPicker && (
              <DateTimePicker
                value={deadline ? new Date(`${deadline}T00:00:00`) : new Date()}
                mode="date"
                minimumDate={new Date()}
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(event: any, selected?: Date) => {
                  setShowPicker(false);
                  if (event.type === 'set' && selected) setDeadline(toDateStr(selected));
                }}
              />
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable style={[styles.save, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.saveText}>{editing ? 'Save changes' : 'Create goal'}</Text>
              )}
            </Pressable>
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
    maxHeight: '90%',
  },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.borderLight, marginBottom: 14 },
  title: { fontFamily: Font.extrabold, fontSize: 22, color: Colors.textPrimary, marginBottom: 16 },
  label: { fontFamily: Font.bold, fontSize: 15, color: Colors.textSecondary, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.surfaceLight,
  },
  iconChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  iconChipText: { fontFamily: Font.semibold, fontSize: 14, color: Colors.textSecondary },
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
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateText: { fontFamily: Font.medium, fontSize: 16, color: Colors.textPrimary },
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
});
