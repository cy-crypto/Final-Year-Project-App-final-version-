import { Notifications } from './notifications';
import { formatMoney } from '../utils/budgetFormat';
import { upcomingDueDates } from '../utils/subscriptions';
import type { SubscriptionDto } from './budgetService';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    return false;
  }
}

export async function scheduleHabitReminder(
  habitId: string,
  habitName: string,
  reminderTime: string
): Promise<boolean> {
  try {
    // Cancel any existing notification for this habit
    await cancelHabitReminder(habitId);

    // Parse reminder time (HH:MM format)
    const [hours, minutes] = reminderTime.split(':').map(Number);
    
    // Calculate reminder time (1 hour before the habit time)
    let reminderHour = hours - 1;
    let reminderMinute = minutes;
    
    // Handle hour overflow/underflow
    if (reminderHour < 0) {
      reminderHour = 23; // Previous day
    }

    // Get current date
    const now = new Date();
    const reminderDate = new Date();
    reminderDate.setHours(reminderHour, reminderMinute, 0, 0);
    
    // If reminder time has passed for today, schedule for tomorrow
    if (reminderDate <= now) {
      reminderDate.setDate(reminderDate.getDate() + 1);
    }

    // Schedule daily notification
    await Notifications.scheduleNotificationAsync({
      identifier: habitId,
      content: {
        title: 'Habit Reminder',
        body: `Time to prepare for: ${habitName}`,
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        hour: reminderHour,
        minute: reminderMinute,
        repeats: true,
      },
    });

    return true;
  } catch (error) {
    console.error('Error scheduling habit reminder:', error);
    return false;
  }
}

export async function cancelHabitReminder(habitId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(habitId);
  } catch (error) {
    console.error('Error cancelling habit reminder:', error);
  }
}

/** Immediate local notification for a category budget that is nearly used up or exceeded. */
export async function notifyBudgetAlert(title: string, body: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null,
    });
  } catch (error) {
    console.warn('Failed to show budget notification', error);
  }
}

const SUB_PREFIX = 'sub-';
const REMINDER_HOUR = 9;
const REMINDERS_PER_SUBSCRIPTION = 3;

/**
 * Re-creates the "due tomorrow" reminders for all active subscriptions.
 * Each one fires at 9:00 the day before a due date; the next few cycles are
 * scheduled so reminders keep coming even if the app is not opened for a while.
 */
export async function syncSubscriptionReminders(subscriptions: SubscriptionDto[], currency: string): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => n.identifier.startsWith(SUB_PREFIX))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );

    const now = new Date();
    for (const sub of subscriptions) {
      if (!sub.isActive) continue;
      const dueDates = upcomingDueDates(sub.nextDueDate, sub.frequency, REMINDERS_PER_SUBSCRIPTION);
      for (let i = 0; i < dueDates.length; i++) {
        const [y, m, d] = dueDates[i].split('-').map(Number);
        const remindAt = new Date(y, m - 1, d - 1, REMINDER_HOUR, 0, 0, 0);
        if (remindAt <= now) continue;

        await Notifications.scheduleNotificationAsync({
          identifier: `${SUB_PREFIX}${sub.id}-${i}`,
          content: {
            title: 'Payment due tomorrow',
            body: `${sub.name} \u00b7 ${currency} ${formatMoney(sub.amount)} is due tomorrow.`,
            sound: 'default',
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: remindAt },
        });
      }
    }
  } catch (error) {
    console.warn('Failed to sync subscription reminders', error);
  }
}
