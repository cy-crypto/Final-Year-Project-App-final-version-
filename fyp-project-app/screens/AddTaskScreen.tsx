import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useAppContext } from '../context/AppContext';
import { Colors, Font, Radius } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';
import type { TaskInput, TaskPriority, TaskStatus } from '../services/taskService';
import { addTaskFile } from '../services/taskService';
import { toApiErrorMessage } from '../services/api';
import { ensureNotificationPermission, parseLocalDate } from '../services/reminderService';
import { DateTimeInput } from '../components/module/DateTimeInput';
import {
  ChipRow,
  ErrorText,
  Field,
  FormCard,
  FormHeader,
  Input,
  PrimaryButton,
  Segmented,
  ToggleRow,
  moduleStyles,
} from '../components/module/ModuleUI';
import { PickedFile, normalizeLink, pickTaskDocument, pickTaskPhoto } from '../components/tasks/pickAttachment';
import { PRIORITY_META, TASK_CATEGORIES, toDateStr } from '../utils/taskFormat';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'AddTask'>;

const PRIORITIES: { key: TaskPriority; label: string }[] = [
  { key: 'low', label: 'Low' },
  { key: 'medium', label: 'Medium' },
  { key: 'high', label: 'High' },
];

const STATUSES: { key: TaskStatus; label: string }[] = [
  { key: 'pending', label: 'To do' },
  { key: 'in_progress', label: 'Doing' },
  { key: 'done', label: 'Done' },
];

export function AddTaskScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { tasks, addTask, updateTask, getTask } = useAppContext();
  const editing = useMemo(() => tasks.find((t) => t.id === route.params?.taskId) ?? null, [tasks, route.params?.taskId]);

  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [category, setCategory] = useState(editing?.category ?? '');
  const [priority, setPriority] = useState<TaskPriority>(editing?.priority ?? 'medium');
  const [status, setStatus] = useState<TaskStatus>(editing?.status ?? 'pending');
  const [deadline, setDeadline] = useState<Date | null>(editing?.deadline ? parseLocalDate(editing.deadline) : null);
  const [reminderOn, setReminderOn] = useState(Boolean(editing?.reminder_time));
  const [reminderDate, setReminderDate] = useState<Date | null>(editing?.reminder_time ? new Date(editing.reminder_time) : null);
  const [emailReminder, setEmailReminder] = useState(editing?.email_reminder_enabled ?? false);
  const [links, setLinks] = useState<string[]>(editing?.links ?? []);
  const [linkInput, setLinkInput] = useState('');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The reminder is picked as a date and a time; keep both parts on one Date.
  const setReminderPart = (part: 'date' | 'time', value: Date) => {
    const base = reminderDate ?? (deadline ? new Date(deadline) : new Date());
    const next = new Date(base);
    if (part === 'date') next.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
    else next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    if (!reminderDate && part === 'date') next.setHours(9, 0, 0, 0);
    setReminderDate(next);
  };

  const addLink = () => {
    const link = normalizeLink(linkInput);
    if (!link) return;
    setLinks((prev) => (prev.includes(link) ? prev : [...prev, link]));
    setLinkInput('');
  };

  const addFile = async (kind: 'camera' | 'gallery' | 'document') => {
    const picked = kind === 'document' ? await pickTaskDocument() : await pickTaskPhoto(kind === 'camera');
    if (picked) setFiles((prev) => [...prev, picked]);
  };

  const handleSave = async () => {
    setError(null);
    if (!title.trim()) {
      setError('Give the task a title.');
      return;
    }
    if (reminderOn) {
      if (!reminderDate) {
        setError('Pick when you want to be reminded, or turn the reminder off.');
        return;
      }
      if (reminderDate.getTime() <= Date.now()) {
        setError('The reminder time is already in the past.');
        return;
      }
      await ensureNotificationPermission();
    }

    const payload: TaskInput = {
      title: title.trim(),
      description: description.trim(),
      category: category.trim(),
      priority,
      deadline: deadline ? toDateStr(deadline) : null,
      reminder_time: reminderOn && reminderDate ? reminderDate.toISOString() : null,
      email_reminder_enabled: emailReminder,
      links,
      ...(editing ? { status } : {}),
    };

    setSaving(true);
    try {
      const saved = editing ? await updateTask(editing.id, payload) : await addTask(payload);
      if (!saved) {
        setError('Could not save the task. Check your connection and try again.');
        return;
      }
      if (files.length) {
        const failed: string[] = [];
        for (const file of files) {
          try {
            await addTaskFile(saved.id, file);
          } catch {
            failed.push(file.name);
          }
        }
        await getTask(saved.id);
        if (failed.length) Alert.alert('Some files were not uploaded', failed.join('\n'));
      }
      navigation.goBack();
    } catch (err) {
      setError(toApiErrorMessage(err, 'Could not save the task.'));
    } finally {
      setSaving(false);
    }
  };

  const categoryOptions = Array.from(new Set([...TASK_CATEGORIES, ...(editing?.category ? [editing.category] : [])]));

  return (
    <SafeAreaView style={moduleStyles.container}>
      <FormHeader title={editing ? 'Edit Task' : 'Add Task'} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={moduleStyles.formContent} keyboardShouldPersistTaps="handled">
          <FormCard>
            <Field label="Title">
              <Input placeholder="e.g. Submit assignment" value={title} onChangeText={setTitle} />
            </Field>
            <Field label="Description (optional)">
              <Input placeholder="Add a note..." multiline value={description} onChangeText={setDescription} />
            </Field>
            <Field label="Category (optional)">
              <ChipRow
                options={categoryOptions.map((c) => ({ key: c, label: c }))}
                value={categoryOptions.find((c) => c.toLowerCase() === category.trim().toLowerCase()) ?? null}
                onChange={(c) => setCategory(category === c ? '' : c)}
              />
              <Input placeholder="Or type your own" value={category} onChangeText={setCategory} />
            </Field>
            <Field label="Priority">
              <Segmented
                options={PRIORITIES}
                value={priority}
                onChange={setPriority}
                colors={{ high: PRIORITY_META.high.color, medium: PRIORITY_META.medium.color, low: PRIORITY_META.low.color }}
              />
            </Field>
            {editing ? (
              <Field label="Status">
                <Segmented options={STATUSES} value={status} onChange={setStatus} />
              </Field>
            ) : null}
            <Field label="Deadline (optional)">
              <DateTimeInput value={deadline} mode="date" onChange={setDeadline} onClear={() => setDeadline(null)} placeholder="Pick a day" />
            </Field>
          </FormCard>

          <FormCard>
            <ToggleRow
              title="Remind me"
              meta="A notification at the time you choose"
              value={reminderOn}
              onValueChange={setReminderOn}
            />
            {reminderOn ? (
              <View style={{ gap: 8 }}>
                <DateTimeInput value={reminderDate} mode="date" minimumDate={new Date()} onChange={(d) => setReminderPart('date', d)} placeholder="Reminder day" />
                <DateTimeInput value={reminderDate} mode="time" onChange={(d) => setReminderPart('time', d)} placeholder="Reminder time" />
              </View>
            ) : null}
            <ToggleRow
              title="Email reminder"
              meta="Allow sending this task to your email from the task page"
              value={emailReminder}
              onValueChange={setEmailReminder}
            />
            <Text style={moduleStyles.muted}>Open tasks with a deadline also get a reminder at 9:00 on the due day.</Text>
          </FormCard>

          <FormCard>
            <Field label="Links (optional)">
              <View style={moduleStyles.row}>
                <View style={{ flex: 1 }}>
                  <Input
                    placeholder="example.com/notes"
                    value={linkInput}
                    onChangeText={setLinkInput}
                    autoCapitalize="none"
                    keyboardType="url"
                    onSubmitEditing={addLink}
                  />
                </View>
                <Pressable style={styles.addBtn} onPress={addLink}>
                  <Ionicons name="add" size={22} color={Colors.white} />
                </Pressable>
              </View>
              {links.map((link) => (
                <AttachmentChip key={link} icon="link" text={link} onRemove={() => setLinks((prev) => prev.filter((l) => l !== link))} />
              ))}
            </Field>
            <Field label={editing ? 'Add files (optional)' : 'Files and photos (optional)'}>
              <View style={moduleStyles.row}>
                <SmallAction icon="camera-outline" label="Camera" onPress={() => addFile('camera')} />
                <SmallAction icon="image-outline" label="Gallery" onPress={() => addFile('gallery')} />
                <SmallAction icon="document-attach-outline" label="File" onPress={() => addFile('document')} />
              </View>
              {files.map((file) => (
                <AttachmentChip
                  key={file.uri}
                  icon="document-outline"
                  text={file.name}
                  onRemove={() => setFiles((prev) => prev.filter((f) => f.uri !== file.uri))}
                />
              ))}
            </Field>
          </FormCard>

          <View style={{ paddingHorizontal: 16, gap: 8 }}>
            <ErrorText text={error} />
            <PrimaryButton label={editing ? 'Save Changes' : 'Add Task'} onPress={handleSave} loading={saving} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SmallAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.smallAction} onPress={onPress}>
      <Ionicons name={icon} size={18} color={Colors.primary} />
      <Text style={styles.smallActionText}>{label}</Text>
    </Pressable>
  );
}

export function AttachmentChip({ icon, text, onRemove }: { icon: keyof typeof Ionicons.glyphMap; text: string; onRemove: () => void }) {
  return (
    <View style={styles.attachment}>
      <Ionicons name={icon} size={16} color={Colors.primary} />
      <Text style={styles.attachmentText} numberOfLines={1}>
        {text}
      </Text>
      <Pressable onPress={onRemove} hitSlop={8}>
        <Ionicons name="close-circle" size={18} color={Colors.textHint} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallAction: {
    flex: 1,
    height: 42,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.primarySurface,
  },
  smallActionText: { fontFamily: Font.semibold, fontSize: 13, color: Colors.primary },
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  attachmentText: { flex: 1, fontFamily: Font.medium, fontSize: 14, color: Colors.textPrimary },
});
