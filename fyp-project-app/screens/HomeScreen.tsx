import { getQuickPosition } from '../utils/quickLocation';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, MainTabParamList } from '../navigation/types';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Colors, Font, Radius, Shadows } from '../constants/theme';
import * as Location from 'expo-location';
import { fetchWeather, fetchWeatherByCity, formatTemperature } from '../services/weatherService';
import { api, parseJsonData } from '../services/api';
import { DashboardBudgetCard } from '../components/DashboardBudgetCard';
import { getToday as getFitnessToday } from '../services/fitnessService';
import { getPrayerTimes, loadSavedPlace, type PrayerPlace } from '../services/prayerService';

interface PrayerTimes {
  Fajr: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
}

// Last-resort location: "Asia/Karachi" -> Karachi, so prayer times work before a place is chosen.
function cityFromTimezone(timezone?: string): PrayerPlace | null {
  const city = timezone?.split('/').pop()?.replace(/_/g, ' ').trim();
  return city ? { city, label: city } : null;
}

const THOUGHT_HEIGHT = 64;   // fixed height of the compact verse card (fits 2 lines)

const DAILY_THOUGHTS = [
  { arabic: 'رَبِّ زِدْنِي عِلْمًا', translation: 'My Lord, increase me in knowledge.', ref: 'Quran 20:114' },
  { arabic: 'إِنَّ مَعَ الْعُسْرِ يُسْرًا', translation: 'Indeed, with hardship comes ease.', ref: 'Quran 94:6' },
  { arabic: 'حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ', translation: 'Allah is sufficient for us, and He is the best disposer of affairs.', ref: 'Quran 3:173' },
  { arabic: 'فَاذْكُرُونِي أَذْكُرْكُمْ', translation: 'So remember Me; I will remember you.', ref: 'Quran 2:152' },
  { arabic: 'وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ', translation: 'Whoever relies upon Allah, He is sufficient for him.', ref: 'Quran 65:3' },
];

const PRAYER_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Fajr: 'cloudy-night',
  Dhuhr: 'sunny',
  Asr: 'partly-sunny',
  Maghrib: 'moon',
  Isha: 'star',
};

const PLACEHOLDER_PRAYERS: PrayerTimes = {
  Fajr: '--:--',
  Dhuhr: '--:--',
  Asr: '--:--',
  Maghrib: '--:--',
  Isha: '--:--',
};

interface DateInfo {
  hijri: {
    day: string;
    month: { en: string };
  };
}

interface Medication {
  id: number;
  name: string;
  dosage: string;
  schedule_times: string[];
  is_active: boolean;
}

type HomeScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface NextEvent {
  type: 'prayer' | 'medication' | 'task';
  name: string;
  time: Date;
  displayName: string;
  dosage?: string;
}

export function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { tasks, habits, weather, setWeather, toggleTask } = useAppContext();
  const { user } = useAuth();
  const tempUnit = user?.preferences?.temperature_unit ?? 'C';
  const insets = useSafeAreaInsets();
  const weatherFetchRef = useRef<{ city: string; at: number } | null>(null);
  
  // State for real-time data
  const [refreshing, setRefreshing] = useState(false);
  const [budgetReloadKey, setBudgetReloadKey] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes | null>(null);
  const [hijriDate, setHijriDate] = useState<DateInfo | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [stepsToday, setStepsToday] = useState<number | null>(null);
  // Visible height of the scroll area (depends only on the device, never on loaded data).
  const [viewportHeight, setViewportHeight] = useState(0);
  const [nextEvent, setNextEvent] = useState<NextEvent | null>(null);
  
  const today = new Date().toISOString().split('T')[0];
  const todaysTasks = tasks.filter((task) => task.deadline === today && !task.done);
  const completedHabitsToday = habits.filter((habit) => habit.lastCompletedDate === today).length;
  
  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    
    return () => clearInterval(timer);
  }, []);
  
  // Fetch prayer times and hijri date
  useEffect(() => {
    fetchPrayerData();
  }, [user?.selectedCity, user?.timezone, user?.preferences?.prayer_school]);
  
  // Fetch medications
  useEffect(() => {
    fetchMedications();
  }, []);

  // Fetch today's steps for the Fitness tile
  useEffect(() => {
    fetchSteps();
  }, []);
  
  // Calculate next event whenever relevant data changes
  useEffect(() => {
    calculateNextEvent();
  }, [currentTime, prayerTimes, medications, tasks, habits]);

  // Weather: uses the device's current location when allowed, else the profile city, else London.
  useEffect(() => {
    const fallbackCity = user?.selectedCity?.trim() || 'London';

    const lastFetch = weatherFetchRef.current;
    if (lastFetch && lastFetch.city === fallbackCity.toLowerCase() && Date.now() - lastFetch.at < 10 * 60 * 1000) {
      return;
    }

    let cancelled = false;
    (async () => {
      // Current location (same approach as the Weather screen); null if denied or unavailable.
      let place: { city?: string; lat?: number; lon?: number } | null = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await getQuickPosition();
          let city: string | undefined;
          try {
            const [geo] = await Location.reverseGeocodeAsync(pos.coords);
            city = geo?.city || geo?.subregion || undefined;
          } catch {
            city = undefined;
          }
          place = { city, lat: pos.coords.latitude, lon: pos.coords.longitude };
        }
      } catch {
        place = null;
      }
      if (cancelled) {
        return;
      }

      try {
        const snapshot = place ? await fetchWeather(place) : await fetchWeatherByCity(fallbackCity);
        if (cancelled) {
          return;
        }

        setWeather({
          city: snapshot.city || place?.city || fallbackCity,
          temperatureC: snapshot.temperatureC,
          condition: snapshot.condition,
          updatedAt: snapshot.updatedAt,
        });
        weatherFetchRef.current = { city: fallbackCity.toLowerCase(), at: Date.now() };
      } catch (error) {
        console.warn('Failed to fetch weather for dashboard', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setWeather, user?.selectedCity]);

  // Helper functions
  const fetchPrayerData = async () => {
    try {
      // Same place the Prayer screen uses: last chosen place, else the city in the profile.
      const place: PrayerPlace | null =
        (await loadSavedPlace()) ??
        (user?.selectedCity ? { city: user.selectedCity, label: user.selectedCity } : null) ??
        cityFromTimezone(user?.timezone);
      if (!place) {
        return;
      }

      const { data } = await getPrayerTimes(place, 1);
      const day = data.days[0];
      if (!day) {
        return;
      }

      setPrayerTimes({
        Fajr: day.times.Fajr,
        Dhuhr: day.times.Dhuhr,
        Asr: day.times.Asr,
        Maghrib: day.times.Maghrib,
        Isha: day.times.Isha,
      });
      setHijriDate({ hijri: { day: String(day.hijri.day), month: { en: day.hijri.month_name } } });
    } catch (error) {
      console.warn('Failed to fetch prayer data', error);
    }
  };
  
  const fetchSteps = async () => {
    try {
      const record = await getFitnessToday();
      setStepsToday(record.steps);
    } catch (error) {
      console.log('Could not load fitness data for home', error);
    }
  };

  const fetchMedications = async () => {
    try {
      const response = await api.get('/medications/');
      const data = parseJsonData(response.data);
      setMedications(Array.isArray(data) ? data : []);
    } catch (error) {
      console.warn('Failed to fetch medications', error);
    }
  };
  
  const calculateNextEvent = () => {
    const events: NextEvent[] = [];
    const now = currentTime;
    
    // Add prayer times
    if (prayerTimes) {
      Object.entries(prayerTimes).forEach(([name, time]) => {
        const [hours, minutes] = time.split(':').map(Number);
        const eventTime = new Date();
        eventTime.setHours(hours, minutes, 0, 0);
        if (eventTime > now) {
          events.push({ type: 'prayer', name, time: eventTime, displayName: name });
        }
      });
    }
    
    // Add medication times
    medications.forEach(med => {
      if (med.is_active) {
        med.schedule_times.forEach(scheduleTime => {
          const [hours, minutes] = scheduleTime.split(':').map(Number);
          const eventTime = new Date();
          eventTime.setHours(hours, minutes, 0, 0);
          if (eventTime > now) {
            events.push({ 
              type: 'medication', 
              name: med.name, 
              dosage: med.dosage,
              time: eventTime, 
              displayName: `${med.name} (${med.dosage})` 
            });
          }
        });
      }
    });
    
    // Add task deadlines
    todaysTasks.forEach(task => {
      if (task.reminder_time) {
        const [hours, minutes] = task.reminder_time.split(':').map(Number);
        const eventTime = new Date();
        eventTime.setHours(hours, minutes, 0, 0);
        if (eventTime > now) {
          events.push({ 
            type: 'task', 
            name: task.title, 
            time: eventTime, 
            displayName: task.title 
          });
        }
      }
    });
    
    // Sort by time and get the next one
    events.sort((a, b) => a.time.getTime() - b.time.getTime());
    setNextEvent(events[0] || null);
  };
  
  const getTimeUntil = (eventTime: Date) => {
    const diff = eventTime.getTime() - currentTime.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };
  
  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    if (hour < 21) return 'Good evening';
    return 'Good night';
  };
  
  const getWeatherMood = () => {
    if (!weather) return '';
    const temp = weather.temperatureC;
    const condition = weather.condition?.toLowerCase() || '';
    
    if (temp > 38) return 'Hot & clear today';
    if (temp > 30) return 'Warm day ahead';
    if (temp < 15) return 'Cool morning';
    if (condition.includes('rain')) return 'Rain expected';
    if (condition.includes('clear') || condition.includes('sunny')) return 'Clear skies';
    return 'Pleasant weather';
  };
  
  const getContextualNote = () => {
    if (!weather) return '';
    const temp = weather.temperatureC;
    
    if (temp > 38) {
      return `It's ${formatTemperature(temp, tempUnit, false)} outside — your water habit matters more today.`;
    }
    
    const overdueHabits = habits.filter(h => h.lastCompletedDate !== today);
    if (overdueHabits.length > 0) {
      return `${overdueHabits[0].name} is still waiting — small steps.`;
    }
    
    if (temp < 25) {
      return 'Pleasant weather — good day for the walk habit.';
    }
    
    return 'Gentle day — take it moment by moment.';
  };
  
  const getNextMedication = (): Medication | null => {
    const now = currentTime;
    let nextMed: Medication | null = null;
    let nextTime: Date | null = null;
    
    medications.forEach(med => {
      if (!med.is_active) return;
      
      med.schedule_times.forEach(scheduleTime => {
        const [hours, minutes] = scheduleTime.split(':').map(Number);
        const medTime = new Date();
        medTime.setHours(hours, minutes, 0, 0);
        
        if (medTime > now && (!nextTime || medTime < nextTime)) {
          nextMed = med;
          nextTime = medTime;
        }
      });
    });
    
    return nextMed;
  };
  
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setBudgetReloadKey((k) => k + 1);
    await Promise.all([
      fetchPrayerData(),
      fetchMedications(),
      fetchSteps()
    ]);
    setRefreshing(false);
  }, []);
  
  const handleTaskToggle = (taskId: string) => {
    toggleTask(taskId);
  };
  
  // Format functions
  const formatTemp = (value: number | undefined, suffix = '°C') =>
    Number.isFinite(value) ? `${Number(value).toFixed(0)}${suffix}` : '--';
  
  const formatDate = (date: Date) => {
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    return `${weekdays[date.getDay()]} · ${months[date.getMonth()]} ${date.getDate()}`;
  };
  
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };
  
  const firstName = user?.fullName?.split(' ')[0] || 'there';
  const nextMed = getNextMedication();

  const initials = (user?.fullName || firstName)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

  const statTiles: {
    key: string;
    label: string;
    value: string;
    icon: keyof typeof Ionicons.glyphMap;
    tint: string;
    solid: string;
    onPress: () => void;
  }[] = [
    {
      key: 'tasks',
      label: 'Tasks Due',
      value: `${todaysTasks.length} Today`,
      icon: 'checkbox',
      tint: Colors.tintOrange,
      solid: Colors.primary,
      onPress: () => navigation.navigate('Tasks'),
    },
    {
      key: 'habits',
      label: 'Habits',
      value: `${completedHabitsToday}/${habits.length} Done`,
      icon: 'flame',
      tint: Colors.tintAmber,
      solid: Colors.accentAmber,
      onPress: () => navigation.navigate('Habits'),
    },
    {
      key: 'fitness',
      label: 'Fitness',
      value: stepsToday === null ? 'Open' : `${stepsToday.toLocaleString()} steps`,
      icon: 'fitness',
      tint: Colors.tintRose,
      solid: Colors.accentRose,
      onPress: () => navigation.navigate('Fitness'),
    },
    {
      key: 'medication',
      label: 'Medication',
      value: nextMed ? nextMed.schedule_times[0] : 'All clear',
      icon: 'medkit',
      tint: Colors.tintIndigo,
      solid: Colors.accentBlue,
      onPress: () => navigation.navigate('Medication'),
    },
  ];

  // The verse card has a fixed height, so it looks the same from the first frame and never resizes
  // while weather, prayer and medication data load below it.
  const topPadding = insets.top + 16;
  // The first screen (verse, greeting, next-up card, 4 tiles) is exactly one screen tall: the tiles
  // take whatever height is left, so all four are fully visible without scrolling. Budget and the
  // sections below start just under the fold.
  const firstScreenHeight = viewportHeight > 0 ? viewportHeight - topPadding - THOUGHT_HEIGHT - 16 - 4 : undefined;
  const dayOfYear = Math.floor((currentTime.getTime() - new Date(currentTime.getFullYear(), 0, 0).getTime()) / 86400000);
  const thought = DAILY_THOUGHTS[dayOfYear % DAILY_THOUGHTS.length];

  // ---- Today's rhythm: prayers are the anchors; medication doses and timed tasks slot in between ----
  type RhythmItem = {
    key: string;
    kind: 'prayer' | 'medication' | 'task';
    minutes: number | null;
    title: string;
    detail?: string;
    timeLabel: string;
    onPress?: () => void;
  };
  const toMinutes = (value: string) => {
    const [h, m] = value.split(':').map(Number);
    return h * 60 + (m || 0);
  };
  const minutesToDate = (minutes: number) => {
    const d = new Date();
    d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return d;
  };
  const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

  const rhythmItems: RhythmItem[] = [];
  Object.entries(prayerTimes ?? PLACEHOLDER_PRAYERS).forEach(([name, time]) => {
    const minutes = prayerTimes ? toMinutes(time) : null;
    rhythmItems.push({
      key: `prayer-${name}`,
      kind: 'prayer',
      minutes,
      title: name,
      timeLabel: minutes === null ? time : formatTime(minutesToDate(minutes)),
      onPress: () => navigation.navigate('PrayerTime'),
    });
  });
  if (prayerTimes) {
    medications.filter((med) => med.is_active).forEach((med) => {
      med.schedule_times.forEach((t) => {
        const minutes = toMinutes(t);
        rhythmItems.push({
          key: `med-${med.id}-${t}`,
          kind: 'medication',
          minutes,
          title: med.name,
          detail: med.dosage,
          timeLabel: formatTime(minutesToDate(minutes)),
          onPress: () => navigation.navigate('Medication'),
        });
      });
    });
    todaysTasks.filter((task) => task.reminder_time).forEach((task) => {
      const minutes = toMinutes(task.reminder_time as string);
      rhythmItems.push({
        key: `task-${task.id}`,
        kind: 'task',
        minutes,
        title: task.title,
        detail: task.category || 'Task',
        timeLabel: formatTime(minutesToDate(minutes)),
        onPress: () => handleTaskToggle(task.id),
      });
    });
    rhythmItems.sort((x, y) => (x.minutes ?? 0) - (y.minutes ?? 0));
  }
  const nextRhythmKey = rhythmItems.find((item) => item.minutes !== null && item.minutes > nowMinutes)?.key;
  const anytimeTasks = todaysTasks.filter((task) => !task.reminder_time);

  return (
    <ScrollView
      style={styles.screen}
      onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
      contentContainerStyle={[styles.contentContainer, { paddingTop: topPadding }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
      }
    >
      {/* Thought for today (fixed size) */}
      <View style={[styles.thoughtCard, { height: THOUGHT_HEIGHT }]}>
        <Text style={styles.thoughtCompact} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
          {thought.translation} <Text style={styles.thoughtRef}>· {thought.ref}</Text>
        </Text>
      </View>

      <View style={[styles.aboveFold, { height: firstScreenHeight }]}>
      <View style={styles.aboveFold}>
      {/* Greeting Row */}
      <View style={styles.greetingRow}>
        <View style={styles.greetingText}>
          <Text style={styles.dateMeta}>
            {formatDate(currentTime)} {hijriDate && `· ${hijriDate.hijri.day} ${hijriDate.hijri.month.en}`}
          </Text>
          <Text style={styles.greetingLine}>{getGreeting()}, {firstName}</Text>
          {/* Empty line kept on purpose so the card keeps its original height */}
          <Text style={styles.greetingLabel}>{' '}</Text>
        </View>
        <Pressable style={styles.avatar} onPress={() => navigation.navigate('Profile')}>
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{initials}</Text>
          )}
        </Pressable>
      </View>

      {/* Hero Card: Next Up + Weather */}
      <Pressable
        style={styles.heroCard}
        disabled={!nextEvent}
        onPress={() => {
          if (!nextEvent) return;
          if (nextEvent.type === 'prayer') navigation.navigate('PrayerTime');
          if (nextEvent.type === 'medication') navigation.navigate('Medication');
          if (nextEvent.type === 'task') navigation.navigate('Tasks');
        }}
      >
        <View style={styles.heroTopRow}>
          <View style={styles.heroMain}>
            {nextEvent ? (
              <>
                <Text style={styles.rightNowHeadline}>
                  {nextEvent.displayName} in {getTimeUntil(nextEvent.time)}
                </Text>
                <Text style={styles.rightNowSubline}>
                  at {formatTime(nextEvent.time)}
                  {nextEvent.type === 'medication' && nextMed && ` · then ${nextMed.name} at ${nextMed.schedule_times[1] || 'later'}`}
                </Text>
              </>
            ) : (
              <Text style={styles.rightNowHeadline}>Nothing scheduled</Text>
            )}
          </View>
          <Pressable style={styles.weatherChip} onPress={() => navigation.navigate('Weather')}>
            <View style={styles.weatherChipRow}>
              <Ionicons name="partly-sunny" size={18} color={Colors.accentTeal} />
              <Text style={styles.weatherPill}>
                {weather ? formatTemperature(weather.temperatureC, tempUnit, false) : '--'}
              </Text>
            </View>
            <Text style={styles.weatherCity} numberOfLines={1}>{weather?.city ?? ''}</Text>
          </Pressable>
        </View>
        {nextEvent && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: '30%' }]} />
          </View>
        )}
        {weather && <Text style={styles.weatherMood}>{getWeatherMood()}</Text>}
      </Pressable>

      </View>

      {/* 2x2 Tinted Summary Grid */}
      <View style={styles.statGrid}>
        {[statTiles.slice(0, 2), statTiles.slice(2)].map((row, rowIndex) => (
          <View key={rowIndex} style={styles.statRow}>
            {row.map((tile) => (
              <Pressable
                key={tile.key}
                style={({ pressed }) => [styles.statTile, { backgroundColor: tile.tint }, pressed && styles.pressed]}
                onPress={tile.onPress}
              >
                <View style={[styles.statIcon, { backgroundColor: tile.solid }]}>
                  <Ionicons name={tile.icon} size={26} color={Colors.white} />
                </View>
                <View style={styles.statText}>
                  <Text style={styles.statLabel}>{tile.label}</Text>
                  <Text style={styles.statValue} numberOfLines={1}>{tile.value}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      </View>

      {/* Budget summary */}
      <DashboardBudgetCard reloadKey={budgetReloadKey} />

      {/* Assistant */}
      <Pressable
        style={({ pressed }) => [styles.assistantCard, pressed && styles.pressed]}
        onPress={() => navigation.navigate('Assistant')}
      >
        <View style={styles.assistantTop}>
          <View style={styles.assistantIcon}>
            <Ionicons name="happy" size={28} color={Colors.white} />
          </View>
          <View style={styles.assistantText}>
            <Text style={styles.assistantTitle}>Ask your assistant</Text>
            <Text style={styles.assistantSubtitle}>Type or speak in English, Urdu or Punjabi</Text>
          </View>
          <Ionicons name="mic" size={22} color={Colors.primary} />
        </View>
        <View style={styles.assistantChips}>
          {['Add a task', 'Log an expense', 'My medicines'].map((label) => (
            <View key={label} style={styles.assistantChip}>
              <Text style={styles.assistantChipText}>{label}</Text>
            </View>
          ))}
        </View>
      </Pressable>

      {/* Today's rhythm: the whole day on one timeline, anchored on the five prayers */}
      <View style={styles.rhythmCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Today's rhythm</Text>
        </View>

        <View>
          {rhythmItems.map((item, index) => {
            const isFirst = index === 0;
            const isLast = index === rhythmItems.length - 1;
            const isPrayer = item.kind === 'prayer';
            const isNext = item.key === nextRhythmKey;
            const past = item.minutes !== null && item.minutes <= nowMinutes;
            const nodeIcon: keyof typeof Ionicons.glyphMap = isPrayer
              ? (PRAYER_ICONS[item.title] ?? 'time')
              : item.kind === 'medication'
                ? 'medkit'
                : 'checkmark';
            return (
              <Pressable
                key={item.key}
                style={[styles.rhythmRow, isNext && styles.rhythmRowNext]}
                onPress={item.onPress}
                disabled={!item.onPress}
              >
                <View style={styles.rhythmRail}>
                  <View
                    style={[
                      styles.rhythmLine,
                      isFirst && { top: 20 },
                      isLast && { bottom: undefined, height: 20 },
                    ]}
                  />
                  <View
                    style={[
                      styles.rhythmNode,
                      isPrayer ? styles.rhythmNodePrayer : styles.rhythmNodeSmall,
                      item.kind === 'medication' && styles.rhythmNodeMed,
                      item.kind === 'task' && styles.rhythmNodeTask,
                      past && styles.rhythmNodePast,
                      isNext && styles.rhythmNodeNext,
                    ]}
                  >
                    <Ionicons
                      name={nodeIcon}
                      size={isPrayer ? 16 : 12}
                      color={isNext || (!past && isPrayer) ? Colors.white : isPrayer ? Colors.textHint : Colors.white}
                    />
                  </View>
                </View>

                <View style={[styles.rhythmBody, past && styles.rhythmBodyPast]}>
                  <View style={styles.rhythmTextCol}>
                    <Text style={isPrayer ? styles.rhythmPrayerName : styles.rhythmEventName} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {isNext ? (
                      <Text style={styles.rhythmNextTag}>Up next · in {getTimeUntil(minutesToDate(item.minutes ?? 0))}</Text>
                    ) : item.detail ? (
                      <Text style={styles.rhythmDetail} numberOfLines={1}>{item.detail}</Text>
                    ) : null}
                  </View>
                  <Text style={isPrayer ? styles.rhythmPrayerTime : styles.rhythmEventTime}>{item.timeLabel}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Tasks due today without a set time */}
        {anytimeTasks.length > 0 && (
          <View style={styles.anytimeBlock}>
            <Text style={styles.anytimeLabel}>ANYTIME TODAY</Text>
            {anytimeTasks.slice(0, 3).map((task) => (
              <Pressable key={task.id} style={styles.anytimeRow} onPress={() => handleTaskToggle(task.id)}>
                <View style={styles.anytimeBullet} />
                <Text style={styles.anytimeTitle} numberOfLines={1}>{task.title}</Text>
              </Pressable>
            ))}
            {anytimeTasks.length > 3 && (
              <Pressable onPress={() => navigation.navigate('Tasks')}>
                <Text style={styles.sectionLink}>{anytimeTasks.length - 3} more →</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Habits progress */}
        {habits.length > 0 && (
          <Pressable style={styles.habitSummary} onPress={() => navigation.navigate('Habits')}>
            <View style={styles.noteIcon}>
              <Ionicons name="checkmark-done" size={16} color={Colors.success} />
            </View>
            <Text style={styles.habitSummaryText}>
              Habits · {completedHabitsToday} of {habits.length} done today
            </Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textHint} />
          </Pressable>
        )}

        <View style={styles.contextualNoteRow}>
          <View style={styles.noteIcon}>
            <Ionicons name="water" size={16} color={Colors.accentTeal} />
          </View>
          <Text style={styles.contextualNote}>{getContextualNote()}</Text>
        </View>
      </View>

    </ScrollView>
  );
}

function resolveHomeWeatherEmoji(condition?: string, isNight?: boolean) {
  const normalized = (condition || '').toLowerCase();
  if (normalized.includes('sunny') || normalized.includes('clear')) {
    return isNight ? '🌙' : '🌞';
  }
  if (normalized.includes('cloud')) {
    return '🌥️';
  }
  if (normalized.includes('rain')) {
    return '🌧️';
  }
  if (normalized.includes('storm')) {
    return '⛈️';
  }
  if (normalized.includes('snow')) {
    return '🌨️';
  }
  if (normalized.includes('hazy') || normalized.includes('smoke') || normalized.includes('mist')) {
    return '😶‍🌫️';
  }

  return '';
}

function isNightNow() {
  try {
    const hour = new Date().getHours();
    return hour < 6 || hour >= 19;
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bgLight,
  },
  contentContainer: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },

  // Greeting Row
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  greetingText: {
    flex: 1,
  },
  dateMeta: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: Font.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.6,
  },
  greetingLine: {
    fontSize: 22,
    fontFamily: Font.extrabold,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  greetingLabel: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: Font.medium,
    marginTop: 2,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.button,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 25,
  },
  avatarText: {
    color: Colors.white,
    fontSize: 17,
    fontFamily: Font.extrabold,
  },

  // Hero Card
  heroCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 16,
    gap: 12,
    ...Shadows.card,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroMain: {
    flex: 1,
    gap: 6,
  },
  rightNowHeadline: {
    fontSize: 24,
    fontFamily: Font.extrabold,
    color: Colors.textPrimary,
    lineHeight: 30,
    letterSpacing: -0.4,
  },
  rightNowSubline: {
    fontSize: 15,
    color: Colors.textSecondary,
    fontFamily: Font.medium,
  },
  weatherChip: {
    backgroundColor: Colors.tintSky,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'flex-end',
    maxWidth: 110,
  },
  weatherChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  weatherPill: {
    color: Colors.accentTeal,
    fontSize: 18,
    fontFamily: Font.extrabold,
  },
  weatherCity: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: Font.semibold,
    marginTop: 2,
  },
  weatherMood: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: Font.medium,
  },

  // Stat Grid
  assistantCard: {
    backgroundColor: Colors.primarySurface,
    borderRadius: Radius.lg,
    padding: 18,
    gap: 14,
  },
  assistantTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  assistantIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistantText: {
    flex: 1,
  },
  assistantTitle: {
    fontSize: 17,
    fontFamily: Font.extrabold,
    color: Colors.textPrimary,
  },
  assistantSubtitle: {
    fontSize: 13,
    fontFamily: Font.medium,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  assistantChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  assistantChip: {
    backgroundColor: Colors.white,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  assistantChipText: {
    fontSize: 13,
    fontFamily: Font.semibold,
    color: Colors.textPrimary,
  },
  aboveFold: {
    gap: 16,
  },
  thoughtCard: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...Shadows.card,
  },
  thoughtRef: {
    fontSize: 12,
    fontFamily: Font.bold,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  thoughtCompact: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: Font.bold,
    color: Colors.white,
    textAlign: 'center',
  },
  statGrid: {
    flex: 1,
    gap: 12,
  },
  statRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  statTile: {
    flex: 1,
    minHeight: 112,
    justifyContent: 'space-between',
    borderRadius: Radius.lg,
    padding: 16,
  },
  statIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statText: {},
  statLabel: {
    fontSize: 14,
    fontFamily: Font.semibold,
    color: Colors.textSecondary,
  },
  statValue: {
    fontSize: 18,
    fontFamily: Font.extrabold,
    color: Colors.textPrimary,
    marginTop: 1,
  },

  // Section Headers
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: Font.extrabold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  sectionLink: {
    fontSize: 15,
    fontFamily: Font.bold,
    color: Colors.primary,
  },

  // Rhythm Card
  rhythmCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 16,
    gap: 16,
    ...Shadows.card,
  },
  contextualNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.bgLight,
    borderRadius: Radius.md,
    padding: 10,
  },
  noteIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: Colors.tintSky,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextualNote: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: Font.medium,
    flex: 1,
  },

  // Rhythm timeline
  rhythmRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: Radius.md,
    paddingRight: 8,
  },
  rhythmRowNext: {
    backgroundColor: Colors.tintOrange,
  },
  rhythmRail: {
    width: 40,
    alignItems: 'center',
  },
  rhythmLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: Colors.borderLight,
  },
  rhythmNode: {
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rhythmNodePrayer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.accentAmber,
  },
  rhythmNodeSmall: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginTop: 12,
  },
  rhythmNodeMed: { backgroundColor: Colors.accentBlue },
  rhythmNodeTask: { backgroundColor: Colors.success },
  rhythmNodePast: { backgroundColor: Colors.borderLight },
  rhythmNodeNext: { backgroundColor: Colors.primary },
  rhythmBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
  },
  rhythmBodyPast: { opacity: 0.55 },
  rhythmTextCol: { flex: 1, gap: 2 },
  rhythmPrayerName: { fontSize: 17, fontFamily: Font.extrabold, color: Colors.textPrimary },
  rhythmPrayerTime: { fontSize: 16, fontFamily: Font.bold, color: Colors.textPrimary },
  rhythmEventName: { fontSize: 15, fontFamily: Font.semibold, color: Colors.textPrimary },
  rhythmEventTime: { fontSize: 14, fontFamily: Font.semibold, color: Colors.textSecondary },
  rhythmDetail: { fontSize: 13, fontFamily: Font.medium, color: Colors.textSecondary },
  rhythmNextTag: { fontSize: 13, fontFamily: Font.bold, color: Colors.primary },
  anytimeBlock: { gap: 8 },
  anytimeLabel: { fontSize: 12, fontFamily: Font.extrabold, color: Colors.textSecondary, letterSpacing: 1 },
  anytimeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  anytimeBullet: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.borderLight,
  },
  anytimeTitle: { flex: 1, fontSize: 15, fontFamily: Font.semibold, color: Colors.textPrimary },
  habitSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.tintGreen,
    borderRadius: Radius.md,
    padding: 10,
  },
  habitSummaryText: { flex: 1, fontSize: 14, fontFamily: Font.bold, color: Colors.textPrimary },

  // Habits Card

  // Tasks Card

  // Medication Card

  // Progress bar (shared)
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.tintSlate,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },

  // Sign-off
});
