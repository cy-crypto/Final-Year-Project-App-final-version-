import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import {
  getProfile,
  updateProfile,
  createOrUpdateGoal,
  FitnessProfileDto,
  Gender,
} from '../services/fitnessService';
import { toApiErrorMessage } from '../services/api';
import { Colors } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';

type FitnessProfileScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const GENDER_OPTIONS: { value: Gender | ''; label: string }[] = [
  { value: '', label: 'Prefer not to say' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

export function FitnessProfileScreen() {
  const navigation = useNavigation<FitnessProfileScreenNavigationProp>();

  const [profile, setProfile] = useState<FitnessProfileDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formGender, setFormGender] = useState<Gender | ''>('');
  const [formHeightCm, setFormHeightCm] = useState('');
  const [formWaterGoalMl, setFormWaterGoalMl] = useState('2000');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUsingGoal, setIsUsingGoal] = useState(false);

  const applyProfileToForm = (data: FitnessProfileDto) => {
    setProfile(data);
    setFormGender(data.gender ?? '');
    setFormHeightCm(data.heightCm !== null ? String(Number(data.heightCm)) : '');
    setFormWaterGoalMl(String(data.waterGoalMl));
  };

  const fetchProfile = async () => {
    try {
      const data = await getProfile();
      applyProfileToForm(data);
      setError(null);
    } catch (err) {
      setError(toApiErrorMessage(err, 'Failed to load your fitness profile'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleGoBack = () => navigation.goBack();

  const handleSave = async () => {
    setFormError(null);

    let parsedHeight: number | null = null;
    if (formHeightCm.trim()) {
      parsedHeight = Number(formHeightCm);
      if (Number.isNaN(parsedHeight) || parsedHeight <= 0) {
        setFormError('Height must be greater than 0.');
        return;
      }
    }

    const trimmedGoal = formWaterGoalMl.trim();
    const parsedGoal = Number(trimmedGoal);
    if (!trimmedGoal || Number.isNaN(parsedGoal) || parsedGoal <= 0) {
      setFormError('Daily water goal must be greater than 0.');
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile({
        gender: formGender === '' ? null : formGender,
        heightCm: parsedHeight,
        waterGoalMl: parsedGoal,
      });
      // Refetch so suggested_step_goal/estimated_stride_cm reflect the values we just
      // saved, rather than showing stale computed fields from before the save.
      await fetchProfile();
    } catch (err) {
      setFormError(toApiErrorMessage(err, 'Failed to save your fitness profile'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleUseAsStepGoal = async () => {
    if (!profile?.suggestedStepGoal) return;
    setIsUsingGoal(true);
    try {
      await createOrUpdateGoal({
        goalType: 'steps',
        targetValue: String(profile.suggestedStepGoal),
      });
      Alert.alert('Goal Updated', `Your daily steps goal is now set to ${profile.suggestedStepGoal.toLocaleString()}.`);
    } catch (err) {
      Alert.alert('Error', toApiErrorMessage(err, 'Failed to set step goal'));
    } finally {
      setIsUsingGoal(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const suggestedStepGoal = profile?.suggestedStepGoal ?? null;
  const estimatedStrideCm = profile?.estimatedStrideCm ?? null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.modalHeader}>
        <Pressable onPress={handleGoBack}>
          <Text style={styles.backButton}>← Back</Text>
        </Pressable>
        <Text style={styles.modalTitle}>Fitness Profile</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

        <View style={styles.formCard}>
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Gender</Text>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={formGender} onValueChange={(v) => setFormGender(v)}>
                {GENDER_OPTIONS.map((option) => (
                  <Picker.Item key={option.value || 'unset'} label={option.label} value={option.value} />
                ))}
              </Picker>
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Height (cm)</Text>
            <TextInput
              style={styles.formInput}
              keyboardType="decimal-pad"
              placeholder="e.g. 175"
              placeholderTextColor="#9CA3AF"
              value={formHeightCm}
              onChangeText={setFormHeightCm}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Daily water goal (ml)</Text>
            <TextInput
              style={styles.formInput}
              keyboardType="number-pad"
              placeholder="e.g. 2000"
              placeholderTextColor="#9CA3AF"
              value={formWaterGoalMl}
              onChangeText={setFormWaterGoalMl}
            />
          </View>

          <Pressable style={[styles.saveButton, isSaving && styles.saveButtonDisabled]} onPress={handleSave} disabled={isSaving}>
            {isSaving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.saveButtonText}>Save</Text>}
          </Pressable>
          {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
        </View>

        <View style={styles.suggestionCard}>
          <Text style={styles.suggestionTitle}>Suggested Step Goal</Text>
          {suggestedStepGoal !== null ? (
            <>
              <Text style={styles.suggestionValue}>{suggestedStepGoal.toLocaleString()} steps/day</Text>
              <Text style={styles.suggestionNote}>
                Based on general guidance — adjust anytime in your Goals. This isn't a medical
                or precise calculation, just a reasonable starting point.
              </Text>
              <Pressable
                style={[styles.useGoalButton, isUsingGoal && styles.saveButtonDisabled]}
                onPress={handleUseAsStepGoal}
                disabled={isUsingGoal}
              >
                {isUsingGoal ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.useGoalButtonText}>Use this as my step goal</Text>
                )}
              </Pressable>
            </>
          ) : (
            <Text style={styles.suggestionNote}>Set your gender and height above to get a suggested step goal.</Text>
          )}

          {estimatedStrideCm !== null ? (
            <View style={styles.strideRow}>
              <Text style={styles.suggestionTitle}>Estimated Stride Length</Text>
              <Text style={styles.suggestionValue}>{estimatedStrideCm} cm</Text>
              <Text style={styles.suggestionNote}>
                A rough approximation for distance estimates, not a precise measurement.
              </Text>
            </View>
          ) : null}
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
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  errorBanner: {
    marginBottom: 8,
    color: Colors.error,
    fontSize: 13,
  },
  formCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 16,
    gap: 16,
    marginBottom: 16,
  },
  formGroup: {
    gap: 8,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
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
    marginTop: 4,
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
  suggestionCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 16,
    gap: 6,
  },
  suggestionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  suggestionValue: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.primary,
  },
  suggestionNote: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  useGoalButton: {
    backgroundColor: Colors.accentBlue,
    borderRadius: 8,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  useGoalButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  strideRow: {
    marginTop: 12,
    gap: 6,
  },
});
