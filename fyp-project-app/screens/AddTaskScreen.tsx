import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useAppContext } from '../context/AppContext';
import { Colors } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';
import { api } from '../services/api';

type AddTaskScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

type TaskPriority = 'low' | 'medium' | 'high';

export function AddTaskScreen() {
  const { addTask } = useAppContext();
  const navigation = useNavigation<AddTaskScreenNavigationProp>();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [deadline, setDeadline] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [attachment, setAttachment] = useState<any>(null);
  const [attachmentType, setAttachmentType] = useState<'image' | 'file' | null>(null);

  // Handle Android hardware back button
  useEffect(() => {
    const backAction = () => {
      navigation.goBack();
      return true; // Prevent default back behavior
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove(); // Cleanup on unmount
  }, []);

  const handleAddTask = async () => {
    setLocalError(null);
    setIsSaving(true);
    
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    
    // Validation
    if (!trimmedTitle) {
      setLocalError('Task title is required.');
      setIsSaving(false);
      return;
    }
    
    if (!deadline) {
      setLocalError('Assign day is required.');
      setIsSaving(false);
      return;
    }

    try {
      if (attachment) {
        const formData = new FormData();
        formData.append('title', trimmedTitle);
        formData.append('description', trimmedDescription || '');
        formData.append('priority', priority);
        formData.append('deadline', deadline);
        
        const uriParts = attachment.uri.split('.');
        const fileType = uriParts[uriParts.length - 1];
        
        formData.append('attachment', {
          uri: attachment.uri,
          name: `attachment_${Date.now()}.${fileType}`,
          type: `image/${fileType}`,
        } as any);

        try {
          const response = await api.post('/tasks/', formData, {
            headers: { 
              'Content-Type': 'multipart/form-data',
              'Accept': 'application/json',
            },
            transformRequest: (data) => data,
          });
          if (response.status === 201 || response.status === 200) {
            navigation.goBack();
          } else {
            setLocalError('Failed to add task. Please try again.');
          }
        } catch (error: any) {
          console.log('FormData error details:', error.response?.data);
          setLocalError('Failed to add task. Please try again.');
        } finally {
          setIsSaving(false);
        }
        return;
      } else {
        // Existing JSON payload logic unchanged
        const payload = {
          title: trimmedTitle,
          description: trimmedDescription,
          priority,
          deadline: deadline
        };
        
        console.log('Sending payload to backend:', payload);
        const ok = await addTask(payload);
        
        if (!ok) {
          setLocalError('Unable to add task. Please try again.');
          setIsSaving(false);
          return;
        }

        // Navigate back to TasksScreen on success
        navigation.goBack();
      }
    } catch (error: any) {
      console.error('Error adding task:', error);
      console.log('Error details:', error.response?.data);
      console.log('Error status:', error.response?.status);
      setLocalError('Failed to add task. Please check your connection and try again.');
      setIsSaving(false);
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    
    if (event.type === 'set' && selectedDate) {
      setSelectedDate(selectedDate);
      const dateStr = selectedDate.toISOString().split('T')[0];
      setDeadline(dateStr);
    }
  };

  const showDatepicker = () => {
    setShowDatePicker(true);
  };

  const formatDateDisplay = (dateString: string) => {
    if (!dateString) return 'Select a date';
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    return date.toLocaleDateString('en-US', options);
  };

  const handleGoBack = () => {
    navigation.goBack();
  };

  const handleCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required to take photos');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setAttachment(result.assets[0]);
      setAttachmentType('image');
    }
  };

  const handleGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Media library permission is required to select photos');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setAttachment(result.assets[0]);
      setAttachmentType('image');
    }
  };

  const removeAttachment = () => {
    setAttachment(null);
    setAttachmentType(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.modalHeader}>
        <Pressable onPress={handleGoBack}>
          <Text style={styles.backButton}>← Back</Text>
        </Pressable>
        <Text style={styles.modalTitle}>Add New Task</Text>
        <View style={styles.placeholder} />
      </View>
      
      <View style={styles.formCard}>
        {/* Title */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Title</Text>
          <TextInput
            style={styles.formInput}
            placeholder="e.g. Buy groceries"
            placeholderTextColor="#9CA3AF"
            value={title}
            onChangeText={setTitle}
          />
        </View>

        {/* Description */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Description</Text>
          <TextInput
            style={[styles.formInput, styles.formTextarea]}
            placeholder="e.g. From the nearby store"
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
            value={description}
            onChangeText={setDescription}
          />
        </View>

        {/* Priority */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Priority</Text>
          <View style={styles.priorityContainer}>
            {(['low', 'medium', 'high'] as const).map(priorityOption => (
              <Pressable
                key={priorityOption}
                style={[
                  styles.priorityButton,
                  priority === priorityOption && styles.priorityButtonActive
                ]}
                onPress={() => setPriority(priorityOption)}
              >
                <Text style={[
                  styles.priorityButtonText,
                  priority === priorityOption && styles.priorityButtonTextActive
                ]}>
                  {priorityOption === 'high' ? 'High' : priorityOption === 'medium' ? 'Medium' : 'Low'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Attachment (Optional) */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Attachment (Optional)</Text>
          <View style={styles.attachmentButtonsContainer}>
            <Pressable style={styles.attachmentButton} onPress={handleCamera}>
              <Text style={styles.attachmentButtonEmoji}>📷</Text>
              <Text style={styles.attachmentButtonText}>Camera</Text>
            </Pressable>
            <Pressable style={styles.attachmentButton} onPress={handleGallery}>
              <Text style={styles.attachmentButtonEmoji}>🖼️</Text>
              <Text style={styles.attachmentButtonText}>Gallery</Text>
            </Pressable>
          </View>
          
          {attachment && (
            <View style={styles.attachmentPreview}>
              <Image source={{ uri: attachment.uri }} style={styles.attachmentImage} />
              <Pressable style={styles.removeAttachmentButton} onPress={removeAttachment}>
                <Text style={styles.removeAttachmentText}>✕</Text>
              </Pressable>
              <Text style={styles.attachmentFileName}>
                {attachment.fileName || 'Image attached ✅'}
              </Text>
            </View>
          )}
        </View>

        {/* Assign Day */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Assign Day</Text>
          <Pressable style={styles.datePickerButton} onPress={showDatepicker}>
            <Text style={[styles.datePickerText, deadline ? { color: Colors.textPrimary } : {}]}>
              {formatDateDisplay(deadline)}
            </Text>
          </Pressable>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={handleDateChange}
            minimumDate={new Date()}
          />
        )}

        {/* Add Task Button */}
        <Pressable 
          style={[styles.addTaskButton, isSaving && styles.addTaskButtonDisabled]} 
          onPress={handleAddTask} 
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text style={styles.addTaskButtonText}>Add Task</Text>
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
  priorityContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityButton: {
    flex: 1,
    height: 42,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  priorityButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  priorityButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  priorityButtonTextActive: {
    color: Colors.white,
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.white,
    height: 42,
    justifyContent: 'center',
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
    fontWeight: '400',
    color: '#9CA3AF',
  },
  addTaskButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  addTaskButtonDisabled: {
    backgroundColor: Colors.primaryLight,
  },
  addTaskButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  errorText: {
    color: Colors.error,
    fontWeight: '600',
    marginTop: 4,
  },
  attachmentButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  attachmentButton: {
    flex: 1,
    height: 80,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  attachmentButtonEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  attachmentButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  attachmentPreview: {
    marginTop: 12,
    alignItems: 'center',
  },
  attachmentImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  removeAttachmentButton: {
    position: 'absolute',
    top: -4,
    right: 80,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeAttachmentText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  attachmentFileName: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
