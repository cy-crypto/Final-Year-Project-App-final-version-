import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useAppContext } from '../context/AppContext';
import { Colors } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';
import type { Task, TaskPriority, TaskStatus } from '../services/taskService';
import { TaskItem } from '../components/tasks/TaskItem';
import { TaskCalendarTab } from '../components/tasks/TaskCalendarTab';
import { TaskInsightsTab } from '../components/tasks/TaskInsightsTab';
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
  SearchBox,
  SectionHeader,
  moduleStyles,
} from '../components/module/ModuleUI';
import { addDays, isOverdue, sortTasks, todayStr } from '../utils/taskFormat';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type TabKey = 'overview' | 'all' | 'calendar' | 'insights';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'all', label: 'All' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'insights', label: 'Insights' },
];

const STATUS_FILTERS: { key: 'all' | TaskStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'To do' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
];

const PRIORITY_FILTERS: { key: 'any' | TaskPriority; label: string }[] = [
  { key: 'any', label: 'Any priority' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
];

export function TasksScreen() {
  const { tasks, tasksLoading, tasksError, fetchTasks, toggleTask, deleteTask } = useAppContext();
  const navigation = useNavigation<Nav>();

  const [tab, setTab] = useState<TabKey>('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'any' | TaskPriority>('any');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [loadedOnce, setLoadedOnce] = useState(false);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchTasks().finally(() => setLoadedOnce(true));
    });
    return unsubscribe;
  }, [navigation, fetchTasks]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setReloadKey((k) => k + 1);
    await fetchTasks(true);
    setRefreshing(false);
  }, [fetchTasks]);

  const today = todayStr();
  const weekEnd = addDays(today, 7);
  const sorted = useMemo(() => sortTasks(tasks), [tasks]);

  const dueToday = sorted.filter((t) => t.deadline === today);
  const overdue = sorted.filter(isOverdue);
  const upcoming = sorted.filter((t) => !t.done && !!t.deadline && t.deadline > today && t.deadline <= weekEnd);
  const noDate = sorted.filter((t) => !t.done && !t.deadline);
  const todayDone = dueToday.filter((t) => t.done).length;
  const todayPct = dueToday.length ? (todayDone / dueToday.length) * 100 : 0;
  const openCount = tasks.filter((t) => !t.done).length;

  const categories = useMemo(
    () => Array.from(new Set(tasks.map((t) => t.category).filter(Boolean))).sort(),
    [tasks]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sorted.filter(
      (t) =>
        (statusFilter === 'all' || t.status === statusFilter) &&
        (priorityFilter === 'any' || t.priority === priorityFilter) &&
        (categoryFilter === 'all' || t.category === categoryFilter) &&
        (!term ||
          t.title.toLowerCase().includes(term) ||
          t.description.toLowerCase().includes(term) ||
          t.category.toLowerCase().includes(term))
    );
  }, [sorted, search, statusFilter, priorityFilter, categoryFilter]);

  const openTask = (task: Task) => navigation.navigate('TaskDetail', { taskId: task.id });

  const confirmDelete = (task: Task) =>
    Alert.alert('Delete task', `Delete "${task.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteTask(task.id) },
    ]);

  const renderList = (list: Task[]) => (
    <View style={moduleStyles.list}>
      {list.map((t) => (
        <TaskItem
          key={t.id}
          task={t}
          onPress={() => openTask(t)}
          onToggle={() => toggleTask(t.id)}
          onLongPress={() => confirmDelete(t)}
        />
      ))}
    </View>
  );

  const renderOverview = () => (
    <>
      <HeroCard
        label={`${new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })} · Today`}
        value={dueToday.length ? `${todayDone} of ${dueToday.length} done` : 'Nothing due today'}
      >
        {dueToday.length ? (
          <View style={{ marginTop: 6 }}>
            <ProgressBar pct={todayPct} color={Colors.white} />
          </View>
        ) : null}
        <HeroStats>
          <HeroStat icon="list" label="Open tasks" value={String(openCount)} />
          <HeroStat icon="alert-circle" label="Overdue" value={String(overdue.length)} />
        </HeroStats>
      </HeroCard>

      {overdue.length > 0 ? (
        <>
          <SectionHeader title="Overdue" />
          {renderList(overdue)}
        </>
      ) : null}

      <SectionHeader title="Due today" actionLabel="See all" onAction={() => setTab('all')} />
      {dueToday.length === 0 ? (
        <EmptyCard text={tasksError ?? 'No tasks due today. Tap + to plan one.'} />
      ) : (
        renderList(dueToday)
      )}

      <SectionHeader title="Next 7 days" />
      {upcoming.length === 0 ? <EmptyCard text="Nothing scheduled for the coming week." /> : renderList(upcoming.slice(0, 6))}

      {noDate.length > 0 ? (
        <>
          <SectionHeader title="No deadline" />
          {renderList(noDate.slice(0, 5))}
        </>
      ) : null}
    </>
  );

  const renderAll = () => (
    <>
      <SearchBox value={search} onChangeText={setSearch} placeholder="Search tasks" />
      <ChipRow options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} scroll />
      <ChipRow options={PRIORITY_FILTERS} value={priorityFilter} onChange={setPriorityFilter} scroll />
      {categories.length > 0 ? (
        <ChipRow
          options={[{ key: 'all', label: 'All categories' }, ...categories.map((c) => ({ key: c, label: c }))]}
          value={categoryFilter}
          onChange={setCategoryFilter}
          scroll
        />
      ) : null}
      <Text style={moduleStyles.muted}>
        {filtered.length} task{filtered.length === 1 ? '' : 's'} · long-press a task to delete it
      </Text>
      {filtered.length === 0 ? (
        <EmptyCard text={tasks.length ? 'No tasks match your filters.' : 'No tasks yet. Tap + to add one.'} icon="search-outline" />
      ) : (
        renderList(filtered)
      )}
    </>
  );

  return (
    <SafeAreaView style={moduleStyles.container} edges={['top']}>
      <ModuleHeader
        title="Tasks"
        subtitle="Plan it, track it, finish it."
        actions={[{ icon: 'add-circle-outline', label: 'Add task', onPress: () => navigation.navigate('AddTask') }]}
      />
      <PillTabs tabs={TABS} value={tab} onChange={setTab} />

      {!loadedOnce && tasksLoading && tasks.length === 0 ? (
        <CenterLoader />
      ) : (
        <ScrollView
          contentContainerStyle={moduleStyles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          {tab === 'overview'
            ? renderOverview()
            : tab === 'all'
              ? renderAll()
              : tab === 'calendar'
                ? <TaskCalendarTab tasks={sorted} onOpen={openTask} onToggle={(t) => toggleTask(t.id)} />
                : <TaskInsightsTab reloadKey={reloadKey} />}
        </ScrollView>
      )}

      {tab !== 'insights' ? <Fab onPress={() => navigation.navigate('AddTask')} label="Add task" aboveAssistant /> : null}
    </SafeAreaView>
  );
}
