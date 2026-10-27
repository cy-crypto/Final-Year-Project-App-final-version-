import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../context/AuthContext';
import { Colors, Font, Radius, Shadows } from '../constants/theme';
import { adhanUrl, loadAdhanSettings } from '../constants/adhan';
import type { RootStackParamList } from '../navigation/types';
import { toApiErrorMessage } from '../services/api';
import {
  PRAYER_NAMES,
  atLocal,
  formatPrayerTime,
  getPrayerTimes,
  loadPrayerAlerts,
  loadSavedPlace,
  savePlace,
  savePrayerAlerts,
  type PrayerAlerts,
  type PrayerName,
  type PrayerPlace,
  type PrayerResponse,
} from '../services/prayerService';
import { ensureNotificationPermission, syncPrayerReminders } from '../services/reminderService';
import {
  Card,
  CenterLoader,
  EmptyCard,
  EntryCard,
  Field,
  HeroCard,
  HeroStat,
  HeroStats,
  Input,
  ModuleHeader,
  PillTabs,
  PrimaryButton,
  SecondaryButton,
  moduleStyles,
} from '../components/module/ModuleUI';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type TabKey = 'today' | 'week';

const PRAYER_ICONS: Record<PrayerName, keyof typeof Ionicons.glyphMap> = {
  Fajr: 'moon-outline',
  Dhuhr: 'sunny-outline',
  Asr: 'partly-sunny-outline',
  Maghrib: 'cloudy-night-outline',
  Isha: 'moon',
};

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`;
}

export function PrayerTimeScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabKey>('today');
  const [place, setPlace] = useState<PrayerPlace | null>(null);
  const [data, setData] = useState<PrayerResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<PrayerAlerts | null>(null);
  const [now, setNow] = useState(new Date());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cityInput, setCityInput] = useState('');
  const [locating, setLocating] = useState(false);
  const [playing, setPlaying] = useState(false);
  const player = useRef<AudioPlayer | null>(null);
  const playedFor = useRef<string | null>(null);

  const fetchFor = useCallback(async (target: PrayerPlace) => {
    setError(null);
    try {
      const result = await getPrayerTimes(target, 7);
      setData(result.data);
      setOffline(result.offline);
      const prayerAlerts = await loadPrayerAlerts();
      setAlerts(prayerAlerts);
      syncPrayerReminders(result.data.days, prayerAlerts, target.label);
    } catch (err) {
      setError(toApiErrorMessage(err, 'Could not load prayer times.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const locate = useCallback(async (): Promise<PrayerPlace | null> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    let label = 'Current location';
    try {
      const [geo] = await Location.reverseGeocodeAsync(pos.coords);
      label = geo?.city || geo?.subregion || geo?.region || label;
    } catch {
      // keep the generic label
    }
    return { lat: pos.coords.latitude, lon: pos.coords.longitude, label };
  }, []);

  // Location order: last chosen place → GPS → city in the profile → ask (UC-05 AF-1).
  useEffect(() => {
    (async () => {
      ensureNotificationPermission();
      let target = await loadSavedPlace();
      if (!target) {
        try {
          target = await locate();
        } catch {
          target = null;
        }
      }
      if (!target && user?.selectedCity) target = { city: user.selectedCity, label: user.selectedCity };
      if (!target) {
        setLoading(false);
        setPickerOpen(true);
        return;
      }
      setPlace(target);
      fetchFor(target);
    })();
  }, [fetchFor, locate, user?.selectedCity]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(
    () => () => {
      player.current?.remove();
    },
    []
  );

  // Alerts can be changed in Adhan settings; refresh the bell icons when coming back.
  useEffect(() => navigation.addListener('focus', () => loadPrayerAlerts().then(setAlerts)), [navigation]);

  const today = data?.days[0];

  // Current and next prayer from the loaded days, recalculated every second for the countdown.
  const { current, next } = (() => {
    if (!data) return { current: null, next: null };
    let cur: { name: PrayerName; at: Date } | null = null;
    for (const day of data.days) {
      for (const name of PRAYER_NAMES) {
        const at = atLocal(day.date, day.times[name]);
        if (at > now) return { current: cur, next: { name, at, date: day.date } };
        cur = { name, at };
      }
    }
    return { current: cur, next: null };
  })();

  const playAdhan = useCallback(async () => {
    const { id } = await loadAdhanSettings();
    const url = adhanUrl(id);
    if (!url) return;
    player.current?.remove();
    const sound = createAudioPlayer({ uri: url });
    player.current = sound;
    sound.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) setPlaying(false);
    });
    sound.play();
    setPlaying(true);
  }, []);

  const stopAdhan = () => {
    player.current?.pause();
    player.current?.remove();
    player.current = null;
    setPlaying(false);
  };

  // Play the chosen Adhan while the app is open at a prayer time (when enabled in Adhan settings).
  useEffect(() => {
    if (!current) return;
    const key = `${current.at.toISOString()}-${current.name}`;
    const justStarted = now.getTime() - current.at.getTime() < 60000;
    if (!justStarted || playedFor.current === key) return;
    playedFor.current = key;
    loadAdhanSettings().then((s) => {
      if (s.enabled) playAdhan();
    });
  }, [current, now, playAdhan]);

  const chooseCity = async () => {
    const city = cityInput.trim();
    if (!city) return;
    const target = { city, label: city };
    setPickerOpen(false);
    setCityInput('');
    setLoading(true);
    setPlace(target);
    await savePlace(target);
    fetchFor(target);
  };

  const chooseGps = async () => {
    setLocating(true);
    try {
      const target = await locate();
      if (!target) {
        setError('Location permission is off. Enter a city instead.');
        return;
      }
      setPickerOpen(false);
      setLoading(true);
      setPlace(target);
      await savePlace(null); // follow the device next time
      fetchFor(target);
    } catch {
      setError('Could not get your location. Enter a city instead.');
    } finally {
      setLocating(false);
    }
  };

  const toggleAlert = async (name: PrayerName) => {
    if (!alerts || !data) return;
    const updated = { ...alerts, [name]: !alerts[name] };
    setAlerts(updated);
    await savePrayerAlerts(updated);
    syncPrayerReminders(data.days, updated, place?.label ?? '');
  };

  const renderToday = () => {
    if (!data || !today) return <EmptyCard text={error ?? 'No prayer times yet.'} icon="moon-outline" />;
    const iftar = atLocal(today.date, today.times.Maghrib);
    const sehri = atLocal(today.date, today.times.Imsak);
    return (
      <>
        <HeroCard
          label={next ? `Next prayer · ${next.name}` : 'Prayer times'}
          value={next ? `${formatPrayerTime(data.days.find((d) => d.date === next.date)!.times[next.name])}` : '–'}
        >
          {next ? <Text style={styles.countdown}>in {formatCountdown(next.at.getTime() - now.getTime())}</Text> : null}
          <HeroStats>
            <HeroStat icon="moon" label="Hijri" value={`${today.hijri.day} ${today.hijri.month_name} ${today.hijri.year}`} />
            <HeroStat
              icon="calendar"
              label="Today"
              value={now.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}
            />
          </HeroStats>
          {playing ? (
            <Pressable style={styles.stop} onPress={stopAdhan}>
              <Ionicons name="stop-circle" size={18} color={Colors.primary} />
              <Text style={styles.stopText}>Stop Adhan</Text>
            </Pressable>
          ) : null}
        </HeroCard>

        {offline ? (
          <EmptyCard text="You are offline. Showing the last prayer times that were loaded." icon="cloud-offline-outline" />
        ) : null}

        {today.is_ramadan ? (
          <Card title="Ramadan Mubarak" right={<Ionicons name="moon" size={20} color={Colors.primary} />}>
            <View style={moduleStyles.grid}>
              <View style={styles.ramadanTile}>
                <Text style={styles.ramadanLabel}>Sehri ends</Text>
                <Text style={styles.ramadanTime}>{formatPrayerTime(today.times.Imsak)}</Text>
                <Text style={moduleStyles.muted}>Fajr {formatPrayerTime(today.times.Fajr)}</Text>
              </View>
              <View style={styles.ramadanTile}>
                <Text style={styles.ramadanLabel}>Iftar</Text>
                <Text style={styles.ramadanTime}>{formatPrayerTime(today.times.Maghrib)}</Text>
                <Text style={moduleStyles.muted}>
                  {now < iftar ? `in ${formatCountdown(iftar.getTime() - now.getTime())}` : 'Iftar time has passed'}
                </Text>
              </View>
            </View>
            {now < sehri ? <Text style={moduleStyles.muted}>Sehri ends in {formatCountdown(sehri.getTime() - now.getTime())}</Text> : null}
          </Card>
        ) : null}

        {today.hijri.holidays.length > 0 ? (
          <Card title={today.hijri.holidays.join(', ')} right={<Ionicons name="star" size={18} color={Colors.primary} />}>
            <Text style={moduleStyles.muted}>Islamic occasion today</Text>
          </Card>
        ) : null}

        <View style={moduleStyles.list}>
          {PRAYER_NAMES.map((name) => {
            const at = atLocal(today.date, today.times[name]);
            const isCurrent = current?.name === name && current.at.toDateString() === now.toDateString();
            const past = at <= now && !isCurrent;
            return (
              <View key={name} style={[styles.prayerRow, isCurrent && styles.prayerRowNow]}>
                <View style={[styles.prayerIcon, isCurrent && { backgroundColor: Colors.white }]}>
                  <Ionicons name={PRAYER_ICONS[name]} size={20} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.prayerName, isCurrent && { color: Colors.white }, past && { color: Colors.textSecondary }]}>{name}</Text>
                  {isCurrent ? <Text style={styles.nowLabel}>Current prayer</Text> : null}
                </View>
                <Text style={[styles.prayerTime, isCurrent && { color: Colors.white }, past && { color: Colors.textSecondary }]}>
                  {formatPrayerTime(today.times[name])}
                </Text>
                <Pressable onPress={() => toggleAlert(name)} hitSlop={10} accessibilityLabel={`${name} alert`}>
                  <Ionicons
                    name={alerts?.[name] === false ? 'notifications-off-outline' : 'notifications'}
                    size={20}
                    color={isCurrent ? Colors.white : alerts?.[name] === false ? Colors.textHint : Colors.primary}
                  />
                </Pressable>
              </View>
            );
          })}
        </View>
        <Text style={[moduleStyles.muted, { textAlign: 'center' }]}>
          Sunrise {formatPrayerTime(today.times.Sunrise)} · {today.method}
        </Text>

        <EntryCard
          icon="compass-outline"
          title="Qibla direction"
          meta={data.qibla !== null ? `${Math.round(data.qibla)}° from north` : 'Use your location to find the Qibla'}
          onPress={() => navigation.navigate('Qibla')}
        />
      </>
    );
  };

  const renderWeek = () =>
    !data ? (
      <EmptyCard text={error ?? 'No prayer times yet.'} />
    ) : (
      <Card title="Next 7 days">
        <View style={styles.weekHead}>
          <Text style={[styles.weekCell, styles.weekDay]} />
          {PRAYER_NAMES.map((n) => (
            <Text key={n} style={[styles.weekCell, styles.weekHeadText]}>
              {n}
            </Text>
          ))}
        </View>
        {data.days.map((day) => {
          const d = atLocal(day.date, '00:00');
          return (
            <View key={day.date} style={[styles.weekRow, day.is_ramadan && { backgroundColor: Colors.primarySurface }]}>
              <View style={[styles.weekCell, styles.weekDay]}>
                <Text style={styles.weekDayName}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</Text>
                <Text style={moduleStyles.muted}>{d.getDate()}</Text>
              </View>
              {PRAYER_NAMES.map((n) => (
                <Text key={n} style={styles.weekCell}>
                  {day.times[n]}
                </Text>
              ))}
            </View>
          );
        })}
        <Text style={moduleStyles.muted}>Times in 24-hour format. Ramadan days are highlighted.</Text>
      </Card>
    );

  return (
    <SafeAreaView style={moduleStyles.container}>
      <ModuleHeader
        title="Prayer Times"
        subtitle={place ? place.label : 'Choose your location'}
        actions={[
          { icon: 'location-outline', label: 'Change location', onPress: () => setPickerOpen(true) },
          { icon: 'compass-outline', label: 'Qibla', onPress: () => navigation.navigate('Qibla') },
          { icon: 'settings-outline', label: 'Adhan settings', onPress: () => navigation.navigate('AdhanSettings') },
        ]}
      />
      <PillTabs
        tabs={[
          { key: 'today', label: 'Today' },
          { key: 'week', label: 'This week' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {loading ? (
        <CenterLoader />
      ) : (
        <ScrollView
          contentContainerStyle={moduleStyles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                if (!place) return;
                setRefreshing(true);
                fetchFor(place);
              }}
              tintColor={Colors.primary}
            />
          }
        >
          {tab === 'today' ? renderToday() : renderWeek()}
        </ScrollView>
      )}

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => place && setPickerOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Prayer location</Text>
            <Text style={moduleStyles.muted}>Use your location for exact times, or type a city.</Text>
            <PrimaryButton label={locating ? 'Locating...' : 'Use my location'} icon="locate" onPress={chooseGps} loading={locating} />
            <Field label="City">
              <Input placeholder="e.g. Lahore" value={cityInput} onChangeText={setCityInput} onSubmitEditing={chooseCity} autoCapitalize="words" />
            </Field>
            <SecondaryButton label="Use this city" icon="search" onPress={chooseCity} />
            {error ? <Text style={styles.sheetError}>{error}</Text> : null}
            {place ? (
              <Pressable onPress={() => setPickerOpen(false)} style={{ alignSelf: 'center', padding: 6 }}>
                <Text style={moduleStyles.link}>Cancel</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  countdown: { fontFamily: Font.bold, fontSize: 16, color: 'rgba(255,255,255,0.95)' },
  stop: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.white,
    borderRadius: Radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  stopText: { fontFamily: Font.bold, fontSize: 14, color: Colors.primary },
  ramadanTile: { flex: 1, backgroundColor: Colors.primarySurface, borderRadius: Radius.md, padding: 12, gap: 2 },
  ramadanLabel: { fontFamily: Font.semibold, fontSize: 13, color: Colors.textSecondary },
  ramadanTime: { fontFamily: Font.extrabold, fontSize: 22, color: Colors.primary },
  prayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 12,
    ...Shadows.card,
  },
  prayerRowNow: { backgroundColor: Colors.primary, borderColor: Colors.primary, ...Shadows.button },
  prayerIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  prayerName: { fontFamily: Font.bold, fontSize: 16, color: Colors.textPrimary },
  nowLabel: { fontFamily: Font.semibold, fontSize: 12, color: 'rgba(255,255,255,0.9)' },
  prayerTime: { fontFamily: Font.extrabold, fontSize: 16, color: Colors.textPrimary },
  weekHead: { flexDirection: 'row', alignItems: 'center' },
  weekHeadText: { fontFamily: Font.bold, fontSize: 11, color: Colors.textSecondary },
  weekRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderRadius: Radius.sm },
  weekCell: { flex: 1, textAlign: 'center', fontFamily: Font.semibold, fontSize: 13, color: Colors.textPrimary },
  weekDay: { flex: 0.9, alignItems: 'center' },
  weekDayName: { fontFamily: Font.bold, fontSize: 13, color: Colors.textPrimary },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surfaceLight,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: 20,
    paddingBottom: 36,
    gap: 12,
  },
  sheetTitle: { fontFamily: Font.extrabold, fontSize: 20, color: Colors.textPrimary },
  sheetError: { fontFamily: Font.semibold, fontSize: 14, color: Colors.error },
});
