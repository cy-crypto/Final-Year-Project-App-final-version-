import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/theme';

interface AdhanOption {
  id: string;
  label: string;
  description: string;
}

export function AdhanSettingsScreen() {
  const navigation = useNavigation();
  const [selectedAdhan, setSelectedAdhan] = useState('adhan_makkah');
  const [adhanEnabled, setAdhanEnabled] = useState(false);

  const adhanOptions: AdhanOption[] = [
    { id: 'adhan_makkah', label: 'Makkah Adhan', description: 'Classic Adhan from Masjid al-Haram' },
    { id: 'adhan_madinah', label: 'Madinah Adhan', description: 'Adhan from Masjid an-Nabawi' },
    { id: 'adhan_aqsa', label: 'Al-Aqsa Adhan', description: 'Adhan from Masjid al-Aqsa' },
    { id: 'adhan_egypt', label: 'Egyptian Adhan', description: 'Traditional Egyptian style Adhan' },
    { id: 'default', label: 'Default Sound', description: 'Default notification sound' },
  ];

  useEffect(() => {
    loadSavedPreferences();
  }, []);

  const loadSavedPreferences = async () => {
    try {
      const savedAdhan = await AsyncStorage.getItem('selected_adhan');
      if (savedAdhan) {
        setSelectedAdhan(savedAdhan);
      }
      
      const adhanEnabled = await AsyncStorage.getItem('adhan_enabled');
      setAdhanEnabled(adhanEnabled === 'true');
    } catch (error) {
      console.log('Error loading Adhan preferences:', error);
    }
  };

  const toggleAdhanEnabled = async () => {
    const newValue = !adhanEnabled;
    setAdhanEnabled(newValue);
    try {
      await AsyncStorage.setItem('adhan_enabled', newValue.toString());
    } catch (error) {
      console.log('Error saving Adhan enabled preference:', error);
    }
  };

  const handleAdhanSelection = async (adhanId: string) => {
    setSelectedAdhan(adhanId);
    try {
      await AsyncStorage.setItem('selected_adhan', adhanId);
    } catch (error) {
      console.log('Error saving Adhan preference:', error);
    }
  };

  const handleSave = async () => {
    try {
      await AsyncStorage.setItem('selected_adhan', selectedAdhan);
      Alert.alert(
        'Success',
        'Adhan preference saved! This will be used for your next prayer notification.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.log('Error saving Adhan preference:', error);
      Alert.alert('Error', 'Failed to save Adhan preference. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Back Button */}
      <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      {/* Title */}
      <Text style={styles.title}>Adhan Settings</Text>
      <Text style={styles.subtitle}>Choose your preferred Adhan sound for prayer notifications</Text>

      {/* Adhan Enable Toggle */}
      <View style={styles.toggleContainer}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleLabel}>Play Adhan at prayer times</Text>
          <Text style={styles.toggleDescription}>Automatically play Adhan audio when prayer time begins</Text>
        </View>
        <Pressable 
          style={[styles.toggleButton, adhanEnabled && styles.toggleButtonActive]} 
          onPress={toggleAdhanEnabled}
        >
          <View style={[styles.toggleKnob, adhanEnabled && styles.toggleKnobActive]} />
        </Pressable>
      </View>

      {/* Adhan Options */}
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {adhanOptions.map((option) => (
          <Pressable
            key={option.id}
            style={[
              styles.adhanCard,
              selectedAdhan === option.id && styles.selectedCard,
            ]}
            onPress={() => handleAdhanSelection(option.id)}
          >
            <View style={styles.adhanInfo}>
              <Text style={styles.mosqueEmoji}>🕌</Text>
              <View style={styles.textContainer}>
                <Text style={styles.adhanLabel}>{option.label}</Text>
                <Text style={styles.adhanDescription}>{option.description}</Text>
              </View>
            </View>
            <View style={styles.radioContainer}>
              <View style={[
                styles.radioButton,
                selectedAdhan === option.id && styles.radioSelected,
              ]}>
                {selectedAdhan === option.id && (
                  <View style={styles.radioInner} />
                )}
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      {/* Save Button */}
      <View style={styles.saveButtonContainer}>
        <Pressable style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save Adhan Preference</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgLight,
    paddingTop: 40,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 16,
    marginBottom: 16,
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  toggleDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 18,
  },
  toggleButton: {
    width: 48,
    height: 28,
    backgroundColor: '#d1d5db',
    borderRadius: 14,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  toggleButtonActive: {
    backgroundColor: Colors.primary,
  },
  toggleKnob: {
    width: 20,
    height: 20,
    backgroundColor: Colors.white,
    borderRadius: 10,
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  toggleKnobActive: {
    alignSelf: 'flex-end',
  },
  backButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.primary,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 24,
    lineHeight: 20,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
  },
  adhanCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  selectedCard: {
    backgroundColor: '#dcfce7',
    borderColor: Colors.primary,
  },
  adhanInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  mosqueEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  adhanLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  adhanDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 18,
  },
  radioContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#d1d5db',
    backgroundColor: Colors.white,
  },
  radioSelected: {
    borderColor: Colors.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  saveButtonContainer: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 8,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  saveButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
});
