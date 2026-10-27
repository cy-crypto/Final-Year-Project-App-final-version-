import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import {
  getToday,
  getGoals,
  getTrends,
  getProfile,
  getWaterToday,
  logWater,
  upsertToday,
  getRoutines,
  createRoutine,
  updateRoutine,
  deleteRoutine,
  logRoutine,
  getFieldError,
  FitnessRecordDto,
  FitnessGoalDto,
  TrendRow,
  FitnessProfileDto,
  WaterIntakeDto,
  WorkoutRoutineDto,
  RoutineExercise,
} from '../services/fitnessService';
import {
  isAvailable as isPedometerAvailable,
  requestPermission as requestPedometerPermission,
  getTodayStepCount as getDeviceStepCountToday,
} from '../services/pedometerService';
import { toApiErrorMessage } from '../services/api';
import { Colors, Font } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';
import { Card, CenterLoader, EmptyCard, EntryCard, ErrorText, Field, FormCard, HeroCard, HeroStat, HeroStats, Input, ModuleHeader, PillTabs, PrimaryButton, ProgressBar, SecondaryButton, SectionHeader, Segmented, moduleStyles as s } from '../components/module/ModuleUI';
import { BarChart } from '../components/module/BarChart';
import { formatSleepDuration, fromCanonicalMeasurement, localFitnessDate } from '../services/fitnessCalculations';
import { GoalProgress } from '../components/fitness/GoalProgress';
import { notifyFitnessAchievements } from '../components/fitness/achievements';

// Device step count is deliberately a separate, informational number that requires an
// explicit "Sync to log" tap before it touches the user's actual fitness record — see
// services/pedometerService.ts for the full reasoning. Do not wire this to auto-sync.
type DeviceStepsStatus = 'checking' | 'unsupported' | 'permission-denied' | 'unusable' | 'ready';

type FitnessScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

// One routine exercise row in the add/edit form — sets/reps and duration_min are mutually
// exclusive in practice (an exercise is rep-based OR duration-based), hence the `mode`
// toggle deciding which input(s) are shown, mirroring LogFitnessScreen's exercise-row
// add/remove interaction rather than inventing a different pattern for a similar need.
type ExerciseMode = 'reps' | 'duration';
type ExerciseFormRow = {
  exercise: string;
  mode: ExerciseMode;
  sets: string;
  reps: string;
  durationMin: string;
};

const EMPTY_EXERCISE_ROW: ExerciseFormRow = { exercise: '', mode: 'reps', sets: '', reps: '', durationMin: '' };

function buildExercisePayload(row: ExerciseFormRow): RoutineExercise {
  const entry: RoutineExercise = { exercise: row.exercise.trim() };
  if (row.mode === 'reps') {
    if (row.sets.trim()) entry.sets = Number(row.sets);
    if (row.reps.trim()) entry.reps = Number(row.reps);
  } else if (row.durationMin.trim()) {
    entry.duration_min = Number(row.durationMin);
  }
  return entry;
}

const GOAL_LABELS: Record<string, string> = {
  steps: 'Daily Steps',
  calories: 'Calories Burned',
  sleep: 'Sleep',
  workout_frequency: 'Workout Frequency',
};

export function FitnessScreen() {
  const navigation = useNavigation<FitnessScreenNavigationProp>();
  const [tab, setTab] = useState<'overview' | 'workouts' | 'goals' | 'trends'>('overview');
  const [stepSnapshot, setStepSnapshot] = useState<{ date: string; readAt: string } | null>(null);
  const loadVersion = useRef(0);
  const syncGuard = useRef(false);
  const sensorVersion = useRef(0);

  const [today, setToday] = useState<FitnessRecordDto | null>(null);
  const [goals, setGoals] = useState<FitnessGoalDto[]>([]);
  const [trends, setTrends] = useState<TrendRow[]>([]);
  const [profile, setProfile] = useState<FitnessProfileDto | null>(null);
  const [waterToday, setWaterToday] = useState<WaterIntakeDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggingWater, setIsLoggingWater] = useState(false);

  const [deviceStepsStatus, setDeviceStepsStatus] = useState<DeviceStepsStatus>('checking');
  const [deviceStepCount, setDeviceStepCount] = useState<number | null>(null);
  const [isSyncingSteps, setIsSyncingSteps] = useState(false);

  const [routines, setRoutines] = useState<WorkoutRoutineDto[]>([]);
  // Existing routine CRUD/logging remains available in the Workout tab.

  const [isRoutineFormOpen, setIsRoutineFormOpen] = useState(false);
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [formRoutineName, setFormRoutineName] = useState('');
  const [formRoutineNameError, setFormRoutineNameError] = useState<string | null>(null);
  const [formExercises, setFormExercises] = useState<ExerciseFormRow[]>([EMPTY_EXERCISE_ROW]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSavingRoutine, setIsSavingRoutine] = useState(false);
  const [loggingRoutineId, setLoggingRoutineId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const requestVersion = ++loadVersion.current;
    try {
      const [todayRecord, activeGoals, trendRows, fitnessProfile, waterRecord, routineList] = await Promise.all([
        getToday(),
        getGoals(true),
        getTrends(7),
        getProfile(),
        getWaterToday(),
        getRoutines(),
      ]);
      if (requestVersion !== loadVersion.current) return;
      setToday(todayRecord);
      setGoals(activeGoals);
      setTrends(trendRows);
      setProfile(fitnessProfile);
      setWaterToday(waterRecord);
      setRoutines(routineList);
      setError(null);
      await notifyFitnessAchievements(activeGoals);
    } catch (err) {
      if (requestVersion !== loadVersion.current) return;
      setError(toApiErrorMessage(err, 'Failed to load fitness data'));
    } finally {
      if (requestVersion === loadVersion.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  const fetchRoutines = useCallback(async () => {
    try {
      const routineList = await getRoutines();
      setRoutines(routineList);
    } catch (err) {
      setError(toApiErrorMessage(err, 'Failed to load workout routines'));
    }
  }, []);

  useFocusEffect(useCallback(() => { void fetchAll(); return () => { loadVersion.current++; }; }, [fetchAll]));

  const checkDeviceSteps = useCallback(async () => {
    const readingVersion = ++sensorVersion.current;
    // Runs the availability -> permission -> step-count chain as a single pass behind one
    // loading state, so the device-steps section doesn't flash through intermediate UI.
    setDeviceStepsStatus('checking');
    setDeviceStepCount(null);
    setStepSnapshot(null);
    const available = await isPedometerAvailable();
    if (readingVersion !== sensorVersion.current) return;
    if (!available) {
      setDeviceStepsStatus('unsupported');
      return;
    }

    // This is the ONE automatic permission prompt per screen visit — requestPermission()
    // only shows the native OS dialog the first time it's ever asked; once the user has
    // answered (granted or denied), the OS just returns that status silently on every
    // later call. If it comes back denied here, we stop and let the user retry manually
    // via the "Enable" button (handleEnableDeviceSteps) rather than asking again ourselves.
    const granted = await requestPedometerPermission();
    if (readingVersion !== sensorVersion.current) return;
    if (!granted) {
      setDeviceStepsStatus('permission-denied');
      return;
    }

    const observedAt = new Date();
    const began = localFitnessDate(observedAt);
    const count = await getDeviceStepCountToday();
    if (readingVersion !== sensorVersion.current) return;
    const captured = new Date();
    if (count === null || !Number.isSafeInteger(count) || count < 0 || began !== localFitnessDate(captured)) {
      setDeviceStepsStatus('unusable'); return;
    }
    setDeviceStepCount(count);
    setStepSnapshot({ date: began, readAt: observedAt.toISOString() });
    setDeviceStepsStatus('ready');
  }, []);

  useEffect(() => {
    // Mount-only (not tied to the `focus` listener like fetchAll) — this is what keeps
    // the permission check to once per screen visit rather than once per re-focus.
    void Promise.resolve().then(checkDeviceSteps);
  }, [checkDeviceSteps]);

  useEffect(() => {
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') { sensorVersion.current++; setDeviceStepCount(null); setStepSnapshot(null); setDeviceStepsStatus('unusable'); if (navigation.isFocused()) void fetchAll(); }
    });
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(() => {
        sensorVersion.current++;
        setDeviceStepCount(null); setStepSnapshot(null); setDeviceStepsStatus('unusable'); if (navigation.isFocused()) void fetchAll(); schedule();
      }, midnight.getTime() - now.getTime() + 1000);
    };
    schedule();
    return () => { foreground.remove(); clearTimeout(timer); };
  }, [fetchAll, navigation]);

  const handleEnableDeviceSteps = () => {
    // A user-initiated retry, not an automatic re-prompt — safe to call requestPermission()
    // again here since the user explicitly tapped "Enable".
    checkDeviceSteps();
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAll();
  };

  const handleLogToday = () => navigation.navigate('LogFitness');
  const handleGoals = () => navigation.navigate('FitnessGoals');
  const handleProfile = () => navigation.navigate('FitnessProfile');

  const handleQuickAddWater = async (incrementMl: number) => {
    // logWater is an upsert-by-date that stores the day's running TOTAL, not an individual
    // entry (see WaterIntakeViewSet.perform_create) — so each tap must submit
    // currentTotal + increment, never just the increment alone, or the day's total would
    // get overwritten down to the increment instead of accumulating.
    if (isLoggingWater) return;
    const baseline = waterToday;
    const newTotal = (baseline?.amountMl ?? 0) + incrementMl;

    setIsLoggingWater(true);
    setWaterToday((prev) => (prev ? { ...prev, amountMl: newTotal } : prev)); // optimistic
    try {
      const confirmed = await logWater(newTotal);
      setWaterToday(confirmed);
    } catch (err) {
      setWaterToday(baseline); // revert the optimistic update
      setError(toApiErrorMessage(err, 'Failed to log water'));
    } finally {
      setIsLoggingWater(false);
    }
  };

  const handleSyncSteps = () => {
    if (deviceStepCount === null || syncGuard.current) return;
    if (!stepSnapshot || stepSnapshot.date !== localFitnessDate() || stepSnapshot.date !== today?.date) {
      setError('This snapshot belongs to another day. Refresh your daily record and phone snapshot.');
      setDeviceStepCount(null); setStepSnapshot(null); setDeviceStepsStatus('unusable'); void fetchAll(); return;
    }

    const syncNow = async () => {
      if (syncGuard.current) return;
      syncGuard.current = true;
      setIsSyncingSteps(true);
      try {
        const updated = await upsertToday({ date: stepSnapshot.date, steps: deviceStepCount, stepSource: 'sensor', stepsObservedAt: stepSnapshot.readAt });
        setToday(updated);
        try {
          const [activeGoals, trendRows] = await Promise.all([getGoals(true), getTrends(7)]);
          setGoals(activeGoals);
          setTrends(trendRows);
          await notifyFitnessAchievements(activeGoals);
        } catch (err) {
          setError(toApiErrorMessage(err, 'Steps saved, but goal progress could not refresh. Pull to retry.'));
        }
      } catch (err) {
        Alert.alert('Error', toApiErrorMessage(err, 'Failed to sync your step count'));
      } finally {
        syncGuard.current = false;
        setIsSyncingSteps(false);
      }
    };

    const loggedSteps = today?.steps ?? 0;
    // Nothing to overwrite yet (still the default/unset 0) or the counts already agree —
    // sync straight away. Otherwise, this would silently clobber a manually-logged number,
    // so confirm first (see the manual-sync design note at the top of pedometerService.ts).
    if (loggedSteps === 0 || loggedSteps === deviceStepCount) {
      syncNow();
      return;
    }

    Alert.alert(
      'Replace logged steps?',
      `Replace your logged ${loggedSteps.toLocaleString()} steps with ${deviceStepCount.toLocaleString()} from your phone?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', onPress: syncNow },
      ]
    );
  };

  const handleOpenNewRoutineForm = () => {
    setEditingRoutineId(null);
    setFormRoutineName('');
    setFormExercises([EMPTY_EXERCISE_ROW]);
    setFormRoutineNameError(null);
    setFormError(null);

    setIsRoutineFormOpen(true);
  };

  const handleOpenEditRoutineForm = (routine: WorkoutRoutineDto) => {
    setEditingRoutineId(routine.id);
    setFormRoutineName(routine.name);
    setFormExercises(
      routine.exercises.length > 0
        ? routine.exercises.map((ex) => ({
            exercise: ex.exercise,
            mode: ex.duration_min !== undefined && ex.duration_min !== null ? 'duration' : 'reps',
            sets: ex.sets !== undefined && ex.sets !== null ? String(ex.sets) : '',
            reps: ex.reps !== undefined && ex.reps !== null ? String(ex.reps) : '',
            durationMin: ex.duration_min !== undefined && ex.duration_min !== null ? String(ex.duration_min) : '',
          }))
        : [EMPTY_EXERCISE_ROW]
    );
    setFormRoutineNameError(null);
    setFormError(null);
    setIsRoutineFormOpen(true);
  };

  const handleCloseRoutineForm = () => {
    setIsRoutineFormOpen(false);
    setEditingRoutineId(null);
  };

  const handleAddExerciseRow = () => {
    setFormExercises((rows) => [...rows, EMPTY_EXERCISE_ROW]);
  };

  const handleRemoveExerciseRow = (index: number) => {
    setFormExercises((rows) => rows.filter((_, i) => i !== index));
  };

  const handleExerciseTextChange = (
    index: number,
    field: 'exercise' | 'sets' | 'reps' | 'durationMin',
    value: string
  ) => {
    setFormExercises((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const handleExerciseModeChange = (index: number, mode: ExerciseMode) => {
    setFormExercises((rows) => rows.map((row, i) => (i === index ? { ...row, mode } : row)));
  };

  const handleSaveRoutine = async () => {
    setFormRoutineNameError(null);
    setFormError(null);

    const trimmedName = formRoutineName.trim();
    if (!trimmedName) {
      setFormRoutineNameError('Routine name is required.');
      return;
    }
    if (formExercises.length === 0) {
      setFormError('Add at least one exercise.');
      return;
    }
    if (formExercises.some((row) => !row.exercise.trim())) {
      // Matches the backend's validate_exercises rule: sets/reps/duration_min stay
      // optional (an exercise can be rep-based or duration-based), only the exercise name
      // itself is required — a nameless entry isn't usable data.
      setFormError('Each exercise needs a name.');
      return;
    }

    const exercisesPayload = formExercises.map(buildExercisePayload);

    setIsSavingRoutine(true);
    try {
      if (editingRoutineId) {
        await updateRoutine(editingRoutineId, { name: trimmedName, exercises: exercisesPayload });
      } else {
        await createRoutine({ name: trimmedName, exercises: exercisesPayload });
      }
      handleCloseRoutineForm();
      await fetchRoutines();
    } catch (err) {
      // Duplicate-name conflicts (see WorkoutRoutineViewSet.perform_create) come back as a
      // 400 with the message under the 'name' field — surface that on the name input
      // itself rather than a generic alert/banner, so it reads as "fix this field", not
      // "something broke".
      const nameError = getFieldError(err, 'name');
      if (nameError) {
        setFormRoutineNameError(nameError);
      } else {
        setFormError(toApiErrorMessage(err, 'Failed to save routine'));
      }
    } finally {
      setIsSavingRoutine(false);
    }
  };

  const handleDeleteRoutine = (routine: WorkoutRoutineDto) => {
    Alert.alert('Delete Routine', `Delete "${routine.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRoutine(routine.id);
            await fetchRoutines();
          } catch (err) {
            Alert.alert('Error', toApiErrorMessage(err, 'Failed to delete routine'));
          }
        },
      },
    ]);
  };

  const handleLogRoutine = async (routine: WorkoutRoutineDto) => {
    if (loggingRoutineId) return;
    setLoggingRoutineId(routine.id);
    try {
      // The backend appends this routine's exercises onto today's workout_log and returns
      // the updated FitnessRecord — use it to refresh `today` directly instead of a
      // separate refetch, so the dashboard reflects the newly logged exercises immediately.
      const updatedRecord = await logRoutine(routine.id);
      setToday(updatedRecord);
      Alert.alert('Logged', `${routine.name} added to today's workout.`);
    } catch (err) {
      Alert.alert('Error', toApiErrorMessage(err, 'Failed to log routine'));
    } finally {
      setLoggingRoutineId(null);
    }
  };

  const estimate = today?.estimatedActiveCalories;
  const estimatedLabel = estimate === null || estimate === undefined ? '— kcal' : `${Number(estimate).toLocaleString(undefined, { maximumFractionDigits: 1 })} kcal`;
  const incomplete = !profile?.calorieProfileReady;
  const displayedWeight = profile?.weightKg ? `${fromCanonicalMeasurement(Number(profile.weightKg), 'weight', profile.displayUnits)} ${profile.displayUnits === 'imperial' ? 'lb' : 'kg'}` : 'Weight missing';
  const displayedHeight = profile?.heightCm ? `${fromCanonicalMeasurement(Number(profile.heightCm), 'height', profile.displayUnits)} ${profile.displayUnits === 'imperial' ? 'in' : 'cm'}` : 'Height missing';
  return <SafeAreaView style={s.container}>
    <ModuleHeader title="Fitness" subtitle="Your activity, at a glance." actions={[
      { icon: 'flag-outline', label: 'Fitness goals', onPress: handleGoals },
      { icon: 'settings-outline', label: 'Edit fitness profile', onPress: handleProfile },
    ]} />
    <PillTabs tabs={[{ key: 'overview', label: 'Today' }, { key: 'workouts', label: 'Workout' }, { key: 'goals', label: 'Goals' }, { key: 'trends', label: 'Trends' }]} value={tab} onChange={setTab} />
    {loading ? <CenterLoader /> : <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
        {error ? <Card><ErrorText text={error} /><Text style={s.muted}>Saved values may be out of date. Retry to refresh.</Text><SecondaryButton label="Retry" onPress={handleRefresh} /></Card> : null}
        {tab === 'overview' ? <>
          <HeroCard label="Estimated active calories" value={estimatedLabel}>
            <Text style={{ color: Colors.white, fontFamily: Font.medium, fontSize: 13 }}>{today?.date ?? 'Daily record unavailable'} · walking energy above rest</Text>
            <HeroStats>
              <HeroStat icon="walk-outline" label="Steps" value={today?.stepsAvailable ? today.steps.toLocaleString() : 'No data'} />
              <HeroStat icon="scale-outline" label={`Weight (${profile?.displayUnits === 'imperial' ? 'lb' : 'kg'})`} value={profile?.weightKg ? fromCanonicalMeasurement(Number(profile.weightKg), 'weight', profile.displayUnits) : 'Not set'} />
            </HeroStats>
            <HeroStats>
              <HeroStat icon="moon-outline" label="Sleep" value={today?.sleepDurationMinutes !== null && today?.sleepDurationMinutes !== undefined ? formatSleepDuration(today.sleepDurationMinutes) : 'No data'} />
            </HeroStats>
          </HeroCard>
          {incomplete ? <Card title="Set up your fitness profile"><Text style={s.body}>Add your own weight, age and height. Setup is optional for the rest of the app.</Text><PrimaryButton label="Edit fitness profile" icon="person-outline" onPress={handleProfile} /></Card>
            : <EntryCard icon="person-outline" title="Edit fitness profile" meta={`${displayedWeight} · ${displayedHeight} · ${profile?.age} years`} onPress={handleProfile} />}
          <PrimaryButton label="Log Today" icon="add" onPress={handleLogToday} />
          {today?.workoutLog?.length ? <Text style={s.muted}>{today.workoutLog.length} exercises logged today.</Text> : null}
          <EntryCard icon="moon-outline" title="Sleep Tracking" meta="Record bedtime, wake-up time and sleep history" onPress={() => navigation.navigate('SleepTracking')} />
          <Card title="Device steps">
            {deviceStepsStatus === 'checking' ? <Text style={s.body}>Checking your phone’s step count…</Text> : null}
            {deviceStepsStatus === 'unsupported' ? <Text style={s.body}>Automatic step counting is not supported on this device. Manual logging is available.</Text> : null}
            {deviceStepsStatus === 'permission-denied' ? <><Text style={s.body}>Motion & fitness permission is required to read the phone’s steps. Logged data is preserved.</Text><SecondaryButton label="Enable motion access" onPress={handleEnableDeviceSteps} /></> : null}
            {deviceStepsStatus === 'unusable' ? <Text style={s.body}>No usable phone snapshot. Your saved steps have not been changed.</Text> : null}
            {deviceStepsStatus === 'ready' && deviceStepCount !== null ? <>
              <Text style={s.bodyStrong}>{deviceStepCount.toLocaleString()} steps detected</Text>
              <Text style={s.body}>Snapshot {stepSnapshot?.date} at {stepSnapshot ? new Date(stepSnapshot.readAt).toLocaleTimeString() : 'unknown time'}. Sync replaces the day’s total; it does not add steps or calories again.</Text>
              <PrimaryButton label="Sync to log" onPress={handleSyncSteps} loading={isSyncingSteps} />
            </> : null}
            <SecondaryButton label="Refresh phone snapshot" onPress={() => { if (deviceStepsStatus !== 'checking') void checkDeviceSteps(); }} />
          </Card>
          <Card title="Water" right={<SecondaryButton label="Adjust goal" onPress={handleProfile} />}>
            <Text style={s.bodyStrong}>{waterToday?.amountMl.toLocaleString() ?? '—'} / {profile?.waterGoalMl.toLocaleString() ?? '—'} ml</Text>
            <ProgressBar pct={profile?.waterGoalMl && waterToday ? waterToday.amountMl / profile.waterGoalMl * 100 : 0} />
            <View style={s.grid}><PrimaryButton label="+250 ml" loading={isLoggingWater} disabled={!waterToday} onPress={() => { void handleQuickAddWater(250); }} style={{ flex: 1 }} /><PrimaryButton label="+500 ml" disabled={isLoggingWater || !waterToday} onPress={() => { void handleQuickAddWater(500); }} style={{ flex: 1 }} /></View>
          </Card>
        </> : null}
        {tab === 'workouts' ? <>
          <SectionHeader title="Workout routines" />
          <Text style={s.body}>Save, edit and log your existing exercise routines. Exercise logs are not counted as completed workout sessions.</Text>
          {!routines.length ? <EmptyCard text="No routines yet. Add your first routine below." icon="barbell-outline" /> : null}
          {routines.map((routine) => <Card key={routine.id} title={routine.name}>
            <Text style={s.body}>{routine.exercises.length} exercises</Text>
            <PrimaryButton label="Log routine today" onPress={() => { void handleLogRoutine(routine); }} loading={loggingRoutineId === routine.id} disabled={Boolean(loggingRoutineId)} />
            <SecondaryButton label="Edit routine" onPress={() => { if (!isSavingRoutine) handleOpenEditRoutineForm(routine); }} />
            <SecondaryButton label="Delete routine" danger onPress={() => handleDeleteRoutine(routine)} />
          </Card>)}
          {!isRoutineFormOpen ? <PrimaryButton label="New routine" icon="add" onPress={handleOpenNewRoutineForm} /> : <FormCard>
            <Text style={s.bodyStrong}>{editingRoutineId ? 'Edit routine' : 'New routine'}</Text>
            <Field label="Routine name"><Input accessibilityLabel="Routine name" value={formRoutineName} onChangeText={setFormRoutineName} editable={!isSavingRoutine} /></Field>
            <ErrorText text={formRoutineNameError} />
            {formExercises.map((row, index) => <View key={index} style={{ gap: 10 }}>
              <Field label={`Exercise ${index + 1}`}><Input accessibilityLabel={`Exercise ${index + 1} name`} value={row.exercise} onChangeText={(v) => handleExerciseTextChange(index, 'exercise', v)} editable={!isSavingRoutine} /></Field>
              <Segmented options={[{ key: 'reps', label: 'Sets & reps' }, { key: 'duration', label: 'Duration' }]} value={row.mode} onChange={(v) => { if (!isSavingRoutine) handleExerciseModeChange(index, v); }} />
              {row.mode === 'reps' ? <View style={s.grid}><View style={{ flex: 1 }}><Field label="Sets"><Input value={row.sets} keyboardType="number-pad" onChangeText={(v) => handleExerciseTextChange(index, 'sets', v)} editable={!isSavingRoutine} /></Field></View><View style={{ flex: 1 }}><Field label="Reps"><Input value={row.reps} keyboardType="number-pad" onChangeText={(v) => handleExerciseTextChange(index, 'reps', v)} editable={!isSavingRoutine} /></Field></View></View>
                : <Field label="Duration (minutes)"><Input value={row.durationMin} keyboardType="decimal-pad" onChangeText={(v) => handleExerciseTextChange(index, 'durationMin', v)} editable={!isSavingRoutine} /></Field>}
              <SecondaryButton label={`Remove exercise ${index + 1}`} onPress={() => { if (!isSavingRoutine) handleRemoveExerciseRow(index); }} />
            </View>)}
            <SecondaryButton label="Add exercise" onPress={() => { if (!isSavingRoutine) handleAddExerciseRow(); }} />
            <ErrorText text={formError} />
            <PrimaryButton label="Save routine" loading={isSavingRoutine} onPress={() => { void handleSaveRoutine(); }} />
            <SecondaryButton label="Cancel" onPress={() => { if (!isSavingRoutine) handleCloseRoutineForm(); }} />
          </FormCard>}
        </> : null}
        {tab === 'goals' ? <>
          <EntryCard icon="flag-outline" title="Manage fitness goals" meta="Create, edit or archive your personal targets" onPress={handleGoals} />
          {!goals.length ? <EmptyCard text="No active goals. Set a personal target to see progress." icon="flag-outline" /> : null}
          {goals.map((goal) => <Card key={goal.id} title={GOAL_LABELS[goal.goalType] ?? goal.goalType}><GoalProgress goal={goal} /></Card>)}
        </> : null}
        {tab === 'trends' ? <>
          <Card title="Recorded steps · last 7 days">
            {trends.length ? <BarChart labels={trends.map((r) => r.date.slice(5))} series={[{ label: 'Recorded steps', color: Colors.primary, values: trends.map((r) => r.stepsAvailable ? r.steps : 0) }]} /> : <Text style={s.body}>No activity records yet.</Text>}
            <Text style={s.muted}>Missing step readings are unavailable, not recorded zero. Details below show the difference.</Text>
          </Card>
          {trends.map((row) => <Card key={row.date} title={row.date}>
            <Text style={s.body}>Steps: {row.stepsAvailable ? row.steps.toLocaleString() : 'No data'}</Text>
            <Text style={s.body}>{row.calorieSource === 'manual' ? 'Manual calorie override' : 'Estimated active calories'}: {row.caloriesBurned === null ? 'No data' : `${row.caloriesBurned.toLocaleString()} kcal`}</Text>
            <Text style={s.body}>Sleep logged: {formatSleepDuration(row.sleepDurationMinutes)}</Text>
          </Card>)}
          <Text style={s.muted}>Completed days retain the original estimate and measurements. Manual calorie overrides replace estimates; they are never added together.</Text>
        </> : null}
      </ScrollView>
    </KeyboardAvoidingView>}
  </SafeAreaView>;
}
