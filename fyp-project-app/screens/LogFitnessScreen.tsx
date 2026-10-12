import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { getToday, upsertToday, WorkoutLogEntry } from '../services/fitnessService';
import { toApiErrorMessage } from '../services/api';
import { Colors } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';

type LogFitnessScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

type WorkoutRow = { exercise: string; durationMin: string };

export function LogFitnessScreen() {
  const navigation = useNavigation<LogFitnessScreenNavigationProp>();

  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState('0');
  const [calories, setCalories] = useState('0');
  const [sleep, setSleep] = useState('');
  const [workoutRows, setWorkoutRows] = useState<WorkoutRow[]>([]);
  const [workoutDirty, setWorkoutDirty] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const backAction = () => {
      navigation.goBack();
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const today = await getToday();
        setSteps(String(today.steps));
        setCalories(String(Number(today.caloriesBurned)));
        setSleep(today.sleepDurationMinutes !== null ? String(today.sleepDurationMinutes) : '');
        setWorkoutRows(
          (today.workoutLog ?? []).map((entry) => ({
            exercise: entry.exercise ?? '',
            durationMin: entry.duration_min !== undefined ? String(entry.duration_min) : '',
          }))
        );
      } catch (err) {
        setLocalError(toApiErrorMessage(err, 'Failed to load today\'s entry'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleAddExercise = () => {
    setWorkoutRows((rows) => [...rows, { exercise: '', durationMin: '' }]);
    setWorkoutDirty(true);
  };

  const handleRemoveExercise = (index: number) => {
    setWorkoutRows((rows) => rows.filter((_, i) => i !== index));
    setWorkoutDirty(true);
  };

  const handleExerciseChange = (index: number, field: keyof WorkoutRow, value: string) => {
    setWorkoutRows((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
    setWorkoutDirty(true);
  };

  const handleSubmit = async () => {
    setLocalError(null);

    const parsedSteps = Number(steps);
    if (steps.trim() === '' || Number.isNaN(parsedSteps) || parsedSteps < 0) {
      setLocalError('Steps must be 0 or greater.');
      return;
    }

    const parsedCalories = Number(calories);
    if (calories.trim() === '' || Number.isNaN(parsedCalories) || parsedCalories < 0) {
      setLocalError('Calories must be 0 or greater.');
      return;
    }

    let parsedSleep: number | null = null;
    if (sleep.trim()) {
      parsedSleep = Number(sleep);
      if (Number.isNaN(parsedSleep) || parsedSleep < 0) {
        setLocalError('Sleep must be 0 or greater.');
        return;
      }
    }

    setIsSaving(true);
    try {
      const payload: Parameters<typeof upsertToday>[0] = {
        steps: parsedSteps,
        caloriesBurned: parsedCalories,
        sleepDurationMinutes: parsedSleep,
      };
      // Only send workout_log if the user actually touched that section this visit —
      // otherwise we'd risk overwriting existing entries with an incomplete/empty array
      // just because the user re-saved their step count. See task summary for reasoning.
      if (workoutDirty) {
        const entries: WorkoutLogEntry[] = workoutRows
          .filter((row) => row.exercise.trim())
          .map((row) => ({ exercise: row.exercise.trim(), duration_min: Number(row.durationMin) || 0 }));
        payload.workoutLog = entries;
      }

      await upsertToday(payload);
      navigation.goBack();
    } catch (err) {
      setLocalError(toApiErrorMessage(err, 'Failed to save today\'s entry'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleGoBack = () => navigation.goBack();

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.modalHeader}>
        <Pressable onPress={handleGoBack}>
          <Text style={styles.backButton}>← Back</Text>
        </Pressable>
        <Text style={styles.modalTitle}>Log Today</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.formCard}>
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Steps</Text>
          <TextInput style={styles.formInput} keyboardType="number-pad" value={steps} onChangeText={setSteps} />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Calories Burned</Text>
          <TextInput style={styles.formInput} keyboardType="decimal-pad" value={calories} onChangeText={setCalories} />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Last Night's Sleep (minutes, optional)</Text>
          <TextInput
            style={styles.formInput}
            keyboardType="number-pad"
            placeholder="e.g. 420"
            placeholderTextColor="#9CA3AF"
            value={sleep}
            onChangeText={setSleep}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Workouts</Text>
          {workoutRows.map((row, index) => (
            <View key={index} style={styles.workoutRow}>
              <TextInput
                style={[styles.formInput, styles.workoutExerciseInput]}
                placeholder="Exercise"
                placeholderTextColor="#9CA3AF"
                value={row.exercise}
                onChangeText={(text) => handleExerciseChange(index, 'exercise', text)}
              />
              <TextInput
                style={[styles.formInput, styles.workoutDurationInput]}
                placeholder="Min"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                value={row.durationMin}
                onChangeText={(text) => handleExerciseChange(index, 'durationMin', text)}
              />
              <Pressable style={styles.removeRowButton} onPress={() => handleRemoveExercise(index)}>
                <Text style={styles.removeRowButtonText}>✕</Text>
              </Pressable>
            </View>
          ))}
          <Pressable style={styles.addExerciseButton} onPress={handleAddExercise}>
            <Text style={styles.addExerciseButtonText}>+ Add Exercise</Text>
          </Pressable>
        </View>

        <Pressable
          style={[styles.submitButton, isSaving && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text style={styles.submitButtonText}>Save</Text>
          )}
        </Pressable>

        {localError ? <Text style={styles.errorText}>{localError}</Text> : null}
      </View>
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
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.primary,
    textAlign: 'center',
    flex: 1,
  },
  placeholder: {
    width: 60,
  },
  formCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 16,
    marginHorizontal: 16,
    gap: 16,
  },
  formGroup: {
    gap: 8,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
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
  workoutRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  workoutExerciseInput: {
    flex: 2,
  },
  workoutDurationInput: {
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
  addExerciseButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  addExerciseButtonText: {
    color: Colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  submitButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    backgroundColor: Colors.primaryLight,
  },
  submitButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  errorText: {
    color: Colors.error,
    fontWeight: '600',
    marginTop: 4,
  },
});
