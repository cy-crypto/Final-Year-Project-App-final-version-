import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import { api, parseJsonData, toApiErrorMessage } from '../services/api';
import { Colors } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';

type AddMedicationScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

type MedicationFrequency = 'daily' | 'twice_daily' | 'three_times_daily' | 'weekly' | 'as_needed';

export function AddMedicationScreen() {
  const navigation = useNavigation<AddMedicationScreenNavigationProp>();
  
  // Form state
  const [medicationName, setMedicationName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState<MedicationFrequency>('daily');
  const [scheduleTimes, setScheduleTimes] = useState<string[]>(['08:00']);
  const [supplyCount, setSupplyCount] = useState('');
  const [refillThreshold, setRefillThreshold] = useState('');
  const [notes, setNotes] = useState('');
  
  // UI state
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedTimeIndex, setSelectedTimeIndex] = useState(0);
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Update schedule times based on frequency
  React.useEffect(() => {
    switch (frequency) {
      case 'daily':
        setScheduleTimes(['08:00']);
        break;
      case 'twice_daily':
        setScheduleTimes(['08:00', '20:00']);
        break;
      case 'three_times_daily':
        setScheduleTimes(['08:00', '14:00', '20:00']);
        break;
      case 'weekly':
      case 'as_needed':
        setScheduleTimes(['09:00']);
        break;
    }
  }, [frequency]);

  const handleAddMedication = async () => {
    setLocalError(null);
    setIsSaving(true);
    
    const trimmedName = medicationName.trim();
    const trimmedDosage = dosage.trim();
    
    // Validation
    if (!trimmedName) {
      setLocalError('Medication name is required.');
      setIsSaving(false);
      return;
    }
    
    if (!trimmedDosage) {
      setLocalError('Dosage is required.');
      setIsSaving(false);
      return;
    }

    const payload = {
      name: trimmedName,
      dosage: trimmedDosage,
      frequency,
      schedule_times: scheduleTimes,
      supply_count: parseInt(supplyCount) || 0,
      refill_threshold: parseInt(refillThreshold) || 7,
      notes: notes.trim()
    };
    
    console.log('Sending payload to backend:', payload);

    try {
      const response = await api.post('/medications/', payload);
      const data = parseJsonData(response.data);
      
      if (!data) {
        setLocalError('Unable to add medication. Please try again.');
        setIsSaving(false);
        return;
      }

      // Navigate back to MedicationScreen on success
      Alert.alert(
        'Success',
        'Medication added successfully!',
        [
          { 
            text: 'OK', 
            onPress: () => navigation.goBack() 
          }
        ]
      );
    } catch (error) {
      console.error('Error adding medication:', error);
      setLocalError(toApiErrorMessage(error, 'Failed to add medication. Please check your connection and try again.'));
      setIsSaving(false);
    }
  };

  const handleTimeChange = (event: any, selectedDate?: Date) => {
    setShowTimePicker(false);
    
    if (event.type === 'set' && selectedDate) {
      setSelectedDate(selectedDate);
      const timeStr = selectedDate.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
      
      const newScheduleTimes = [...scheduleTimes];
      newScheduleTimes[selectedTimeIndex] = timeStr;
      setScheduleTimes(newScheduleTimes);
    }
  };

  const showTimePickerForIndex = (index: number) => {
    setSelectedTimeIndex(index);
    setShowTimePicker(true);
  };

  const formatTimeDisplay = (time: string) => {
    if (!time) return 'Select time';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const minute = parseInt(minutes);
    const date = new Date();
    date.setHours(hour, minute);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const handleGoBack = () => {
    navigation.goBack();
  };

  const frequencyOptions: { value: MedicationFrequency; label: string }[] = [
    { value: 'daily', label: 'Daily' },
    { value: 'twice_daily', label: 'Twice Daily' },
    { value: 'three_times_daily', label: 'Three Times Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'as_needed', label: 'As Needed' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.modalHeader}>
          <Pressable onPress={handleGoBack}>
            <Text style={styles.backButton}>← Back</Text>
          </Pressable>
          <Text style={styles.modalTitle}>Add New Medication</Text>
          <View style={styles.placeholder} />
        </View>
        
        <View style={styles.formCard}>
          {/* Medication Name */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Medication Name</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g. Paracetamol"
              placeholderTextColor="#9CA3AF"
              value={medicationName}
              onChangeText={setMedicationName}
            />
          </View>

          {/* Dosage */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Dosage</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g. 500mg"
              placeholderTextColor="#9CA3AF"
              value={dosage}
              onChangeText={setDosage}
            />
          </View>

          {/* Frequency */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Frequency</Text>
            <View style={styles.frequencyContainer}>
              {frequencyOptions.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.frequencyButton,
                    frequency === option.value && styles.frequencyButtonActive
                  ]}
                  onPress={() => setFrequency(option.value)}
                >
                  <Text style={[
                    styles.frequencyButtonText,
                    frequency === option.value && styles.frequencyButtonTextActive
                  ]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Schedule Times */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Schedule Times</Text>
            <View style={styles.scheduleTimesContainer}>
              {scheduleTimes.map((time, index) => (
                <Pressable 
                  key={index} 
                  style={styles.timePickerButton} 
                  onPress={() => showTimePickerForIndex(index)}
                >
                  <Text style={styles.timePickerText}>
                    {formatTimeDisplay(time)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Supply Count */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Supply Count (tablets/units)</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g. 30"
              placeholderTextColor="#9CA3AF"
              value={supplyCount}
              onChangeText={setSupplyCount}
              keyboardType="numeric"
            />
          </View>

          {/* Refill Threshold */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Refill Alert (days before empty)</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g. 7"
              placeholderTextColor="#9CA3AF"
              value={refillThreshold}
              onChangeText={setRefillThreshold}
              keyboardType="numeric"
            />
          </View>

          {/* Notes */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Notes / Doctor Instructions</Text>
            <TextInput
              style={[styles.formInput, styles.formTextarea]}
              placeholder="e.g. Take after meals"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              value={notes}
              onChangeText={setNotes}
            />
          </View>

          {/* Add Medication Button */}
          <Pressable 
            style={[styles.addMedicationButton, isSaving && styles.addMedicationButtonDisabled]} 
            onPress={handleAddMedication} 
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={styles.addMedicationButtonText}>Add Medication</Text>
            )}
          </Pressable>

          {localError ? <Text style={styles.errorText}>{localError}</Text> : null}
        </View>

        {showTimePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="time"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={handleTimeChange}
          />
        )}
      </ScrollView>
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
    marginHorizontal: 16,
    marginBottom: 32,
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
    fontWeight: '400',
    color: Colors.textPrimary,
  },
  formTextarea: {
    height: 80,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  frequencyContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  frequencyButton: {
    height: 42,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    minWidth: '45%',
  },
  frequencyButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  frequencyButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  frequencyButtonTextActive: {
    color: Colors.white,
  },
  scheduleTimesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timePickerButton: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.white,
    height: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
    minWidth: 100,
  },
  timePickerText: {
    fontSize: 14,
    fontWeight: '400',
    color: Colors.textPrimary,
  },
  addMedicationButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  addMedicationButtonDisabled: {
    backgroundColor: Colors.primaryLight,
  },
  addMedicationButtonText: {
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
