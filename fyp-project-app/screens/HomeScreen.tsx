import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, MainTabParamList } from '../navigation/types';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';
import { fetchWeatherByCity } from '../services/weatherService';
import { api, parseJsonData } from '../services/api';

interface PrayerTimes {
  Fajr: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
}

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
  const weatherFetchRef = useRef<{ city: string; at: number } | null>(null);
  
  // State for real-time data
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes | null>(null);
  const [hijriDate, setHijriDate] = useState<DateInfo | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
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
  }, [user?.selectedCity]);
  
  // Fetch medications
  useEffect(() => {
    fetchMedications();
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
      // This would normally fetch from prayer API, using mock data for now
      // In a real implementation, you'd call the same prayer API as PrayerTimeScreen
      const mockPrayerTimes: PrayerTimes = {
        Fajr: '05:30',
        Dhuhr: '12:30', 
        Asr: '15:45',
        Maghrib: '18:15',
        Isha: '19:30'
      };
      const mockHijriDate: DateInfo = {
        hijri: {
          day: '10',
          month: { en: 'Ramadan' }
        }
      };
      setPrayerTimes(mockPrayerTimes);
      setHijriDate(mockHijriDate);
    } catch (error) {
      console.warn('Failed to fetch prayer data', error);
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
    await Promise.all([
      fetchPrayerData(),
      fetchMedications()
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

  return (
    <ScrollView 
      style={styles.screen} 
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Hero Greeting Card */}
      <View style={styles.heroCard}>
        <Text style={styles.dateMeta}>
          {formatDate(currentTime)} {hijriDate && `· ${hijriDate.hijri.day} ${hijriDate.hijri.month.en}`}
        </Text>
        <Text style={styles.greetingLabel}>{getGreeting()},</Text>
        <Text style={styles.greetingLine}>{firstName} — {getMoodLine()}</Text>
        <View style={styles.separator} />
        <View style={styles.weatherStrip}>
          <Text style={styles.weatherPill}>
            {weather && `${formatTemp(weather.temperatureC, '°')} ${weather.city}`}
          </Text>
          <Text style={styles.weatherMood}>{getWeatherMood()}</Text>
        </View>
      </View>

      {/* Right Now Card */}
      {nextEvent && (
        <Pressable 
          style={styles.rightNowCard}
          onPress={() => {
            if (nextEvent.type === 'prayer') navigation.navigate('PrayerTime');
            if (nextEvent.type === 'medication') navigation.navigate('Medication');
            if (nextEvent.type === 'task') navigation.navigate('Tasks');
          }}
        >
          <View style={styles.rightNowHeader}>
            <View style={styles.pulseDot} />
            <Text style={styles.rightNowLabel}>RIGHT NOW · NEXT UP</Text>
          </View>
          <Text style={styles.rightNowHeadline}>
            {nextEvent.displayName} in {getTimeUntil(nextEvent.time)}
          </Text>
          <Text style={styles.rightNowSubline}>
            at {formatTime(nextEvent.time)} 
            {nextEvent.type === 'medication' && nextMed && ` · then ${nextMed.name} at ${nextMed.schedule_times[1] || 'later'}`}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: '30%' }]} />
          </View>
        </Pressable>
      )}

      {/* Today's Rhythm Card */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Today's rhythm</Text>
        <Pressable onPress={() => navigation.navigate('PrayerTime')}>
          <Text style={styles.sectionLink}>Prayer times →</Text>
        </Pressable>
      </View>
      <View style={styles.rhythmCard}>
        <View style={styles.prayerTimeline}>
          {prayerTimes && Object.entries(prayerTimes).map(([name, time], index) => {
            const { isPast, isNext } = getPrayerStatus(name, time);
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
                {index < Object.keys(prayerTimes!).length - 1 && (
                  <View style={styles.prayerLine} />
                )}
              </View>
            );
          })}
        </View>
        <View style={styles.contextualNoteRow}>
          <Ionicons name="water" size={16} color={Colors.textSecondary} />
          <Text style={styles.contextualNote}>{getContextualNote()}</Text>
        </View>
      </View>

      {/* Habits Card */}
      <View style={styles.habitsCard}>
        <View style={styles.habitsHeader}>
          <Text style={styles.habitsTitle}>
            {habits.length} small thing{habits.length !== 1 ? 's' : ''}
          </Text>
          <Text style={styles.habitsCount}>
            {completedHabitsToday} of {habits.length}
          </Text>
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
                    color={isCompleted ? Colors.textPrimary : Colors.textSecondary} 
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
                <Ionicons name="medkit" size={20} color={Colors.white} />
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
    paddingTop: 100,
    gap: 16,
    paddingBottom: 30,
  },
  
  // Hero Card
  heroCard: {
    backgroundColor: Colors.textPrimary,
    borderRadius: 18,
    padding: 20,
    gap: 12,
  },
  dateMeta: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    opacity: 0.8,
  },
  greetingLabel: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '500',
  },
  greetingLine: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.white,
    lineHeight: 34,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.textSecondary,
    opacity: 0.3,
    marginVertical: 4,
  },
  weatherStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  weatherPill: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  weatherMood: {
    color: Colors.white,
    fontSize: 13,
    fontStyle: 'italic',
    opacity: 0.8,
  },
  
  // Right Now Card
  rightNowCard: {
    backgroundColor: Colors.primarySurface,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  rightNowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accentAmber,
  },
  rightNowLabel: {
    color: Colors.textHint,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
  },
  rightNowHeadline: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 24,
  },
  rightNowSubline: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  
  // Section Headers
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  sectionLink: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  
  // Rhythm Card
  rhythmCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 16,
    gap: 12,
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
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
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.borderLight,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  prayerDotPast: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  prayerDotNext: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.accentAmber,
    borderColor: Colors.accentAmber,
    shadowColor: Colors.accentAmber,
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  prayerName: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase' as const,
    color: Colors.textHint,
    letterSpacing: 0.5,
  },
  prayerNamePast: {
    color: Colors.primary,
  },
  prayerNameNext: {
    color: Colors.accentAmber,
    fontWeight: '800',
  },
  prayerTime: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.textHint,
  },
  prayerTimePast: {
    color: Colors.primary,
  },
  prayerTimeNext: {
    color: Colors.accentAmber,
    fontWeight: '700',
  },
  prayerLine: {
    position: 'absolute',
    top: 4,
    left: '50%',
    right: '-50%',
    height: 1,
    backgroundColor: Colors.borderLight,
    zIndex: -1,
  },
  contextualNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  contextualNote: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    flex: 1,
  },
  
  // Habits Card
  habitsCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 16,
    gap: 12,
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  habitsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  habitsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  habitsCount: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  habitsSubtitle: {
    fontSize: 13,
    color: Colors.textHint,
    fontStyle: 'italic',
  },
  habitTiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  habitTile: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 20,
    padding: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 6,
    minWidth: 80,
  },
  habitTileCompleted: {
    backgroundColor: Colors.textPrimary,
    borderColor: Colors.textPrimary,
  },
  habitIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  habitIconCompleted: {
    backgroundColor: Colors.primarySurface,
  },
  habitName: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  habitNameCompleted: {
    color: Colors.white,
  },
  
  // Tasks Card
  tasksCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 16,
    gap: 12,
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  tasksLead: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 24,
    fontFamily: 'serif',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  taskBullet: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskBulletCompleted: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  taskTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  taskTitleCompleted: {
    color: Colors.textHint,
    textDecorationLine: 'line-through',
  },
  taskCategory: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textHint,
    textTransform: 'uppercase' as const,
    backgroundColor: Colors.primarySurface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tasksFooter: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
    textAlign: 'center',
    marginTop: 8,
  },
  
  // Medication Card
  medicationCard: {
    backgroundColor: Colors.textPrimary,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  medicationLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.white,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    opacity: 0.8,
  },
  medicationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  medicationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medicationInfo: {
    flex: 1,
  },
  medicationName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  medicationDosage: {
    fontSize: 13,
    color: Colors.white,
    marginTop: 2,
    opacity: 0.8,
  },
  medicationTime: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white,
    textAlign: 'right',
    opacity: 0.8,
  },
  medicationAllClear: {
    fontSize: 14,
    color: Colors.white,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
    opacity: 0.8,
  },
  
  // Progress bar (shared)
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.borderLight,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  
  // Sign-off
  signOff: {
    fontSize: 12,
    color: Colors.textHint,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 16,
  },
});
