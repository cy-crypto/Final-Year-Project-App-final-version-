import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppContext } from '../context/AppContext';
import { Colors } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';

type HabitsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

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

export function HabitsScreen() {
  const { habits, habitsLoading, habitsError, fetchHabits } = useAppContext();
  const navigation = useNavigation<HabitsScreenNavigationProp>();
  
  // Selected habit state
  const [selectedHabit, setSelectedHabit] = useState<any>(null);

  useEffect(() => {
    fetchHabits();
  }, [fetchHabits]);

  // Calculate today's completion stats
  const today = getTodayDateString();
  const completedToday = habits.filter(habit => habit.lastCompletedDate === today).length;
  const totalHabits = habits.length;

  // Get only the 3 most recent habits for preview
  const recentHabits = habits.slice(0, 3);

  const handleAddHabit = () => {
    navigation.navigate('AddHabit');
  };

  const handleViewAllHabits = () => {
    navigation.navigate('AllHabits');
  };

  const handleViewAnalytics = () => {
    navigation.navigate('HabitAnalytics');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Habit Tracker</Text>
        <Text style={styles.subtitle}>Build and track daily habits with streak tracking and progress analytics.</Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Today's Progress</Text>
        {totalHabits === 0 ? (
          <Text style={styles.summaryText}>No habits added yet</Text>
        ) : (
          <>
            <Text style={styles.summaryText}>
              {completedToday} of {totalHabits} habits completed
            </Text>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${(completedToday / totalHabits) * 100}%` }
                ]} 
              />
            </View>
          </>
        )}
      </View>

      {/* Add Habit Button */}
      <Pressable style={styles.addHabitButton} onPress={handleAddHabit}>
        <Text style={styles.addHabitButtonText}>+ Add Habit</Text>
      </Pressable>

      {/* Recent Habits Preview */}
      {recentHabits.length > 0 && (
        <View style={styles.previewSection}>
          <Text style={styles.previewTitle}>Recent Habits</Text>
          {recentHabits.map((habit) => (
            <Pressable key={habit.id} onPress={() => setSelectedHabit(habit)}>
              <View style={styles.previewCard}>
                <Text style={styles.previewHabitName}>{getCategoryEmoji(habit.category)} {habit.name}</Text>
                <View style={styles.previewMeta}>
                  <Text style={styles.previewMetaText}>Frequency: {habit.frequency}</Text>
                  <Text style={styles.previewMetaText}>Streak: {habit.streakCount}</Text>
                </View>
              </View>
            </Pressable>
          ))}
          
          {/* View All Habits Button */}
          <Pressable style={styles.viewAllButton} onPress={handleViewAllHabits}>
            <Text style={styles.viewAllButtonText}>View All Habits</Text>
          </Pressable>

          {/* View Analytics Button */}
          <Pressable style={styles.viewAllButton} onPress={handleViewAnalytics}>
            <Text style={styles.viewAllButtonText}>View Analytics 📊</Text>
          </Pressable>
        </View>
      )}

      {habitsLoading && habits.length > 0 ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      ) : null}
      
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
    paddingTop: 40,
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
  addHabitButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  addHabitButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  previewSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  previewCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 12,
    marginBottom: 10,
    gap: 6,
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  previewHabitName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  previewMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  previewMetaText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  viewAllButton: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 8,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  viewAllButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
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
