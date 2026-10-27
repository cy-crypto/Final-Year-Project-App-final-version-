import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Colors, Font, Radius, Shadows } from '../constants/theme';
import {
  fetchAirPollution,
  fetchUVIndex,
  fetchWeather,
  formatTemperature,
  type WeatherSnapshot,
} from '../services/weatherService';
import {
  addSavedLocation,
  deleteSavedLocation,
  getSavedLocations,
  type SavedLocationDto,
} from '../services/weatherLocationService';
import { notifyWeatherAlert } from '../services/reminderService';
import {
  Card,
  CenterLoader,
  EmptyCard,
  Field,
  HeroCard,
  HeroStat,
  HeroStats,
  Input,
  ListRow,
  ModuleHeader,
  PillTabs,
  PrimaryButton,
  SecondaryButton,
  moduleStyles,
} from '../components/module/ModuleUI';
import { aqiInfo, cityTime, dayLabel, isNight, outdoorAdvice, uvInfo, weatherIcon } from '../utils/weatherFormat';

type TabKey = 'today' | 'forecast' | 'places';
type Place = { city?: string; lat?: number; lon?: number };

const CACHE_KEY = 'weather.lastSnapshot';
const REFRESH_MS = 10 * 60 * 1000;

export function WeatherScreen() {
  const { setWeather } = useAppContext();
  const { user } = useAuth();
  const unit = user?.preferences?.temperature_unit ?? 'C';
  const t = (c?: number) => formatTemperature(c, unit);

  const [tab, setTab] = useState<TabKey>('today');
  const [place, setPlace] = useState<Place | null>(null);
  const [weather, setLocalWeather] = useState<WeatherSnapshot | null>(null);
  const [uv, setUv] = useState<number | null>(null);
  const [aqi, setAqi] = useState<number | null>(null);
  const [saved, setSaved] = useState<SavedLocationDto[]>([]);
  const [savedWeather, setSavedWeather] = useState<Record<string, WeatherSnapshot>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staleAt, setStaleAt] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cityInput, setCityInput] = useState('');
  const [locating, setLocating] = useState(false);
  const placeRef = useRef<Place | null>(null);

  const load = useCallback(
    async (target: Place, quiet = false) => {
      if (!quiet) setError(null);
      try {
        const snapshot = await fetchWeather(target);
        setLocalWeather(snapshot);
        setStaleAt(null);
        setWeather({ city: snapshot.city, temperatureC: snapshot.temperatureC, condition: snapshot.condition, updatedAt: snapshot.updatedAt });
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), snapshot })).catch(() => {});
        for (const alert of snapshot.alerts ?? []) {
          notifyWeatherAlert(alert.id, `${alert.title} · ${snapshot.city}`, alert.message);
        }
        if (snapshot.lat !== undefined && snapshot.lon !== undefined) {
          fetchUVIndex(snapshot.lat, snapshot.lon).then((r) => setUv(r.uv_index ?? null)).catch(() => setUv(null));
          fetchAirPollution(snapshot.lat, snapshot.lon).then((r) => setAqi(r.aqi ?? null)).catch(() => setAqi(null));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to load weather.';
        // Offline: keep showing the last weather that loaded, with a notice.
        const raw = await AsyncStorage.getItem(CACHE_KEY).catch(() => null);
        if (raw) {
          const cached = JSON.parse(raw) as { savedAt: string; snapshot: WeatherSnapshot };
          setLocalWeather((current) => current ?? cached.snapshot);
          setStaleAt(cached.savedAt);
        }
        if (!quiet) setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [setWeather]
  );

  const choose = useCallback(
    (target: Place) => {
      placeRef.current = target;
      setPlace(target);
      load(target);
    },
    [load]
  );

  const devicePlace = useCallback(async (): Promise<Place | null> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    let city: string | undefined;
    try {
      const [geo] = await Location.reverseGeocodeAsync(pos.coords);
      city = geo?.city || geo?.subregion || undefined;
    } catch {
      city = undefined;
    }
    // Sending both lets the server fall back to the coordinates if the city name is not found.
    return { city, lat: pos.coords.latitude, lon: pos.coords.longitude };
  }, []);

  // Start: device location → city in the profile → ask.
  useEffect(() => {
    (async () => {
      let target: Place | null = null;
      try {
        target = await devicePlace();
      } catch {
        target = null;
      }
      if (!target && user?.selectedCity) target = { city: user.selectedCity };
      if (target) choose(target);
      else {
        setLoading(false);
        setPickerOpen(true);
      }
    })();
    getSavedLocations().then(setSaved).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => placeRef.current && load(placeRef.current, true), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (tab !== 'places' || saved.length === 0) return;
    Promise.allSettled(saved.map((s) => fetchWeather({ city: s.city }))).then((results) => {
      const next: Record<string, WeatherSnapshot> = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') next[saved[i].city] = r.value;
      });
      setSavedWeather(next);
    });
  }, [tab, saved]);

  const pickCity = () => {
    const city = cityInput.trim();
    if (!city) return;
    setPickerOpen(false);
    setCityInput('');
    setLoading(true);
    choose({ city });
  };

  const pickGps = async () => {
    setLocating(true);
    try {
      const target = await devicePlace();
      if (!target) {
        setError('Location permission is off. Type a city instead.');
        return;
      }
      setPickerOpen(false);
      setLoading(true);
      choose(target);
    } catch {
      setError('Could not get your location. Type a city instead.');
    } finally {
      setLocating(false);
    }
  };

  const saveCurrent = async () => {
    if (!weather) return;
    try {
      const row = await addSavedLocation(weather.city);
      setSaved((prev) => [row, ...prev]);
    } catch (err) {
      Alert.alert('Not saved', err instanceof Error && /409|already/i.test(err.message) ? 'This place is already saved.' : 'Could not save this place.');
    }
  };

  const removeSaved = (row: SavedLocationDto) =>
    Alert.alert('Remove place', row.city, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSavedLocation(row.id);
            setSaved((prev) => prev.filter((s) => s.id !== row.id));
          } catch {
            Alert.alert('Error', 'Could not remove this place.');
          }
        },
      },
    ]);

  const renderToday = () => {
    if (!weather) return <EmptyCard text={error ?? 'Choose a place to see the weather.'} icon="partly-sunny-outline" />;
    const night = isNight(weather);
    const advice = outdoorAdvice(weather, aqi);
    const air = aqiInfo(aqi);
    const uvi = uvInfo(uv);
    return (
      <>
        <HeroCard label={`${weather.city}${weather.fromGps ? ' (GPS)' : ''} · ${weather.description ?? weather.condition}`} value={t(weather.temperatureC)}>
          <Ionicons name={weatherIcon(weather.condition, night)} size={46} color={Colors.white} style={styles.heroIcon} />
          <HeroStats>
            <HeroStat icon="arrow-up" label="High" value={t(weather.maxC)} />
            <HeroStat icon="arrow-down" label="Low" value={t(weather.minC)} />
            <HeroStat icon="body" label="Feels" value={t(weather.feelsLikeC)} />
          </HeroStats>
        </HeroCard>

        {staleAt ? (
          <EmptyCard text={`Offline · showing weather from ${new Date(staleAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`} icon="cloud-offline-outline" />
        ) : null}

        {(weather.alerts ?? []).length > 0 ? (
          (weather.alerts ?? []).map((a) => (
            <View key={a.id} style={[styles.alert, a.severity === 'high' ? styles.alertHigh : styles.alertMedium]}>
              <Ionicons name="warning" size={22} color={a.severity === 'high' ? Colors.error : Colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={styles.alertTitle}>{a.title}</Text>
                <Text style={moduleStyles.body}>{a.message}</Text>
              </View>
            </View>
          ))
        ) : (
          <View style={[styles.alert, styles.alertOk]}>
            <Ionicons name="shield-checkmark" size={22} color={Colors.success} />
            <Text style={[moduleStyles.body, { flex: 1 }]}>No severe weather expected in the next hours.</Text>
          </View>
        )}

        <View style={styles.grid}>
          <Tile icon="water-outline" label="Humidity" value={`${weather.humidity}%`} />
          <Tile icon="speedometer-outline" label="Wind" value={weather.windSpeedKph !== undefined ? `${Math.round(weather.windSpeedKph)} km/h` : '--'} />
          <Tile icon="sunny-outline" label="UV index" value={uv !== null ? `${uv.toFixed(1)}` : '--'} note={uvi.label} noteColor={uvi.color} />
          <Tile icon="leaf-outline" label="Air quality" value={air.label} noteColor={air.color} />
          <Tile icon="eye-outline" label="Visibility" value={weather.visibilityM !== undefined ? `${(weather.visibilityM / 1000).toFixed(1)} km` : '--'} />
          <Tile icon="partly-sunny-outline" label="Sun" value={cityTime(weather.sunrise, weather.timezoneOffset, true)} note={`Sets ${cityTime(weather.sunset, weather.timezoneOffset, true)}`} />
        </View>

        <Card title="Outdoor activity" right={<Text style={[styles.advice, { color: advice.status === 'Good' ? Colors.success : advice.status === 'Fair' ? Colors.warning : Colors.error }]}>{advice.status}</Text>}>
          <Text style={moduleStyles.body}>{advice.reason}. {advice.status === 'Good' ? 'A good time for a walk or a run.' : advice.status === 'Fair' ? 'Fine for a short walk.' : 'Better to stay indoors for now.'}</Text>
        </Card>
        <Text style={[moduleStyles.muted, { textAlign: 'center' }]}>Updated {weather.updatedAt}</Text>
      </>
    );
  };

  const renderForecast = () =>
    !weather ? (
      <EmptyCard text={error ?? 'No forecast yet.'} />
    ) : (
      <>
        <Card title="Next hours">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {(weather.hourly ?? []).map((h, i) => (
              <View key={`${h.dt}-${i}`} style={styles.hour}>
                <Text style={moduleStyles.muted}>{i === 0 ? 'Now' : cityTime(h.dt, weather.timezoneOffset)}</Text>
                <Ionicons name={weatherIcon(h.condition, isNight(weather, h.dt))} size={24} color={Colors.primary} />
                <Text style={styles.hourTemp}>{t(h.temp)}</Text>
                <Text style={styles.hourPop}>{h.pop !== undefined ? `${Math.round(h.pop * 100)}%` : ''}</Text>
              </View>
            ))}
          </ScrollView>
          <Text style={moduleStyles.muted}>3-hour steps · % chance of rain</Text>
        </Card>
        <Card title="Next days">
          {(weather.daily ?? []).map((d, i) => (
            <View key={`${d.date}-${i}`} style={styles.dayRow}>
              <Text style={styles.dayName}>{dayLabel(d.date, i)}</Text>
              <Ionicons name={weatherIcon(d.condition ?? weather.condition)} size={20} color={Colors.primary} />
              <Text style={styles.dayPop}>{d.pop !== undefined ? `${Math.round(d.pop * 100)}%` : ''}</Text>
              <Text style={styles.dayTemps}>
                {t(d.temp_max)} <Text style={{ color: Colors.textSecondary }}>{t(d.temp_min)}</Text>
              </Text>
            </View>
          ))}
        </Card>
      </>
    );

  const renderPlaces = () => (
    <>
      {weather ? <SecondaryButton label={`Save ${weather.city}`} icon="bookmark-outline" onPress={saveCurrent} /> : null}
      {saved.length === 0 ? (
        <EmptyCard text="Save places to check their weather quickly." icon="bookmarks-outline" />
      ) : (
        <View style={moduleStyles.list}>
          {saved.map((row) => {
            const w = savedWeather[row.city];
            return (
              <ListRow
                key={row.id}
                icon={weatherIcon(w?.condition)}
                title={row.city}
                meta={w ? `${w.condition} · H ${t(w.maxC)} L ${t(w.minC)}${w.alerts?.length ? ' · ⚠ alert' : ''}` : 'Loading...'}
                right={w ? t(w.temperatureC) : undefined}
                onPress={() => {
                  setTab('today');
                  setLoading(true);
                  choose({ city: row.city });
                }}
                onLongPress={() => removeSaved(row)}
              />
            );
          })}
          <Text style={moduleStyles.muted}>Long-press a place to remove it.</Text>
        </View>
      )}
    </>
  );

  return (
    <SafeAreaView style={moduleStyles.container} edges={['top']}>
      <ModuleHeader
        title="Weather"
        subtitle={weather ? `${weather.city} · ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}` : 'Plan your day.'}
        showBack={false}
        actions={[{ icon: 'location-outline', label: 'Change place', onPress: () => setPickerOpen(true) }]}
      />
      <PillTabs
        tabs={[
          { key: 'today', label: 'Today' },
          { key: 'forecast', label: 'Forecast' },
          { key: 'places', label: 'Places' },
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
                if (!placeRef.current) return setRefreshing(false);
                setRefreshing(true);
                load(placeRef.current);
              }}
              tintColor={Colors.primary}
            />
          }
        >
          {error && weather && !staleAt ? <Text style={styles.error}>{error}</Text> : null}
          {tab === 'today' ? renderToday() : tab === 'forecast' ? renderForecast() : renderPlaces()}
        </ScrollView>
      )}

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => place && setPickerOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Weather location</Text>
            <PrimaryButton label={locating ? 'Locating...' : 'Use my location'} icon="locate" onPress={pickGps} loading={locating} />
            <Field label="City">
              <Input placeholder="e.g. Lahore" value={cityInput} onChangeText={setCityInput} onSubmitEditing={pickCity} autoCapitalize="words" />
            </Field>
            <SecondaryButton label="Show weather" icon="search" onPress={pickCity} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
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

function Tile({ icon, label, value, note, noteColor }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; note?: string; noteColor?: string }) {
  return (
    <View style={styles.tile}>
      <Ionicons name={icon} size={20} color={Colors.primary} />
      <Text style={moduleStyles.muted}>{label}</Text>
      <Text style={[styles.tileValue, !note && noteColor ? { color: noteColor } : null]} numberOfLines={1}>
        {value}
      </Text>
      {note ? <Text style={[styles.tileNote, noteColor ? { color: noteColor } : null]}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  heroIcon: { position: 'absolute', right: 16, top: 16 },
  alert: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: Radius.lg, padding: 14, borderWidth: 1 },
  alertHigh: { backgroundColor: Colors.tintRose, borderColor: '#FECDD3' },
  alertMedium: { backgroundColor: Colors.tintAmber, borderColor: '#FDE68A' },
  alertOk: { backgroundColor: Colors.tintGreen, borderColor: '#A7F3D0', alignItems: 'center' },
  alertTitle: { fontFamily: Font.extrabold, fontSize: 15, color: Colors.textPrimary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '31%',
    flexGrow: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 12,
    gap: 2,
    ...Shadows.card,
  },
  tileValue: { fontFamily: Font.extrabold, fontSize: 16, color: Colors.textPrimary },
  tileNote: { fontFamily: Font.semibold, fontSize: 12, color: Colors.textSecondary },
  advice: { fontFamily: Font.extrabold, fontSize: 16 },
  hour: { alignItems: 'center', gap: 6, backgroundColor: Colors.primarySurface, borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: 12, minWidth: 64 },
  hourTemp: { fontFamily: Font.extrabold, fontSize: 15, color: Colors.textPrimary },
  hourPop: { fontFamily: Font.semibold, fontSize: 11, color: Colors.accentTeal },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  dayName: { flex: 1, fontFamily: Font.bold, fontSize: 15, color: Colors.textPrimary },
  dayPop: { width: 40, fontFamily: Font.semibold, fontSize: 12, color: Colors.accentTeal, textAlign: 'right' },
  dayTemps: { width: 92, textAlign: 'right', fontFamily: Font.extrabold, fontSize: 15, color: Colors.textPrimary },
  error: { fontFamily: Font.semibold, fontSize: 14, color: Colors.error },
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
});
