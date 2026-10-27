import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useAppContext } from '../context/AppContext';
import { Colors, Font, Radius } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';
import { HABIT_CATEGORIES, getHabits, type HabitCategory, type HabitDto } from '../services/habitService';
import { HabitCard } from '../components/habits/HabitCard';
import { HabitInsightsTab } from '../components/habits/HabitInsightsTab';
import {
  CenterLoader,
  ChipRow,
  EmptyCard,
  Fab,
  HeroCard,
  HeroStat,
  HeroStats,
  ModuleHeader,
  PillTabs,
  ProgressBar,
  SectionHeader,
  moduleStyles,
} from '../components/module/ModuleUI';
import { CATEGORY_META, HABIT_SUGGESTIONS, isDue } from '../utils/habitFormat';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type TabKey = 'today' | 'all' | 'insights';

export function HabitsScreen() {
  const navigation = useNavigation<Nav>();
  const { habits, habitsLoading, habitsError, fetchHabits, completeHabit, saveHabit, deleteHabit } = useAppContext();
  const [tab, setTab] = useState<TabKey>('today');
  const [category, setCategory] = useState<'All' | HabitCategory | 'Archived'>('All');
  const [archived, setArchived] = useState<HabitDto[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadedOnce, setLoadedOnce] = useState(false);

  useEffect(
    () => navigation.addListener('focus', () => fetchHabits(true).finally(() => setLoadedOnce(true))),
    [navigation, fetchHabits]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setReloadKey((k) => k + 1);
    await fetchHabits(true);
    setRefreshing(false);
  }, [fetchHabits]);

  const showCategory = async (key: 'All' | HabitCategory | 'Archived') => {
    setCategory(key);
    if (key === 'Archived') getHabits(true).then(setArchived).catch(() => setArchived([]));
  };

  const toDo = habits.filter(isDue);
  const doneToday = habits.filter((h) => h.doneToday);
  const weeklyMet = habits.filter((h) => !h.doneToday && !isDue(h));
  const daily = habits.filter((h) => h.frequency === 'Daily');
  const dailyDone = daily.filter((h) => h.doneToday).length;
  const bestRunning = habits.reduce((m, h) => Math.max(m, h.streakCount), 0);
  const avgRate = habits.length ? Math.round(habits.reduce((s, h) => s + h.rate30d, 0) / habits.length) : 0;

  const filtered = useMemo(
    () => (category === 'Archived' ? archived : category === 'All' ? habits : habits.filter((h) => h.category === category)),
    [habits, archived, category]
  );

  const open = (h: HabitDto) => navigation.navigate('HabitDetail', { habitId: h.id });

  const actions = (h: HabitDto) =>
    Alert.alert(h.name, undefined, [
      { text: 'Edit', onPress: () => navigation.navigate('AddHabit', { habitId: h.id }) },
      {
        text: h.isArchived ? 'Restore' : 'Archive',
        onPress: async () => {
          await saveHabit(h.id, { is_archived: !h.isArchived });
          if (h.isArchived) setArchived((prev) => prev.filter((a) => a.id !== h.id));
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete habit', `Delete "${h.name}" and all its history?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteHabit(h.id) },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const list = (items: HabitDto[]) => (
    <View style={moduleStyles.list}>
      {items.map((h) => (
        <HabitCard
          key={h.id}
          habit={h}
          onPress={() => open(h)}
          onToggle={() => (h.isArchived ? open(h) : completeHabit(h.id))}
          onLongPress={() => actions(h)}
        />
      ))}
    </View>
  );

  const suggestions = (
    <View style={{ gap: 10 }}>
      <SectionHeader title="Ideas to start with" />
      <View style={styles.suggestions}>
        {HABIT_SUGGESTIONS.slice(0, 6).map((s) => {
          const meta = CATEGORY_META[s.category];
          return (
            <Pressable key={s.name} style={styles.suggestion} onPress={() => navigation.navigate('AddHabit', { preset: s.name })}>
              <Ionicons name={meta.icon} size={16} color={meta.color} />
              <Text style={styles.suggestionText} numberOfLines={1}>
                {s.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const renderToday = () =>
    habits.length === 0 ? (
      <>
        <EmptyCard text={habitsError ?? 'No habits yet. Small daily steps add up — add your first one.'} icon="flame-outline" />
        {suggestions}
      </>
    ) : (
      <>
        <HeroCard
          label={`${new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })} · Habits`}
          value={toDo.length === 0 ? 'All done for today' : `${doneToday.length} of ${doneToday.length + toDo.length} done`}
        >
          <View style={{ marginTop: 6 }}>
            <ProgressBar pct={daily.length ? (dailyDone / daily.length) * 100 : toDo.length ? 0 : 100} color={Colors.white} />
          </View>
          <HeroStats>
            <HeroStat icon="flame" label="Best running" value={`${bestRunning} days`} />
            <HeroStat icon="trending-up" label="30-day average" value={`${avgRate}%`} />
          </HeroStats>
        </HeroCard>

        <SectionHeader title={toDo.length ? 'To do' : 'To do · nothing left'} />
        {toDo.length ? list(toDo) : <EmptyCard text="Every habit is checked. Great work!" icon="checkmark-done-outline" />}

        {doneToday.length > 0 ? (
          <>
            <SectionHeader title="Done today" />
            {list(doneToday)}
          </>
        ) : null}

        {weeklyMet.length > 0 ? (
          <>
            <SectionHeader title="Weekly goal reached" />
            {list(weeklyMet)}
          </>
        ) : null}
        <Text style={[moduleStyles.muted, { textAlign: 'center' }]}>Tap ✓ to check in · tap a habit for its history · long-press for options</Text>
      </>
    );

  const renderAll = () => (
    <>
      <ChipRow
        options={[
          { key: 'All' as const, label: 'All' },
          ...HABIT_CATEGORIES.filter((c) => habits.some((h) => h.category === c)).map((c) => ({ key: c, label: c })),
          { key: 'Archived' as const, label: 'Archived' },
        ]}
        value={category}
        onChange={showCategory}
        scroll
      />
      {filtered.length === 0 ? (
        <EmptyCard text={category === 'Archived' ? 'No archived habits.' : 'No habits here yet.'} icon="albums-outline" />
      ) : (
        list(filtered)
      )}
      {category !== 'Archived' ? suggestions : null}
    </>
  );

  return (
    <SafeAreaView style={moduleStyles.container} edges={['top']}>
      <ModuleHeader
        title="Habits"
        subtitle="Small steps, every day."
        showBack={false}
        actions={[{ icon: 'add-circle-outline', label: 'Add habit', onPress: () => navigation.navigate('AddHabit') }]}
      />
      <PillTabs
        tabs={[
          { key: 'today', label: 'Today' },
          { key: 'all', label: 'All habits' },
          { key: 'insights', label: 'Insights' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {!loadedOnce && habitsLoading && habits.length === 0 ? (
        <CenterLoader />
      ) : (
        <ScrollView
          contentContainerStyle={moduleStyles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          {tab === 'today' ? renderToday() : tab === 'all' ? renderAll() : <HabitInsightsTab habits={habits} reloadKey={reloadKey} />}
        </ScrollView>
      )}
      {tab !== 'insights' ? <Fab onPress={() => navigation.navigate('AddHabit')} label="Add habit" aboveAssistant /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 38,
    maxWidth: '100%',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.surfaceLight,
  },
  suggestionText: { fontFamily: Font.semibold, fontSize: 13, color: Colors.textPrimary },
});
