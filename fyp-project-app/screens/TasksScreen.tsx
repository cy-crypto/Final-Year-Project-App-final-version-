import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppContext } from '../context/AppContext';
import { Colors } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';

type TasksScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

type Task = {
  id: string;
  title: string;
  description: string;
  category?: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'done';
  deadline?: string | null | undefined;
  done?: boolean;
  reminder_time?: string | null;
  time_slot_start?: string | null;
  time_slot_end?: string | null;
  links?: string[];
  time_spent_seconds?: number;
  progress_percentage?: number;
  email_reminder_enabled?: boolean;
  attachments?: any[];
  created_at?: string;
  updated_at?: string;
};

export function TasksScreen() {
  const { tasks, tasksLoading, tasksError, fetchTasks, deleteTask, updateTask, addTask } = useAppContext();
  const navigation = useNavigation<TasksScreenNavigationProp>();
  
  // Selected task state
  const [selectedTask, setSelectedTask] = useState<any>(null);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Calculate today's open tasks stats
  const today = getTodayDateString();
  const openTasks = tasks.filter(task => {
    const taskDate = task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : null;
    return taskDate === today && task.status !== 'done';
  }).length;
  const totalTasks = tasks.filter(task => {
    const taskDate = task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : null;
    return taskDate === today;
  }).length;

  // Get only the 3 most recent tasks for preview
  const recentTasks = tasks.slice(0, 3);

  const handleAddTask = () => {
    navigation.navigate('AddTask');
  };

  const handleViewAllTasks = () => {
    navigation.navigate('AllTasks');
  };

  const handleViewAnalytics = () => {
    navigation.navigate('TaskAnalytics');
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return Colors.error;
      case 'medium': return Colors.warning;
      case 'low': return Colors.success;
      default: return Colors.textSecondary;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high': return '🔴 HIGH';
      case 'medium': return '🟡 MEDIUM';
      case 'low': return '🟢 LOW';
      default: return '⚪ LOW';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  
  const handleDeleteTask = (task: Task) => {
    Alert.alert(
      'Delete Task',
      `Are you sure you want to delete "${task.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            const ok = await deleteTask(task.id);
            if (ok !== undefined && ok) {
              await fetchTasks(true);
            }
          }
        }
      ]
    );
  };

  
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Task Manager</Text>
        <Text style={styles.subtitle}>Manage and track your daily tasks with priority and reminders.</Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Today's Tasks</Text>
        {totalTasks === 0 ? (
          <Text style={styles.summaryText}>No tasks scheduled for today</Text>
        ) : (
          <>
            <Text style={styles.summaryText}>
              {openTasks} of {totalTasks} tasks remaining
            </Text>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${((totalTasks - openTasks) / totalTasks) * 100}%` }
                ]} 
              />
            </View>
          </>
        )}
      </View>

      {/* Add Task Button */}
      <Pressable style={styles.addTaskButton} onPress={handleAddTask}>
        <Text style={styles.addTaskButtonText}>+ Add Task</Text>
      </Pressable>

      {/* Recent Tasks Preview */}
      {recentTasks.length > 0 && (
        <View style={styles.previewSection}>
          <Text style={styles.previewTitle}>Recent Tasks</Text>
          {recentTasks.map((task) => (
            <Pressable key={task.id} onPress={() => setSelectedTask(task)}>
              <View style={styles.previewCard}>
                <Text style={styles.previewTaskName}>{task.title}</Text>
                <View style={styles.previewMeta}>
                  <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(task.priority) }]}>
                    <Text style={styles.priorityText}>{getPriorityBadge(task.priority)}</Text>
                  </View>
                  <Text style={styles.previewMetaText}>
                    {task.deadline ? formatDate(task.deadline) : 'No date'}
                  </Text>
                </View>
              </View>
            </Pressable>
          ))}
          
          {/* View All Tasks Button */}
          <Pressable style={styles.viewAllButton} onPress={handleViewAllTasks}>
            <Text style={styles.viewAllButtonText}>View All Tasks</Text>
          </Pressable>

          {/* View Analytics Button */}
          <Pressable style={styles.viewAllButton} onPress={handleViewAnalytics}>
            <Text style={styles.viewAllButtonText}>View Analytics 📊</Text>
          </Pressable>
        </View>
      )}

      {tasksLoading && tasks.length > 0 ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      ) : null}
      
      {/* Selected Task Modal */}
      <Modal
        visible={selectedTask !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedTask(null)}>
        <View style={styles.selectedTaskOverlay}>
          <View style={styles.selectedTaskModalContent}>
            <Text style={styles.selectedTaskTitle}>{selectedTask?.title}</Text>
            <Text style={styles.selectedTaskMeta}>Priority: {getPriorityBadge(selectedTask?.priority || 'low')}</Text>
            <Text style={styles.selectedTaskMeta}>Status: {selectedTask?.status?.replace('_', ' ') || 'pending'}</Text>
            <Text style={styles.selectedTaskMeta}>
              Due: {selectedTask?.deadline ? formatDate(selectedTask.deadline) : 'No deadline'}
            </Text>
            {selectedTask?.description && (
              <Text style={styles.selectedTaskMeta}>Description: {selectedTask.description}</Text>
            )}
            {selectedTask?.email_reminder_enabled && (
              <Text style={styles.selectedTaskMeta}>🔔 Email reminder enabled</Text>
            )}
            <Pressable style={styles.selectedTaskDeleteButton} onPress={() => {
                handleDeleteTask(selectedTask);
                setSelectedTask(null);
              }}>
                <Text style={styles.selectedTaskDeleteButtonText}>Delete</Text>
              </Pressable>
            <Pressable style={styles.selectedTaskCloseButton} onPress={() => setSelectedTask(null)}>
              <Text style={styles.selectedTaskCloseButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      
      {tasksError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{tasksError}</Text>
          <Pressable onPress={() => fetchTasks(true)} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {tasksLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      )}
    </SafeAreaView>
  );
}

function getTodayDateString() {
  return formatDate(new Date());
}

function formatDate(date: Date) {
  return date.toISOString().split('T')[0];
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
  addTaskButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  addTaskButtonText: {
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
  previewTaskName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  previewMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewMetaText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priorityText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.white,
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
  selectedTaskOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedTaskModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '80%',
    maxWidth: 300,
    alignItems: 'center',
  },
  selectedTaskTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  selectedTaskMeta: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
    textAlign: 'center',
  },
  selectedTaskActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  selectedTaskEditButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  selectedTaskEditButtonText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  selectedTaskDeleteButton: {
    backgroundColor: Colors.error,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  selectedTaskDeleteButtonText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  selectedTaskCloseButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 16,
  },
  selectedTaskCloseButtonText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  errorBox: {
    backgroundColor: '#ffebee',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'center',
    marginTop: 12,
  },
  retryText: {
    color: Colors.white,
    fontWeight: '600',
  },
});
