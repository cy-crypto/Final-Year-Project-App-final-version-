import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Font, Radius, Shadows } from '../../constants/theme';
import { formatTime12, type DoseSlot, type SlotState } from '../../services/medicationService';

export const SLOT_META: Record<SlotState, { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  taken: { label: 'Taken', color: Colors.success, bg: Colors.tintGreen, icon: 'checkmark-circle' },
  skipped: { label: 'Skipped', color: Colors.textSecondary, bg: Colors.tintSlate, icon: 'remove-circle' },
  deferred: { label: 'Later', color: Colors.accentAmber, bg: Colors.tintAmber, icon: 'time' },
  missed: { label: 'Missed', color: Colors.error, bg: Colors.tintRose, icon: 'alert-circle' },
  due: { label: 'Due now', color: Colors.primary, bg: Colors.primarySurface, icon: 'alarm' },
  upcoming: { label: 'Upcoming', color: Colors.accentBlue, bg: Colors.tintIndigo, icon: 'time-outline' },
};

type Props = {
  slot: DoseSlot;
  busy?: boolean;
  onTake: () => void;
  onSkip: () => void;
  onChange: () => void;
};

/** One scheduled dose: time, medicine, state and Take / Skip buttons until it is logged. */
export function DoseRow({ slot, busy, onTake, onSkip, onChange }: Props) {
  const meta = SLOT_META[slot.status];
  const logged = slot.status === 'taken' || slot.status === 'skipped' || slot.status === 'deferred';

  return (
    <Pressable style={styles.card} onPress={logged ? onChange : undefined} disabled={!logged}>
      <View style={[styles.icon, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={20} color={meta.color} />
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, logged && slot.status !== 'deferred' && styles.titleDone]} numberOfLines={1}>
          {slot.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {formatTime12(slot.time)} · {slot.dosage}
          {slot.instructions ? ` · ${slot.instructions}` : ''}
        </Text>
        <Text style={[styles.state, { color: meta.color }]}>{meta.label}</Text>
      </View>
      {busy ? (
        <ActivityIndicator color={Colors.primary} />
      ) : logged ? (
        <Ionicons name="chevron-forward" size={18} color={Colors.textHint} />
      ) : (
        <View style={styles.actions}>
          <Pressable style={styles.skip} onPress={onSkip} hitSlop={6}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
          <Pressable style={styles.take} onPress={onTake} hitSlop={6}>
            <Text style={styles.takeText}>Take</Text>
          </Pressable>
        </View>
      )}
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
    padding: 10,
    ...Shadows.card,
  },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 1 },
  title: { fontFamily: Font.bold, fontSize: 15, color: Colors.textPrimary },
  titleDone: { color: Colors.textSecondary },
  meta: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary },
  state: { fontFamily: Font.bold, fontSize: 12 },
  actions: { flexDirection: 'row', gap: 6 },
  skip: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: { fontFamily: Font.semibold, fontSize: 13, color: Colors.textSecondary },
  take: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.button,
  },
  takeText: { fontFamily: Font.bold, fontSize: 13, color: Colors.white },
});
