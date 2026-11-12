import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Font, Radius, Shadows } from '../../constants/theme';
import type { HabitDto } from '../../services/habitService';
import { CATEGORY_META, progressLabel } from '../../utils/habitFormat';

type Props = {
  habit: HabitDto;
  onPress: () => void;
  onToggle: () => void;
  onLongPress?: () => void;
};

/** Habit row: category tile, streak/week progress, the last 7 days as dots and a big check button. */
export function HabitCard({ habit, onPress, onToggle, onLongPress }: Props) {
  const meta = CATEGORY_META[habit.category];
  const done = habit.doneToday;
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]} onPress={onPress} onLongPress={onLongPress}>
      <View style={[styles.icon, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, done && styles.nameDone]} numberOfLines={1}>
          {habit.name}
        </Text>
        <View style={styles.metaRow}>
          {habit.streakCount > 0 ? <Ionicons name="flame" size={13} color={Colors.primary} /> : null}
          <Text style={[styles.meta, habit.streakCount > 0 && { color: Colors.primary }]} numberOfLines={1}>
            {progressLabel(habit)}
          </Text>
          <View style={styles.dots}>
            {habit.last7Days.map((d) => (
              <View key={d.date} style={[styles.dot, d.done && styles.dotDone]} />
            ))}
          </View>
        </View>
      </View>
      <Pressable
        onPress={onToggle}
        hitSlop={10}
        style={[styles.check, done && styles.checkDone]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={done ? `Undo ${habit.name}` : `Check in ${habit.name}`}
      >
        {done ? <Ionicons name="checkmark" size={18} color={Colors.white} /> : null}
      </Pressable>
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
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 3 },
  name: { fontFamily: Font.bold, fontSize: 15, color: Colors.textPrimary },
  nameDone: { color: Colors.textSecondary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  meta: { flex: 1, fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary },
  dots: { flexDirection: 'row', gap: 3 },
  dot: { width: 8, height: 6, borderRadius: 3, backgroundColor: Colors.borderLight },
  dotDone: { backgroundColor: Colors.primary },
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
});
