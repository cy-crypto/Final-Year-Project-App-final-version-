import * as Notifications from 'expo-notifications';

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
