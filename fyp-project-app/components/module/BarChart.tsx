import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Font } from '../../constants/theme';

const CHART_HEIGHT = 120;

type Series = { label: string; color: string; values: number[] };

/** Grouped bar chart drawn with plain views, same look as the Budget insights chart. */
export function BarChart({ labels, series, highlightLast = true }: { labels: string[]; series: Series[]; highlightLast?: boolean }) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.chart}>
        {labels.map((label, i) => {
          const current = highlightLast && i === labels.length - 1;
          return (
            <View key={`${label}-${i}`} style={styles.group}>
              <View style={styles.bars}>
                {series.map((s) => (
                  <View
                    key={s.label}
                    style={[
                      styles.bar,
                      {
                        height: Math.max((s.values[i] / max) * CHART_HEIGHT, s.values[i] > 0 ? 3 : 0),
                        backgroundColor: s.color,
                        opacity: current || !highlightLast ? 1 : 0.55,
                      },
                    ]}
                  />
                ))}
              </View>
              <Text style={[styles.label, current && styles.labelActive]}>{label}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.legend}>
        {series.map((s) => (
          <View key={s.label} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text style={styles.legendText}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { flexDirection: 'row', alignItems: 'flex-end' },
  group: { flex: 1, alignItems: 'center', gap: 6 },
  bars: { height: CHART_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  bar: { width: 12, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  label: { fontFamily: Font.medium, fontSize: 12, color: Colors.textSecondary },
  labelActive: { fontFamily: Font.bold, color: Colors.textPrimary },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary },
});
