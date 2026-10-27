import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Colors, Font } from '../../constants/theme';
import { toApiErrorMessage } from '../../services/api';
import { getAdherence, type Adherence, type Medication } from '../../services/medicationService';
import { BarChart } from '../module/BarChart';
import { Card, ChipRow, EmptyCard, ListRow, ProgressBar, StatTile, moduleStyles } from '../module/ModuleUI';

const RANGES: { key: '7' | '14'; label: string }[] = [
  { key: '7', label: 'Last 7 days' },
  { key: '14', label: 'Last 14 days' },
];

export function MedicationInsightsTab({ medications, reloadKey }: { medications: Medication[]; reloadKey: number }) {
  const [range, setRange] = useState<'7' | '14'>('7');
  const [data, setData] = useState<Adherence | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getAdherence(Number(range))
      .then((res) => {
        if (!alive) return;
        setData(res);
        setError(null);
      })
      .catch((err) => alive && setError(toApiErrorMessage(err, 'Could not load adherence.')));
    return () => {
      alive = false;
    };
  }, [range, reloadKey]);

  const active = medications.filter((m) => m.is_active);
  const totals = data?.days.reduce(
    (acc, d) => ({ skipped: acc.skipped + d.skipped, missed: acc.missed + d.missed }),
    { skipped: 0, missed: 0 }
  );
  // Show day labels for a week, every other day for two weeks so the axis stays readable.
  const labels = data?.days.map((d, i) => (range === '7' || i % 2 === data.days.length % 2 ? d.label : '')) ?? [];

  return (
    <>
      <ChipRow options={RANGES} value={range} onChange={setRange} />
      {error ? (
        <EmptyCard text={error} icon="cloud-offline-outline" />
      ) : !data || !totals ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
      ) : (
        <>
          <Card title="Adherence">
            <View style={moduleStyles.rowBetween}>
              <Text style={moduleStyles.muted}>Doses taken on schedule</Text>
              <Text style={styles.rate}>{data.rate === null ? '–' : `${data.rate}%`}</Text>
            </View>
            <ProgressBar pct={data.rate ?? 0} color={data.rate !== null && data.rate < 70 ? Colors.error : Colors.success} />
            <View style={moduleStyles.grid}>
              <StatTile label="Taken" value={String(data.taken)} tint={Colors.tintGreen} color={Colors.success} />
              <StatTile label="Skipped" value={String(totals.skipped)} tint={Colors.tintSlate} color={Colors.textSecondary} />
              <StatTile label="Missed" value={String(totals.missed)} tint={Colors.tintRose} color={Colors.error} />
            </View>
          </Card>

          <Card title="Day by day">
            <BarChart
              labels={labels}
              series={[
                { label: 'Scheduled', color: Colors.primaryLight, values: data.days.map((d) => d.scheduled) },
                { label: 'Taken', color: Colors.success, values: data.days.map((d) => d.taken) },
              ]}
            />
          </Card>

          <Card title="Supply">
            {active.length === 0 ? (
              <Text style={moduleStyles.body}>No active medicines.</Text>
            ) : (
              active.map((m) => (
                <ListRow
                  key={m.id}
                  icon={m.needs_refill ? 'warning' : 'cube-outline'}
                  iconColor={m.needs_refill ? Colors.error : Colors.primary}
                  iconBg={m.needs_refill ? Colors.tintRose : Colors.primarySurface}
                  title={m.name}
                  meta={m.days_of_supply_left !== null ? `About ${m.days_of_supply_left} day(s) left` : 'Taken as needed'}
                  right={`${m.supply_count} left`}
                  rightColor={m.needs_refill ? Colors.error : undefined}
                />
              ))
            )}
          </Card>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  rate: { fontFamily: Font.extrabold, fontSize: 22, color: Colors.textPrimary },
});
