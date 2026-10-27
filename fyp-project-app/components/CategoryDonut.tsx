import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Colors, Font } from '../constants/theme';
import { CATEGORY_COLORS, formatMoney } from '../utils/budgetFormat';

export type DonutRow = { label: string; value: number };

type Props = {
  rows: DonutRow[];
  currency: string;
  /** Shown under the total in the middle of the ring. */
  centerLabel?: string;
};

const SIZE = 156;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;
const MAX_SLICES = 5;

/** Keeps the biggest categories and folds the rest into "Other". */
function collapse(rows: DonutRow[]): DonutRow[] {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  if (sorted.length <= MAX_SLICES + 1) return sorted;
  const rest = sorted.slice(MAX_SLICES).reduce((sum, r) => sum + r.value, 0);
  return [...sorted.slice(0, MAX_SLICES), { label: 'Other', value: rest }];
}

export function CategoryDonut({ rows, currency, centerLabel = 'Spent' }: Props) {
  const slices = collapse(rows.filter((r) => r.value > 0));
  const total = slices.reduce((sum, r) => sum + r.value, 0);

  if (total === 0) {
    return (
      <Text style={styles.empty}>No spending yet this month — add an expense to see the breakdown.</Text>
    );
  }

  const gap = slices.length > 1 ? 3 : 0;
  let offset = 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.ring}>
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke={Colors.tintSlate} strokeWidth={STROKE} fill="none" />
          {slices.map((slice, i) => {
            const length = (slice.value / total) * CIRC;
            const dash = Math.max(length - gap, 0.5);
            const node = (
              <Circle
                key={slice.label}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                stroke={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                strokeWidth={STROKE}
                fill="none"
                strokeDasharray={`${dash} ${CIRC}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              />
            );
            offset += length;
            return node;
          })}
        </Svg>
        <View style={styles.center} pointerEvents="none">
          <Text style={styles.centerLabel}>{centerLabel}</Text>
          <Text style={styles.centerValue} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(total)}
          </Text>
          <Text style={styles.centerCurrency}>{currency}</Text>
        </View>
      </View>

      <View style={styles.legend}>
        {slices.map((slice, i) => (
          <View key={slice.label} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }]} />
            <Text style={styles.legendLabel} numberOfLines={1}>{slice.label}</Text>
            <Text style={styles.legendPct}>{Math.round((slice.value / total) * 100)}%</Text>
            <Text style={styles.legendValue}>{formatMoney(slice.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 16 },
  ring: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', alignItems: 'center', width: SIZE - STROKE * 2 - 12 },
  centerLabel: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary },
  centerValue: { fontFamily: Font.extrabold, fontSize: 22, color: Colors.textPrimary },
  centerCurrency: { fontFamily: Font.semibold, fontSize: 12, color: Colors.textHint },
  legend: { alignSelf: 'stretch', gap: 10 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  legendLabel: { flex: 1, fontFamily: Font.semibold, fontSize: 15, color: Colors.textPrimary },
  legendPct: { fontFamily: Font.medium, fontSize: 14, color: Colors.textSecondary, width: 44, textAlign: 'right' },
  legendValue: { fontFamily: Font.bold, fontSize: 15, color: Colors.textPrimary, minWidth: 70, textAlign: 'right' },
  empty: { fontFamily: Font.medium, fontSize: 15, lineHeight: 22, color: Colors.textSecondary, textAlign: 'center', paddingVertical: 12 },
});
