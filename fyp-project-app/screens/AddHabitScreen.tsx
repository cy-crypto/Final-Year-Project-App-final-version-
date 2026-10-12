import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppContext } from '../context/AppContext';
import { Colors } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';

type AddHabitScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

type HabitFrequency = 'Daily' | 'Weekly';
type HabitCategory = 'Health' | 'Fitness' | 'Study' | 'Mindfulness' | 'Finance' | 'Other';

export function AddHabitScreen() {
  const { addHabit, habitsLoading } = useAppContext();
  const navigation = useNavigation<AddHabitScreenNavigationProp>();
  
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<HabitFrequency>('Daily');
  const [category, setCategory] = useState<HabitCategory>('Other');
  const [localError, setLocalError] = useState<string | null>(null);

  // Handle Android hardware back button
  useEffect(() => {
    const backAction = () => {
      navigation.goBack();
      return true; // Prevent default back behavior
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove(); // Cleanup on unmount
  }, []);

  const handleAddHabit = async () => {
    setLocalError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError('Habit name is required.');
      return;
    }

    const ok = await addHabit({ name: trimmed, frequency, category });
    if (!ok) {
      setLocalError('Unable to add habit. Please try again.');
      return;
    }

    // Navigate back to HabitsScreen on success
    navigation.goBack();
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
        <Text style={styles.modalTitle}>Add New Habit</Text>
        <View style={styles.placeholder} />
      </View>
      
      <View style={styles.formCard}>
        <Text style={styles.label}>Habit Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Read 20 minutes"
          style={styles.input}
        />

        <Text style={styles.label}>Frequency</Text>
        <View style={styles.pickerWrap}>
          <Picker
            selectedValue={frequency}
            onValueChange={(v) => setFrequency(v)}
            style={{ color: '#000000', width: '100%' }}
            dropdownIconColor="#000000"
            mode="dropdown"
          >
            <Picker.Item label="Daily" value="Daily" color="#000000" />
            <Picker.Item label="Weekly" value="Weekly" color="#000000" />
          </Picker>
        </View>

        <Text style={styles.label}>Category</Text>
        <View style={styles.pickerWrap}>
          <Picker
            selectedValue={category}
            onValueChange={(v) => setCategory(v)}
            style={{ color: '#000000', width: '100%' }}
            dropdownIconColor="#000000"
            mode="dropdown"
          >
            <Picker.Item label="Health" value="Health" color="#000000" />
            <Picker.Item label="Fitness" value="Fitness" color="#000000" />
            <Picker.Item label="Study" value="Study" color="#000000" />
            <Picker.Item label="Mindfulness" value="Mindfulness" color="#000000" />
            <Picker.Item label="Finance" value="Finance" color="#000000" />
            <Picker.Item label="Other" value="Other" color="#000000" />
          </Picker>
        </View>

        <Pressable 
          style={[styles.addButton, habitsLoading && styles.addButtonDisabled]} 
          onPress={handleAddHabit} 
          disabled={habitsLoading}
        >
          {habitsLoading ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text style={styles.addButtonText}>Add Habit</Text>
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
    fontWeight: '400',
    color: Colors.textPrimary,
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.white,
    height: 42,
    justifyContent: 'center',
  },
  picker: {
    height: 42,
    color: Colors.textPrimary,
  },
  addButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  addButtonDisabled: {
    backgroundColor: Colors.primaryLight,
  },
  addButtonText: {
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
