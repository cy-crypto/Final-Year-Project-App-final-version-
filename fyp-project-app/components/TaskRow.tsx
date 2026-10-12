import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '../constants/theme';
import type { Task } from '../context/AppContext';

type Props = {
  task: Task;
  onPress: () => void;
  onDelete?: () => void;
};

export function TaskRow({ task, onPress, onDelete }: Props) {
  const priorityColor =
    task.priority === 'high' ? Colors.error : task.priority === 'medium' ? Colors.warning : Colors.success;

  return (
    <Pressable style={[styles.row, task.done && styles.rowDone]} onPress={onPress}>
      <View style={styles.headerRow}>
        <Text style={[styles.text, task.done && styles.textDone]}>{task.title}</Text>
        <Text style={[styles.priority, { color: priorityColor }]}>{task.priority}</Text>
      </View>
      <Text style={styles.deadline}>Deadline: {task.deadline}</Text>
      {onDelete ? (
        <Pressable onPress={onDelete} style={styles.deleteButton}>
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 6,
  },
  rowDone: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primaryLight,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontWeight: '600',
    flex: 1,
  },
  textDone: {
    textDecorationLine: 'line-through',
    color: Colors.textHint,
  },
  priority: {
    fontSize: 12,
    fontWeight: '700',
  },
  deadline: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  deleteButton: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
  },
  deleteText: {
    color: Colors.error,
    fontSize: 12,
    fontWeight: '700',
  },
});
