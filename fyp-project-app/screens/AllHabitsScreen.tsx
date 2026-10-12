import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
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
import { getHabitHistory } from '../services/habitService';
import { scheduleHabitReminder, cancelHabitReminder } from '../services/notificationService';
import type { RootStackParamList } from '../navigation/types';

type AllHabitsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

type HabitFrequency = 'Daily' | 'Weekly';

function getCategoryEmoji(category: string): string {
  const emojiMap: Record<string, string> = {
    'Health': '🏥',
    'Fitness': '💪',
    'Study': '📚',
    'Mindfulness': '🧘',
    'Finance': '💰',
    'Other': '⭐',
  };
  return emojiMap[category] || '⭐';
}

export function AllHabitsScreen() {
  const { habits, habitsLoading, habitsError, fetchHabits, completeHabit, deleteHabit, updateHabit } = useAppContext();
  const navigation = useNavigation<AllHabitsScreenNavigationProp>();
  const [habitHistories, setHabitHistories] = useState<Record<string, string[]>>({});
  
  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingHabit, setEditingHabit] = useState<{id: string, name: string, frequency: HabitFrequency, reminderTime: string | null} | null>(null);
  const [editName, setEditName] = useState('');
  const [editFrequency, setEditFrequency] = useState<HabitFrequency>('Daily');
  const [editReminderTime, setEditReminderTime] = useState<string | null>(null);
  
  // Selected habit state
  const [selectedHabit, setSelectedHabit] = useState<any>(null);
  
  // Time picker modal state
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [tempHour, setTempHour] = useState('');
  const [tempMinute, setTempMinute] = useState('');

  useEffect(() => {
    fetchHabits();
  }, [fetchHabits]);

  useEffect(() => {
    // Fetch histories when habits are loaded
    if (habits.length > 0) {
      const fetchHistories = async () => {
        const histories: Record<string, string[]> = {};
        for (const habit of habits) {
          try {
            const history = await getHabitHistory(habit.id);
            histories[habit.id] = history;
          } catch (error) {
            console.warn(`Failed to fetch history for habit ${habit.id}:`, error);
            histories[habit.id] = [];
          }
        }
        setHabitHistories(histories);
      };
      fetchHistories();
    }
  }, [habits]);

  const markCompleted = async (id: string) => {
    await completeHabit(id);
    // Refresh history for the completed habit
    try {
      const history = await getHabitHistory(id);
      setHabitHistories(prev => ({
        ...prev,
        [id]: history
      }));
    } catch (error) {
      console.warn(`Failed to refresh history for habit ${id}:`, error);
    }
  };

  const handleDeleteHabit = (id: string, habitName: string) => {
    Alert.alert(
      'Delete Habit',
      `Are you sure you want to delete "${habitName}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => await deleteHabit(id),
        },
      ]
    );
  };

  const openEditModal = (habit: {id: string, name: string, frequency: HabitFrequency, reminderTime: string | null}) => {
    setEditingHabit(habit);
    setEditName(habit.name);
    setEditFrequency(habit.frequency);
    setEditReminderTime(habit.reminderTime);
    setEditModalVisible(true);
  };

  const closeEditModal = () => {
    setEditModalVisible(false);
    setEditingHabit(null);
    setEditName('');
    setEditFrequency('Daily');
    setEditReminderTime(null);
  };

  const handleSaveEdit = async () => {
    if (!editingHabit || !editName.trim()) {
      return;
    }

    const success = await updateHabit(editingHabit.id, editName.trim(), editFrequency, editReminderTime || undefined);
    if (success) {
      // Handle notifications
      if (editReminderTime) {
        await scheduleHabitReminder(editingHabit.id, editName.trim(), editReminderTime);
      } else {
        await cancelHabitReminder(editingHabit.id);
      }
      closeEditModal();
    }
  };
  
  const openTimePicker = () => {
    if (editReminderTime) {
      const [hour, minute] = editReminderTime.split(':');
      setTempHour(hour);
      setTempMinute(minute);
    } else {
      setTempHour('');
      setTempMinute('');
    }
    setTimePickerVisible(true);
  };
  
  const closeTimePicker = () => {
    setTimePickerVisible(false);
    setTempHour('');
    setTempMinute('');
  };
  
  const confirmTimePicker = () => {
    const hour = parseInt(tempHour);
    const minute = parseInt(tempMinute);
    
    if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      Alert.alert('Invalid Time', 'Please enter a valid time (Hour: 0-23, Minute: 0-59)');
      return;
    }
    
    const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    setEditReminderTime(timeString);
    closeTimePicker();
  };
  
  const clearReminder = () => {
    setEditReminderTime(null);
  };

  const handleGoBack = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={handleGoBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>All Habits</Text>
      </View>

      <FlatList
        data={habits}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={habitsLoading} onRefresh={fetchHabits} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={<Text style={styles.emptyText}>No habits yet.</Text>}
        renderItem={({ item }) => {
          const today = getTodayDateString();
          const completedToday = item.lastCompletedDate === today;
          
          // Calculate completion rates
          const history = habitHistories[item.id] || [];
          const last7Days = getDateRange(7);
          const last30Days = getDateRange(30);
          
          const weeklyCompletions = last7Days.filter(date => history.includes(date)).length;
          const monthlyCompletions = last30Days.filter(date => history.includes(date)).length;
          
          const weeklyRate = Math.round((weeklyCompletions / 7) * 100);
          const monthlyRate = Math.round((monthlyCompletions / 30) * 100);
          
          return (
            <Pressable onPress={() => setSelectedHabit(item)}>
              <View style={styles.habitCard}>
                <View style={styles.habitHeader}>
                  <Text style={styles.habitName}>{getCategoryEmoji(item.category)} {item.name}</Text>
                  <View style={styles.habitButtons} pointerEvents="box-none">
                    <Pressable
                      style={styles.editButton}
                      onPress={() => openEditModal({id: item.id, name: item.name, frequency: item.frequency, reminderTime: item.reminderTime})}>
                      <Text style={styles.editButtonText}>✏️</Text>
                    </Pressable>
                    <Pressable
                      style={styles.deleteButton}
                      onPress={() => handleDeleteHabit(item.id, item.name)}>
                      <Text style={styles.deleteButtonText}>🗑️</Text>
                    </Pressable>
                  </View>
                </View>
              <Text style={styles.meta}>Frequency: {item.frequency}</Text>
              <Text style={styles.meta}>Current Streak: {item.streakCount}</Text>
              <Text style={styles.meta}>Best Streak: {item.bestStreak} 🏆</Text>
              <Text style={styles.meta}>
                Last Completed: {item.lastCompletedDate ?? 'Not completed yet'}
              </Text>
              {item.reminderTime && (
                <Text style={styles.reminderText}>⏰ Reminder: {item.reminderTime}</Text>
              )}

              <View style={styles.weekStrip}>
                {getWeekDays().map((day, index) => {
                  const isCompleted = habitHistories[item.id]?.includes(day.date);
                  return (
                    <View key={index} style={styles.dayContainer}>
                      <Text style={styles.dayLetter}>{day.dayLetter}</Text>
                      <View 
                        style={[
                          styles.dayCircle,
                          isCompleted ? styles.dayCircleCompleted : styles.dayCircleEmpty,
                          day.isToday && styles.dayCircleToday
                        ]} 
                      />
                    </View>
                  );
                })}
              </View>

              <View style={styles.completionRateRow}>
                <View style={styles.rateBadge}>
                  <Text style={styles.rateText}>This Week: {weeklyRate}%</Text>
                </View>
                <View style={styles.rateBadge}>
                  <Text style={styles.rateText}>This Month: {monthlyRate}%</Text>
                </View>
              </View>

              <Pressable
                style={[styles.completeButton, completedToday && styles.completeButtonDisabled]}
                onPress={() => markCompleted(item.id)}
                disabled={completedToday}>
                <Text style={styles.completeButtonText}>
                  {completedToday ? 'Completed Today' : 'Mark as Completed'}
                </Text>
              </Pressable>
              </View>
            </Pressable>
          );
        }}
      />

      {habitsLoading && habits.length > 0 ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      ) : null}

      {/* Edit Modal */}
      <Modal
        visible={editModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={closeEditModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Habit</Text>
            
            <Text style={styles.label}>Habit Name</Text>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              placeholder="e.g. Read 20 minutes"
              style={styles.input}
            />

            <Text style={styles.label}>Frequency</Text>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={editFrequency} onValueChange={setEditFrequency}>
                <Picker.Item label="Daily" value="Daily" />
                <Picker.Item label="Weekly" value="Weekly" />
              </Picker>
            </View>

            <Text style={styles.label}>Set Reminder</Text>
            <View style={styles.reminderRow}>
              <Pressable style={styles.reminderButton} onPress={openTimePicker}>
                <Text style={styles.reminderButtonText}>
                  {editReminderTime ? editReminderTime : 'No reminder set'}
                </Text>
              </Pressable>
              {editReminderTime && (
                <Pressable style={styles.clearButton} onPress={clearReminder}>
                  <Text style={styles.clearButtonText}>Clear</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.modalButtons}>
              <Pressable style={[styles.button, styles.cancelButton]} onPress={closeEditModal}>
                <Text style={styles.buttonText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.saveButton]} onPress={handleSaveEdit}>
                <Text style={styles.buttonText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Time Picker Modal */}
      <Modal
        visible={timePickerVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={closeTimePicker}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Set Reminder Time</Text>
            
            <Text style={styles.label}>Hour (0-23)</Text>
            <TextInput
              value={tempHour}
              onChangeText={setTempHour}
              placeholder="08"
              style={styles.timeInput}
              keyboardType="numeric"
              maxLength={2}
            />
            
            <Text style={styles.label}>Minute (0-59)</Text>
            <TextInput
              value={tempMinute}
              onChangeText={setTempMinute}
              placeholder="00"
              style={styles.timeInput}
              keyboardType="numeric"
              maxLength={2}
            />
            
            <Text style={styles.timeExample}>Example: 08:30 for 8:30 AM</Text>

            <View style={styles.modalButtons}>
              <Pressable style={[styles.button, styles.cancelButton]} onPress={closeTimePicker}>
                <Text style={styles.buttonText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.saveButton]} onPress={confirmTimePicker}>
                <Text style={styles.buttonText}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      {/* Selected Habit Modal */}
      <Modal
        visible={selectedHabit !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedHabit(null)}>
        <View style={styles.selectedHabitOverlay}>
          <View style={styles.selectedHabitModalContent}>
            <Text style={styles.selectedHabitTitle}>{getCategoryEmoji(selectedHabit?.category || 'Other')} {selectedHabit?.name}</Text>
            <Text style={styles.selectedHabitMeta}>Frequency: {selectedHabit?.frequency}</Text>
            <Text style={styles.selectedHabitMeta}>Current Streak: {selectedHabit?.streakCount} 🔥</Text>
            <Text style={styles.selectedHabitMeta}>Best Streak: {selectedHabit?.bestStreak} 🏆</Text>
            <Text style={styles.selectedHabitMeta}>
              Last Completed: {selectedHabit?.lastCompletedDate ?? 'Not completed yet'}
            </Text>
            {selectedHabit?.reminderTime && (
              <Text style={styles.selectedHabitMeta}>⏰ Reminder: {selectedHabit.reminderTime}</Text>
            )}
            <Pressable style={styles.selectedHabitCloseButton} onPress={() => setSelectedHabit(null)}>
              <Text style={styles.selectedHabitCloseButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function getTodayDateString() {
  return formatDate(new Date());
}

function formatDate(date: Date) {
  return date.toISOString().split('T')[0];
}

function getWeekDays() {
  const days = [];
  const today = new Date();
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    days.push({
      date: formatDate(date),
      dayLetter: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][date.getDay()],
      isToday: i === 0
    });
  }
  
  return days;
}

function getDateRange(days: number): string[] {
  const dates = [];
  const today = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    dates.push(formatDate(date));
  }
  
  return dates;
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
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: Colors.primary,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.primary,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  emptyText: {
    textAlign: 'center',
    color: Colors.textHint,
    marginTop: 14,
  },
  habitCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 12,
    gap: 6,
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  habitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  habitName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
  },
  deleteButton: {
    padding: 4,
    borderRadius: 4,
  },
  deleteButtonText: {
    fontSize: 16,
  },
  habitButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  editButton: {
    padding: 4,
    borderRadius: 4,
  },
  editButtonText: {
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    padding: 20,
    width: '80%',
    maxWidth: 300,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  button: {
    borderRadius: 8,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    marginHorizontal: 8,
  },
  buttonText: {
    fontWeight: '700',
    fontSize: 14,
  },
  cancelButton: {
    backgroundColor: Colors.borderLight,
  },
  saveButton: {
    backgroundColor: Colors.primary,
  },
  label: {
    color: Colors.textSecondary,
    fontWeight: '600',
    fontSize: 13,
  },
  input: {
    height: 42,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 10,
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
  },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 8,
  },
  dayContainer: {
    alignItems: 'center',
    flex: 1,
  },
  dayLetter: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  dayCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  dayCircleCompleted: {
    backgroundColor: Colors.primary,
  },
  dayCircleEmpty: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  dayCircleToday: {
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  completionRateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 8,
  },
  rateBadge: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flex: 1,
    marginHorizontal: 2,
  },
  rateText: {
    fontSize: 11,
    color: '#ffffff',
    fontWeight: '600',
    textAlign: 'center',
  },
  meta: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  reminderText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reminderButton: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  reminderButtonText: {
    fontSize: 14,
    color: Colors.textPrimary,
  },
  clearButton: {
    backgroundColor: Colors.error,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    height: 42,
    justifyContent: 'center',
  },
  clearButtonText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 12,
  },
  timeInput: {
    height: 42,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 10,
    fontSize: 16,
    textAlign: 'center',
  },
  timeExample: {
    fontSize: 12,
    color: Colors.textHint,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  completeButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: Colors.success,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  completeButtonDisabled: {
    backgroundColor: Colors.primaryLight,
  },
  completeButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 12,
  },
  loadingOverlay: {
    position: 'absolute',
    right: 18,
    top: 14,
  },
  selectedHabitOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedHabitModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '80%',
    maxWidth: 300,
    alignItems: 'center',
  },
  selectedHabitTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  selectedHabitMeta: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
    textAlign: 'center',
  },
  selectedHabitCloseButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 16,
  },
  selectedHabitCloseButtonText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
});
