import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import {
  getGoals,
  createOrUpdateGoal,
  patchGoal,
  deleteGoal,
  FitnessGoalDto,
  GoalType,
} from '../services/fitnessService';
import { toApiErrorMessage } from '../services/api';
import { Colors } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';

type FitnessGoalsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const GOAL_TYPE_OPTIONS: { value: GoalType; label: string }[] = [
  { value: 'steps', label: 'Daily Steps' },
  { value: 'calories', label: 'Calories Burned' },
  { value: 'sleep', label: 'Sleep' },
  { value: 'workout_frequency', label: 'Workout Frequency' },
];

export function FitnessGoalsScreen() {
  const navigation = useNavigation<FitnessGoalsScreenNavigationProp>();

  const [goals, setGoals] = useState<FitnessGoalDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formGoalType, setFormGoalType] = useState<GoalType>('steps');
  const [formTargetValue, setFormTargetValue] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchGoals = useCallback(async () => {
    try {
      const data = await getGoals();
      setGoals(data);
      setError(null);
    } catch (err) {
      setError(toApiErrorMessage(err, 'Failed to load goals'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchGoals();
  };

  const handleGoBack = () => navigation.goBack();

  const handleSaveGoal = async () => {
    setFormError(null);
    const trimmed = formTargetValue.trim();
    const parsed = Number(trimmed);
    if (!trimmed || Number.isNaN(parsed) || parsed <= 0) {
      setFormError('Target must be greater than 0.');
      return;
    }

    setIsSaving(true);
    try {
      await createOrUpdateGoal({ goalType: formGoalType, targetValue: trimmed });
      setFormTargetValue('');
      await fetchGoals();
    } catch (err) {
      setFormError(toApiErrorMessage(err, 'Failed to save goal'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (goal: FitnessGoalDto, value: boolean) => {
    // Safe as a POST-free partial update — target_value is required on the upsert POST
    // endpoint, so toggling active state must go through PATCH instead (see backend notes).
    try {
      await patchGoal(goal.id, { isActive: value });
      await fetchGoals();
    } catch (err) {
      Alert.alert('Error', toApiErrorMessage(err, 'Failed to update goal'));
    }
  };

  const handleDelete = (goal: FitnessGoalDto) => {
    Alert.alert('Delete Goal', `Delete your ${GOAL_TYPE_OPTIONS.find((o) => o.value === goal.goalType)?.label} goal?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteGoal(goal.id);
            await fetchGoals();
          } catch (err) {
            Alert.alert('Error', toApiErrorMessage(err, 'Failed to delete goal'));
          }
        },
      },
    ]);
  };

  const existingTypes = new Set(goals.map((g) => g.goalType));

  const renderGoal = ({ item }: { item: FitnessGoalDto }) => (
    <View style={[styles.goalCard, !item.isActive && styles.goalCardInactive]}>
      <View style={styles.goalCardTop}>
        <View style={styles.goalCardInfo}>
          <Text style={styles.goalLabel}>{GOAL_TYPE_OPTIONS.find((o) => o.value === item.goalType)?.label ?? item.goalType}</Text>
          <Text style={styles.goalMeta}>
            Target: {Number(item.targetValue).toLocaleString()} {item.unit}
          </Text>
          {!item.isActive && <Text style={styles.inactiveBadge}>Inactive</Text>}
        </View>
        <Switch value={item.isActive} onValueChange={(value) => handleToggleActive(item, value)} />
      </View>
      <Pressable style={styles.deleteButton} onPress={() => handleDelete(item)}>
        <Text style={styles.deleteButtonText}>Delete</Text>
      </Pressable>
    </View>
  );

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
        <Text style={styles.modalTitle}>Fitness Goals</Text>
        <View style={styles.placeholder} />
      </View>

      <FlatList
        data={goals}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={<Text style={styles.emptyText}>{error ? error : 'No goals yet — add one below.'}</Text>}
        ListHeaderComponent={
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Add / Update Goal</Text>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={formGoalType} onValueChange={(v) => setFormGoalType(v)}>
                {GOAL_TYPE_OPTIONS.map((option) => (
                  <Picker.Item
                    key={option.value}
                    label={existingTypes.has(option.value) ? `${option.label} (update existing)` : option.label}
                    value={option.value}
                  />
                ))}
              </Picker>
            </View>
            <TextInput
              style={styles.formInput}
              placeholder="Target value"
              placeholderTextColor="#9CA3AF"
              keyboardType="decimal-pad"
              value={formTargetValue}
              onChangeText={setFormTargetValue}
            />
            <Pressable style={[styles.saveButton, isSaving && styles.saveButtonDisabled]} onPress={handleSaveGoal} disabled={isSaving}>
              {isSaving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.saveButtonText}>Save Goal</Text>}
            </Pressable>
            {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
            <Text style={styles.sectionTitle}>Your Goals</Text>
          </View>
        }
        renderItem={renderGoal}
      />
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
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  formCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.white,
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
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: Colors.primaryLight,
  },
  saveButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  errorText: {
    color: Colors.error,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 8,
  },
  emptyText: {
    textAlign: 'center',
    color: Colors.textHint,
    marginTop: 14,
  },
  goalCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 12,
    gap: 8,
  },
  goalCardInactive: {
    opacity: 0.6,
  },
  goalCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalCardInfo: {
    flex: 1,
    gap: 4,
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
  inactiveBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.warning,
  },
  deleteButton: {
    alignSelf: 'flex-start',
  },
  deleteButtonText: {
    fontSize: 13,
    color: Colors.error,
    fontWeight: '600',
  },
});
