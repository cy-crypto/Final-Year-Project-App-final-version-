import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Font, Radius, Shadows } from '../constants/theme';
import type { TransactionDto } from '../services/budgetService';
import { categoryIcon, formatMoney } from '../utils/budgetFormat';

type Props = {
  item: TransactionDto;
  currency: string;
  onPress: () => void;
  onDelete?: () => void;
};

export function TransactionRow({ item, currency, onPress, onDelete }: Props) {
  const isIncome = item.type === 'income';
  const accent = isIncome ? Colors.success : Colors.primary;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
      onPress={onPress}
      onLongPress={onDelete}
    >
      <View style={[styles.icon, { backgroundColor: isIncome ? '#ECFDF5' : Colors.primarySurface }]}>
        <Ionicons name={categoryIcon(item.category, item.type)} size={20} color={accent} />
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {item.description?.trim() || item.category || 'Uncategorized'}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {item.category || 'Uncategorized'}
        </Text>
      </View>
      <Text style={[styles.amount, { color: isIncome ? Colors.success : Colors.textPrimary }]}>
        {isIncome ? '+' : '-'}
        {currency} {formatMoney(Number(item.amount))}
      </Text>
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
  info: { flex: 1, gap: 2 },
  title: { fontFamily: Font.bold, fontSize: 15, color: Colors.textPrimary },
  meta: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary },
  amount: { fontFamily: Font.extrabold, fontSize: 14 },
});
