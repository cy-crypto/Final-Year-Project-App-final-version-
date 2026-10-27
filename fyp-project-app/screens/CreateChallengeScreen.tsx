import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { toApiErrorMessage } from '../services/api';
import { METRIC_LABELS, createChallenge, type ChallengeMetric } from '../services/communityService';
import { DateTimeInput } from '../components/module/DateTimeInput';
import { ChipRow, ErrorText, Field, FormCard, FormHeader, Input, PrimaryButton, moduleStyles } from '../components/module/ModuleUI';
import { toDateStr } from '../utils/taskFormat';

const METRICS = (Object.keys(METRIC_LABELS) as ChallengeMetric[]).map((key) => ({ key, label: METRIC_LABELS[key].label }));
const SUGGESTED_TARGET: Record<ChallengeMetric, string> = { habit_checkins: '7', tasks_completed: '10', steps: '50000' };

export function CreateChallengeScreen() {
  const navigation = useNavigation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [metric, setMetric] = useState<ChallengeMetric>('habit_checkins');
  const [target, setTarget] = useState(SUGGESTED_TARGET.habit_checkins);
  const [start, setStart] = useState<Date>(new Date());
  const [end, setEnd] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 6);
    return d;
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    const goal = Number(target);
    if (!title.trim()) return setError('Give the challenge a name.');
    if (!Number.isInteger(goal) || goal < 1) return setError('The target must be a whole number above 0.');
    if (end < start) return setError('The end date is before the start date.');
    setSaving(true);
    try {
      await createChallenge({
        title: title.trim(),
        description: description.trim(),
        metric,
        target: goal,
        start_date: toDateStr(start),
        end_date: toDateStr(end),
      });
      navigation.goBack();
    } catch (err) {
      setError(toApiErrorMessage(err, 'Could not create the challenge.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={moduleStyles.container}>
      <FormHeader title="New Challenge" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={moduleStyles.formContent} keyboardShouldPersistTaps="handled">
          <FormCard>
            <Field label="Name">
              <Input placeholder="e.g. 7 days of reading" value={title} onChangeText={setTitle} maxLength={120} />
            </Field>
            <Field label="Description (optional)">
              <Input placeholder="What is the challenge about?" multiline value={description} onChangeText={setDescription} />
            </Field>
            <Field label="What counts" hint="Progress is counted automatically from your Habits, Tasks or Fitness data.">
              <ChipRow
                options={METRICS}
                value={metric}
                onChange={(m) => {
                  setMetric(m);
                  setTarget(SUGGESTED_TARGET[m]);
                }}
              />
            </Field>
            <Field label={`Target (${METRIC_LABELS[metric].unit})`}>
              <Input keyboardType="number-pad" value={target} onChangeText={setTarget} />
            </Field>
            <Field label="Starts">
              <DateTimeInput value={start} mode="date" onChange={setStart} />
            </Field>
            <Field label="Ends" hint="Up to 90 days.">
              <DateTimeInput value={end} mode="date" minimumDate={start} onChange={setEnd} />
            </Field>
          </FormCard>
          <View style={{ paddingHorizontal: 16, gap: 8 }}>
            <ErrorText text={error} />
            <PrimaryButton label="Create & Join" icon="flag" onPress={submit} loading={saving} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
