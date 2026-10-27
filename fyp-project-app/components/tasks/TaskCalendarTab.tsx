import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Calendar } from 'react-native-calendars';

import { Colors, Font } from '../../constants/theme';
import type { Task } from '../../services/taskService';
import { PRIORITY_META, formatLongDate, todayStr } from '../../utils/taskFormat';
import { Card, EmptyCard, SectionHeader } from '../module/ModuleUI';
import { TaskItem } from './TaskItem';

type Props = {
  tasks: Task[];
  onOpen: (task: Task) => void;
  onToggle: (task: Task) => void;
};

/** Month view of task deadlines (FR-02.5); dots use the highest open priority on that day. */
export function TaskCalendarTab({ tasks, onOpen, onToggle }: Props) {
  const [selected, setSelected] = useState(todayStr());

  const marked = useMemo(() => {
    const byDay: Record<string, any> = {};
    for (const task of tasks) {
      if (!task.deadline) continue;
      const day = (byDay[task.deadline] ??= { dots: [] as { key: string; color: string }[] });
      const color = task.done ? Colors.textHint : PRIORITY_META[task.priority].color;
      if (!day.dots.some((d: { color: string }) => d.color === color) && day.dots.length < 3) {
        day.dots.push({ key: `${task.id}`, color });
      }
    }
    byDay[selected] = { ...(byDay[selected] ?? { dots: [] }), selected: true, selectedColor: Colors.primary };
    return byDay;
  }, [tasks, selected]);

  const dayTasks = tasks.filter((t) => t.deadline === selected);

  return (
    <>
      <Card style={{ paddingHorizontal: 6 }}>
        <Calendar
          current={selected}
          markingType="multi-dot"
          markedDates={marked}
          onDayPress={(day: { dateString: string }) => setSelected(day.dateString)}
          theme={{
            calendarBackground: Colors.surfaceLight,
            dayTextColor: Colors.textPrimary,
            textDisabledColor: Colors.textHint,
            todayTextColor: Colors.primary,
            arrowColor: Colors.primary,
            selectedDayBackgroundColor: Colors.primary,
            textDayFontFamily: Font.medium,
            textMonthFontFamily: Font.extrabold,
            textDayHeaderFontFamily: Font.semibold,
            monthTextColor: Colors.textPrimary,
            textSectionTitleColor: Colors.textSecondary,
          }}
        />
      </Card>
      <SectionHeader title={selected === todayStr() ? 'Today' : formatLongDate(selected)} />
      {dayTasks.length === 0 ? (
        <EmptyCard text="Nothing due on this day." icon="calendar-clear-outline" />
      ) : (
        <View style={{ gap: 10 }}>
          {dayTasks.map((t) => (
            <TaskItem key={t.id} task={t} onPress={() => onOpen(t)} onToggle={() => onToggle(t)} />
          ))}
        </View>
      )}
    </>
  );
}
