import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Colors } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';
import { toApiErrorMessage } from '../services/api';
import {
  FREQUENCY_LABELS,
  formatTime12,
  getMedications,
  getTodaySchedule,
  logDose,
  type DoseSlot,
  type DoseStatus,
  type Medication,
  type TodaySchedule,
} from '../services/medicationService';
import {
  cancelDoseFollowUp,
  ensureNotificationPermission,
  notifyRefills,
  syncMedicationReminders,
} from '../services/reminderService';
import { DoseRow } from '../components/medication/DoseRow';
import { MedicationHistoryTab } from '../components/medication/MedicationHistoryTab';
import { MedicationInsightsTab } from '../components/medication/MedicationInsightsTab';
import {
  CenterLoader,
  EmptyCard,
  EntryCard,
  Fab,
  HeroCard,
  HeroStat,
  HeroStats,
  ListRow,
  ModuleHeader,
  PillTabs,
  ProgressBar,
  SecondaryButton,
  SectionHeader,
  moduleStyles,
} from '../components/module/ModuleUI';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type TabKey = 'today' | 'medicines' | 'history' | 'insights';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'medicines', label: 'Medicines' },
  { key: 'history', label: 'History' },
  { key: 'insights', label: 'Insights' },
];

export function MedicationScreen() {
  const navigation = useNavigation<Nav>();
  const [tab, setTab] = useState<TabKey>('today');
  const [today, setToday] = useState<TodaySchedule | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busySlot, setBusySlot] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [schedule, meds] = await Promise.all([getTodaySchedule(), getMedications()]);
      setToday(schedule);
      setMedications(meds);
      setError(null);
      const logged = new Set(
        schedule.slots.filter((s) => s.log_id !== null).map((s) => `${s.medication_id}@${s.time}`)
      );
      syncMedicationReminders(meds, logged);
      notifyRefills(meds);
    } catch (err) {
      setError(toApiErrorMessage(err, 'Failed to load medications'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    ensureNotificationPermission();
    const unsubscribe = navigation.addListener('focus', load);
    return unsubscribe;
  }, [navigation, load]);

  const record = async (slot: DoseSlot, status: DoseStatus) => {
    const key = `${slot.medication_id}@${slot.time}`;
    setBusySlot(key);
    try {
      const { medication } = await logDose(slot.medication_id, { status, dose_time: slot.time });
      await cancelDoseFollowUp(slot);
      if (medication.needs_refill) notifyRefills([medication]);
      setReloadKey((k) => k + 1);
      await load();
    } catch (err) {
      Alert.alert('Could not log the dose', toApiErrorMessage(err, 'Please try again.'));
    } finally {
      setBusySlot(null);
    }
  };

  const changeLogged = (slot: DoseSlot) =>
    Alert.alert(slot.name, `${formatTime12(slot.time)} dose`, [
      { text: 'Mark as taken', onPress: () => record(slot, 'taken') },
      { text: 'Mark as skipped', onPress: () => record(slot, 'skipped') },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const logAsNeeded = (med: Medication) =>
    Alert.alert(`Log ${med.name}`, `Record a ${med.dosage} dose taken now?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Taken now',
        onPress: async () => {
          try {
            await logDose(med.id, { status: 'taken' });
            setReloadKey((k) => k + 1);
            load();
          } catch (err) {
            Alert.alert('Could not log the dose', toApiErrorMessage(err, 'Please try again.'));
          }
        },
      },
    ]);

  const callEmergency = () =>
    Alert.alert('Emergency call', 'Call 1122 (Rescue) now?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Call now', style: 'destructive', onPress: () => Linking.openURL('tel:1122') },
    ]);

  const openMedication = (med: Medication) => navigation.navigate('AddMedication', { medicationId: med.id });

  const renderToday = () => {
    if (!today) return <EmptyCard text={error ?? 'No data.'} icon="cloud-offline-outline" />;
    const pct = today.total ? (today.taken / today.total) * 100 : 0;
    const attention = today.slots.filter((s) => s.status === 'due' || s.status === 'missed');
    const later = today.slots.filter((s) => s.status === 'upcoming');
    const done = today.slots.filter((s) => s.status === 'taken' || s.status === 'skipped' || s.status === 'deferred');
    const asNeeded = medications.filter((m) => m.is_active && m.frequency === 'as_needed');
    const next = today.next_dose;
    const nextText = next
      ? `${next.date && next.date !== today.date ? 'Tomorrow ' : ''}${formatTime12(next.time)}`
      : 'None';

    const renderSlots = (slots: DoseSlot[]) => (
      <View style={moduleStyles.list}>
        {slots.map((slot) => (
          <DoseRow
            key={`${slot.medication_id}@${slot.time}`}
            slot={slot}
            busy={busySlot === `${slot.medication_id}@${slot.time}`}
            onTake={() => record(slot, 'taken')}
            onSkip={() => record(slot, 'skipped')}
            onChange={() => changeLogged(slot)}
          />
        ))}
      </View>
    );

    return (
      <>
        <HeroCard
          label={`${new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })} · Doses`}
          value={today.total ? `${today.taken} of ${today.total} taken` : 'No doses today'}
        >
          {today.total ? (
            <View style={{ marginTop: 6 }}>
              <ProgressBar pct={pct} color={Colors.white} />
            </View>
          ) : null}
          <HeroStats>
            <HeroStat icon="alarm" label={next ? `Next · ${next.name}` : 'Next dose'} value={nextText} />
            <HeroStat icon="cube" label="Need refill" value={String(today.refills.length)} />
          </HeroStats>
        </HeroCard>

        {today.refills.map((med) => (
          <EntryCard
            key={med.id}
            icon="warning-outline"
            title={`Refill ${med.name}`}
            meta={`${med.supply_count} left · refill at ${med.refill_threshold}`}
            note={med.days_of_supply_left !== null ? `About ${med.days_of_supply_left} day(s) of supply` : 'Update the supply after refilling'}
            noteColor={Colors.error}
            onPress={() => openMedication(med)}
          />
        ))}

        {attention.length > 0 ? (
          <>
            <SectionHeader title="Needs attention" />
            {renderSlots(attention)}
          </>
        ) : null}

        <SectionHeader title="Later today" actionLabel="History" onAction={() => setTab('history')} />
        {later.length === 0 ? (
          <EmptyCard text={today.total ? 'No more doses today.' : 'Add a medicine with dose times to build your schedule.'} />
        ) : (
          renderSlots(later)
        )}

        {done.length > 0 ? (
          <>
            <SectionHeader title="Done" />
            {renderSlots(done)}
          </>
        ) : null}

        {asNeeded.length > 0 ? (
          <>
            <SectionHeader title="As needed" />
            <View style={moduleStyles.list}>
              {asNeeded.map((med) => (
                <ListRow
                  key={med.id}
                  icon="medical-outline"
                  title={med.name}
                  meta={`${med.dosage} · ${med.supply_count} left`}
                  onPress={() => logAsNeeded(med)}
                  trailing={<Text style={moduleStyles.link}>Log</Text>}
                />
              ))}
            </View>
          </>
        ) : null}
      </>
    );
  };

  const renderMedicines = () => {
    const active = medications.filter((m) => m.is_active);
    const paused = medications.filter((m) => !m.is_active);
    const row = (m: Medication) => (
      <ListRow
        key={m.id}
        icon={m.needs_refill ? 'warning' : 'medkit-outline'}
        iconColor={m.needs_refill ? Colors.error : Colors.primary}
        iconBg={m.needs_refill ? Colors.tintRose : Colors.primarySurface}
        title={`${m.name} · ${m.dosage}`}
        meta={`${FREQUENCY_LABELS[m.frequency]}${m.schedule_times.length ? ` · ${m.schedule_times.map(formatTime12).join(', ')}` : ''}`}
        right={`${m.supply_count} left`}
        rightColor={m.needs_refill ? Colors.error : undefined}
        onPress={() => openMedication(m)}
      />
    );
    return (
      <>
        {active.length === 0 ? (
          <EmptyCard text={error ?? 'No medicines yet. Tap + to add your first one.'} icon="medkit-outline" />
        ) : (
          <View style={moduleStyles.list}>{active.map(row)}</View>
        )}
        {paused.length > 0 ? (
          <>
            <SectionHeader title="Paused" />
            <View style={moduleStyles.list}>{paused.map(row)}</View>
          </>
        ) : null}
        <SecondaryButton label="Add medicine" icon="add" onPress={() => navigation.navigate('AddMedication')} />
      </>
    );
  };

  return (
    <SafeAreaView style={moduleStyles.container}>
      <ModuleHeader
        title="Medication"
        subtitle="Never miss a dose."
        actions={[{ icon: 'call-outline', label: 'Emergency call', onPress: callEmergency }]}
      />
      <PillTabs tabs={TABS} value={tab} onChange={setTab} />

      {loading ? (
        <CenterLoader />
      ) : (
        <ScrollView
          contentContainerStyle={moduleStyles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                setReloadKey((k) => k + 1);
                load();
              }}
              tintColor={Colors.primary}
            />
          }
        >
          {tab === 'today'
            ? renderToday()
            : tab === 'medicines'
              ? renderMedicines()
              : tab === 'history'
                ? <MedicationHistoryTab medications={medications} reloadKey={reloadKey} />
                : <MedicationInsightsTab medications={medications} reloadKey={reloadKey} />}
        </ScrollView>
      )}

      {tab === 'today' || tab === 'medicines' ? (
        <Fab onPress={() => navigation.navigate('AddMedication')} label="Add medicine" />
      ) : null}
    </SafeAreaView>
  );
}
