import React, { useCallback, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getGoals, createOrUpdateGoal, patchGoal, type FitnessGoalDto, type GoalType } from '../services/fitnessService';
import { toApiErrorMessage } from '../services/api';
import { validateGoalTarget } from '../services/fitnessCalculations';
import { GoalProgress } from '../components/fitness/GoalProgress';
import { notifyFitnessAchievements } from '../components/fitness/achievements';
import { Card, CenterLoader, ChipRow, ErrorText, Field, FormCard, FormHeader, Input, PrimaryButton, SecondaryButton, moduleStyles as s } from '../components/module/ModuleUI';

const OPTIONS: { key: GoalType; label: string }[] = [
  { key: 'steps', label: 'Daily steps' }, { key: 'calories', label: 'Daily calories burned' },
  { key: 'workout_frequency', label: 'Weekly workout sessions' },
];
const labels: Record<GoalType, string> = { steps: 'Daily steps', calories: 'Daily calories burned', workout_frequency: 'Weekly workout sessions', sleep: 'Sleep (legacy goal)' };
const units: Record<GoalType, string> = { steps: 'steps/day', calories: 'kcal/day', workout_frequency: 'sessions/week', sleep: 'minutes/day' };

export function FitnessGoalsScreen() {
  const [goals, setGoals] = useState<FitnessGoalDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [kind, setKind] = useState<GoalType>('steps');
  const [target, setTarget] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const version = useRef(0);
  const mounted = useRef(false);
  const load = useCallback(async () => {
    const requestVersion = ++version.current;
    try {
      const rows = await getGoals();
      if (!mounted.current || requestVersion !== version.current) return;
      setGoals(rows); setError(null);
      await notifyFitnessAchievements(rows);
    } catch (err) {
      if (mounted.current && requestVersion === version.current) setError(toApiErrorMessage(err, 'Could not load goals. Please retry.'));
    } finally {
      if (mounted.current && requestVersion === version.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);
  useFocusEffect(useCallback(() => {
    mounted.current = true; void load();
    return () => { mounted.current = false; version.current++; };
  }, [load]));
  const clearForm = () => { setEditing(null); setTarget(''); setFormError(null); };
  const save = async () => {
    if (submitting.current) return;
    const message = validateGoalTarget(kind, target); setFormError(message);
    if (message) return;
    submitting.current = true; setBusy(true); version.current++;
    try {
      const saved = editing ? await patchGoal(editing, { targetValue: target.trim() })
        : await createOrUpdateGoal({ goalType: kind, targetValue: target.trim() });
      setGoals((old) => [saved, ...old.filter((g) => g.id !== saved.id)]);
      clearForm(); await load();
    } catch (err) { setFormError(toApiErrorMessage(err, 'Could not save goal. Please retry.')); }
    finally { submitting.current = false; setBusy(false); }
  };
  const archive = (goal: FitnessGoalDto) => Alert.alert('Archive goal?', 'Activity records and goal history will be preserved.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Archive', onPress: async () => {
      if (submitting.current) return;
      submitting.current = true; setBusy(true); version.current++;
      try {
        const saved = await patchGoal(goal.id, { isActive: false });
        setGoals((old) => old.map((g) => g.id === saved.id ? saved : g));
        if (editing === goal.id) clearForm(); await load();
      }
      catch (err) { setError(toApiErrorMessage(err, 'Could not archive goal. Please retry.')); }
      finally { submitting.current = false; setBusy(false); }
    } },
  ]);
  if (loading) return <SafeAreaView style={s.container}><CenterLoader /></SafeAreaView>;
  const existing = goals.find((g) => g.isActive && g.goalType === kind);
  return <SafeAreaView style={s.container}>
    <FormHeader title="Fitness Goals" />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { if (!busy) { setRefreshing(true); void load(); } }} />}>
        {error ? <Card><ErrorText text={error} /><SecondaryButton label="Retry" onPress={() => { void load(); }} /></Card> : null}
        <FormCard>
          <Text style={s.bodyStrong}>{editing ? 'Edit goal' : 'Personalized goal'}</Text>
          {!editing ? <ChipRow options={OPTIONS} value={kind} onChange={(value) => { if (!busy) { setKind(value); setFormError(null); } }} /> : <Text style={s.body}>{labels[kind]}</Text>}
          <Field label={`Target (${units[kind]})`} hint={existing && !editing ? 'An active goal exists. Saving updates its target without changing activity history.' : 'Daily goals use your profile timezone. Weeks run Monday–Sunday.'}>
            <Input accessibilityLabel={`Goal target in ${units[kind]}`} keyboardType={kind === 'calories' ? 'decimal-pad' : 'number-pad'} value={target} onChangeText={setTarget} editable={!busy} placeholder="Enter target" />
          </Field>
          {kind === 'workout_frequency' ? <Text style={s.body}>Session progress is unavailable: existing workout logs record exercises, not completed sessions. You can still save a weekly target.</Text> : null}
          <ErrorText text={formError} />
          <PrimaryButton label={editing || existing ? 'Save target' : 'Create goal'} onPress={() => { void save(); }} loading={busy} style={{ minHeight: 48 }} />
          {editing ? <SecondaryButton label="Cancel edit" onPress={() => { if (!busy) clearForm(); }} /> : null}
        </FormCard>
        <Text style={s.bodyStrong}>Your goals</Text>
        {!goals.length && !error ? <Card><Text style={s.body}>No goals yet. Set your first target above.</Text></Card> : null}
        {goals.map((goal) => <Card key={goal.id} title={labels[goal.goalType]}>
          <GoalProgress goal={goal} />
          {goal.isActive ? <View style={{ gap: 8 }}>
            <SecondaryButton label="Edit target" onPress={() => {
              if (busy) return;
              setEditing(goal.id); setKind(goal.goalType); setTarget(goal.targetValue); setFormError(null); scroll.current?.scrollTo({ y: 0, animated: true });
            }} />
            <SecondaryButton label="Archive goal" onPress={() => { if (!busy) archive(goal); }} />
          </View> : null}
        </Card>)}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
