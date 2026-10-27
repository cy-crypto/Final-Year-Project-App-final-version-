import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Font, Radius, Shadows } from '../constants/theme';
import { getTransactions, TransactionDto } from '../services/budgetService';
import type { RootStackParamList } from '../navigation/types';
import { formatMoney, toDateStr } from '../utils/budgetFormat';
import { TransactionRow } from './TransactionRow';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Props = {
  currency: string;
  /** Bumped by the parent (pull-to-refresh) to force a reload. */
  reloadKey: number;
};

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
// Heat colour = the app orange at increasing opacity.
const heat = (intensity: number) => `rgba(255, 107, 44, ${(0.14 + 0.82 * intensity).toFixed(2)})`;

export function SpendingCalendar({ currency, reloadKey }: Props) {
  const navigation = useNavigation<Nav>();

  const [monthOffset, setMonthOffset] = useState(0); // 0 = this month, -1 = last month...
  const [txns, setTxns] = useState<TransactionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(toDateStr(new Date()));

  const base = new Date();
  const first = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const year = first.getFullYear();
  const month = first.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = (first.getDay() + 6) % 7; // week starts on Monday
  const monthLabel = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const todayStr = toDateStr(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = toDateStr(new Date(year, month, 1));
      const to = toDateStr(new Date(year, month + 1, 0));
      setTxns(await getTransactions({ dateFrom: from, dateTo: to }));
    } catch {
      setTxns([]);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  const { spendByDay, maxDay, total, topDay, spendingDays } = useMemo(() => {
    const map = new Map<string, number>();
    txns.forEach((t) => {
      if (t.type === 'expense') map.set(t.date, (map.get(t.date) ?? 0) + Number(t.amount));
    });
    let max = 0;
    let top: string | null = null;
    let sum = 0;
    map.forEach((v, k) => {
      sum += v;
      if (v > max) {
        max = v;
        top = k;
      }
    });
    return { spendByDay: map, maxDay: max, total: sum, topDay: top as string | null, spendingDays: map.size };
  }, [txns]);

  const changeMonth = (delta: number) => {
    const next = Math.min(monthOffset + delta, 0);
    setMonthOffset(next);
    setSelected(next === 0 ? todayStr : null);
  };

  const dayItems = selected ? txns.filter((t) => t.date === selected) : [];
  const dayExpense = selected ? spendByDay.get(selected) ?? 0 : 0;

  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const dayLabel = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>Spending calendar</Text>
        <View style={styles.nav}>
          <Pressable style={styles.navBtn} onPress={() => changeMonth(-1)} hitSlop={8}>
            <Ionicons name="chevron-back" size={18} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <Pressable
            style={[styles.navBtn, monthOffset === 0 && { opacity: 0.3 }]}
            onPress={() => changeMonth(1)}
            disabled={monthOffset === 0}
            hitSlop={8}
          >
            <Ionicons name="chevron-forward" size={18} color={Colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((d, i) => (
          <Text key={i} style={styles.weekday}>{d}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (day === null) return <View key={`b${i}`} style={styles.cellWrap} />;
          const dateStr = toDateStr(new Date(year, month, day));
          const spent = spendByDay.get(dateStr) ?? 0;
          const intensity = maxDay > 0 ? spent / maxDay : 0;
          const isFuture = dateStr > todayStr;
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selected;
          return (
            <View key={dateStr} style={styles.cellWrap}>
              <Pressable
                style={[
                  styles.cell,
                  { backgroundColor: spent > 0 ? heat(intensity) : Colors.tintSlate },
                  isFuture && { opacity: 0.4 },
                  isToday && styles.cellToday,
                  isSelected && styles.cellSelected,
                ]}
                onPress={() => setSelected(isSelected ? null : dateStr)}
              >
                <Text style={[styles.dayNum, spent > 0 && intensity > 0.55 && { color: Colors.white }]}>{day}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={styles.legend}>
        <Text style={styles.legendText}>Less</Text>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <View key={v} style={[styles.legendBox, { backgroundColor: v === 0 ? Colors.tintSlate : heat(v) }]} />
        ))}
        <Text style={styles.legendText}>More</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginVertical: 8 }} />
      ) : (
        <Text style={styles.summary}>
          {total > 0
            ? `${currency} ${formatMoney(total)} over ${spendingDays} day${spendingDays === 1 ? '' : 's'}${topDay ? ` · busiest: ${dayLabel(topDay)} (${formatMoney(maxDay)})` : ''}`
            : 'No spending recorded this month.'}
        </Text>
      )}

      {selected && !loading ? (
        <View style={styles.dayBox}>
          <View style={styles.dayHeader}>
            <Text style={styles.dayTitle}>{dayLabel(selected)}</Text>
            <Text style={styles.dayTotal}>{dayExpense > 0 ? `${currency} ${formatMoney(dayExpense)} spent` : ''}</Text>
          </View>
          {dayItems.length === 0 ? (
            <Text style={styles.empty}>Nothing recorded on this day.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {dayItems.map((t) => (
                <TransactionRow
                  key={t.id}
                  item={t}
                  currency={currency}
                  onPress={() => navigation.navigate('AddTransaction', { transaction: t })}
                />
              ))}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 14,
    gap: 10,
    ...Shadows.card,
  },
  head: { gap: 8 },
  title: { fontFamily: Font.extrabold, fontSize: 16, color: Colors.textPrimary },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.tintSlate, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontFamily: Font.bold, fontSize: 15, color: Colors.textPrimary },

  weekRow: { flexDirection: 'row' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontFamily: Font.semibold, fontSize: 12, color: Colors.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cellWrap: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  cell: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  cellToday: { borderColor: Colors.accentOlive },
  cellSelected: { borderColor: Colors.textPrimary },
  dayNum: { fontFamily: Font.bold, fontSize: 13, color: Colors.textPrimary },

  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  legendBox: { width: 16, height: 16, borderRadius: 5 },
  legendText: { fontFamily: Font.medium, fontSize: 11, color: Colors.textSecondary },
  summary: { fontFamily: Font.medium, fontSize: 13, lineHeight: 19, color: Colors.textSecondary, textAlign: 'center' },

  dayBox: { backgroundColor: Colors.bgLight, borderRadius: Radius.md, padding: 10, gap: 8 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayTitle: { fontFamily: Font.extrabold, fontSize: 15, color: Colors.textPrimary },
  dayTotal: { fontFamily: Font.bold, fontSize: 13, color: Colors.primary },
  empty: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary },
});
