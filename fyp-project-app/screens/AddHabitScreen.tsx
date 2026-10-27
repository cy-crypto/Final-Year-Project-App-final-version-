import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useAppContext } from '../context/AppContext';
import { Colors, Font, Radius } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';
import { HABIT_CATEGORIES, type HabitCategory, type HabitFrequency } from '../services/habitService';
import { ensureNotificationPermission } from '../services/reminderService';
import { DateTimeInput } from '../components/module/DateTimeInput';
import {
  ErrorText,
  Field,
  FormCard,
  FormHeader,
  Input,
  PrimaryButton,
  SecondaryButton,
  Segmented,
  ToggleRow,
  moduleStyles,
} from '../components/module/ModuleUI';
import { CATEGORY_META, HABIT_SUGGESTIONS } from '../utils/habitFormat';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'AddHabit'>;

function timeToDate(hhmm: string | null) {
  const d = new Date();
  const [h, m] = (hhmm ?? '08:00').split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

export function AddHabitScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { habits, addHabit, saveHabit, deleteHabit } = useAppContext();
  const editing = habits.find((h) => h.id === params?.habitId) ?? null;
  const preset = HABIT_SUGGESTIONS.find((s) => s.name === params?.preset);

  const [name, setName] = useState(editing?.name ?? preset?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [category, setCategory] = useState<HabitCategory>(editing?.category ?? preset?.category ?? 'Health');
  const [frequency, setFrequency] = useState<HabitFrequency>(editing?.frequency ?? preset?.frequency ?? 'Daily');
  const [target, setTarget] = useState(editing?.targetPerWeek ?? preset?.target ?? 3);
  const [reminderOn, setReminderOn] = useState(Boolean(editing?.reminderTime));
  const [reminder, setReminder] = useState<Date>(timeToDate(editing?.reminderTime ?? null));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const applySuggestion = (s: (typeof HABIT_SUGGESTIONS)[number]) => {
    setName(s.name);
    setCategory(s.category);
    setFrequency(s.frequency);
    if (s.target) setTarget(s.target);
  };

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Give your habit a name.');
      return;
    }
    if (reminderOn) await ensureNotificationPermission();
    const payload = {
      name: name.trim(),
      description: description.trim(),
      category,
      frequency,
      target_per_week: frequency === 'Weekly' ? target : 1,
      reminder_time: reminderOn
        ? `${String(reminder.getHours()).padStart(2, '0')}:${String(reminder.getMinutes()).padStart(2, '0')}`
        : null,
    };
    setSaving(true);
    const saved = editing ? await saveHabit(editing.id, payload) : await addHabit(payload);
    setSaving(false);
    if (saved) navigation.goBack();
    else setError('Could not save the habit. Check your connection and try again.');
  };

  const handleDelete = () =>
    editing &&
    Alert.alert('Delete habit', `Delete "${editing.name}" and all its history?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteHabit(editing.id);
          navigation.pop(navigation.getState().routes.some((r) => r.name === 'HabitDetail') ? 2 : 1);
        },
      },
    ]);

  return (
    <SafeAreaView style={moduleStyles.container}>
      <FormHeader title={editing ? 'Edit Habit' : 'New Habit'} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={moduleStyles.formContent} keyboardShouldPersistTaps="handled">
          {!editing ? (
            <View style={{ gap: 8 }}>
              <Text style={[styles.label, { paddingHorizontal: 16 }]}>Quick start</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestions}>
                {HABIT_SUGGESTIONS.map((s) => {
                  const active = name === s.name;
                  return (
                    <Pressable key={s.name} style={[styles.suggestion, active && styles.suggestionActive]} onPress={() => applySuggestion(s)}>
                      <Ionicons name={CATEGORY_META[s.category].icon} size={15} color={active ? Colors.white : CATEGORY_META[s.category].color} />
                      <Text style={[styles.suggestionText, active && { color: Colors.white }]}>{s.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          <FormCard>
            <Field label="Habit name">
              <Input placeholder="e.g. Read 20 minutes" value={name} onChangeText={setName} maxLength={255} />
            </Field>
            <Field label="Why it matters (optional)">
              <Input placeholder="e.g. To finish one book a month" multiline value={description} onChangeText={setDescription} />
            </Field>
            <Field label="Category">
              <View style={styles.categories}>
                {HABIT_CATEGORIES.map((c) => {
                  const meta = CATEGORY_META[c];
                  const active = category === c;
                  return (
                    <Pressable
                      key={c}
                      style={[styles.category, active && { borderColor: meta.color, backgroundColor: meta.bg }]}
                      onPress={() => setCategory(c)}
                      accessibilityState={{ selected: active }}
                    >
                      <Ionicons name={meta.icon} size={20} color={active ? meta.color : Colors.textHint} />
                      <Text style={[styles.categoryText, active && { color: Colors.textPrimary }]}>{c}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>
          </FormCard>

          <FormCard>
            <Field label="How often">
              <Segmented
                options={[
                  { key: 'Daily', label: 'Every day' },
                  { key: 'Weekly', label: 'Times a week' },
                ]}
                value={frequency}
                onChange={setFrequency}
              />
            </Field>
            {frequency === 'Weekly' ? (
              <View style={styles.stepperRow}>
                <Text style={moduleStyles.bodyStrong}>Goal per week</Text>
                <View style={styles.stepper}>
                  <Pressable style={styles.stepBtn} onPress={() => setTarget((t) => Math.max(1, t - 1))} accessibilityLabel="Fewer">
                    <Ionicons name="remove" size={20} color={Colors.primary} />
                  </Pressable>
                  <Text style={styles.stepValue}>{target}×</Text>
                  <Pressable style={styles.stepBtn} onPress={() => setTarget((t) => Math.min(7, t + 1))} accessibilityLabel="More">
                    <Ionicons name="add" size={20} color={Colors.primary} />
                  </Pressable>
                </View>
              </View>
            ) : null}
            <Text style={moduleStyles.muted}>
              {frequency === 'Daily'
                ? 'Check in once a day. Missing a day resets the streak.'
                : `A week counts once you check in ${target} time${target === 1 ? '' : 's'}. The streak counts weeks in a row.`}
            </Text>
          </FormCard>

          <FormCard>
            <ToggleRow title="Daily reminder" meta="A notification at the time you choose" value={reminderOn} onValueChange={setReminderOn} />
            {reminderOn ? <DateTimeInput value={reminder} mode="time" onChange={setReminder} /> : null}
          </FormCard>

          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            <ErrorText text={error} />
            <PrimaryButton label={editing ? 'Save Changes' : 'Create Habit'} icon="checkmark" onPress={handleSave} loading={saving} />
            {editing ? <SecondaryButton label="Delete habit" icon="trash-outline" danger onPress={handleDelete} /> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: Font.semibold, fontSize: 14, color: Colors.primary },
  suggestions: { gap: 8, paddingHorizontal: 16 },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.surfaceLight,
  },
  suggestionActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  suggestionText: { fontFamily: Font.semibold, fontSize: 13, color: Colors.textPrimary },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  category: {
    width: '31%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.surfaceLight,
  },
  categoryText: { fontFamily: Font.semibold, fontSize: 13, color: Colors.textSecondary },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { minWidth: 36, textAlign: 'center', fontFamily: Font.extrabold, fontSize: 20, color: Colors.textPrimary },
});
