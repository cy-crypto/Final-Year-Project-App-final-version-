import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';

import { createTransaction, updateTransaction, TransactionType } from '../services/budgetService';
import { toApiErrorMessage } from '../services/api';
import { Colors } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';

type AddTransactionScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;
type AddTransactionScreenRouteProp = RouteProp<RootStackParamList, 'AddTransaction'>;

function todayString() {
  return new Date().toISOString().split('T')[0];
}

export function AddTransactionScreen() {
  const navigation = useNavigation<AddTransactionScreenNavigationProp>();
  const route = useRoute<AddTransactionScreenRouteProp>();
  const editingTransaction = route.params?.transaction ?? null;
  const isEditMode = editingTransaction !== null;

  const [type, setType] = useState<TransactionType>(editingTransaction?.type ?? 'expense');
  const [amount, setAmount] = useState(editingTransaction?.amount ?? '');
  const [category, setCategory] = useState(editingTransaction?.category ?? '');
  const [description, setDescription] = useState(editingTransaction?.description ?? '');
  const [date, setDate] = useState(editingTransaction?.date ?? todayString());
  const [showDatePicker, setShowDatePicker] = useState(false);
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

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (event.type === 'set' && selectedDate) {
      setDate(selectedDate.toISOString().split('T')[0]);
    }
  };

  const formatDateDisplay = (dateString: string) => {
    if (!dateString) return 'Select a date';
    const parsed = new Date(dateString);
    return parsed.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  const handleSubmit = async () => {
    setLocalError(null);

    if (type !== 'income' && type !== 'expense') {
      setLocalError('Type must be income or expense.');
      return;
    }

    const trimmedAmount = amount.trim();
    const parsedAmount = Number(trimmedAmount);
    if (!trimmedAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setLocalError('Amount must be greater than 0.');
      return;
    }

    if (!date) {
      setLocalError('Date is required.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        type,
        amount: trimmedAmount,
        category: category.trim() || undefined,
        description: description.trim() || undefined,
        date,
      };

      if (isEditMode && editingTransaction) {
        await updateTransaction(editingTransaction.id, payload);
      } else {
        await createTransaction(payload);
      }

      navigation.goBack();
    } catch (err) {
      setLocalError(toApiErrorMessage(err, isEditMode ? 'Failed to update transaction' : 'Failed to add transaction'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleGoBack = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.modalHeader}>
        <Pressable onPress={handleGoBack}>
          <Text style={styles.backButton}>← Back</Text>
        </Pressable>
        <Text style={styles.modalTitle}>{isEditMode ? 'Edit Transaction' : 'Add Transaction'}</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.formCard}>
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Type</Text>
          <View style={styles.typeContainer}>
            {(['expense', 'income'] as const).map((option) => (
              <Pressable
                key={option}
                style={[
                  styles.typeButton,
                  type === option && (option === 'income' ? styles.typeButtonIncomeActive : styles.typeButtonExpenseActive),
                ]}
                onPress={() => setType(option)}
              >
                <Text style={[styles.typeButtonText, type === option && styles.typeButtonTextActive]}>
                  {option === 'income' ? 'Income' : 'Expense'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Amount</Text>
          <TextInput
            style={styles.formInput}
            placeholder="0.00"
            placeholderTextColor="#9CA3AF"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Category (optional)</Text>
          <TextInput
            style={styles.formInput}
            placeholder="e.g. Groceries"
            placeholderTextColor="#9CA3AF"
            value={category}
            onChangeText={setCategory}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Description (optional)</Text>
          <TextInput
            style={[styles.formInput, styles.formTextarea]}
            placeholder="Add a note..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
            value={description}
            onChangeText={setDescription}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Date</Text>
          <Pressable style={styles.datePickerButton} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.datePickerText}>{formatDateDisplay(date)}</Text>
          </Pressable>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={new Date(date)}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={handleDateChange}
          />
        )}

        <Pressable
          style={[styles.submitButton, isSaving && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text style={styles.submitButtonText}>{isEditMode ? 'Save Changes' : 'Add Transaction'}</Text>
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
  formTextarea: {
    height: 80,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  typeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  typeButton: {
    flex: 1,
    height: 42,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeButtonExpenseActive: {
    backgroundColor: Colors.error,
    borderColor: Colors.error,
  },
  typeButtonIncomeActive: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  typeButtonTextActive: {
    color: Colors.white,
  },
  datePickerButton: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.white,
    height: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  datePickerText: {
    fontSize: 16,
    color: Colors.textPrimary,
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
