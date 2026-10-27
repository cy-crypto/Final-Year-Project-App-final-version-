import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';

import { useAppContext } from '../context/AppContext';
import { Colors, Font } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';
import { toApiErrorMessage } from '../services/api';
import { getHabit, getHabitHistory, type HabitDto } from '../services/habitService';
import { shareAchievement } from '../services/communityService';
import {
  Card,
  CenterLoader,
  EmptyCard,
  HeroCard,
  HeroStat,
  HeroStats,
  ModuleHeader,
  PrimaryButton,
  SecondaryButton,
  moduleStyles,
} from '../components/module/ModuleUI';
import { CATEGORY_META, formatReminder, frequencyLabel, progressLabel, shortWeekday } from '../utils/habitFormat';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'HabitDetail'>;

export function HabitDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { habits, setHabitDone, saveHabit, replaceHabit } = useAppContext();
  const cached = habits.find((h) => h.id === params.habitId) ?? null;
  const [fetched, setFetched] = useState<HabitDto | null>(null);
  const habit = cached ?? fetched;
  const [history, setHistory] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [h, dates] = await Promise.all([getHabit(params.habitId), getHabitHistory(params.habitId)]);
      setFetched(h);
      if (!h.isArchived) replaceHabit(h);
      setHistory(dates);
      setError(null);
    } catch (err) {
      setError(toApiErrorMessage(err, 'Could not load this habit.'));
    } finally {
      setRefreshing(false);
    }
  }, [params.habitId, replaceHabit]);

  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  if (!habit) {
    return (
      <SafeAreaView style={moduleStyles.container}>
        <ModuleHeader title="Habit" />
        {error ? (
          <View style={moduleStyles.content}>
            <EmptyCard text={error} icon="flame-outline" />
          </View>
        ) : (
          <CenterLoader />
        )}
      </SafeAreaView>
    );
  }

  const meta = CATEGORY_META[habit.category];

  const toggleDay = async (date: string, done: boolean, isToday: boolean) => {
    setBusy(true);
    await setHabitDone(habit.id, !done, isToday ? undefined : date);
    setHistory((prev) => (done ? prev.filter((d) => d !== date) : [date, ...prev]));
    if (habit.isArchived) await load();
    setBusy(false);
  };

  const share = async () => {
    try {
      await shareAchievement('habit_streak', '', Number(habit.id));
      Alert.alert('Shared', 'Your streak is now in the Community feed.', [
        { text: 'View', onPress: () => navigation.navigate('Community') },
        { text: 'OK' },
      ]);
    } catch (err) {
      Alert.alert('Could not share', toApiErrorMessage(err, 'Please try again.'));
    }
  };

  const toggleArchive = async () => {
    const updated = await saveHabit(habit.id, { is_archived: !habit.isArchived });
    if (updated) setFetched(updated);
  };

  const marked = Object.fromEntries(
    history.map((d) => [d, { selected: true, selectedColor: Colors.primary }])
  );
  const today = habit.last7Days[habit.last7Days.length - 1]?.date;

  return (
    <SafeAreaView style={moduleStyles.container}>
      <ModuleHeader
        title="Habit"
        subtitle={habit.isArchived ? 'Archived' : frequencyLabel(habit)}
        actions={[{ icon: 'create-outline', label: 'Edit habit', onPress: () => navigation.navigate('AddHabit', { habitId: habit.id }) }]}
      />
      <ScrollView
        contentContainerStyle={moduleStyles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <HeroCard label={`${habit.category} · ${frequencyLabel(habit)}`} value={habit.name}>
          <Text style={styles.heroNote}>{progressLabel(habit)}</Text>
          <HeroStats>
            <HeroStat icon="flame" label="Best streak" value={`${habit.bestStreak} ${habit.frequency === 'Weekly' ? 'wk' : 'days'}`} />
            <HeroStat icon="pie-chart" label="Last 30 days" value={`${habit.rate30d}%`} />
          </HeroStats>
        </HeroCard>

        {!habit.isArchived ? (
          habit.doneToday ? (
            <SecondaryButton label="Done today · tap to undo" icon="checkmark-circle" onPress={() => toggleDay(today, true, true)} />
          ) : (
            <PrimaryButton label="Check in for today" icon="checkmark" onPress={() => toggleDay(today, false, true)} loading={busy} />
          )
        ) : null}

        <Card title="Last 7 days">
          <View style={styles.week}>
            {habit.last7Days.map((d, i) => {
              const isToday = i === habit.last7Days.length - 1;
              return (
                <Pressable
                  key={d.date}
                  style={styles.day}
                  disabled={busy || habit.isArchived}
                  onPress={() => toggleDay(d.date, d.done, isToday)}
                  accessibilityLabel={`${d.date} ${d.done ? 'done' : 'not done'}`}
                >
                  <Text style={[styles.dayLabel, isToday && { color: Colors.primary }]}>{isToday ? 'Today' : shortWeekday(d.date)}</Text>
                  <View style={[styles.dayCircle, d.done && styles.dayDone, isToday && !d.done && { borderColor: Colors.primary }]}>
                    {d.done ? <Ionicons name="checkmark" size={18} color={Colors.white} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text style={moduleStyles.muted}>Forgot to check in? Tap a past day to fix it (up to 7 days back).</Text>
          {habit.frequency === 'Weekly' ? (
            <Text style={moduleStyles.bodyStrong}>
              This week: {habit.weekCount} of {habit.targetPerWeek}
              {habit.weekCount >= habit.targetPerWeek ? ' · goal reached 🎉' : ''}
            </Text>
          ) : null}
        </Card>

        <Card title="History" right={<Text style={moduleStyles.muted}>{history.length} check-ins</Text>}>
          <Calendar
            markedDates={marked}
            maxDate={today}
            hideExtraDays
            theme={{
              calendarBackground: Colors.surfaceLight,
              dayTextColor: Colors.textPrimary,
              monthTextColor: Colors.textPrimary,
              textDisabledColor: Colors.textHint,
              todayTextColor: Colors.primary,
              arrowColor: Colors.primary,
              textDayFontFamily: Font.medium,
              textMonthFontFamily: Font.extrabold,
              textDayHeaderFontFamily: Font.semibold,
            }}
          />
        </Card>

        <Card title="Details">
          <Row icon={meta.icon} label="Category" value={habit.category} />
          <Row icon="repeat" label="Frequency" value={frequencyLabel(habit)} />
          <Row icon="alarm-outline" label="Reminder" value={formatReminder(habit.reminderTime)} />
          {habit.createdAt ? <Row icon="calendar-outline" label="Started" value={new Date(habit.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })} /> : null}
          {habit.description ? <Text style={moduleStyles.body}>{habit.description}</Text> : null}
        </Card>

        {habit.streakCount > 0 && !habit.isArchived ? (
          <SecondaryButton label={`Share my ${habit.streakCount}-${habit.frequency === 'Weekly' ? 'week' : 'day'} streak`} icon="people-outline" onPress={share} />
        ) : null}
        <SecondaryButton
          label={habit.isArchived ? 'Restore habit' : 'Archive habit'}
          icon={habit.isArchived ? 'refresh' : 'archive-outline'}
          onPress={toggleArchive}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={moduleStyles.rowBetween}>
      <View style={moduleStyles.row}>
        <Ionicons name={icon} size={18} color={Colors.textSecondary} />
        <Text style={moduleStyles.body}>{label}</Text>
      </View>
      <Text style={moduleStyles.bodyStrong}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroNote: { fontFamily: Font.bold, fontSize: 15, color: 'rgba(255,255,255,0.95)' },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { alignItems: 'center', gap: 6, flex: 1 },
  dayLabel: { fontFamily: Font.semibold, fontSize: 11, color: Colors.textSecondary },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDone: { backgroundColor: Colors.primary, borderColor: Colors.primary },
});
