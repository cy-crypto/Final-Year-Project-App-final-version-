import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Font, Radius, Shadows } from '../../constants/theme';
import type { Task } from '../../services/taskService';
import { PRIORITY_META, categoryIcon, dueLabel, isOverdue } from '../../utils/taskFormat';

type Props = {
  task: Task;
  onPress: () => void;
  onToggle: () => void;
  onLongPress?: () => void;
};

/** Task row in the TransactionRow style, with a checkbox to complete the task in place. */
export function TaskItem({ task, onPress, onToggle, onLongPress }: Props) {
  const priority = PRIORITY_META[task.priority];
  const overdue = isOverdue(task);
  const meta = [dueLabel(task), task.category || null].filter(Boolean).join(' · ');

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <Pressable
        onPress={onToggle}
        hitSlop={10}
        style={[styles.check, task.done && styles.checkDone]}
        accessibilityLabel={task.done ? 'Mark as not done' : 'Mark as done'}
      >
        {task.done ? <Ionicons name="checkmark" size={18} color={Colors.white} /> : null}
      </Pressable>
      <View style={styles.info}>
        <Text style={[styles.title, task.done && styles.titleDone]} numberOfLines={1}>
          {task.title}
        </Text>
        <View style={styles.metaRow}>
          <Ionicons name={categoryIcon(task.category)} size={13} color={Colors.textHint} />
          <Text style={[styles.meta, overdue && { color: Colors.error }]} numberOfLines={1}>
            {meta}
          </Text>
        </View>
      </View>
      <View style={[styles.priority, { backgroundColor: priority.bg }]}>
        <Text style={[styles.priorityText, { color: priority.color }]}>{priority.label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 12,
    ...Shadows.card,
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: { backgroundColor: Colors.primary },
  info: { flex: 1, gap: 3 },
  title: { fontFamily: Font.bold, fontSize: 15, color: Colors.textPrimary },
  titleDone: { textDecorationLine: 'line-through', color: Colors.textHint },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  meta: { flex: 1, fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary },
  priority: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill },
  priorityText: { fontFamily: Font.bold, fontSize: 12 },
});
