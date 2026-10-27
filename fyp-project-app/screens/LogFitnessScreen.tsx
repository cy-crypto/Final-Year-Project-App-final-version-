import React, { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getToday, getFieldError, upsertToday, type FitnessRecordDto, type WorkoutLogEntry } from '../services/fitnessService';
import { toApiErrorMessage } from '../services/api';
import { Card, CenterLoader, ErrorText, Field, FormCard, FormHeader, Input, PrimaryButton, SecondaryButton, moduleStyles as s } from '../components/module/ModuleUI';

type WorkoutRow = { exercise: string; durationMin: string; original?: WorkoutLogEntry };
export function LogFitnessScreen() {
  const navigation = useNavigation();
  const [today, setToday] = useState<FitnessRecordDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState('');
  const [calories, setCalories] = useState('');
  const [sleep, setSleep] = useState('');
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
  const [dirty, setDirty] = useState({ steps: false, calories: false, sleep: false, workouts: false });
  const [busy, setBusy] = useState(false);
  const [dayChanged, setDayChanged] = useState(false);
  const saving = useRef(false);
  const version = useRef(0);
  const load = useCallback(async () => {
    const request = ++version.current;
    try {
      const r = await getToday();
      if (request !== version.current) return;
      setToday(r); setSteps(r.stepsAvailable ? String(r.steps) : '');
      setCalories(r.calorieSource === 'manual' ? String(Number(r.caloriesBurned)) : '');
      setSleep(r.sleepDurationMinutes === null ? '' : String(r.sleepDurationMinutes));
      setWorkouts((r.workoutLog ?? []).map((w) => ({ exercise: w.exercise, durationMin: w.duration_min === undefined ? '' : String(w.duration_min), original: w })));
      setDirty({ steps: false, calories: false, sleep: false, workouts: false }); setError(null);
      setDayChanged(false);
    } catch (err) { if (request === version.current) setError(toApiErrorMessage(err, 'Could not load today’s record. Retry before editing.')); }
    finally { if (request === version.current) setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); return () => { version.current++; }; }, [load]));
  const editWorkout = (index: number, field: keyof WorkoutRow, value: string) => {
    setWorkouts((rows) => rows.map((row, i) => i === index ? { ...row, [field]: value } : row)); setDirty((d) => ({ ...d, workouts: true }));
  };
  const save = async () => {
    if (saving.current || !today) return;
    setError(null);
    if (!Object.values(dirty).some(Boolean)) { setError('Make a change before saving.'); return; }
    if (dirty.steps && (!/^\d+$/.test(steps.trim()) || !Number.isSafeInteger(Number(steps)) || Number(steps) > 2147483647)) { setError('Steps must be a whole number, zero or greater.'); return; }
    if (dirty.calories && calories.trim() && (!/^\d+(\.\d{1,2})?$/.test(calories.trim()) || !Number.isFinite(Number(calories)) || Number(calories) > 9999999999.99)) { setError('Manual calories must be zero or greater with at most two decimal places.'); return; }
    if (dirty.sleep && sleep.trim() && (!/^\d+$/.test(sleep.trim()) || !Number.isSafeInteger(Number(sleep)) || Number(sleep) > 2147483647)) { setError('Sleep duration must be a whole number of minutes, zero or greater.'); return; }
    if (dirty.workouts && workouts.some((w) => !w.exercise.trim() || (w.durationMin.trim() && (!/^\d+(\.\d+)?$/.test(w.durationMin) || !Number.isFinite(Number(w.durationMin)))))) { setError('Each workout needs an exercise name and a valid non-negative duration.'); return; }
    saving.current = true; setBusy(true);
    try {
      const payload: Parameters<typeof upsertToday>[0] = { date: today.date, todayOnly: true };
      if (dirty.steps) { payload.steps = Number(steps); payload.stepSource = 'manual'; }
      if (dirty.calories) payload.caloriesBurned = calories.trim() ? Number(calories) : null;
      if (dirty.sleep) payload.sleepDurationMinutes = sleep.trim() ? Number(sleep) : null;
      if (dirty.workouts) payload.workoutLog = workouts.map((w) => ({ ...w.original, exercise: w.exercise.trim(), duration_min: Number(w.durationMin) || 0 }));
      await upsertToday(payload); navigation.goBack();
    } catch (err) {
      setError(toApiErrorMessage(err, 'Could not confirm the save. Please retry.'));
      if (getFieldError(err, 'today_only')) setDayChanged(true);
    }
    finally { saving.current = false; setBusy(false); }
  };
  if (loading) return <SafeAreaView style={s.container}><CenterLoader /></SafeAreaView>;
  return <SafeAreaView style={s.container}>
    <FormHeader title="Log Today" />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={s.content}>
        {error ? <Card><ErrorText text={error} />{!today || dayChanged ? <SecondaryButton label={dayChanged ? 'Reload today (discard edits)' : 'Retry'} onPress={() => { if (!busy) void load(); }} /> : null}</Card> : null}
        <FormCard>
          <Text style={s.bodyStrong}>{today?.date ?? 'Record unavailable'}</Text>
          <Field label="Steps (daily total)" hint="This replaces the daily total; it does not add another reading.">
            <Input accessibilityLabel="Daily step total" style={{ minHeight: 46 }} keyboardType="number-pad" value={steps} onChangeText={(v) => { setSteps(v); setDirty((d) => ({ ...d, steps: true })); }} editable={!busy && Boolean(today)} placeholder="Not recorded" />
          </Field>
          <Field label="Manual calorie override (kcal, optional)" hint="Replaces calorie-goal progress rather than adding to the walking estimate. Clear this field to use the estimate again.">
            <Input accessibilityLabel="Manual calorie override in kcal" style={{ minHeight: 46 }} keyboardType="decimal-pad" value={calories} onChangeText={(v) => { setCalories(v); setDirty((d) => ({ ...d, calories: true })); }} editable={!busy && Boolean(today)} placeholder="Use walking estimate" />
          </Field>
          <Text style={s.muted}>Walking estimates update automatically from saved steps and measurements. Blank, untouched fields never erase existing activity.</Text>
          <Field label="Last night’s sleep (minutes, optional)" hint="Existing duration-only logs stay separate from bedtime/wake-up records.">
            <Input accessibilityLabel="Sleep duration in minutes" keyboardType="number-pad" value={sleep} onChangeText={(v) => { setSleep(v); setDirty((d) => ({ ...d, sleep: true })); }} editable={!busy && Boolean(today)} />
          </Field>
          <Text style={s.bodyStrong}>Workouts</Text>
          {workouts.map((row, index) => <View key={index} style={{ gap: 8 }}>
            <Field label={`Exercise ${index + 1}`}><Input value={row.exercise} onChangeText={(v) => editWorkout(index, 'exercise', v)} editable={!busy} /></Field>
            <Field label="Duration (minutes)"><Input keyboardType="decimal-pad" value={row.durationMin} onChangeText={(v) => editWorkout(index, 'durationMin', v)} editable={!busy} /></Field>
            <SecondaryButton label={`Remove exercise ${index + 1}`} onPress={() => { if (!busy) { setWorkouts((rows) => rows.filter((_, i) => i !== index)); setDirty((d) => ({ ...d, workouts: true })); } }} />
          </View>)}
          <SecondaryButton label="Add exercise" onPress={() => { if (!busy && today) { setWorkouts((rows) => [...rows, { exercise: '', durationMin: '' }]); setDirty((d) => ({ ...d, workouts: true })); } }} />
          <PrimaryButton label="Save daily record" onPress={() => { void save(); }} loading={busy} disabled={!today} />
        </FormCard>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
