import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Font, Radius } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';
import { toApiErrorMessage } from '../services/api';
import {
  FREQUENCY_LABELS,
  createMedication,
  deleteMedication,
  getMedication,
  getMedications,
  updateMedication,
  type Frequency,
  type MedicationInput,
} from '../services/medicationService';
import { ensureNotificationPermission, parseLocalDate, syncMedicationReminders } from '../services/reminderService';
import { DateTimeInput } from '../components/module/DateTimeInput';
import {
  CenterLoader,
  ChipRow,
  ErrorText,
  Field,
  FormCard,
  FormHeader,
  Input,
  PrimaryButton,
  SecondaryButton,
  ToggleRow,
  moduleStyles,
} from '../components/module/ModuleUI';
import { toDateStr } from '../utils/taskFormat';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'AddMedication'>;

const FREQUENCIES = (Object.keys(FREQUENCY_LABELS) as Frequency[]).map((key) => ({ key, label: FREQUENCY_LABELS[key] }));
const DEFAULT_TIMES: Record<Frequency, string[]> = {
  daily: ['08:00'],
  twice_daily: ['08:00', '20:00'],
  three_times_daily: ['08:00', '14:00', '20:00'],
  weekly: ['09:00'],
  as_needed: [],
};
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function timeToDate(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function dateToTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function AddMedicationScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const editingId = params?.medicationId ?? null;

  const [loading, setLoading] = useState(Boolean(editingId));
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('daily');
  const [times, setTimes] = useState<string[]>(DEFAULT_TIMES.daily);
  const [days, setDays] = useState<number[]>([new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [doseUnits, setDoseUnits] = useState('1');
  const [supply, setSupply] = useState('30');
  const [threshold, setThreshold] = useState('7');
  const [doctor, setDoctor] = useState('');
  const [instructions, setInstructions] = useState('');
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editingId) return;
    getMedication(editingId)
      .then((m) => {
        setName(m.name);
        setDosage(m.dosage);
        setFrequency(m.frequency);
        setTimes(m.schedule_times.length ? m.schedule_times : DEFAULT_TIMES[m.frequency]);
        setDays(m.days_of_week.length ? m.days_of_week : [0]);
        setStartDate(m.start_date ? parseLocalDate(m.start_date) : null);
        setEndDate(m.end_date ? parseLocalDate(m.end_date) : null);
        setDoseUnits(String(m.dose_units));
        setSupply(String(m.supply_count));
        setThreshold(String(m.refill_threshold));
        setDoctor(m.doctor_name);
        setInstructions(m.instructions);
        setNotes(m.notes ?? '');
        setActive(m.is_active);
      })
      .catch((err) => setError(toApiErrorMessage(err, 'Could not load this medicine.')))
      .finally(() => setLoading(false));
  }, [editingId]);

  const changeFrequency = (next: Frequency) => {
    setFrequency(next);
    const needed = DEFAULT_TIMES[next].length;
    // Keep the times the user already picked where possible.
    if (next === 'as_needed') setTimes([]);
    else if (next === 'daily' || next === 'weekly') setTimes(times.length ? times.slice(0, Math.max(1, times.length)) : DEFAULT_TIMES[next]);
    else setTimes([...times, ...DEFAULT_TIMES[next]].filter((t, i, all) => all.indexOf(t) === i).slice(0, needed).sort());
  };

  const fixedCount = frequency === 'twice_daily' ? 2 : frequency === 'three_times_daily' ? 3 : null;

  const setTimeAt = (index: number, value: Date) => {
    const next = [...times];
    next[index] = dateToTime(value);
    setTimes(next);
  };

  const toInt = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN);

  const handleSave = async () => {
    setError(null);
    if (!name.trim() || !dosage.trim()) {
      setError('Enter the medicine name and dosage.');
      return;
    }
    if (frequency !== 'as_needed' && times.length === 0) {
      setError('Add at least one dose time.');
      return;
    }
    if (new Set(times).size !== times.length) {
      setError('Two doses are set to the same time.');
      return;
    }
    if (frequency === 'weekly' && days.length === 0) {
      setError('Pick at least one day of the week.');
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setError('The end date is before the start date.');
      return;
    }
    const units = toInt(doseUnits);
    const supplyCount = toInt(supply);
    const refillAt = toInt(threshold);
    if (!(units >= 1) || Number.isNaN(supplyCount) || Number.isNaN(refillAt)) {
      setError('Dose units, supply and refill level must be whole numbers.');
      return;
    }

    const payload: MedicationInput = {
      name: name.trim(),
      dosage: dosage.trim(),
      frequency,
      schedule_times: [...times].sort(),
      days_of_week: frequency === 'weekly' ? days : [],
      start_date: startDate ? toDateStr(startDate) : null,
      end_date: endDate ? toDateStr(endDate) : null,
      dose_units: units,
      supply_count: supplyCount,
      refill_threshold: refillAt,
      doctor_name: doctor.trim(),
      instructions: instructions.trim(),
      notes: notes.trim(),
      is_active: active,
    };

    setSaving(true);
    try {
      if (editingId) await updateMedication(editingId, payload);
      else await createMedication(payload);
      await ensureNotificationPermission();
      syncMedicationReminders(await getMedications());
      navigation.goBack();
    } catch (err) {
      setError(toApiErrorMessage(err, 'Could not save the medicine.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () =>
    Alert.alert('Delete medicine', `Delete ${name} and its dose history?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMedication(editingId!);
            syncMedicationReminders(await getMedications());
            navigation.goBack();
          } catch (err) {
            Alert.alert('Error', toApiErrorMessage(err, 'Could not delete the medicine.'));
          }
        },
      },
    ]);

  if (loading) {
    return (
      <SafeAreaView style={moduleStyles.container}>
        <FormHeader title="Edit Medicine" />
        <CenterLoader />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={moduleStyles.container}>
      <FormHeader title={editingId ? 'Edit Medicine' : 'Add Medicine'} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={moduleStyles.formContent} keyboardShouldPersistTaps="handled">
          <FormCard>
            <Field label="Medicine name">
              <Input placeholder="e.g. Panadol" value={name} onChangeText={setName} />
            </Field>
            <Field label="Dosage">
              <Input placeholder="e.g. 500 mg, 1 tablet" value={dosage} onChangeText={setDosage} />
            </Field>
            <Field label="How often">
              <ChipRow options={FREQUENCIES} value={frequency} onChange={changeFrequency} />
            </Field>

            {frequency === 'weekly' ? (
              <Field label="On these days">
                <View style={styles.days}>
                  {WEEKDAYS.map((label, index) => {
                    const on = days.includes(index);
                    return (
                      <Pressable
                        key={label}
                        style={[styles.day, on && styles.dayOn]}
                        onPress={() => setDays(on ? days.filter((d) => d !== index) : [...days, index].sort())}
                      >
                        <Text style={[styles.dayText, on && styles.dayTextOn]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Field>
            ) : null}

            {frequency !== 'as_needed' ? (
              <Field label="Dose times" hint="You get a reminder at each time and a follow-up 10 minutes later if the dose is not logged.">
                {times.map((t, index) => (
                  <View key={index} style={moduleStyles.row}>
                    <View style={{ flex: 1 }}>
                      <DateTimeInput value={timeToDate(t)} mode="time" onChange={(d) => setTimeAt(index, d)} />
                    </View>
                    {!fixedCount && times.length > 1 ? (
                      <Pressable onPress={() => setTimes(times.filter((_, i) => i !== index))} hitSlop={8}>
                        <Ionicons name="close-circle" size={22} color={Colors.textHint} />
                      </Pressable>
                    ) : null}
                  </View>
                ))}
                {!fixedCount && times.length < 6 ? (
                  <Pressable onPress={() => setTimes([...times, '12:00'])} hitSlop={8}>
                    <Text style={moduleStyles.link}>+ Add another time</Text>
                  </Pressable>
                ) : null}
              </Field>
            ) : (
              <Text style={moduleStyles.muted}>As-needed medicines have no schedule. Log a dose from the Today tab whenever you take one.</Text>
            )}
          </FormCard>

          <FormCard>
            <Field label="Course start (optional)">
              <DateTimeInput value={startDate} mode="date" onChange={setStartDate} onClear={() => setStartDate(null)} placeholder="Starts today" />
            </Field>
            <Field label="Course end (optional)">
              <DateTimeInput value={endDate} mode="date" onChange={setEndDate} onClear={() => setEndDate(null)} placeholder="No end date" />
            </Field>
          </FormCard>

          <FormCard>
            <View style={moduleStyles.grid}>
              <View style={{ flex: 1 }}>
                <Field label="Units per dose">
                  <Input keyboardType="number-pad" value={doseUnits} onChangeText={setDoseUnits} />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="In stock">
                  <Input keyboardType="number-pad" value={supply} onChangeText={setSupply} />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Refill at">
                  <Input keyboardType="number-pad" value={threshold} onChangeText={setThreshold} />
                </Field>
              </View>
            </View>
            <Text style={moduleStyles.muted}>Taking a dose lowers the stock. You get a refill alert when it reaches the refill level.</Text>
          </FormCard>

          <FormCard>
            <Field label="Doctor (optional)">
              <Input placeholder="e.g. Dr. Ayesha Khan" value={doctor} onChangeText={setDoctor} />
            </Field>
            <Field label="Doctor's instructions (optional)">
              <Input placeholder="e.g. After meals, with water" multiline value={instructions} onChangeText={setInstructions} />
            </Field>
            <Field label="Health notes (optional)">
              <Input placeholder="Allergies, side effects, test results..." multiline value={notes} onChangeText={setNotes} />
            </Field>
            {editingId ? (
              <ToggleRow title="Active" meta="Paused medicines get no reminders" value={active} onValueChange={setActive} />
            ) : null}
          </FormCard>

          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            <ErrorText text={error} />
            <PrimaryButton label={editingId ? 'Save Changes' : 'Add Medicine'} onPress={handleSave} loading={saving} />
            {editingId ? <SecondaryButton label="Delete medicine" icon="trash-outline" danger onPress={handleDelete} /> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  days: { flexDirection: 'row', gap: 6 },
  day: {
    flex: 1,
    height: 38,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dayText: { fontFamily: Font.semibold, fontSize: 12, color: Colors.textSecondary },
  dayTextOn: { color: Colors.white },
});
