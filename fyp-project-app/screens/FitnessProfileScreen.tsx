import React, { useCallback, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getProfile, updateProfile, createOrUpdateGoal, type FitnessProfileDto, type Gender } from '../services/fitnessService';
import { toApiErrorMessage } from '../services/api';
import { fromCanonicalMeasurement, toCanonicalMeasurements, validateFitnessMeasurements, type FitnessUnits } from '../services/fitnessCalculations';
import { Card, CenterLoader, ChipRow, ErrorText, Field, FormCard, FormHeader, Input, PrimaryButton, SecondaryButton, Segmented, moduleStyles as s } from '../components/module/ModuleUI';
import { Colors } from '../constants/theme';

export function FitnessProfileScreen() {
  const [profile, setProfile] = useState<FitnessProfileDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [water, setWater] = useState('2000');
  const [units, setUnits] = useState<FitnessUnits>('metric');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const version = useRef(0);
  const load = useCallback(async () => {
    const request = ++version.current;
    try {
      const p = await getProfile();
      if (request !== version.current) return;
      setProfile(p); setUnits(p.displayUnits);
      setWeight(p.weightKg === null ? '' : fromCanonicalMeasurement(Number(p.weightKg), 'weight', p.displayUnits));
      setHeight(p.heightCm === null ? '' : fromCanonicalMeasurement(Number(p.heightCm), 'height', p.displayUnits));
      setAge(p.age === null ? '' : String(p.age)); setGender(p.gender ?? ''); setWater(String(p.waterGoalMl)); setError(null);
      setDirty(false); setSuccess(false);
    } catch (err) { if (request === version.current) setError(toApiErrorMessage(err, 'Could not load your fitness profile.')); }
    finally { if (request === version.current) setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); return () => { version.current++; }; }, [load]));
  const changeUnits = (next: FitnessUnits) => {
    if (busy || next === units) return;
    const canonical = toCanonicalMeasurements(Number(weight), Number(height), units);
    if (weight.trim() && Number.isFinite(canonical.weightKg)) setWeight(fromCanonicalMeasurement(canonical.weightKg, 'weight', next));
    if (height.trim() && Number.isFinite(canonical.heightCm)) setHeight(fromCanonicalMeasurement(canonical.heightCm, 'height', next));
    setUnits(next);
    setDirty(true); setSuccess(false);
  };
  const save = async () => {
    if (saving.current || !profile) return;
    const validation = validateFitnessMeasurements(weight, height, age, units);
    setFormError(validation); setSuccess(false);
    if (validation) return;
    if (!/^\d+$/.test(water.trim()) || !Number.isSafeInteger(Number(water)) || Number(water) < 1 || Number(water) > 2147483647) { setFormError('Water goal must be a positive whole number of ml.'); return; }
    saving.current = true; setBusy(true);
    const canonical = toCanonicalMeasurements(Number(weight), Number(height), units);
    try {
      const saved = await updateProfile({ weightKg: weight.trim() ? canonical.weightKg : null,
        heightCm: height.trim() ? canonical.heightCm : null, age: age.trim() ? Number(age) : null,
        displayUnits: units, gender: gender || null, waterGoalMl: Number(water) });
      setProfile(saved); setSuccess(true); setDirty(false); setError(null);
      setWeight(saved.weightKg === null ? '' : fromCanonicalMeasurement(Number(saved.weightKg), 'weight', saved.displayUnits));
      setHeight(saved.heightCm === null ? '' : fromCanonicalMeasurement(Number(saved.heightCm), 'height', saved.displayUnits));
      setAge(saved.age === null ? '' : String(saved.age)); setWater(String(saved.waterGoalMl));
    } catch (err) { setFormError(toApiErrorMessage(err, 'Could not save your profile. Your changes are not synced.')); }
    finally { saving.current = false; setBusy(false); }
  };
  const handleUseSuggestion = async () => {
    if (saving.current || !profile?.suggestedStepGoal) return;
    saving.current = true; setBusy(true);
    try { await createOrUpdateGoal({ goalType: 'steps', targetValue: String(profile.suggestedStepGoal) }); Alert.alert('Goal updated', 'Your suggested daily step target has been saved.'); }
    catch (err) { setFormError(toApiErrorMessage(err, 'Could not update your step goal.')); }
    finally { saving.current = false; setBusy(false); }
  };
  if (loading) return <SafeAreaView style={s.container}><CenterLoader /></SafeAreaView>;
  return <SafeAreaView style={s.container}>
    <FormHeader title="Fitness Profile" />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {error ? <Card><ErrorText text={error} /><SecondaryButton label="Retry" onPress={() => { void load(); }} /></Card> : null}
        {success ? <Text accessibilityLiveRegion="polite" style={[s.bodyStrong, { color: Colors.success }]}>Fitness profile saved.</Text> : null}
        {dirty ? <Text accessibilityLiveRegion="polite" style={s.muted}>Unsaved profile changes.</Text> : null}
        <FormCard>
          <Text style={s.bodyStrong}>Your fitness measurements</Text>
          <Text style={s.body}>Add your own details for an approximate adult walking-energy estimate. Age is saved for your profile and supported range; it is not part of the energy equation.</Text>
          <Segmented options={[{ key: 'metric', label: 'kg / cm' }, { key: 'imperial', label: 'lb / in' }]} value={units} onChange={changeUnits} />
          <Field label={`Weight (${units === 'metric' ? 'kg' : 'lb'})`} hint="Supported range: 25–350 kg.">
            <Input style={{ minHeight: 46 }} accessibilityLabel="Your weight" value={weight} onChangeText={(v) => { setWeight(v); setDirty(true); setSuccess(false); }} keyboardType="decimal-pad" placeholder={units === 'metric' ? 'e.g. 70.5' : 'e.g. 155.43'} editable={!busy && Boolean(profile)} />
          </Field>
          <Field label="Age (years)" hint="Whole number, 18–120. This model supports adults.">
            <Input style={{ minHeight: 46 }} accessibilityLabel="Your age in years" value={age} onChangeText={(v) => { setAge(v); setDirty(true); setSuccess(false); }} keyboardType="number-pad" placeholder="e.g. 25" editable={!busy && Boolean(profile)} />
          </Field>
          <Field label={`Height (${units === 'metric' ? 'cm' : 'in'})`} hint="Supported range: 100–250 cm. Stored in centimeters.">
            <Input style={{ minHeight: 46 }} accessibilityLabel="Your height" value={height} onChangeText={(v) => { setHeight(v); setDirty(true); setSuccess(false); }} keyboardType="decimal-pad" placeholder={units === 'metric' ? 'e.g. 175.5' : 'e.g. 69.09'} editable={!busy && Boolean(profile)} />
          </Field>
          <Field label="Daily water goal (ml)"><Input accessibilityLabel="Daily water goal in ml" value={water} onChangeText={(v) => { setWater(v); setDirty(true); setSuccess(false); }} keyboardType="number-pad" editable={!busy && Boolean(profile)} /></Field>
          <Field label="Gender (optional)" hint="Preserved for the existing step-goal suggestion. Not used for calorie estimation.">
            <ChipRow options={[{ key: '', label: 'Not set' }, { key: 'male', label: 'Male' }, { key: 'female', label: 'Female' }, { key: 'other', label: 'Other' }]} value={gender} onChange={(v) => { if (!busy) { setGender(v as Gender | ''); setDirty(true); setSuccess(false); } }} />
          </Field>
          <ErrorText text={formError} />
          <PrimaryButton label="Save fitness profile" onPress={() => { void save(); }} loading={busy} disabled={!profile} />
          <Text style={s.muted}>Incomplete details do not block the app. Saving measurements refreshes only today’s estimate; completed days retain their original inputs.</Text>
        </FormCard>
        <Card title="Walking estimate">
          <Text style={s.body}>Step length ≈ 0.414 × height. Calories ≈ 0.5 × weight (kg) × estimated walking distance (km), above resting energy. Level-ground walking is a model assumption, not detected terrain. No speed or duration is invented.</Text>
          <Text style={s.muted}>Running, stairs, hills, load carrying and individual gait can differ substantially. This is an approximation, not a measured total daily burn.</Text>
          {profile?.estimatedStrideCm ? <Text style={s.body}>Estimated step length: {profile.estimatedStrideCm} cm per step.</Text> : null}
        </Card>
        <Card title="Suggested step goal">
          {profile?.suggestedStepGoal ? <><Text style={s.bodyStrong}>{profile.suggestedStepGoal.toLocaleString()} steps/day</Text><Text style={s.body}>The existing editable suggestion is a general starting point, not a medical prescription.</Text><PrimaryButton label="Use suggested step goal" loading={busy} onPress={() => { void handleUseSuggestion(); }} /></> : <Text style={s.body}>Save height and optional gender to see the existing step-goal suggestion. You can always set your own target in Goals.</Text>}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
