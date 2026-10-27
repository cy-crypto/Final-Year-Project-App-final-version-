import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, RefreshControl, useWindowDimensions } from 'react-native';
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
import { fetchWeatherByCity } from '../services/weatherService';
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

const SECTION_GAP = 16;        // gap between sections (contentContainer gap)
const GRID_GAP = 12;           // gap between the two rows of tiles (statGrid rowGap)
const FOLD_MARGIN = 4;        // keeps the tiles just inside the screen, so Budget starts just outside it
const MIN_THOUGHT_HEIGHT = 44;
const FULL_THOUGHT_HEIGHT = 200;   // room for the longest verse (2-line Arabic + 3-line translation)

const DAILY_THOUGHTS = [
  { arabic: 'رَبِّ زِدْنِي عِلْمًا', translation: 'My Lord, increase me in knowledge.', ref: 'Quran 20:114' },
  { arabic: 'إِنَّ مَعَ الْعُسْرِ يُسْرًا', translation: 'Indeed, with hardship comes ease.', ref: 'Quran 94:6' },
  { arabic: 'حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ', translation: 'Allah is sufficient for us, and He is the best disposer of affairs.', ref: 'Quran 3:173' },
  { arabic: 'فَاذْكُرُونِي أَذْكُرْكُمْ', translation: 'So remember Me; I will remember you.', ref: 'Quran 2:152' },
  { arabic: 'وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ', translation: 'Whoever relies upon Allah, He is sufficient for him.', ref: 'Quran 65:3' },
];

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
  const { tasks, habits, weather, setWeather, toggleTask, completeHabit } = useAppContext();
  const { user } = useAuth();
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
  // Visible scroll height and the height of greeting + next-up card + tiles (see the top element below).
  const [viewportHeight, setViewportHeight] = useState(0);
  const [headHeight, setHeadHeight] = useState(0); // greeting + next-up card
  const { width: windowWidth } = useWindowDimensions();
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
  }, [user?.selectedCity, user?.timezone]);
  
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

  // Weather fetching (unchanged but integrated into new design)
  useEffect(() => {
    const selectedCity = user?.selectedCity?.trim() || 'London';
    if (!selectedCity) {
      return;
    }

    const cityKey = selectedCity.toLowerCase();
    const lastFetch = weatherFetchRef.current;
    if (lastFetch && lastFetch.city === cityKey && Date.now() - lastFetch.at < 10 * 60 * 1000) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const snapshot = await fetchWeatherByCity(selectedCity);
        if (cancelled) {
          return;
        }

        setWeather({
          city: snapshot.city || selectedCity,
          temperatureC: snapshot.temperatureC,
          condition: snapshot.condition,
          updatedAt: snapshot.updatedAt,
        });
        weatherFetchRef.current = { city: cityKey, at: Date.now() };
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
  
  const getMoodLine = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return 'a fresh start.';
    if (hour < 17) return 'a steady pace.';
    if (hour < 21) return 'time to wind down.';
    return 'rest awaits.';
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
      return `It's ${temp}° outside — your water habit matters more today.`;
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
  
  const getPrayerStatus = (prayerName: string, prayerTime: string) => {
    const [hours, minutes] = prayerTime.split(':').map(Number);
    const prayerDateTime = new Date();
    prayerDateTime.setHours(hours, minutes, 0, 0);
    
    const now = currentTime;
    const isPast = prayerDateTime < now;
    const isNext = nextEvent?.type === 'prayer' && nextEvent.name === prayerName;
    
    return { isPast, isNext };
  };
  
  const getTasksLeadSentence = () => {
    const count = todaysTasks.length;
    if (count === 0) return 'Nothing due today. Breathe.';
    if (count === 1) return 'One thing on your plate today — take your time.';
    if (count <= 4) return `${count} things on your plate today — take your time.`;
    return `${count} things today — pick one to start.`;
  };
  
  const getTasksDueThisWeek = () => {
    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    
    return tasks.filter(task => {
      if (!task.deadline || task.done) return false;
      const deadline = new Date(task.deadline);
      return deadline > new Date(today) && deadline <= weekFromNow;
    }).length;
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
  
  const handleHabitToggle = async (habitId: string) => {
    await completeHabit(habitId);
  };
  
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
  const tasksDueThisWeek = getTasksDueThisWeek();

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

  // Vertical budget of the first screen: the verse card above the greeting takes whatever is left after the
  // greeting, the next-up card and the four tiles, so the tiles stay fully visible and the Budget card starts
  // just below the bottom edge (no sliver of it, no blank gap). If the next-up card grows (weather, medication
  // lines) and the verse would lose its room, the tiles give back a little height (at most 20%) instead.
  const topPadding = insets.top + 16;
  const tileWidth = (windowWidth - 32) * 0.485;
  const squareGridHeight = tileWidth * 2 + GRID_GAP;
  const spare =
    viewportHeight > 0 && headHeight > 0
      ? viewportHeight - topPadding - headHeight - SECTION_GAP * 2 - FOLD_MARGIN - squareGridHeight
      : 0;
  const maxTileShrink = tileWidth * 2 * 0.2;
  let topHeight = 0;
  let tileHeight = tileWidth;
  if (spare >= MIN_THOUGHT_HEIGHT) {
    topHeight = Math.floor(spare);
  } else if (spare + maxTileShrink >= MIN_THOUGHT_HEIGHT) {
    const shrink = MIN_THOUGHT_HEIGHT - spare;
    topHeight = MIN_THOUGHT_HEIGHT;
    tileHeight = tileWidth - shrink / 2;
  } else if (spare !== 0) {
    // Not even a strip fits: no verse, but still keep the four tiles fully on screen (small phones).
    const overflow = Math.max(0, -(spare + SECTION_GAP));
    tileHeight = tileWidth - Math.min(overflow, maxTileShrink) / 2;
  }
  const showThought = topHeight >= MIN_THOUGHT_HEIGHT;
  const fullThought = topHeight >= FULL_THOUGHT_HEIGHT;
  const dayOfYear = Math.floor((currentTime.getTime() - new Date(currentTime.getFullYear(), 0, 0).getTime()) / 86400000);
  const thought = DAILY_THOUGHTS[dayOfYear % DAILY_THOUGHTS.length];

  return (
    <ScrollView
      style={styles.screen}
      onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
      contentContainerStyle={[styles.contentContainer, { paddingTop: topPadding }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
      }
    >
      {/* Thought for today (fills the space left above the greeting) */}
      {showThought && (
        <View style={[styles.thoughtCard, { height: topHeight }]}>
          {fullThought ? (
            <>
              <Text style={styles.thoughtEyebrow}>THOUGHT FOR TODAY</Text>
              <Text style={styles.thoughtArabic} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
                {thought.arabic}
              </Text>
              <Text style={styles.thoughtTranslation} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.8}>
                {thought.translation}
              </Text>
              <Text style={styles.thoughtRef}>{thought.ref}</Text>
            </>
          ) : (
            <Text style={styles.thoughtCompact} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
              {thought.translation} <Text style={styles.thoughtRef}>· {thought.ref}</Text>
            </Text>
          )}
        </View>
      )}

      {/* Greeting + next-up card are measured so the verse card above can use the space that is left */}
      <View style={styles.aboveFold}>
      <View style={styles.aboveFold} onLayout={(e) => setHeadHeight(e.nativeEvent.layout.height)}>
      {/* Greeting Row */}
      <View style={styles.greetingRow}>
        <View style={styles.greetingText}>
          <Text style={styles.dateMeta}>
            {formatDate(currentTime)} {hijriDate && `· ${hijriDate.hijri.day} ${hijriDate.hijri.month.en}`}
          </Text>
          <Text style={styles.greetingLine}>{getGreeting()}, {firstName} 👋</Text>
          <Text style={styles.greetingLabel}>{getMoodLine()}</Text>
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
            <View style={styles.rightNowBadge}>
              <View style={styles.pulseDot} />
              <Text style={styles.rightNowLabel}>RIGHT NOW · NEXT UP</Text>
            </View>
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
                {weather ? formatTemp(weather.temperatureC, '°') : '--'}
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
        {statTiles.map((tile) => (
          <Pressable
            key={tile.key}
            style={({ pressed }) => [styles.statTile, { backgroundColor: tile.tint, height: tileHeight }, pressed && styles.pressed]}
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

      </View>

      {/* Budget summary */}
      <DashboardBudgetCard reloadKey={budgetReloadKey} />

      {/* Today's Rhythm Card */}
      <View style={styles.rhythmCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Today's rhythm</Text>
          <Pressable onPress={() => navigation.navigate('PrayerTime')}>
            <Text style={styles.sectionLink}>Prayer times →</Text>
          </Pressable>
        </View>
        <View style={styles.prayerTimeline}>
          {Object.entries(prayerTimes ?? PLACEHOLDER_PRAYERS).map(([name, time], index, all) => {
            const { isPast, isNext } = prayerTimes
              ? getPrayerStatus(name, time)
              : { isPast: false, isNext: false };
            return (
              <View key={name} style={styles.prayerPoint}>
                <View style={[
                  styles.prayerDot,
                  isPast && styles.prayerDotPast,
                  isNext && styles.prayerDotNext
                ]} />
                <Text style={[
                  styles.prayerName,
                  isPast && styles.prayerNamePast,
                  isNext && styles.prayerNameNext
                ]}>
                  {name.toUpperCase()}
                </Text>
                <Text style={[
                  styles.prayerTime,
                  isPast && styles.prayerTimePast,
                  isNext && styles.prayerTimeNext
                ]}>
                  {time}
                </Text>
                {index < all.length - 1 && (
                  <View style={styles.prayerLine} />
                )}
              </View>
            );
          })}
        </View>
        <View style={styles.contextualNoteRow}>
          <View style={styles.noteIcon}>
            <Ionicons name="water" size={16} color={Colors.accentTeal} />
          </View>
          <Text style={styles.contextualNote}>{getContextualNote()}</Text>
        </View>
      </View>

      {/* Habits Card */}
      <View style={styles.habitsCard}>
        <View style={styles.habitsHeader}>
          <Text style={styles.habitsTitle}>
            {habits.length} small thing{habits.length !== 1 ? 's' : ''}
          </Text>
          <View style={styles.countBadge}>
            <Text style={styles.habitsCount}>
              {completedHabitsToday} of {habits.length}
            </Text>
          </View>
        </View>
        <Text style={styles.habitsSubtitle}>Tap to mark done. No pressure.</Text>
        <View style={styles.habitTiles}>
          {habits.slice(0, 4).map((habit) => {
            const isCompleted = habit.lastCompletedDate === today;
            return (
              <Pressable
                key={habit.id}
                style={[
                  styles.habitTile,
                  isCompleted && styles.habitTileCompleted
                ]}
                onPress={() => handleHabitToggle(habit.id)}
              >
                <View style={[
                  styles.habitIcon,
                  isCompleted && styles.habitIconCompleted
                ]}>
                  <Ionicons
                    name="checkmark"
                    size={16}
                    color={isCompleted ? Colors.primary : Colors.white}
                  />
                </View>
                <Text style={[
                  styles.habitName,
                  isCompleted && styles.habitNameCompleted
                ]}>
                  {habit.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Tasks Card */}
      <View style={styles.tasksCard}>
        <Text style={styles.tasksLead}>{getTasksLeadSentence()}</Text>
        {todaysTasks.slice(0, 3).map((task) => (
          <Pressable
            key={task.id}
            style={styles.taskRow}
            onPress={() => handleTaskToggle(task.id)}
          >
            <View style={[
              styles.taskBullet,
              task.done && styles.taskBulletCompleted
            ]}>
              {task.done && (
                <Ionicons name="checkmark" size={12} color={Colors.white} />
              )}
            </View>
            <Text style={[
              styles.taskTitle,
              task.done && styles.taskTitleCompleted
            ]}>
              {task.title}
            </Text>
            {task.category && (
              <Text style={styles.taskCategory}>{task.category}</Text>
            )}
          </Pressable>
        ))}
        {tasksDueThisWeek > 0 && (
          <Pressable onPress={() => navigation.navigate('Tasks')}>
            <Text style={styles.tasksFooter}>
              {tasksDueThisWeek} more this week →
            </Text>
          </Pressable>
        )}
      </View>

      {/* Medication Card */}
      <View style={styles.medicationCard}>
        {nextMed ? (
          <>
            <Text style={styles.medicationLabel}>
              MEDICATION · NEXT DOSE
            </Text>
            <View style={styles.medicationRow}>
              <View style={styles.medicationIcon}>
                <Ionicons name="medkit" size={22} color={Colors.white} />
              </View>
              <View style={styles.medicationInfo}>
                <Text style={styles.medicationName}>{nextMed!.name}</Text>
                <Text style={styles.medicationDosage}>{nextMed!.dosage}</Text>
              </View>
              <Text style={styles.medicationTime}>
                {nextMed!.schedule_times[0]} · in {(() => {
                  const [hours, minutes] = nextMed!.schedule_times[0].split(':').map(Number);
                  const medTime = new Date();
                  medTime.setHours(hours, minutes, 0, 0);
                  return getTimeUntil(medTime);
                })()}
              </Text>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.medicationLabel}>
              MEDICATION · ALL CLEAR FOR TODAY ✓
            </Text>
            <Text style={styles.medicationAllClear}>
              No more medications scheduled for today
            </Text>
          </>
        )}
      </View>

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

      {/* Sign-off line */}
      <Text style={styles.signOff}>That's the day. Be gentle.</Text>
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
  rightNowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: Colors.tintOrange,
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  rightNowLabel: {
    color: Colors.primary,
    fontSize: 12,
    fontFamily: Font.extrabold,
    letterSpacing: 0.6,
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
  thoughtEyebrow: {
    fontSize: 12,
    fontFamily: Font.extrabold,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 1.2,
  },
  thoughtArabic: {
    fontSize: 30,
    lineHeight: 46,
    fontWeight: '700',
    color: Colors.white,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginTop: 4,
  },
  thoughtTranslation: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: Font.semibold,
    color: Colors.white,
    textAlign: 'center',
    marginTop: 2,
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  statTile: {
    width: '48.5%',
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
  prayerTimeline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  prayerPoint: {
    alignItems: 'center',
    gap: 4,
    position: 'relative',
  },
  prayerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 2,
    borderColor: Colors.borderLight,
  },
  prayerDotPast: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  prayerDotNext: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 3,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  prayerName: {
    fontSize: 11,
    fontFamily: Font.bold,
    textTransform: 'uppercase' as const,
    color: Colors.textHint,
    letterSpacing: 0.5,
  },
  prayerNamePast: {
    color: Colors.textSecondary,
  },
  prayerNameNext: {
    color: Colors.primary,
    fontFamily: Font.extrabold,
  },
  prayerTime: {
    fontSize: 13,
    fontFamily: Font.semibold,
    color: Colors.textHint,
  },
  prayerTimePast: {
    color: Colors.textSecondary,
  },
  prayerTimeNext: {
    color: Colors.primary,
    fontFamily: Font.extrabold,
  },
  prayerLine: {
    position: 'absolute',
    top: 5,
    left: '50%',
    right: '-50%',
    height: 2,
    backgroundColor: Colors.borderSoft,
    zIndex: -1,
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

  // Habits Card
  habitsCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 16,
    gap: 10,
    ...Shadows.card,
  },
  habitsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  habitsTitle: {
    fontSize: 20,
    fontFamily: Font.extrabold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  countBadge: {
    backgroundColor: Colors.tintAmber,
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  habitsCount: {
    fontSize: 14,
    fontFamily: Font.extrabold,
    color: Colors.accentAmber,
  },
  habitsSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: Font.medium,
  },
  habitTiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  habitTile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.tintSlate,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
  },
  habitTileCompleted: {
    backgroundColor: Colors.primary,
  },
  habitIcon: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  habitIconCompleted: {
    backgroundColor: Colors.white,
  },
  habitName: {
    fontSize: 14,
    fontFamily: Font.bold,
    color: Colors.textPrimary,
  },
  habitNameCompleted: {
    color: Colors.white,
  },

  // Tasks Card
  tasksCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 16,
    gap: 6,
    ...Shadows.card,
  },
  tasksLead: {
    fontSize: 20,
    fontFamily: Font.extrabold,
    color: Colors.textPrimary,
    lineHeight: 28,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Colors.bgLight,
    borderRadius: Radius.md,
  },
  taskBullet: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskBulletCompleted: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  taskTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: Font.semibold,
    color: Colors.textPrimary,
  },
  taskTitleCompleted: {
    color: Colors.textHint,
    textDecorationLine: 'line-through',
  },
  taskCategory: {
    fontSize: 12,
    fontFamily: Font.extrabold,
    color: Colors.primary,
    textTransform: 'uppercase' as const,
    backgroundColor: Colors.tintOrange,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tasksFooter: {
    fontSize: 15,
    fontFamily: Font.bold,
    color: Colors.primary,
    textAlign: 'center',
    marginTop: 6,
  },

  // Medication Card
  medicationCard: {
    backgroundColor: Colors.tintRose,
    borderRadius: Radius.lg,
    padding: 16,
    gap: 12,
  },
  medicationLabel: {
    fontSize: 12,
    fontFamily: Font.extrabold,
    color: Colors.accentRose,
    letterSpacing: 0.6,
  },
  medicationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  medicationIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.accentRose,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medicationInfo: {
    flex: 1,
  },
  medicationName: {
    fontSize: 17,
    fontFamily: Font.extrabold,
    color: Colors.textPrimary,
  },
  medicationDosage: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
    fontFamily: Font.medium,
  },
  medicationTime: {
    fontSize: 14,
    fontFamily: Font.extrabold,
    color: Colors.accentRose,
    textAlign: 'right',
  },
  medicationAllClear: {
    fontSize: 15,
    color: Colors.textSecondary,
    fontFamily: Font.medium,
  },

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
  signOff: {
    fontSize: 14,
    color: Colors.textHint,
    textAlign: 'center',
    fontFamily: Font.medium,
    marginTop: 8,
  },
});
