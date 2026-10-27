import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Colors, Font } from '../../constants/theme';
import { useAppContext } from '../../context/AppContext';
import type { TaskReport } from '../../services/taskService';
import { toApiErrorMessage } from '../../services/api';
import { formatDuration } from '../../utils/taskFormat';
import { BarChart } from '../module/BarChart';
import { Card, ChipRow, EmptyCard, ProgressBar, StatTile, moduleStyles } from '../module/ModuleUI';

type Period = TaskReport['period'];

const PERIODS: { key: Period; label: string }[] = [
  { key: 'daily', label: 'Today' },
  { key: 'weekly', label: 'This week' },
  { key: 'monthly', label: 'This month' },
];

export function TaskInsightsTab({ reloadKey }: { reloadKey: number }) {
  const { getTaskReport } = useAppContext();
  const [period, setPeriod] = useState<Period>('weekly');
  const [report, setReport] = useState<TaskReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getTaskReport(period)
      .then((data) => {
        if (!alive) return;
        setReport(data);
        setError(null);
      })
      .catch((err) => alive && setError(toApiErrorMessage(err, 'Could not load task insights.')));
    return () => {
      alive = false;
    };
  }, [period, reloadKey, getTaskReport]);

  const s = report?.summary;
  const rate = s && s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
  const categories = report ? Object.values(report.by_category) : [];

  return (
    <>
      <ChipRow options={PERIODS} value={period} onChange={setPeriod} />
      {error ? (
        <EmptyCard text={error} icon="cloud-offline-outline" />
      ) : !report || !s ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
      ) : (
        <>
          <Card title="Completion">
            <View style={moduleStyles.grid}>
              <StatTile label="Created" value={String(s.total)} />
              <StatTile label="Completed" value={String(s.completed)} tint={Colors.tintGreen} color={Colors.success} />
              <StatTile label="Overdue" value={String(s.overdue)} tint={Colors.tintRose} color={Colors.error} />
            </View>
            <View style={moduleStyles.rowBetween}>
              <Text style={moduleStyles.muted}>Completion rate</Text>
              <Text style={styles.rate}>{rate}%</Text>
            </View>
            <ProgressBar pct={rate} />
            <Text style={moduleStyles.muted}>
              Time tracked: {formatDuration(s.time_spent_seconds)} · {s.completed_in_period} finished in this period
            </Text>
          </Card>

          <Card title={period === 'monthly' ? 'Last 4 weeks' : 'Last 7 days'}>
            <BarChart
              labels={report.chart_data.labels}
              series={[
                { label: 'Created', color: Colors.primary, values: report.chart_data.created },
                { label: 'Completed', color: Colors.success, values: report.chart_data.completed },
              ]}
            />
          </Card>

          <Card title="By priority">
            {Object.values(report.by_priority).map((p) => (
              <BreakdownRow key={p.label} label={p.label} color={p.color} total={p.total} completed={p.completed} />
            ))}
          </Card>

          <Card title="By category">
            {categories.length === 0 ? (
              <Text style={moduleStyles.body}>No tasks in this period yet.</Text>
            ) : (
              categories.map((c) => (
                <BreakdownRow key={c.label} label={c.label} color={c.color} total={c.total} completed={c.completed} />
              ))
            )}
          </Card>
        </>
      )}
    </>
  );
}

function BreakdownRow({ label, color, total, completed }: { label: string; color: string; total: number; completed: number }) {
  const pct = total > 0 ? (completed / total) * 100 : 0;
  return (
    <View style={{ gap: 6 }}>
      <View style={moduleStyles.rowBetween}>
        <View style={moduleStyles.row}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={moduleStyles.bodyStrong}>{label}</Text>
        </View>
        <Text style={moduleStyles.muted}>
          {completed}/{total} done
        </Text>
      </View>
      <ProgressBar pct={pct} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  rate: { fontFamily: Font.extrabold, fontSize: 17, color: Colors.primary },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
