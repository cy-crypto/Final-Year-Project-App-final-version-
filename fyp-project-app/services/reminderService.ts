// Local reminders for Tasks, Medication, Prayer Times and Weather alerts.
// Every module owns an identifier prefix and only ever cancels its own notifications,
// so re-syncing one module never wipes the reminders of another (habits, subscriptions...).
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Notifications } from './notifications';
import type { Task } from './taskService';
import type { DoseSlot, Medication } from './medicationService';
import type { Preferences } from './authService';
import type { HabitDto } from './habitService';

const TASK_PREFIX = 'task-';
const DEADLINE_HOUR = 9;
const MED_PREFIX = 'med-';
const MED_FOLLOW_UP_PREFIX = 'medfu-';
const FOLLOW_UP_MINUTES = 10;
const DATED_DAYS_AHEAD = 3;

// Notification switches from the profile preferences; everything is on until the profile loads.
let prefs: Partial<Preferences> = {};

export function setReminderPreferences(next: Partial<Preferences> | null) {
  prefs = next ?? {};
}

export function remindersEnabled(
  key: 'notify_tasks' | 'notify_habits' | 'notify_medication' | 'notify_prayer' | 'notify_weather_alerts'
) {
  return prefs[key] !== false;
}

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

export async function cancelByPrefix(prefix: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(prefix))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
}

async function scheduleAt(identifier: string, date: Date, title: string, body: string, data?: Record<string, unknown>) {
  if (date.getTime() <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title, body, sound: 'default', data },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
}

export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') return true;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.status === 'granted';
  } catch {
    return false;
  }
}

export function parseLocalDate(value: string, hour = 0, minute = 0): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hour, minute, 0, 0);
}

/* ------------------------------------------------------------------ tasks */

/**
 * Re-creates reminders for all open tasks: one at the task's own reminder time (if set)
 * and one on the morning of the deadline.
 */
export async function syncTaskReminders(tasks: Task[]): Promise<void> {
  try {
    await cancelByPrefix(TASK_PREFIX);
    if (!remindersEnabled('notify_tasks')) return;
    for (const task of tasks) {
      if (task.done) continue;
      if (task.reminder_time) {
        await scheduleAt(
          `${TASK_PREFIX}${task.id}-reminder`,
          new Date(task.reminder_time),
          'Task reminder',
          `${task.title}${task.deadline ? ` · due ${formatShortDate(task.deadline)}` : ''}`,
          { module: 'tasks', taskId: task.id }
        );
      }
      if (task.deadline) {
        await scheduleAt(
          `${TASK_PREFIX}${task.id}-deadline`,
          parseLocalDate(task.deadline, DEADLINE_HOUR),
          'Task due today',
          `"${task.title}" is due today (${task.priority} priority).`,
          { module: 'tasks', taskId: task.id }
        );
      }
    }
  } catch (error) {
    console.warn('Failed to sync task reminders', error);
  }
}

/* ----------------------------------------------------------------- habits */

const HABIT_PREFIX = 'habit-';

/**
 * A repeating daily reminder at each habit's reminder time. Weekly habits whose target is already
 * met this week are skipped until the next sync.
 */
export async function syncHabitReminders(habits: HabitDto[]) {
  try {
    await cancelByPrefix(HABIT_PREFIX);
    if (!remindersEnabled('notify_habits')) return;
    for (const habit of habits) {
      if (!habit.reminderTime || habit.isArchived) continue;
      if (habit.frequency === 'Weekly' && habit.weekCount >= habit.targetPerWeek) continue;
      const [hour, minute] = habit.reminderTime.split(':').map(Number);
      await Notifications.scheduleNotificationAsync({
        identifier: `${HABIT_PREFIX}${habit.id}`,
        content: {
          title: habit.name,
          body: habit.streakCount > 0 ? `Keep your ${habit.streakCount}-day streak going.` : 'Time for your habit.',
          sound: 'default',
          data: { module: 'habits', habitId: habit.id },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
      });
    }
  } catch (error) {
    console.warn('Failed to sync habit reminders', error);
  }
}

/* ------------------------------------------------------------- medication */

function localDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isScheduledOn(med: Medication, day: Date) {
  const date = localDateStr(day);
  if (!med.is_active || med.frequency === 'as_needed' || med.schedule_times.length === 0) return false;
  if (med.start_date && date < med.start_date) return false;
  if (med.end_date && date > med.end_date) return false;
  if (med.frequency === 'weekly') return med.days_of_week.includes((day.getDay() + 6) % 7);
  return true;
}

/**
 * Dose reminders for every active medicine.
 *  - Plain daily/weekly schedules use one repeating notification per dose time.
 *  - Medicines with a start or end date get one-off notifications for the next few days instead,
 *    so they stop when the course ends.
 *  - Each dose still open today or tomorrow also gets a follow-up 10 minutes later
 *    ("Did you take it?"), cancelled as soon as the dose is logged.
 * `loggedToday` holds "medicationId@HH:MM" keys of doses already logged today.
 */
export async function syncMedicationReminders(meds: Medication[], loggedToday: Set<string> = new Set()) {
  try {
    await cancelByPrefix(MED_PREFIX);
    await cancelByPrefix(MED_FOLLOW_UP_PREFIX);
    if (!remindersEnabled('notify_medication')) return;
    const now = new Date();

    for (const med of meds) {
      if (!med.is_active || med.frequency === 'as_needed') continue;
      const title = `Time for ${med.name}`;
      const body = `${med.dosage}${med.instructions ? ` · ${med.instructions}` : ''}`;
      const dated = Boolean(med.start_date || med.end_date);

      for (const hhmm of med.schedule_times) {
        const [hour, minute] = hhmm.split(':').map(Number);

        if (!dated && med.frequency !== 'weekly') {
          await Notifications.scheduleNotificationAsync({
            identifier: `${MED_PREFIX}${med.id}-${hhmm}`,
            content: { title, body, sound: 'default', data: { module: 'medication', medicationId: med.id, time: hhmm } },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
          });
        } else if (!dated) {
          for (const day of med.days_of_week) {
            await Notifications.scheduleNotificationAsync({
              identifier: `${MED_PREFIX}${med.id}-${hhmm}-w${day}`,
              content: { title, body, sound: 'default', data: { module: 'medication', medicationId: med.id, time: hhmm } },
              // expo weekday: 1 = Sunday ... 7 = Saturday; ours: 0 = Monday ... 6 = Sunday.
              trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: ((day + 1) % 7) + 1, hour, minute },
            });
          }
        }

        for (let offset = 0; offset < (dated ? DATED_DAYS_AHEAD : 2); offset++) {
          const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour, minute);
          if (!isScheduledOn(med, day)) continue;
          const date = localDateStr(day);
          if (dated) {
            await scheduleAt(`${MED_PREFIX}${med.id}-${date}-${hhmm}`, day, title, body, { module: 'medication', medicationId: med.id });
          }
          if (offset === 0 && loggedToday.has(`${med.id}@${hhmm}`)) continue;
          if (offset < 2) {
            await scheduleAt(
              `${MED_FOLLOW_UP_PREFIX}${med.id}-${date}-${hhmm}`,
              new Date(day.getTime() + FOLLOW_UP_MINUTES * 60000),
              `Did you take ${med.name}?`,
              `Your ${hhmm} dose (${med.dosage}) is not marked as taken yet. Open the app to log it.`,
              { module: 'medication', medicationId: med.id }
            );
          }
        }
      }
    }
  } catch (error) {
    console.warn('Failed to sync medication reminders', error);
  }
}

/** Call after a dose is logged so its "did you take it?" follow-up does not fire. */
export async function cancelDoseFollowUp(slot: Pick<DoseSlot, 'medication_id' | 'time'>, date = localDateStr(new Date())) {
  try {
    await Notifications.cancelScheduledNotificationAsync(`${MED_FOLLOW_UP_PREFIX}${slot.medication_id}-${date}-${slot.time}`);
  } catch {
    // nothing scheduled
  }
}

/** Immediate refill alert, at most once a day per medicine. */
export async function notifyRefills(meds: Medication[]) {
  if (!remindersEnabled('notify_medication')) return;
  const today = localDateStr(new Date());
  for (const med of meds) {
    if (!med.needs_refill) continue;
    const key = `med.refillAlert.${med.id}`;
    try {
      if ((await AsyncStorage.getItem(key)) === today) continue;
      await AsyncStorage.setItem(key, today);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Refill ${med.name} soon`,
          body:
            med.supply_count <= 0
              ? `You are out of ${med.name}.`
              : `Only ${med.supply_count} left${med.days_of_supply_left !== null ? ` (about ${med.days_of_supply_left} day${med.days_of_supply_left === 1 ? '' : 's'})` : ''}.`,
          data: { module: 'medication', medicationId: med.id },
        },
        trigger: null,
      });
    } catch (error) {
      console.warn('Failed to send refill alert', error);
    }
  }
}

/* ---------------------------------------------------------------- prayer */

const PRAYER_PREFIX = 'prayer-';

/**
 * One alert per prayer for the days returned by the server (times change daily, so these are
 * exact one-off notifications rather than a repeating daily time). Re-run whenever the times load.
 */
export async function syncPrayerReminders(
  days: { date: string; times: Record<string, string> }[],
  enabled: Record<string, boolean>,
  place: string
) {
  try {
    await cancelByPrefix(PRAYER_PREFIX);
    if (!remindersEnabled('notify_prayer')) return;
    for (const day of days.slice(0, 3)) {
      for (const name of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
        if (enabled[name] === false || !day.times[name]) continue;
        await scheduleAt(
          `${PRAYER_PREFIX}${day.date}-${name}`,
          parseLocalDate(day.date, ...(day.times[name].split(':').map(Number) as [number, number])),
          `Time for ${name}`,
          `It is time for ${name} prayer${place ? ` in ${place}` : ''}.`,
          { module: 'prayer', prayer: name }
        );
      }
    }
  } catch (error) {
    console.warn('Failed to sync prayer reminders', error);
  }
}

/* --------------------------------------------------------------- weather */

const WEATHER_ALERT_KEY = 'weather.lastAlert';

/** Immediate severe-weather notification, once per alert per day. */
export async function notifyWeatherAlert(id: string, title: string, body: string) {
  if (!remindersEnabled('notify_weather_alerts')) return;
  const stamp = `${localDateStr(new Date())}:${id}`;
  try {
    const sent = JSON.parse((await AsyncStorage.getItem(WEATHER_ALERT_KEY)) ?? '[]') as string[];
    if (sent.includes(stamp)) return;
    await AsyncStorage.setItem(WEATHER_ALERT_KEY, JSON.stringify([...sent.slice(-20), stamp]));
    await Notifications.scheduleNotificationAsync({ content: { title, body, data: { module: 'weather' } }, trigger: null });
  } catch (error) {
    console.warn('Failed to send weather alert', error);
  }
}

export function formatShortDate(value: string) {
  return parseLocalDate(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
