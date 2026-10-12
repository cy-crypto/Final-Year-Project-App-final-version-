import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, parseJsonData, toApiErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';

type MedicationScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface Medication {
  id: number;
  name: string;
  dosage: string;
  frequency: string;
  schedule_times: string[];
  supply_count: number;
  refill_threshold: number;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface MedicationLog {
  id: number;
  medication: number;
  status: 'taken' | 'skipped' | 'deferred';
  scheduled_time: string;
  taken_at?: string;
  notes?: string;
  created_at: string;
}

export function MedicationScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<MedicationScreenNavigationProp>();
  
  const [medications, setMedications] = useState<Medication[]>([]);
  const [medicationLogs, setMedicationLogs] = useState<MedicationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    fetchMedications();
    fetchMedicationLogs();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchMedications();
      fetchMedicationLogs();
    });
    return unsubscribe;
  }, [navigation]);

  const fetchMedications = async (refresh = false) => {
    try {
      if (!refresh) {
        setLoading(true);
      }
      console.log('API base URL:', api.defaults.baseURL);
      console.log('Full URL:', `${api.defaults.baseURL}/medications/`);
      const response = await api.get('/medications/');
      const data = parseJsonData(response.data);
      setMedications(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(toApiErrorMessage(err, 'Failed to fetch medications'));
      console.error('Error fetching medications:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchMedicationLogs = async () => {
    try {
      console.log('API base URL:', api.defaults.baseURL);
      console.log('Full URL:', `${api.defaults.baseURL}/medication-logs/`);
      const response = await api.get('/medication-logs/');
      const data = parseJsonData(response.data);
      setMedicationLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching medication logs:', err);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchMedications(true);
    fetchMedicationLogs();
  };

  const getTodayDosesStats = () => {
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = medicationLogs.filter(log => 
      log.scheduled_time.startsWith(today)
    );
    
    // Calculate total scheduled doses for today
    let totalDoses = 0;
    medications.forEach(med => {
      if (med.is_active) {
        if (med.frequency === 'daily') {
          totalDoses += med.schedule_times.length || 1;
        } else if (med.frequency === 'twice_daily') {
          totalDoses += 2;
        } else if (med.frequency === 'three_times_daily') {
          totalDoses += 3;
        } else if (med.frequency === 'weekly') {
          totalDoses += 1; // Simplified for weekly
        }
      }
    });

    const takenDoses = todayLogs.filter(log => log.status === 'taken').length;
    return { taken: takenDoses, total: totalDoses };
  };

  const handleAddMedication = () => {
    navigation.navigate('AddMedication');
  };

  const handleViewHistory = () => {
    navigation.navigate('MedicationHistory');
  };

  const handleLogDose = async (medicationId: number, status: 'taken' | 'skipped' = 'taken') => {
    try {
      console.log('API base URL:', api.defaults.baseURL);
      console.log('Full URL:', `${api.defaults.baseURL}/medication-logs/`);
      const now = new Date().toISOString();
      await api.post('/medication-logs/', {
        medication: medicationId,
        status,
        scheduled_time: now,
        taken_at: status === 'taken' ? now : undefined,
      });
      fetchMedicationLogs(); // Refresh logs
      Alert.alert(
        'Success',
        `Medication ${status === 'taken' ? 'taken' : 'skipped'} successfully!`,
        [{ text: 'OK' }]
      );
    } catch (err) {
      const errorMessage = toApiErrorMessage(err, 'Failed to log dose');
      Alert.alert('Error', errorMessage);
      console.error('Error logging dose:', err);
    }
  };

  const getNextDoseTime = (medication: Medication) => {
    if (!medication.is_active || !medication.schedule_times || medication.schedule_times.length === 0) {
      return null;
    }
    
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    // Sort times and find the next one
    const sortedTimes = medication.schedule_times
      .map(time => {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
      })
      .sort((a, b) => a - b);
    
    const nextTime = sortedTimes.find(time => time > currentTime) || sortedTimes[0];
    const hours = Math.floor(nextTime / 60);
    const minutes = nextTime % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  const getFrequencyDisplay = (frequency: string) => {
    const frequencyMap: Record<string, string> = {
      'daily': 'Daily',
      'twice_daily': 'Twice Daily',
      'three_times_daily': 'Three Times Daily',
      'weekly': 'Weekly',
      'as_needed': 'As Needed',
    };
    return frequencyMap[frequency] || frequency;
  };

  const needsRefill = (medication: Medication) => {
    return medication.supply_count <= medication.refill_threshold;
  };

  const displayMedications = medications.slice(0, 3);
  const shouldShowViewAllButton = medications.length > 3;

  const handleViewAllMedications = () => {
    navigation.navigate('AllMedications');
  };

  const { taken, total } = getTodayDosesStats();
  const progressPercentage = total > 0 ? (taken / total) * 100 : 0;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading medications...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => fetchMedications(true)}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const handleSOSPress = () => {
    Alert.alert(
      'Emergency Call',
      'Call 1122 (Rescue) now?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Call Now', 
          style: 'destructive',
          onPress: () => Linking.openURL('tel:1122')
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Medication</Text>
          <Text style={styles.subtitle}>Track your medications and never miss a dose.</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Today's Doses</Text>
          {total === 0 ? (
            <Text style={styles.summaryText}>No medications scheduled for today</Text>
          ) : (
            <>
              <Text style={styles.summaryText}>
                {taken} of {total} doses taken today
              </Text>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${progressPercentage}%` }
                  ]} 
                />
              </View>
            </>
          )}
        </View>

        <Pressable style={styles.addMedicationButton} onPress={handleAddMedication}>
          <Text style={styles.addMedicationButtonText}>+ Add Medication</Text>
        </Pressable>

        {displayMedications.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💊</Text>
            <Text style={styles.emptyText}>No medications added yet</Text>
            <Pressable style={styles.addFirstButton} onPress={handleAddMedication}>
              <Text style={styles.addFirstButtonText}>+ Add Your First Medication</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.medicationsSection}>
            <Text style={styles.sectionTitle}>My Medications</Text>
            {displayMedications.map((medication) => {
              const nextDoseTime = getNextDoseTime(medication);
              return (
                <View key={medication.id} style={styles.medicationCard}>
                  <View style={styles.medicationHeader}>
                    <View style={styles.medicationInfo}>
                      <Text style={styles.medicationName}>{medication.name}</Text>
                      <Text style={styles.medicationDosage}>{medication.dosage} • {getFrequencyDisplay(medication.frequency)}</Text>
                      {nextDoseTime && (
                        <Text style={styles.nextDoseTime}>Next dose: {nextDoseTime}</Text>
                      )}
                    </View>
                    {needsRefill(medication) && (
                      <View style={styles.refillBadge}>
                        <Text style={styles.refillBadgeText}>⚠️ Low Supply</Text>
                      </View>
                    )}
                  </View>
                  
                  <View style={styles.medicationStats}>
                    <Text style={styles.supplyText}>
                      Supply: {medication.supply_count} units
                    </Text>
                    <Text style={styles.thresholdText}>
                      Refill at: {medication.refill_threshold} units
                    </Text>
                  </View>
                  
                  {medication.is_active && (
                    <View style={styles.actionButtons}>
                      <Pressable 
                        style={[styles.actionButton, styles.takeButton]} 
                        onPress={() => handleLogDose(medication.id, 'taken')}
                      >
                        <Text style={styles.takeButtonText}>✓ Take</Text>
                      </Pressable>
                      <Pressable 
                        style={[styles.actionButton, styles.skipButton]} 
                        onPress={() => handleLogDose(medication.id, 'skipped')}
                      >
                        <Text style={styles.skipButtonText}>✕ Skip</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
            
            {/* View All Button */}
            {shouldShowViewAllButton && (
              <Pressable style={styles.viewAllButton} onPress={handleViewAllMedications}>
                <Text style={styles.viewAllButtonText}>
                  View All Medications
                </Text>
              </Pressable>
            )}
          </View>
        )}

        <Pressable style={styles.historyButton} onPress={handleViewHistory}>
          <Text style={styles.historyButtonText}>View History 📋</Text>
        </Pressable>
      </ScrollView>
      
      {/* SOS Button */}
      <Pressable style={styles.sosButton} onPress={handleSOSPress}>
        <Ionicons name="call" size={20} color="#ffffff" />
        <Text style={styles.sosText}>SOS</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgLight,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.primary,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    paddingHorizontal: 16,
  },
  summaryCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 12,
    gap: 8,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  summaryText: {
    fontSize: 14,
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
  addMedicationButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  addMedicationButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  medicationsSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  medicationCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 16,
    marginBottom: 12,
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  medicationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  medicationInfo: {
    flex: 1,
  },
  medicationName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  medicationDosage: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  nextDoseTime: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
  },
  medicationStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  supplyText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  thresholdText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  takeButton: {
    backgroundColor: Colors.success,
  },
  takeButtonText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  skipButton: {
    backgroundColor: Colors.error,
  },
  skipButtonText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  refillBadge: {
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#ffeaa7',
  },
  refillBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#856404',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    fontWeight: '500',
  },
  addFirstButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  addFirstButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  sosButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E53935',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  sosText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12,
    marginTop: 2,
  },
  viewAllButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 16,
  },
  viewAllButtonText: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 16,
  },
  historyButton: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 8,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 32,
  },
  historyButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 16,
    color: Colors.error,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 16,
  },
});
