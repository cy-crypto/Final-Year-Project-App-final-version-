import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useAppContext } from '../context/AppContext';
import { Colors, Font, Radius } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';
import {
  addTaskFile,
  addTaskLink,
  removeTaskAttachment,
  type Task,
  type TaskAttachment,
  type TaskStatus,
} from '../services/taskService';
import { toApiErrorMessage } from '../services/api';
import {
  Card,
  CenterLoader,
  EmptyCard,
  HeroCard,
  HeroStat,
  HeroStats,
  Input,
  ModuleHeader,
  Pill,
  PrimaryButton,
  ProgressBar,
  SecondaryButton,
  Segmented,
  moduleStyles,
} from '../components/module/ModuleUI';
import { normalizeLink, pickTaskDocument, pickTaskPhoto } from '../components/tasks/pickAttachment';
import {
  PRIORITY_META,
  STATUS_META,
  dueLabel,
  formatClock,
  formatDateTime,
  formatDuration,
  isOverdue,
} from '../utils/taskFormat';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'TaskDetail'>;

const STATUSES: { key: TaskStatus; label: string }[] = [
  { key: 'pending', label: 'To do' },
  { key: 'in_progress', label: 'Doing' },
  { key: 'done', label: 'Done' },
];

const PROGRESS_STEPS = [0, 25, 50, 75, 100];

export function TaskDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { tasks, getTask, updateTask, deleteTask, logTime, sendReminderEmail, replaceTask } = useAppContext();

  // The shared task list is the source of truth when the task is in it (checkbox edits elsewhere
  // show up here); `fetched` covers a task opened before the list has loaded.
  const cached = tasks.find((t) => t.id === params.taskId) ?? null;
  const [fetched, setTask] = useState<Task | null>(null);
  const task = cached ?? fetched;
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      setTask(await getTask(params.taskId));
      setError(null);
    } catch (err) {
      setError(toApiErrorMessage(err, 'Could not load this task.'));
    } finally {
      setRefreshing(false);
    }
  }, [getTask, params.taskId]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', load);
    return unsubscribe;
  }, [navigation, load]);

  useEffect(() => {
    if (timerStart === null) return;
    tick.current = setInterval(() => setElapsed((Date.now() - timerStart) / 1000), 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [timerStart]);

  const run = async (action: () => Promise<Task | void>, failMessage: string) => {
    setBusy(true);
    try {
      const result = await action();
      if (result) setTask(result);
    } catch (err) {
      Alert.alert('Something went wrong', toApiErrorMessage(err, failMessage));
    } finally {
      setBusy(false);
    }
  };

  if (!task) {
    return (
      <SafeAreaView style={moduleStyles.container}>
        <ModuleHeader title="Task" />
        {error ? (
          <View style={moduleStyles.content}>
            <EmptyCard text={error} icon="cloud-offline-outline" />
          </View>
        ) : (
          <CenterLoader />
        )}
      </SafeAreaView>
    );
  }

  const priority = PRIORITY_META[task.priority];
  const overdue = isOverdue(task);

  const setStatus = (status: TaskStatus) =>
    run(() => updateTask(task.id, { status }), 'Could not update the status.');

  // 100% finishes the task; any other value on a finished or untouched task means work is in progress.
  const setProgress = (progress: number) => {
    let status: TaskStatus = task.status;
    if (progress === 100) status = 'done';
    else if (progress > 0 && task.status !== 'in_progress') status = 'in_progress';
    else if (progress === 0) status = 'pending';
    run(() => updateTask(task.id, { progress_percentage: progress, status }), 'Could not update the progress.');
  };

  const stopTimer = () => {
    const seconds = Math.round(elapsed);
    setTimerStart(null);
    setElapsed(0);
    if (seconds < 1) return;
    run(() => logTime(task.id, seconds), 'Could not save the tracked time.');
  };

  const startTimer = () => {
    setElapsed(0);
    setTimerStart(Date.now());
    if (task.status === 'pending') setStatus('in_progress');
  };

  const refreshAfterAttachmentChange = async () => {
    const fresh = await getTask(task.id);
    replaceTask(fresh);
    return fresh;
  };

  const addFile = (kind: 'camera' | 'gallery' | 'document') =>
    run(async () => {
      const picked = kind === 'document' ? await pickTaskDocument() : await pickTaskPhoto(kind === 'camera');
      if (!picked) return;
      await addTaskFile(task.id, picked);
      return refreshAfterAttachmentChange();
    }, 'Could not upload the file.');

  const addLink = () => {
    const url = normalizeLink(linkInput);
    if (!url) return;
    setLinkInput('');
    run(async () => {
      await addTaskLink(task.id, url);
      return refreshAfterAttachmentChange();
    }, 'Could not save the link.');
  };

  const removeAttachment = (item: TaskAttachment) =>
    Alert.alert('Remove attachment', item.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          run(async () => {
            await removeTaskAttachment(task.id, item.id);
            return refreshAfterAttachmentChange();
          }, 'Could not remove the attachment.'),
      },
    ]);

  const openUrl = (url: string | null) => {
    if (url) Linking.openURL(url).catch(() => Alert.alert('Cannot open', url));
  };

  const emailMe = () =>
    run(async () => {
      Alert.alert('Email sent', await sendReminderEmail(task.id));
    }, 'Could not send the email.');

  const confirmDelete = () =>
    Alert.alert('Delete task', `Delete "${task.title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (await deleteTask(task.id)) navigation.goBack();
        },
      },
    ]);

  return (
    <SafeAreaView style={moduleStyles.container}>
      <ModuleHeader
        title="Task"
        subtitle={STATUS_META[task.status].label}
        actions={[
          { icon: 'create-outline', label: 'Edit task', onPress: () => navigation.navigate('AddTask', { taskId: task.id }) },
          { icon: 'trash-outline', label: 'Delete task', onPress: confirmDelete },
        ]}
      />
      <ScrollView
        contentContainerStyle={moduleStyles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        <HeroCard label={task.category ? `${task.category} · ${priority.label} priority` : `${priority.label} priority`} value={task.title}>
          <View style={{ marginTop: 6, gap: 6 }}>
            <ProgressBar pct={task.progress_percentage} color={Colors.white} />
          </View>
          <HeroStats>
            <HeroStat icon="calendar" label={overdue ? 'Overdue' : 'Deadline'} value={task.deadline ? dueLabel(task).replace('Overdue · ', '') : 'None'} />
            <HeroStat icon="timer" label="Time spent" value={formatDuration(task.time_spent_seconds)} />
          </HeroStats>
        </HeroCard>

        {task.description ? (
          <Card title="Notes">
            <Text style={moduleStyles.body}>{task.description}</Text>
          </Card>
        ) : null}

        <Card title="Status" right={<Pill text={`${task.progress_percentage}%`} />}>
          <Segmented options={STATUSES} value={task.status} onChange={setStatus} />
          <View style={styles.steps}>
            {PROGRESS_STEPS.map((step) => (
              <Pressable
                key={step}
                style={[styles.step, task.progress_percentage === step && styles.stepActive]}
                onPress={() => setProgress(step)}
                disabled={busy}
              >
                <Text style={[styles.stepText, task.progress_percentage === step && styles.stepTextActive]}>{step}%</Text>
              </Pressable>
            ))}
          </View>
          {task.completed_at ? <Text style={moduleStyles.muted}>Completed {formatDateTime(task.completed_at)}</Text> : null}
        </Card>

        <Card title="Time tracker" right={timerStart !== null ? <Pill text="Running" color={Colors.success} bg={Colors.tintGreen} /> : undefined}>
          <Text style={styles.clock}>{formatClock(timerStart !== null ? elapsed : 0)}</Text>
          {timerStart !== null ? (
            <PrimaryButton label="Stop & save" icon="stop" onPress={stopTimer} />
          ) : (
            <PrimaryButton label="Start timer" icon="play" onPress={startTimer} disabled={task.done} />
          )}
          <View style={moduleStyles.grid}>
            {[15, 30, 60].map((minutes) => (
              <SecondaryButton
                key={minutes}
                label={`+${minutes}m`}
                style={{ flex: 1 }}
                onPress={() => run(() => logTime(task.id, minutes * 60), 'Could not save the time.')}
              />
            ))}
          </View>
          <Text style={moduleStyles.muted}>Total tracked: {formatDuration(task.time_spent_seconds)}</Text>
        </Card>

        <Card title="Reminders">
          <InfoRow icon="alarm-outline" label="Reminder" value={task.reminder_time ? formatDateTime(task.reminder_time) : 'Not set'} />
          <InfoRow icon="calendar-outline" label="Due-day alert" value={task.deadline && !task.done ? '9:00 on the due day' : 'Off'} />
          {task.email_reminder_enabled ? (
            <SecondaryButton label="Email me this task" icon="mail-outline" onPress={emailMe} />
          ) : (
            <Text style={moduleStyles.muted}>Turn on Email reminder in Edit to email yourself this task.</Text>
          )}
        </Card>

        <Card title="Attachments">
          {task.links.map((link) => (
            <Pressable key={link} style={styles.attachRow} onPress={() => openUrl(link)}>
              <Ionicons name="link" size={18} color={Colors.primary} />
              <Text style={styles.attachText} numberOfLines={1}>
                {link}
              </Text>
            </Pressable>
          ))}
          {task.attachments.map((item) => (
            <Pressable
              key={item.id}
              style={styles.attachRow}
              onPress={() => openUrl(item.attachment_type === 'url' ? item.url : item.file_url)}
              onLongPress={() => removeAttachment(item)}
            >
              <Ionicons name={item.attachment_type === 'url' ? 'link' : 'document-outline'} size={18} color={Colors.primary} />
              <Text style={styles.attachText} numberOfLines={1}>
                {item.name}
              </Text>
              <Pressable onPress={() => removeAttachment(item)} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={Colors.textHint} />
              </Pressable>
            </Pressable>
          ))}
          {task.links.length === 0 && task.attachments.length === 0 ? (
            <Text style={moduleStyles.muted}>No files or links yet.</Text>
          ) : null}
          <View style={moduleStyles.row}>
            <View style={{ flex: 1 }}>
              <Input placeholder="Add a link" value={linkInput} onChangeText={setLinkInput} autoCapitalize="none" keyboardType="url" onSubmitEditing={addLink} />
            </View>
            <Pressable style={styles.iconBtn} onPress={addLink}>
              <Ionicons name="add" size={22} color={Colors.white} />
            </Pressable>
          </View>
          <View style={moduleStyles.grid}>
            <SecondaryButton label="Photo" icon="image-outline" style={{ flex: 1 }} onPress={() => addFile('gallery')} />
            <SecondaryButton label="Camera" icon="camera-outline" style={{ flex: 1 }} onPress={() => addFile('camera')} />
            <SecondaryButton label="File" icon="document-attach-outline" style={{ flex: 1 }} onPress={() => addFile('document')} />
          </View>
        </Card>

        {task.created_at ? <Text style={[moduleStyles.muted, { textAlign: 'center' }]}>Created {formatDateTime(task.created_at)}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={moduleStyles.rowBetween}>
      <View style={moduleStyles.row}>
        <Ionicons name={icon} size={18} color={Colors.textSecondary} />
        <Text style={moduleStyles.body}>{label}</Text>
      </View>
      <Text style={moduleStyles.bodyStrong}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  steps: { flexDirection: 'row', gap: 6 },
  step: {
    flex: 1,
    height: 36,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
  },
  stepActive: { backgroundColor: Colors.primarySurface, borderColor: Colors.primary },
  stepText: { fontFamily: Font.semibold, fontSize: 13, color: Colors.textSecondary },
  stepTextActive: { color: Colors.primary, fontFamily: Font.bold },
  clock: { fontFamily: Font.extrabold, fontSize: 40, color: Colors.textPrimary, textAlign: 'center', letterSpacing: 1 },
  attachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  attachText: { flex: 1, fontFamily: Font.medium, fontSize: 14, color: Colors.textPrimary },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
