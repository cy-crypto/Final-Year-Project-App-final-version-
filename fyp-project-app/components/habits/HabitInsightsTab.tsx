import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Colors, Font } from '../../constants/theme';
import { toApiErrorMessage } from '../../services/api';
import { getHabitStats, type HabitDto, type HabitStats } from '../../services/habitService';
import { CATEGORY_META, shortWeekday } from '../../utils/habitFormat';
import { BarChart } from '../module/BarChart';
import { Card, EmptyCard, ProgressBar, StatTile, moduleStyles } from '../module/ModuleUI';

/** Heatmap colour for a day's completion rate (null = nothing was expected that day). */
function heat(rate: number | null) {
  if (rate === null) return Colors.tintSlate;
  if (rate === 0) return Colors.borderLight;
  if (rate < 50) return '#FDBA8C';
  if (rate < 100) return Colors.primaryLight;
  return Colors.primary;
}

export function HabitInsightsTab({ habits, reloadKey }: { habits: HabitDto[]; reloadKey: number }) {
  const [stats, setStats] = useState<HabitStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getHabitStats(28)
      .then((s) => {
        if (!alive) return;
        setStats(s);
        setError(null);
      })
      .catch((err) => alive && setError(toApiErrorMessage(err, 'Could not load habit insights.')));
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  if (error) return <EmptyCard text={error} icon="cloud-offline-outline" />;
  if (!stats) return <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />;
  if (habits.length === 0) return <EmptyCard text="Add a habit to start seeing your progress here." icon="stats-chart-outline" />;

  const week = stats.days.slice(-7);
  const ranked = [...habits].sort((a, b) => b.rate30d - a.rate30d);

  return (
    <>
      <Card title="Overview">
        <View style={moduleStyles.grid}>
          <StatTile label="Check-ins" value={String(stats.total_checkins)} />
          <StatTile label="Running streaks" value={String(stats.active_streaks)} tint={Colors.tintGreen} color={Colors.success} />
          <StatTile label="Best streak" value={`${stats.best_streak}d`} tint={Colors.tintIndigo} color={Colors.accentBlue} />
        </View>
        <View style={moduleStyles.rowBetween}>
          <Text style={moduleStyles.muted}>Daily habits done this week</Text>
          <Text style={styles.rate}>{stats.rate_7d === null ? '–' : `${stats.rate_7d}%`}</Text>
        </View>
        <ProgressBar pct={stats.rate_7d ?? 0} />
      </Card>

      <Card title="Last 4 weeks">
        <View style={styles.heatmap}>
          {stats.days.map((d) => (
            <View key={d.date} style={[styles.cell, { backgroundColor: heat(d.rate) }]} />
          ))}
        </View>
        <View style={styles.legend}>
          <Text style={moduleStyles.muted}>Less</Text>
          {[0, 30, 70, 100].map((r) => (
            <View key={r} style={[styles.legendCell, { backgroundColor: heat(r) }]} />
          ))}
          <Text style={moduleStyles.muted}>More</Text>
        </View>
      </Card>

      <Card title="This week">
        <BarChart
          labels={week.map((d) => shortWeekday(d.date))}
          series={[
            { label: 'Planned', color: Colors.primaryLight, values: week.map((d) => d.expected) },
            { label: 'Done', color: Colors.success, values: week.map((d) => d.done) },
          ]}
        />
      </Card>

      <Card title="Consistency (30 days)">
        {ranked.map((h) => {
          const meta = CATEGORY_META[h.category];
          return (
            <View key={h.id} style={{ gap: 6 }}>
              <View style={moduleStyles.rowBetween}>
                <Text style={moduleStyles.bodyStrong} numberOfLines={1}>
                  {h.name}
                </Text>
                <Text style={moduleStyles.muted}>{h.rate30d}%</Text>
              </View>
              <ProgressBar pct={h.rate30d} color={meta.color} />
            </View>
          );
        })}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  rate: { fontFamily: Font.extrabold, fontSize: 17, color: Colors.primary },
  heatmap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'space-between' },
  cell: { width: '12%', aspectRatio: 1, borderRadius: 6 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'flex-end' },
  legendCell: { width: 14, height: 14, borderRadius: 3 },
});
