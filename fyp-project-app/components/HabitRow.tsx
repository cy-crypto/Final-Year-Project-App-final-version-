import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Colors } from '../constants/theme';
import type { Habit } from '../context/AppContext';

type Props = {
  habit: Habit;
  onPress: () => void;
};

export function HabitRow({ habit, onPress }: Props) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Text style={styles.title}>{habit.name}</Text>
      <Text style={styles.streak}>Streak: {habit.streakCount} days</Text>
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
  title: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  streak: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});
