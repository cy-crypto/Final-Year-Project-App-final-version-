import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Colors } from '../../constants/theme';
import { toApiErrorMessage } from '../../services/api';
import {
  formatTime12,
  getMedicationLogs,
  type DoseStatus,
  type Medication,
  type MedicationLog,
} from '../../services/medicationService';
import { ChipRow, EmptyCard, ListRow, SectionHeader, moduleStyles } from '../module/ModuleUI';
import { SLOT_META } from './DoseRow';

const STATUS_OPTIONS: { key: 'all' | DoseStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'taken', label: 'Taken' },
  { key: 'skipped', label: 'Skipped' },
];

const RANGE_OPTIONS: { key: '7' | '30' | '90'; label: string }[] = [
  { key: '7', label: '7 days' },
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
];

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Intake history log (FR-05.3), grouped by day and filterable by status, medicine and range. */
export function MedicationHistoryTab({ medications, reloadKey }: { medications: Medication[]; reloadKey: number }) {
  const [status, setStatus] = useState<'all' | DoseStatus>('all');
  const [range, setRange] = useState<'7' | '30' | '90'>('30');
  const [medication, setMedication] = useState<string>('all');
  const [logs, setLogs] = useState<MedicationLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getMedicationLogs({
      status: status === 'all' ? undefined : status,
      medication: medication === 'all' ? undefined : Number(medication),
      dateFrom: daysAgo(Number(range) - 1),
    })
      .then((data) => {
        if (!alive) return;
        setLogs(data);
        setError(null);
      })
      .catch((err) => alive && setError(toApiErrorMessage(err, 'Could not load the history.')));
    return () => {
      alive = false;
    };
  }, [status, range, medication, reloadKey]);

  const groups = useMemo(() => {
    const map = new Map<string, MedicationLog[]>();
    for (const log of logs ?? []) {
      const key = new Date(log.scheduled_time).toDateString();
      map.set(key, [...(map.get(key) ?? []), log]);
    }
    return Array.from(map.entries());
  }, [logs]);

  const takenCount = (logs ?? []).filter((l) => l.status === 'taken').length;

  return (
    <>
      <ChipRow options={STATUS_OPTIONS} value={status} onChange={setStatus} />
      <ChipRow options={RANGE_OPTIONS} value={range} onChange={setRange} />
      {medications.length > 1 ? (
        <ChipRow
          options={[{ key: 'all', label: 'All medicines' }, ...medications.map((m) => ({ key: String(m.id), label: m.name }))]}
          value={medication}
          onChange={setMedication}
          scroll
        />
      ) : null}

      {error ? (
        <EmptyCard text={error} icon="cloud-offline-outline" />
      ) : logs === null ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
      ) : logs.length === 0 ? (
        <EmptyCard text="No doses logged in this period." icon="document-text-outline" />
      ) : (
        <>
          <SectionHeader title={`${logs.length} entries · ${takenCount} taken`} />
          {groups.map(([day, items]) => (
            <View key={day} style={moduleStyles.list}>
              <SectionHeader title={formatDay(day)} />
              {items.map((log) => {
                const meta = SLOT_META[log.status];
                const time = log.dose_time
                  ? formatTime12(log.dose_time)
                  : new Date(log.scheduled_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                return (
                  <ListRow
                    key={log.id}
                    icon={meta.icon}
                    iconColor={meta.color}
                    iconBg={meta.bg}
                    title={log.medication_name}
                    meta={`${log.dose_time ? time : `As needed · ${time}`} · ${log.medication_dosage}${log.notes ? ` · ${log.notes}` : ''}`}
                    right={meta.label}
                    rightColor={meta.color}
                  />
                );
              })}
            </View>
          ))}
        </>
      )}
    </>
  );
}

function formatDay(dateString: string) {
  const date = new Date(dateString);
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (dateString === today) return 'Today';
  if (dateString === yesterday) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' });
}
