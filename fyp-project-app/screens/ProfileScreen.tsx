import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';

import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import { Colors, Font } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';
import type { Preferences } from '../services/authService';
import { getProfileSummary, type ProfileSummary } from '../services/profileService';
import { Notifications } from '../services/notifications';
import { ensureNotificationPermission } from '../services/reminderService';
import {
  Card,
  HeroCard,
  HeroStat,
  HeroStats,
  ModuleHeader,
  SecondaryButton,
  Segmented,
  ToggleRow,
  moduleStyles,
} from '../components/module/ModuleUI';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const DEFAULT_PREFS: Preferences = {
  temperature_unit: 'C',
  notify_tasks: true,
  notify_habits: true,
  notify_medication: true,
  notify_prayer: true,
  notify_weather_alerts: true,
  prayer_method: 1,
  prayer_school: 1,
  community_visible: true,
};

export function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const { user, logout, updateProfile } = useAuth();
  const { fetchTasks } = useAppContext();
  const [summary, setSummary] = useState<ProfileSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [permission, setPermission] = useState<boolean | null>(null);
  const prefs = { ...DEFAULT_PREFS, ...(user?.preferences ?? {}) };

  const load = useCallback(async () => {
    try {
      setSummary(await getProfileSummary());
    } catch (error) {
      console.warn('Could not load profile summary', error);
    } finally {
      setRefreshing(false);
    }
    Notifications.getPermissionsAsync()
      .then((p) => setPermission(p.status === 'granted'))
      .catch(() => setPermission(false));
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', load);
    return unsubscribe;
  }, [navigation, load]);

  const setPref = async <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    if (value === true && key.startsWith('notify_')) {
      const granted = await ensureNotificationPermission();
      setPermission(granted);
      if (!granted) {
        Alert.alert('Notifications are off', 'Allow notifications for this app in your phone settings.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open settings', onPress: () => Linking.openSettings() },
        ]);
      }
    }
    const result = await updateProfile({ preferences: { [key]: value } });
    if (!result.ok) {
      Alert.alert('Could not save', result.error ?? 'Please try again.');
      return;
    }
    // Re-sync task reminders now; medication and prayer re-sync when their screens open.
    if (key === 'notify_tasks') fetchTasks(true);
  };

  const confirmLogout = () =>
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
      },
    ]);

  const name = user?.fullName || user?.email?.split('@')[0] || 'Friend';
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const memberSince = (summary?.member_since || user?.memberSince)
    ? new Date(summary?.member_since || user!.memberSince).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  return (
    <SafeAreaView style={moduleStyles.container} edges={['top']}>
      <ModuleHeader
        title="Profile"
        subtitle="Your account and preferences."
        actions={[{ icon: 'create-outline', label: 'Edit profile', onPress: () => navigation.navigate('EditProfile') }]}
      />
      <ScrollView
        contentContainerStyle={moduleStyles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <HeroCard label={memberSince ? `Member since ${memberSince}` : 'Your account'}>
          <View style={styles.identity}>
            {user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.initials}>{initials}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.email} numberOfLines={1}>
                {user?.email}
              </Text>
              {user?.selectedCity ? <Text style={styles.email}>{user.selectedCity}</Text> : null}
            </View>
          </View>
          {user?.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
          <HeroStats>
            <HeroStat icon="calendar" label="Days with us" value={String(summary?.days_active ?? '–')} />
            <HeroStat icon="checkmark-done" label="Tasks done" value={String(summary?.tasks.done ?? '–')} />
          </HeroStats>
        </HeroCard>


        <Card title="Notifications" right={permission === false ? <Text style={styles.warn}>Blocked in settings</Text> : undefined}>
          <ToggleRow title="Task reminders" meta="Reminder times and due-day alerts" value={prefs.notify_tasks} onValueChange={(v) => setPref('notify_tasks', v)} />
          <ToggleRow title="Habit reminders" meta="The daily reminder you set on each habit" value={prefs.notify_habits} onValueChange={(v) => setPref('notify_habits', v)} />
          <ToggleRow title="Medication reminders" meta="Dose times, follow-ups and refills" value={prefs.notify_medication} onValueChange={(v) => setPref('notify_medication', v)} />
          <ToggleRow title="Prayer alerts" meta="A notification at each prayer time" value={prefs.notify_prayer} onValueChange={(v) => setPref('notify_prayer', v)} />
          <ToggleRow title="Severe weather alerts" meta="Storms, heat waves and other warnings" value={prefs.notify_weather_alerts} onValueChange={(v) => setPref('notify_weather_alerts', v)} />
          {permission === false ? (
            <SecondaryButton label="Open phone settings" icon="settings-outline" onPress={() => Linking.openSettings()} />
          ) : null}
        </Card>


        <Card title="Preferences">
          <Text style={moduleStyles.bodyStrong}>Temperature</Text>
          <Segmented
            options={[
              { key: 'C', label: 'Celsius °C' },
              { key: 'F', label: 'Fahrenheit °F' },
            ]}
            value={prefs.temperature_unit}
            onChange={(v) => setPref('temperature_unit', v)}
          />
          <Text style={moduleStyles.bodyStrong}>Asr time</Text>
          <Segmented
            options={[
              { key: '1', label: 'Hanafi' },
              { key: '0', label: 'Shafi / others' },
            ]}
            value={String(prefs.prayer_school) as '0' | '1'}
            onChange={(v) => setPref('prayer_school', Number(v))}
          />
          <ToggleRow
            title="Show me on leaderboards"
            meta="Your name and streaks in Family rankings"
            value={prefs.community_visible}
            onValueChange={(v) => setPref('community_visible', v)}
          />
          <Text style={moduleStyles.muted}>Time zone: {user?.timezone || 'detecting...'}</Text>
        </Card>

        <Card title="Account">
          <SecondaryButton label="Edit profile" icon="person-outline" onPress={() => navigation.navigate('EditProfile')} />
          <SecondaryButton label="Sign out" icon="log-out-outline" danger onPress={confirmLogout} />
        </Card>

        <Text style={[moduleStyles.muted, { textAlign: 'center' }]}>
          Personal Companion · version {Constants.expoConfig?.version ?? '1.0.0'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 },
  avatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: 'rgba(255,255,255,0.6)' },
  avatarFallback: { backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: Font.extrabold, fontSize: 24, color: Colors.white },
  name: { fontFamily: Font.extrabold, fontSize: 22, color: Colors.white },
  email: { fontFamily: Font.medium, fontSize: 14, color: 'rgba(255,255,255,0.9)' },
  bio: { fontFamily: Font.medium, fontSize: 14, lineHeight: 20, color: Colors.white, marginTop: 8 },
  warn: { fontFamily: Font.bold, fontSize: 13, color: Colors.error },
});
