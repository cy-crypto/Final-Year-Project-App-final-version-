import React, { useCallback, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getSleepRecords, getSleepSummary, saveSleepRecord, deleteSleepRecord, type SleepRecordDto, type SleepSummary } from '../services/fitnessService';
import { toApiErrorMessage } from '../services/api';
import { changeSleepDateTime, formatSleepDuration, hasSleepOverlap, sleepMinutes, validateSleepInterval } from '../services/fitnessCalculations';
import { DateTimeInput } from '../components/module/DateTimeInput';
import { BarChart } from '../components/module/BarChart';
import { Card, CenterLoader, ErrorText, Field, FormCard, FormHeader, PrimaryButton, SecondaryButton, moduleStyles as s } from '../components/module/ModuleUI';
import { Colors } from '../constants/theme';

function displayTime(value: string) { return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); }

export function SleepTrackingScreen() {
  const [records, setRecords] = useState<SleepRecordDto[]>([]);
  const [summary, setSummary] = useState<SleepSummary | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [bed, setBed] = useState<Date | null>(null);
  const [wake, setWake] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const paging = useRef(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const version = useRef(0);
  const mounted = useRef(false);
  const load = useCallback(async () => {
    const requestVersion = ++version.current;
    try {
      const [history, totals] = await Promise.all([getSleepRecords(), getSleepSummary()]);
      if (!mounted.current || requestVersion !== version.current) return;
      setRecords(history.results); setHasMore(Boolean(history.next)); setPage(1); setSummary(totals); setError(null);
    } catch (err) {
      if (mounted.current && requestVersion === version.current) setError(toApiErrorMessage(err, 'Could not load sleep records. Please retry.'));
    } finally {
      if (mounted.current && requestVersion === version.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);
  useFocusEffect(useCallback(() => {
    mounted.current = true; void load();
    return () => { mounted.current = false; version.current++; };
  }, [load]));
  const clearForm = () => { setEditing(null); setBed(null); setWake(null); setFormError(null); };
  const save = async () => {
    if (submitting.current) return;
    const message = validateSleepInterval(bed, wake); setFormError(message); setSuccess(null);
    if (message || !bed || !wake) return;
    if (hasSleepOverlap(records, bed, wake, editing)) {
      setFormError('This interval overlaps an existing sleep record.'); return;
    }
    submitting.current = true; setBusy(true); version.current++;
    try {
      const saved = await saveSleepRecord({ bedtime: bed.toISOString(), wake_time: wake.toISOString() }, editing ?? undefined);
      setRecords((old) => [saved, ...old.filter((r) => r.id !== saved.id)].sort((a, b) => Date.parse(b.wake_time) - Date.parse(a.wake_time)));
      setSummary(null);
      clearForm(); setSuccess('Sleep record saved.'); await load();
    } catch (err) { setFormError(toApiErrorMessage(err, 'Could not save sleep. Please retry.')); }
    finally { submitting.current = false; setBusy(false); }
  };
  const remove = (record: SleepRecordDto) => Alert.alert('Delete sleep record?', `Delete ${formatSleepDuration(record.duration_minutes)} assigned to ${record.wake_date}?`, [
    { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => {
      if (submitting.current) return;
      submitting.current = true; setBusy(true); setSuccess(null); version.current++;
      try {
        await deleteSleepRecord(record.id); setRecords((old) => old.filter((r) => r.id !== record.id)); setSummary(null);
        if (editing === record.id) clearForm(); setSuccess('Sleep record deleted.'); await load();
      } catch (err) { setError(toApiErrorMessage(err, 'Could not delete sleep. Please retry.')); }
      finally { submitting.current = false; setBusy(false); }
    } },
  ]);
  const more = async () => {
    if (paging.current || busy || !hasMore) return;
    paging.current = true; setLoadingMore(true);
    const requestVersion = version.current;
    try {
      const history = await getSleepRecords(page + 1);
      if (!mounted.current || requestVersion !== version.current) return;
      setRecords((old) => [...old, ...history.results.filter((r) => !old.some((item) => item.id === r.id))]);
      setHasMore(Boolean(history.next)); setPage((p) => p + 1); setError(null);
    } catch (err) { if (mounted.current) setError(toApiErrorMessage(err, 'Could not load more sleep records.')); }
    finally { paging.current = false; setLoadingMore(false); }
  };
  if (loading) return <SafeAreaView style={s.container}><CenterLoader /></SafeAreaView>;
  const intervalError = validateSleepInterval(bed, wake);
  const latest = records[0];
  return <SafeAreaView style={s.container}>
    <FormHeader title="Sleep Tracking" />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { if (!busy) { setRefreshing(true); void load(); } }} />}>
        {error ? <Card><ErrorText text={error} /><SecondaryButton label="Retry" onPress={() => { void load(); }} /></Card> : null}
        {success ? <Text accessibilityLiveRegion="polite" style={[s.bodyStrong, { color: Colors.success }]}>{success}</Text> : null}
        <FormCard>
          <Text style={s.bodyStrong}>{editing ? 'Edit sleep record' : 'Record your sleep'}</Text>
          <Text style={s.body}>Manual recording · Pick dates and times in this device’s timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Times are saved in UTC.</Text>
          {(['bed', 'wake'] as const).map((part) => {
            const value = part === 'bed' ? bed : wake;
            const update = part === 'bed' ? setBed : setWake;
            return <View key={part} style={{ gap: 10 }}>
              <Field label={part === 'bed' ? 'Bedtime date' : 'Wake-up date'}>
                <DateTimeInput value={value} mode="date" onChange={(selected) => { if (!busy) update(changeSleepDateTime(value, selected, 'date')); }} />
              </Field>
              <Field label={part === 'bed' ? 'Bedtime time' : 'Wake-up time'}>
                <DateTimeInput value={value} mode="time" onChange={(selected) => { if (!busy) update(changeSleepDateTime(value, selected, 'time')); }} />
              </Field>
              {value ? <Text style={s.muted}>{value.toLocaleString()} · UTC offset {value.getTimezoneOffset() <= 0 ? '+' : '−'}{Math.abs(value.getTimezoneOffset()) / 60}h</Text> : null}
            </View>;
          })}
          <Text accessibilityLiveRegion="polite" style={s.bodyStrong}>Duration: {!intervalError && bed && wake ? formatSleepDuration(sleepMinutes(bed, wake)) : 'Choose a valid interval'}</Text>
          <Text style={s.muted}>Overnight sleep belongs to its wake-up date in your profile timezone{summary ? ` (${summary.timezone})` : ''}. Sessions on that date are combined.</Text>
          <ErrorText text={formError} />
          <PrimaryButton label={editing ? 'Save changes' : 'Save sleep record'} onPress={() => { void save(); }} loading={busy} style={{ minHeight: 48 }} />
          {editing ? <SecondaryButton label="Cancel edit" onPress={() => { if (!busy) clearForm(); }} /> : null}
        </FormCard>
        <Card title="Most recent sleep">
          {latest ? <><Text style={s.bodyStrong}>{formatSleepDuration(latest.duration_minutes)} · {latest.wake_date}</Text><Text style={s.body}>{displayTime(latest.bedtime)} → {displayTime(latest.wake_time)}</Text></> : <Text style={s.body}>{error ? 'Sleep data unavailable. Retry above.' : 'No sleep sessions recorded yet.'}</Text>}
        </Card>
        <Card title="Last 7 wake-up dates">
          {summary ? <>
            <Text style={s.bodyStrong}>{formatSleepDuration(summary.average_minutes)} average · {summary.recorded_nights} recorded {summary.recorded_nights === 1 ? 'night' : 'nights'}</Text>
            <Text style={s.muted}>Average uses recorded dates only. A gap means no data, not zero hours. Chart values are hours.</Text>
            <BarChart labels={summary.days.map((d) => d.date.slice(5))} series={[{ label: 'Recorded sleep (hours)', color: Colors.primary, values: summary.days.map((d) => (d.duration_minutes ?? 0) / 60) }]} />
            {summary.days.map((d) => <View key={d.date} style={s.rowBetween}><Text style={s.muted}>{d.date}</Text><Text style={s.body}>{formatSleepDuration(d.duration_minutes)}</Text></View>)}
          </> : <Text style={s.body}>Summary unavailable. Retry above.</Text>}
        </Card>
        <Text style={s.bodyStrong}>Sleep history · newest wake-up first</Text>
        {records.map((record) => <Card key={record.id} title={`${record.wake_date} · ${formatSleepDuration(record.duration_minutes)}`}>
          <Text style={s.body}>Bedtime: {displayTime(record.bedtime)}</Text>
          <Text style={s.body}>Wake-up: {displayTime(record.wake_time)}</Text>
          <SecondaryButton label="Edit sleep record" onPress={() => {
            if (busy) return;
            setEditing(record.id); setBed(new Date(record.bedtime)); setWake(new Date(record.wake_time)); setFormError(null); setSuccess(null); scroll.current?.scrollTo({ y: 0, animated: true });
          }} />
          <SecondaryButton label="Delete sleep record" danger onPress={() => { if (!busy) remove(record); }} />
        </Card>)}
        {!records.length && !error ? <Card><Text style={s.body}>Add a completed sleep session to start your history.</Text></Card> : null}
        {hasMore ? <PrimaryButton label="Load older records" loading={loadingMore} disabled={busy} onPress={() => { void more(); }} /> : null}
        <Text style={s.muted}>Duration-only entries in “Log Today” remain separate. Automatic health-data tracking is not connected.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
