import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Font } from '../constants/theme';
import {
  Card,
  CenterLoader,
  EmptyCard,
  HeroCard,
  HeroStat,
  HeroStats,
  ModuleHeader,
  PrimaryButton,
  moduleStyles,
} from '../components/module/ModuleUI';

const KAABA = { lat: 21.4225, lon: 39.8262 };
const DIAL = 260;
const ALIGNED_WITHIN = 5;

const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle bearing to the Kaaba (same formula as the backend /api/prayer/qibla/). */
function qiblaBearing(lat: number, lon: number) {
  const phi1 = toRad(lat);
  const phi2 = toRad(KAABA.lat);
  const delta = toRad(KAABA.lon - lon);
  const y = Math.sin(delta) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(delta);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function distanceKm(lat: number, lon: number) {
  const dLat = toRad(KAABA.lat - lat);
  const dLon = toRad(KAABA.lon - lon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(KAABA.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function QiblaScreen() {
  const navigation = useNavigation();
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const wasAligned = useRef(false);

  const start = async () => {
    setError(null);
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission is needed to work out the Qibla direction.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    } catch {
      setError('Could not get your location. Check that location services are on.');
    } finally {
      setLoading(false);
    }
  };

  // Re-check the position whenever the screen is opened.
  useEffect(() => navigation.addListener('focus', start), [navigation]);

  useEffect(() => {
    if (!coords) return;
    let sub: Location.LocationSubscription | null = null;
    Location.watchHeadingAsync((h) => {
      // trueHeading is -1 when the device cannot correct for magnetic declination.
      setHeading(h.trueHeading >= 0 ? h.trueHeading : h.magHeading);
      setAccuracy(h.accuracy);
    })
      .then((s) => {
        sub = s;
      })
      .catch(() => setError('This device has no compass. Use the bearing below with a physical compass.'));
    return () => sub?.remove();
  }, [coords]);

  const bearing = coords ? qiblaBearing(coords.lat, coords.lon) : null;
  const turn = bearing !== null && heading !== null ? ((bearing - heading + 540) % 360) - 180 : null;
  const aligned = turn !== null && Math.abs(turn) <= ALIGNED_WITHIN;

  useEffect(() => {
    if (aligned && !wasAligned.current) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    wasAligned.current = aligned;
  }, [aligned]);

  if (loading) {
    return (
      <SafeAreaView style={moduleStyles.container}>
        <ModuleHeader title="Qibla" />
        <CenterLoader />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={moduleStyles.container}>
      <ModuleHeader title="Qibla" subtitle="Direction of the Kaaba, Makkah." />
      <View style={moduleStyles.content}>
        {!coords ? (
          <>
            <EmptyCard text={error ?? 'Location unavailable.'} icon="location-outline" />
            <PrimaryButton label="Try again" icon="refresh" onPress={start} />
          </>
        ) : (
          <>
            <HeroCard
              label={aligned ? 'You are facing the Qibla' : 'Qibla bearing'}
              value={`${Math.round(bearing!)}° from north`}
            >
              <HeroStats>
                <HeroStat icon="navigate" label="Distance" value={`${Math.round(distanceKm(coords.lat, coords.lon)).toLocaleString()} km`} />
                <HeroStat
                  icon="compass"
                  label="Turn"
                  value={turn === null ? '–' : aligned ? 'Aligned' : `${Math.abs(Math.round(turn))}° ${turn > 0 ? 'right' : 'left'}`}
                />
              </HeroStats>
            </HeroCard>

            <Card style={{ alignItems: 'center' }}>
              <View style={[styles.dial, aligned && { borderColor: Colors.success }]}>
                {/* The dial turns with the phone so N always points north. */}
                <View style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${-(heading ?? 0)}deg` }] }]}>
                  {(['N', 'E', 'S', 'W'] as const).map((label, i) => (
                    <View key={label} style={[styles.cardinalWrap, { transform: [{ rotate: `${i * 90}deg` }] }]}>
                      <Text style={[styles.cardinal, label === 'N' && { color: Colors.error }]}>{label}</Text>
                    </View>
                  ))}
                  <View style={[styles.cardinalWrap, { transform: [{ rotate: `${bearing}deg` }] }]}>
                    <View style={[styles.kaaba, aligned && { backgroundColor: Colors.success }]}>
                      <Ionicons name="cube" size={18} color={Colors.white} />
                    </View>
                  </View>
                </View>
                <Ionicons name="arrow-up" size={64} color={aligned ? Colors.success : Colors.primary} />
              </View>
              <Text style={moduleStyles.body}>
                {heading === null
                  ? 'Waiting for the compass...'
                  : aligned
                    ? 'The arrow points to the Qibla.'
                    : 'Turn until the Kaaba icon is at the top, under the arrow.'}
              </Text>
            </Card>

            <Card title="For an accurate reading">
              <Text style={moduleStyles.body}>• Hold the phone flat, away from metal and magnets.</Text>
              <Text style={moduleStyles.body}>• If the reading jumps, move the phone in a figure-8 to calibrate.</Text>
              {accuracy !== null && accuracy < 2 ? (
                <Text style={[moduleStyles.body, { color: Colors.error }]}>Compass accuracy is low right now. Please calibrate.</Text>
              ) : null}
              {error ? <Text style={[moduleStyles.body, { color: Colors.error }]}>{error}</Text> : null}
            </Card>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  dial: {
    width: DIAL,
    height: DIAL,
    borderRadius: DIAL / 2,
    borderWidth: 6,
    borderColor: Colors.primarySurface,
    backgroundColor: Colors.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  cardinalWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', paddingTop: 10 },
  cardinal: { fontFamily: Font.extrabold, fontSize: 18, color: Colors.textSecondary },
  kaaba: {
    marginTop: 30,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
