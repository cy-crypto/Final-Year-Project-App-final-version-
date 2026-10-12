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
import type { RootStackParamList } from '../navigation/types';

type AllTasksScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

type TaskPriority = 'high' | 'medium' | 'low';
type TaskStatus = 'pending' | 'in_progress' | 'done';

function getPriorityEmoji(priority: string): string {
  const emojiMap: Record<string, string> = {
    'high': '🔴',
    'medium': '🟡',
    'low': '🟢',
  };
  return emojiMap[priority] || '⚪';
}

function getStatusEmoji(status: string): string {
  const emojiMap: Record<string, string> = {
    'pending': '⏳',
    'in_progress': '🔄',
    'done': '✅',
  };
  return emojiMap[status] || '⏳';
}

export function AllTasksScreen() {
  const { tasks, tasksLoading, tasksError, fetchTasks, deleteTask, updateTask } = useAppContext();
  const navigation = useNavigation<AllTasksScreenNavigationProp>();
  
  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<{
    id: string, 
    title: string, 
    description: string, 
    priority: TaskPriority, 
    status: TaskStatus,
    deadline: string | null
  } | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState<TaskPriority>('medium');
  const [editStatus, setEditStatus] = useState<TaskStatus>('pending');
  const [editDeadline, setEditDeadline] = useState<string | null>(null);
  
  // Selected task state
  const [selectedTask, setSelectedTask] = useState<any>(null);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleDeleteTask = (id: string, taskTitle: string) => {
    Alert.alert(
      'Delete Task',
      `Are you sure you want to delete "${taskTitle}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const ok = await deleteTask(id);
            if (ok !== undefined && ok) {
              await fetchTasks(true);
            }
          },
        },
      ]
    );
  };

  const openEditModal = (task: {
    id: string, 
    title: string, 
    description: string, 
    priority: TaskPriority, 
    status: TaskStatus,
    deadline: string | null
  }) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDescription(task.description || '');
    setEditPriority(task.priority);
    setEditStatus(task.status);
    setEditDeadline(task.deadline);
    setEditModalVisible(true);
  };

  const closeEditModal = () => {
    setEditModalVisible(false);
    setEditingTask(null);
    setEditTitle('');
    setEditDescription('');
    setEditPriority('medium');
    setEditStatus('pending');
    setEditDeadline(null);
  };

  const handleSaveEdit = async () => {
    if (!editingTask || !editTitle.trim()) {
      return;
    }

    const success = await updateTask(editingTask.id, {
      title: editTitle.trim(),
      description: editDescription.trim(),
      priority: editPriority,
      status: editStatus,
      deadline: editDeadline,
    });
    
    if (success) {
      await fetchTasks(true);
      closeEditModal();
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return Colors.error;
      case 'medium': return Colors.warning;
      case 'low': return Colors.success;
      default: return Colors.textSecondary;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done': return Colors.success;
      case 'in_progress': return Colors.warning;
      case 'pending': return Colors.textSecondary;
      default: return Colors.textSecondary;
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const handleGoBack = () => {
    navigation.goBack();
  };

  const renderTaskCard = ({ item }: { item: any }) => {
    const isOverdue = item.deadline && new Date(item.deadline) < new Date() && item.status !== 'done';
    
    return (
      <Pressable onPress={() => setSelectedTask(item)}>
        <View style={styles.taskCard}>
          <View style={styles.taskHeader}>
            <Text style={styles.taskName}>{getPriorityEmoji(item.priority)} {item.title}</Text>
            <View style={styles.taskButtons} pointerEvents="box-none">
              <Pressable
                style={styles.editButton}
                onPress={() => openEditModal({
                  id: item.id, 
                  title: item.title, 
                  description: item.description || '', 
                  priority: item.priority, 
                  status: item.status,
                  deadline: item.deadline
                })}>
                <Text style={styles.editButtonText}>✏️</Text>
              </Pressable>
              <Pressable
                style={styles.deleteButton}
                onPress={() => handleDeleteTask(item.id, item.title)}>
                <Text style={styles.deleteButtonText}>🗑️</Text>
              </Pressable>
            </View>
          </View>
          
          {item.description && (
            <Text style={styles.meta} numberOfLines={2}>{item.description}</Text>
          )}
          
          <View style={styles.taskMetaRow}>
            <Text style={styles.meta}>Priority: {getPriorityEmoji(item.priority)} {item.priority}</Text>
            <Text style={styles.meta}>Status: {getStatusEmoji(item.status || 'pending')} {(item.status || 'pending').replace('_', ' ')}</Text>
          </View>
          
          <Text style={[styles.meta, isOverdue && styles.overdueText]}>
            Due: {item.deadline ? formatDate(item.deadline) : 'No deadline'}
            {isOverdue && ' (OVERDUE)'}
          </Text>
          
          {item.reminder_time && (
            <Text style={styles.reminderText}>⏰ Reminder: {item.reminder_time}</Text>
          )}

          <View style={styles.actionButtons}>
            {item.status !== 'done' && (
              <Pressable
                style={styles.completeButton}
                onPress={async () => {
                  await updateTask(item.id, { status: 'done' });
                  await fetchTasks(true);
                }}>
                <Text style={styles.completeButtonText}>Mark as Done</Text>
              </Pressable>
            )}
            {item.status === 'done' && (
              <Pressable
                style={[styles.completeButton, styles.reopenButton]}
                onPress={async () => {
                  await updateTask(item.id, { status: 'pending' });
                  await fetchTasks(true);
                }}>
                <Text style={styles.completeButtonText}>Reopen Task</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={handleGoBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>All Tasks</Text>
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={tasksLoading} onRefresh={() => fetchTasks(true)} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={<Text style={styles.emptyText}>No tasks yet.</Text>}
        renderItem={renderTaskCard}
      />

      {tasksLoading && tasks.length > 0 ? (
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
            <Text style={styles.modalTitle}>Edit Task</Text>
            
            <Text style={styles.label}>Task Title</Text>
            <TextInput
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="e.g. Complete project proposal"
              style={styles.input}
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder="Task description..."
              style={[styles.input, styles.textArea]}
              multiline
              numberOfLines={3}
            />

            <Text style={styles.label}>Priority</Text>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={editPriority} onValueChange={setEditPriority}>
                <Picker.Item label="High" value="high" />
                <Picker.Item label="Medium" value="medium" />
                <Picker.Item label="Low" value="low" />
              </Picker>
            </View>

            <Text style={styles.label}>Status</Text>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={editStatus} onValueChange={setEditStatus}>
                <Picker.Item label="Pending" value="pending" />
                <Picker.Item label="In Progress" value="in_progress" />
                <Picker.Item label="Done" value="done" />
              </Picker>
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
      
      {/* Selected Task Modal */}
      <Modal
        visible={selectedTask !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedTask(null)}>
        <View style={styles.selectedTaskOverlay}>
          <View style={styles.selectedTaskModalContent}>
            <Text style={styles.selectedTaskTitle}>{getPriorityEmoji(selectedTask?.priority || 'low')} {selectedTask?.title}</Text>
            <Text style={styles.selectedTaskMeta}>Priority: {getPriorityEmoji(selectedTask?.priority || 'low')} {selectedTask?.priority || 'low'}</Text>
            <Text style={styles.selectedTaskMeta}>Status: {getStatusEmoji(selectedTask?.status || 'pending')} {(selectedTask?.status || 'pending').replace('_', ' ')}</Text>
            <Text style={styles.selectedTaskMeta}>
              Due: {selectedTask?.deadline ? formatDate(selectedTask.deadline) : 'No deadline'}
            </Text>
            {selectedTask?.description && (
              <Text style={styles.selectedTaskMeta}>Description: {selectedTask.description}</Text>
            )}
            {selectedTask?.reminder_time && (
              <Text style={styles.selectedTaskMeta}>⏰ Reminder: {selectedTask.reminder_time}</Text>
            )}
            <Pressable style={styles.selectedTaskCloseButton} onPress={() => setSelectedTask(null)}>
              <Text style={styles.selectedTaskCloseButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  taskCard: {
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
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
  },
  taskButtons: {
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
  deleteButton: {
    padding: 4,
    borderRadius: 4,
  },
  deleteButtonText: {
    fontSize: 16,
  },
  taskMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  meta: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  overdueText: {
    color: Colors.error,
    fontWeight: '600',
  },
  reminderText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  completeButton: {
    backgroundColor: Colors.success,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  reopenButton: {
    backgroundColor: Colors.warning,
  },
  completeButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 12,
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
    marginBottom: 12,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    marginBottom: 12,
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
});
