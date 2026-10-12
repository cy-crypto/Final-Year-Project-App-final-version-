import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
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
import { Colors } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';

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
  // Collapsed by default — this dashboard already stacks Steps/Device Steps/Water/Goals/
  // Trends, and routines aren't a daily glance-and-go item the way those are, so keeping
  // this section tucked away by default keeps the everyday scroll shorter while staying
  // one tap away (see the "Layout decision" note in the task summary).
  const [isRoutinesExpanded, setIsRoutinesExpanded] = useState(false);
  const [isRoutineFormOpen, setIsRoutineFormOpen] = useState(false);
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [formRoutineName, setFormRoutineName] = useState('');
  const [formRoutineNameError, setFormRoutineNameError] = useState<string | null>(null);
  const [formExercises, setFormExercises] = useState<ExerciseFormRow[]>([EMPTY_EXERCISE_ROW]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSavingRoutine, setIsSavingRoutine] = useState(false);
  const [loggingRoutineId, setLoggingRoutineId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [todayRecord, activeGoals, trendRows, fitnessProfile, waterRecord, routineList] = await Promise.all([
        getToday(),
        getGoals(true),
        getTrends(7),
        getProfile(),
        getWaterToday(),
        getRoutines(),
      ]);
      setToday(todayRecord);
      setGoals(activeGoals);
      setTrends(trendRows);
      setProfile(fitnessProfile);
      setWaterToday(waterRecord);
      setRoutines(routineList);
      setError(null);
    } catch (err) {
      setError(toApiErrorMessage(err, 'Failed to load fitness data'));
    } finally {
      setLoading(false);
      setRefreshing(false);
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

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchAll();
    });
    return unsubscribe;
  }, [navigation, fetchAll]);

  const checkDeviceSteps = useCallback(async () => {
    // Runs the availability -> permission -> step-count chain as a single pass behind one
    // loading state, so the device-steps section doesn't flash through intermediate UI.
    setDeviceStepsStatus('checking');
    const available = await isPedometerAvailable();
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
    if (!granted) {
      setDeviceStepsStatus('permission-denied');
      return;
    }

    const count = await getDeviceStepCountToday();
    setDeviceStepCount(count);
    setDeviceStepsStatus(count === null ? 'unusable' : 'ready');
  }, []);

  useEffect(() => {
    // Mount-only (not tied to the `focus` listener like fetchAll) — this is what keeps
    // the permission check to once per screen visit rather than once per re-focus.
    checkDeviceSteps();
  }, [checkDeviceSteps]);

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
    if (deviceStepCount === null || isSyncingSteps) return;

    const syncNow = async () => {
      setIsSyncingSteps(true);
      try {
        const updated = await upsertToday({ steps: deviceStepCount });
        setToday(updated);
      } catch (err) {
        Alert.alert('Error', toApiErrorMessage(err, 'Failed to sync your step count'));
      } finally {
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
    setIsRoutinesExpanded(true);
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

  const isFirstTime =
    today !== null &&
    today.steps === 0 &&
    Number(today.caloriesBurned) === 0 &&
    !today.sleepDurationMinutes &&
    (!today.workoutLog || today.workoutLog.length === 0) &&
    trends.every((row) => row.steps === 0 && row.caloriesBurned === 0);

  const getGoalProgress = (goal: FitnessGoalDto): { current: number; target: number } | null => {
    if (!today) return null;
    if (goal.goalType === 'steps') {
      return { current: today.steps, target: Number(goal.targetValue) };
    }
    if (goal.goalType === 'calories') {
      return { current: Number(today.caloriesBurned), target: Number(goal.targetValue) };
    }
    return null;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading fitness data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Fitness</Text>
            <Text style={styles.subtitle}>Track your daily activity.</Text>
          </View>
          <View style={styles.headerButtons}>
            <Pressable style={styles.goalsButton} onPress={handleProfile}>
              <Text style={styles.goalsButtonText}>👤</Text>
            </Pressable>
            <Pressable style={styles.goalsButton} onPress={handleGoals}>
              <Text style={styles.goalsButtonText}>🎯</Text>
            </Pressable>
          </View>
        </View>

        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

        {isFirstTime ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🏃</Text>
            <Text style={styles.emptyText}>Log your first entry to start tracking your activity.</Text>
          </View>
        ) : null}

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{today?.steps ?? 0}</Text>
            <Text style={styles.statLabel}>Steps</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{today ? Number(today.caloriesBurned).toFixed(0) : 0}</Text>
            <Text style={styles.statLabel}>Calories</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{today?.sleepDurationMinutes ?? '—'}</Text>
            <Text style={styles.statLabel}>Sleep (min)</Text>
          </View>
        </View>

        {today?.workoutLog && today.workoutLog.length > 0 ? (
          <Text style={styles.workoutLogCaption}>
            {today.workoutLog.length} exercise{today.workoutLog.length === 1 ? '' : 's'} logged today
          </Text>
        ) : null}

        <Pressable style={styles.logButton} onPress={handleLogToday}>
          <Text style={styles.logButtonText}>+ Log Today</Text>
        </Pressable>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Device Steps</Text>
          <View style={styles.deviceStepsCard}>
            {deviceStepsStatus === 'checking' ? (
              <View style={styles.deviceStepsLoadingRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.deviceStepsNote}>Checking your phone's step count...</Text>
              </View>
            ) : null}

            {deviceStepsStatus === 'unsupported' ? (
              <Text style={styles.deviceStepsNote}>Automatic step counting isn't available on this device.</Text>
            ) : null}

            {deviceStepsStatus === 'permission-denied' ? (
              <>
                <Text style={styles.deviceStepsNote}>
                  Allow motion & fitness access to see steps detected by your phone.
                </Text>
                <Pressable style={styles.enableButton} onPress={handleEnableDeviceSteps}>
                  <Text style={styles.enableButtonText}>Enable</Text>
                </Pressable>
              </>
            ) : null}

            {deviceStepsStatus === 'unusable' ? (
              <Text style={styles.deviceStepsNote}>Couldn't read your phone's step count right now.</Text>
            ) : null}

            {deviceStepsStatus === 'ready' && deviceStepCount !== null ? (
              <>
                <Text style={styles.deviceStepsValue}>Steps detected today: {deviceStepCount.toLocaleString()}</Text>
                <Text style={styles.deviceStepsNote}>
                  Detected by your phone's motion sensor — separate from your logged steps above until you sync.
                </Text>
                <Pressable
                  style={[styles.syncButton, isSyncingSteps && styles.syncButtonDisabled]}
                  onPress={handleSyncSteps}
                  disabled={isSyncingSteps}
                >
                  {isSyncingSteps ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <Text style={styles.syncButtonText}>Sync to log</Text>
                  )}
                </Pressable>
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.waterHeaderRow}>
            <Text style={styles.sectionTitle}>Water</Text>
            <Pressable onPress={handleProfile}>
              <Text style={styles.waterGoalLink}>Adjust goal</Text>
            </Pressable>
          </View>
          <View style={styles.waterCard}>
            <Text style={styles.waterAmountText}>
              {(waterToday?.amountMl ?? 0).toLocaleString()} / {(profile?.waterGoalMl ?? 2000).toLocaleString()} ml
            </Text>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(
                      ((waterToday?.amountMl ?? 0) / (profile?.waterGoalMl ?? 2000)) * 100,
                      100
                    )}%`,
                  },
                ]}
              />
            </View>
            <View style={styles.waterQuickAddRow}>
              <Pressable
                style={[styles.waterQuickAddButton, isLoggingWater && styles.waterQuickAddButtonDisabled]}
                onPress={() => handleQuickAddWater(250)}
                disabled={isLoggingWater}
              >
                <Text style={styles.waterQuickAddButtonText}>+250ml</Text>
              </Pressable>
              <Pressable
                style={[styles.waterQuickAddButton, isLoggingWater && styles.waterQuickAddButtonDisabled]}
                onPress={() => handleQuickAddWater(500)}
                disabled={isLoggingWater}
              >
                <Text style={styles.waterQuickAddButtonText}>+500ml</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Pressable
            style={styles.collapsibleHeaderRow}
            onPress={() => setIsRoutinesExpanded((expanded) => !expanded)}
          >
            <Text style={styles.sectionTitle}>
              Workout Routines{routines.length > 0 ? ` (${routines.length})` : ''}
            </Text>
            <Text style={styles.collapseChevron}>{isRoutinesExpanded ? '▾' : '▸'}</Text>
          </Pressable>

          {isRoutinesExpanded ? (
            <View style={styles.routinesCard}>
              {routines.length === 0 && !isRoutineFormOpen ? (
                <View style={styles.routinesEmptyState}>
                  <Text style={styles.routinesEmptyText}>
                    No routines yet — save your favorite workouts to log them in one tap.
                  </Text>
                  <Pressable style={styles.newRoutineButton} onPress={handleOpenNewRoutineForm}>
                    <Text style={styles.newRoutineButtonText}>+ New Routine</Text>
                  </Pressable>
                </View>
              ) : null}

              {routines.map((routine) => (
                <View key={routine.id} style={styles.routineRow}>
                  <Pressable style={styles.routineInfo} onPress={() => handleOpenEditRoutineForm(routine)}>
                    <Text style={styles.routineName}>{routine.name}</Text>
                    <Text style={styles.routineMeta}>
                      {routine.exercises.length} exercise{routine.exercises.length === 1 ? '' : 's'}
                    </Text>
                  </Pressable>
                  <View style={styles.routineActions}>
                    <Pressable
                      style={[
                        styles.logRoutineButton,
                        loggingRoutineId === routine.id && styles.logRoutineButtonDisabled,
                      ]}
                      onPress={() => handleLogRoutine(routine)}
                      disabled={loggingRoutineId === routine.id}
                    >
                      {loggingRoutineId === routine.id ? (
                        <ActivityIndicator size="small" color={Colors.white} />
                      ) : (
                        <Text style={styles.logRoutineButtonText}>Log</Text>
                      )}
                    </Pressable>
                    <Pressable style={styles.deleteRoutineButton} onPress={() => handleDeleteRoutine(routine)}>
                      <Text style={styles.deleteRoutineButtonText}>✕</Text>
                    </Pressable>
                  </View>
                </View>
              ))}

              {routines.length > 0 && !isRoutineFormOpen ? (
                <Pressable style={styles.newRoutineRow} onPress={handleOpenNewRoutineForm}>
                  <Text style={styles.newRoutineRowText}>+ New Routine</Text>
                </Pressable>
              ) : null}

              {isRoutineFormOpen ? (
                <View style={styles.routineFormCard}>
                  <Text style={styles.routineFormTitle}>{editingRoutineId ? 'Edit Routine' : 'New Routine'}</Text>

                  <TextInput
                    style={styles.formInput}
                    placeholder="Routine name"
                    placeholderTextColor="#9CA3AF"
                    value={formRoutineName}
                    onChangeText={(text) => {
                      setFormRoutineName(text);
                      if (formRoutineNameError) setFormRoutineNameError(null);
                    }}
                  />
                  {formRoutineNameError ? <Text style={styles.errorText}>{formRoutineNameError}</Text> : null}

                  {formExercises.map((row, index) => (
                    <View key={index} style={styles.exerciseFormRow}>
                      <View style={styles.exerciseFormTopRow}>
                        <TextInput
                          style={[styles.formInput, styles.exerciseNameInput]}
                          placeholder="Exercise name"
                          placeholderTextColor="#9CA3AF"
                          value={row.exercise}
                          onChangeText={(text) => handleExerciseTextChange(index, 'exercise', text)}
                        />
                        <Pressable style={styles.removeRowButton} onPress={() => handleRemoveExerciseRow(index)}>
                          <Text style={styles.removeRowButtonText}>✕</Text>
                        </Pressable>
                      </View>

                      <View style={styles.modeToggleRow}>
                        <Pressable
                          style={[styles.modeChip, row.mode === 'reps' && styles.modeChipActive]}
                          onPress={() => handleExerciseModeChange(index, 'reps')}
                        >
                          <Text style={[styles.modeChipText, row.mode === 'reps' && styles.modeChipTextActive]}>
                            Sets & Reps
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[styles.modeChip, row.mode === 'duration' && styles.modeChipActive]}
                          onPress={() => handleExerciseModeChange(index, 'duration')}
                        >
                          <Text style={[styles.modeChipText, row.mode === 'duration' && styles.modeChipTextActive]}>
                            Duration
                          </Text>
                        </Pressable>
                      </View>

                      {row.mode === 'reps' ? (
                        <View style={styles.exerciseFormBottomRow}>
                          <TextInput
                            style={[styles.formInput, styles.exerciseSmallInput]}
                            placeholder="Sets"
                            placeholderTextColor="#9CA3AF"
                            keyboardType="number-pad"
                            value={row.sets}
                            onChangeText={(text) => handleExerciseTextChange(index, 'sets', text)}
                          />
                          <TextInput
                            style={[styles.formInput, styles.exerciseSmallInput]}
                            placeholder="Reps"
                            placeholderTextColor="#9CA3AF"
                            keyboardType="number-pad"
                            value={row.reps}
                            onChangeText={(text) => handleExerciseTextChange(index, 'reps', text)}
                          />
                        </View>
                      ) : (
                        <View style={styles.exerciseFormBottomRow}>
                          <TextInput
                            style={[styles.formInput, styles.exerciseSmallInput]}
                            placeholder="Duration (min)"
                            placeholderTextColor="#9CA3AF"
                            keyboardType="number-pad"
                            value={row.durationMin}
                            onChangeText={(text) => handleExerciseTextChange(index, 'durationMin', text)}
                          />
                        </View>
                      )}
                    </View>
                  ))}

                  <Pressable style={styles.addExerciseButton} onPress={handleAddExerciseRow}>
                    <Text style={styles.addExerciseButtonText}>+ Add Exercise</Text>
                  </Pressable>

                  {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

                  <View style={styles.routineFormActions}>
                    <Pressable style={styles.cancelButton} onPress={handleCloseRoutineForm}>
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.saveRoutineButton, isSavingRoutine && styles.saveButtonDisabled]}
                      onPress={handleSaveRoutine}
                      disabled={isSavingRoutine}
                    >
                      {isSavingRoutine ? (
                        <ActivityIndicator size="small" color={Colors.white} />
                      ) : (
                        <Text style={styles.saveRoutineButtonText}>Save Routine</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {goals.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Active Goals</Text>
            {goals.map((goal) => {
              const progress = getGoalProgress(goal);
              return (
                <View key={goal.id} style={styles.goalCard}>
                  <Text style={styles.goalLabel}>{GOAL_LABELS[goal.goalType] ?? goal.goalType}</Text>
                  {progress ? (
                    <>
                      <Text style={styles.goalMeta}>
                        {progress.current.toLocaleString()} / {progress.target.toLocaleString()} {goal.unit}
                      </Text>
                      <View style={styles.progressBar}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${Math.min((progress.current / progress.target) * 100, 100)}%` },
                          ]}
                        />
                      </View>
                    </>
                  ) : (
                    <Text style={styles.goalMeta}>
                      Target: {Number(goal.targetValue).toLocaleString()} {goal.unit}
                      {'  '}(progress bar coming in Pass 2)
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Last 7 Days</Text>
          <View style={styles.trendsCard}>
            <View style={styles.trendsHeaderRow}>
              <Text style={[styles.trendsCell, styles.trendsHeaderText]}>Date</Text>
              <Text style={[styles.trendsCell, styles.trendsHeaderText]}>Steps</Text>
              <Text style={[styles.trendsCell, styles.trendsHeaderText]}>Cal</Text>
              <Text style={[styles.trendsCell, styles.trendsHeaderText]}>Sleep</Text>
            </View>
            {trends.length === 0 ? (
              <Text style={styles.trendsEmptyText}>No data yet.</Text>
            ) : (
              trends.map((row) => (
                <View key={row.date} style={styles.trendsRow}>
                  <Text style={styles.trendsCell}>{row.date.slice(5)}</Text>
                  <Text style={styles.trendsCell}>{row.steps}</Text>
                  <Text style={styles.trendsCell}>{row.caloriesBurned.toFixed(0)}</Text>
                  <Text style={styles.trendsCell}>{row.sleepDurationMinutes ?? '—'}</Text>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgLight,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.textSecondary,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.primary,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  headerButtons: {
    flexDirection: 'row',
  },
  goalsButton: {
    padding: 8,
  },
  goalsButtonText: {
    fontSize: 22,
  },
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    color: Colors.error,
    fontSize: 13,
  },
  emptyState: {
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingVertical: 14,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  logButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginBottom: 20,
  },
  logButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  deviceStepsCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 14,
    gap: 8,
  },
  deviceStepsLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deviceStepsValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.accentOlive,
  },
  deviceStepsNote: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  enableButton: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.accentOlive,
    borderRadius: 8,
    height: 36,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  enableButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 13,
  },
  syncButton: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.accentOlive,
    borderRadius: 8,
    height: 38,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  syncButtonDisabled: {
    opacity: 0.5,
  },
  syncButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  waterHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  waterGoalLink: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.accentBlue,
    marginBottom: 10,
  },
  waterCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 14,
    gap: 10,
  },
  waterAmountText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.accentBlue,
  },
  waterQuickAddRow: {
    flexDirection: 'row',
    gap: 10,
  },
  waterQuickAddButton: {
    flex: 1,
    backgroundColor: Colors.accentBlue,
    borderRadius: 8,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waterQuickAddButtonDisabled: {
    opacity: 0.5,
  },
  waterQuickAddButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  goalCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 12,
    marginBottom: 10,
    gap: 6,
  },
  goalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  goalMeta: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.borderLight,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  trendsCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 12,
  },
  trendsHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    paddingBottom: 8,
    marginBottom: 6,
  },
  trendsRow: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  trendsCell: {
    flex: 1,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  trendsHeaderText: {
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  trendsEmptyText: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 8,
  },
  workoutLogCaption: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: -8,
    marginBottom: 12,
  },
  collapsibleHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  collapseChevron: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  routinesCard: {
    gap: 10,
  },
  routinesEmptyState: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 10,
  },
  routinesEmptyText: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  newRoutineButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 38,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newRoutineButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  routineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 12,
    gap: 10,
  },
  routineInfo: {
    flex: 1,
    gap: 4,
  },
  routineName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  routineMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  routineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logRoutineButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 34,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logRoutineButtonDisabled: {
    opacity: 0.5,
  },
  logRoutineButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 13,
  },
  deleteRoutineButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteRoutineButtonText: {
    fontSize: 13,
    color: Colors.error,
  },
  newRoutineRow: {
    alignSelf: 'flex-start',
  },
  newRoutineRowText: {
    color: Colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  routineFormCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 14,
    gap: 10,
  },
  routineFormTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  formInput: {
    height: 42,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.white,
    paddingHorizontal: 12,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  errorText: {
    color: Colors.error,
    fontWeight: '600',
    fontSize: 13,
  },
  exerciseFormRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: 10,
    gap: 8,
  },
  exerciseFormTopRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  exerciseNameInput: {
    flex: 1,
  },
  removeRowButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeRowButtonText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  modeToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeChip: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.white,
  },
  modeChipActive: {
    backgroundColor: Colors.primarySurface,
    borderColor: Colors.primary,
  },
  modeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  modeChipTextActive: {
    color: Colors.primary,
  },
  exerciseFormBottomRow: {
    flexDirection: 'row',
    gap: 8,
  },
  exerciseSmallInput: {
    flex: 1,
  },
  addExerciseButton: {
    alignSelf: 'flex-start',
  },
  addExerciseButtonText: {
    color: Colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  routineFormActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelButton: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: Colors.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
  saveRoutineButton: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: Colors.primaryLight,
  },
  saveRoutineButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
});
