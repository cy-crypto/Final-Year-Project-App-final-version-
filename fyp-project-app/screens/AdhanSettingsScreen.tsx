import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Font, Radius } from '../constants/theme';
import { ADHAN_ENABLED_KEY, ADHAN_KEY, ADHAN_OPTIONS, loadAdhanSettings, type AdhanId } from '../constants/adhan';
import {
  PRAYER_NAMES,
  loadPrayerAlerts,
  resyncPrayerReminders,
  savePrayerAlerts,
  type PrayerAlerts,
  type PrayerName,
} from '../services/prayerService';
import { Card, ModuleHeader, ToggleRow, moduleStyles } from '../components/module/ModuleUI';

export function AdhanSettingsScreen() {
  const [selected, setSelected] = useState<AdhanId>('adhan_makkah');
  const [enabled, setEnabled] = useState(false);
  const [alerts, setAlerts] = useState<PrayerAlerts | null>(null);
  const [previewing, setPreviewing] = useState<AdhanId | null>(null);
  const player = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    loadAdhanSettings().then((s) => {
      setSelected(s.id);
      setEnabled(s.enabled);
    });
    loadPrayerAlerts().then(setAlerts);
    return () => player.current?.remove();
  }, []);

  const stopPreview = () => {
    player.current?.pause();
    player.current?.remove();
    player.current = null;
    setPreviewing(null);
  };

  const preview = (id: AdhanId, url: string | null) => {
    if (previewing === id) return stopPreview();
    stopPreview();
    if (!url) return;
    const sound = createAudioPlayer({ uri: url });
    player.current = sound;
    sound.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) setPreviewing(null);
    });
    sound.play();
    setPreviewing(id);
  };

  const choose = async (id: AdhanId) => {
    setSelected(id);
    await AsyncStorage.setItem(ADHAN_KEY, id);
  };

  const toggleEnabled = async (value: boolean) => {
    setEnabled(value);
    await AsyncStorage.setItem(ADHAN_ENABLED_KEY, String(value));
  };

  const toggleAlert = async (name: PrayerName, value: boolean) => {
    if (!alerts) return;
    const next = { ...alerts, [name]: value };
    setAlerts(next);
    await savePrayerAlerts(next);
    resyncPrayerReminders();
  };

  return (
    <SafeAreaView style={moduleStyles.container}>
      <ModuleHeader title="Adhan Settings" subtitle="Sound and prayer alerts." />
      <ScrollView contentContainerStyle={moduleStyles.content}>
        <Card title="Prayer alerts">
          {PRAYER_NAMES.map((name) => (
            <ToggleRow
              key={name}
              title={name}
              meta="Notification at the start of the prayer"
              value={alerts?.[name] ?? true}
              onValueChange={(v) => toggleAlert(name, v)}
            />
          ))}
          <Text style={moduleStyles.muted}>All prayer alerts can be switched off in Profile → Notifications.</Text>
        </Card>

        <Card title="Adhan">
          <ToggleRow
            title="Play Adhan in the app"
            meta="Plays the chosen Adhan when a prayer starts while the app is open"
            value={enabled}
            onValueChange={toggleEnabled}
          />
          {ADHAN_OPTIONS.map((option) => {
            const active = selected === option.id;
            return (
              <Pressable key={option.id} style={[styles.option, active && styles.optionActive]} onPress={() => choose(option.id)}>
                <View style={[styles.radio, active && styles.radioActive]}>{active ? <View style={styles.radioDot} /> : null}</View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{option.label}</Text>
                  <Text style={moduleStyles.muted}>{option.description}</Text>
                </View>
                {option.url ? (
                  <Pressable onPress={() => preview(option.id, option.url)} hitSlop={10} accessibilityLabel={`Preview ${option.label}`}>
                    <Ionicons name={previewing === option.id ? 'stop-circle' : 'play-circle'} size={30} color={Colors.primary} />
                  </Pressable>
                ) : null}
              </Pressable>
            );
          })}
          <Text style={moduleStyles.muted}>
            Notifications use the phone alert tone; the Adhan audio plays inside the app.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.surfaceLight,
  },
  optionActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.borderLight, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: Colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  label: { fontFamily: Font.bold, fontSize: 15, color: Colors.textPrimary },
});
