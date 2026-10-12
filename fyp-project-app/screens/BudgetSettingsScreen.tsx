import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { getSettings, updateSettings } from '../services/budgetService';
import { toApiErrorMessage } from '../services/api';
import { Colors } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';

type BudgetSettingsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function BudgetSettingsScreen() {
  const navigation = useNavigation<BudgetSettingsScreenNavigationProp>();

  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [currency, setCurrency] = useState('PKR');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

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
        const settings = await getSettings();
        setMonthlyLimit(settings.monthlyLimit ?? '');
        setCurrency(settings.currency || 'PKR');
      } catch (err) {
        setLocalError(toApiErrorMessage(err, 'Failed to load settings'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setLocalError(null);

    const trimmedLimit = monthlyLimit.trim();
    if (trimmedLimit) {
      const parsed = Number(trimmedLimit);
      if (Number.isNaN(parsed) || parsed <= 0) {
        setLocalError('Monthly limit must be greater than 0.');
        return;
      }
    }

    setSaving(true);
    try {
      await updateSettings({
        monthlyLimit: trimmedLimit ? trimmedLimit : null,
        currency: currency.trim() || 'PKR',
      });
      Alert.alert('Saved', 'Budget settings updated successfully.');
      navigation.goBack();
    } catch (err) {
      setLocalError(toApiErrorMessage(err, 'Failed to save settings'));
    } finally {
      setSaving(false);
    }
  };

  const handleGoBack = () => {
    navigation.goBack();
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.modalHeader}>
        <Pressable onPress={handleGoBack}>
          <Text style={styles.backButton}>← Back</Text>
        </Pressable>
        <Text style={styles.modalTitle}>Budget Settings</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.formCard}>
        <Text style={styles.label}>Monthly Limit (optional)</Text>
        <TextInput
          value={monthlyLimit}
          onChangeText={setMonthlyLimit}
          placeholder="e.g. 15000"
          keyboardType="decimal-pad"
          style={styles.input}
        />

        <Text style={styles.label}>Currency</Text>
        <TextInput
          value={currency}
          onChangeText={setCurrency}
          placeholder="PKR"
          style={styles.input}
          autoCapitalize="characters"
        />

        <Pressable
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
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
    fontSize: 24,
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
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  input: {
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
    marginTop: 8,
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
    marginTop: 4,
  },
});
