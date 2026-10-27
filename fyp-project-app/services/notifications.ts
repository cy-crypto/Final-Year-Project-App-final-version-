import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

// Since SDK 53 expo-notifications throws at import time on Android in Expo Go
// (its token auto-registration calls addPushTokenListener). Only load the real module
// in development/production builds; in Expo Go on Android fall back to a no-op stub so the
// rest of the app keeps working. Use a development build to get real notifications.
const unsupportedInExpoGo = Platform.OS === 'android' && isRunningInExpoGo();

const denied = { status: 'denied', granted: false, canAskAgain: false, expires: 'never' };

const stub = {
  setNotificationHandler: () => {},
  getPermissionsAsync: async () => denied,
  requestPermissionsAsync: async () => denied,
  scheduleNotificationAsync: async () => '',
  cancelScheduledNotificationAsync: async () => {},
  cancelAllScheduledNotificationsAsync: async () => {},
  getAllScheduledNotificationsAsync: async () => [],
  SchedulableTriggerInputTypes: { CALENDAR: 'calendar', DAILY: 'daily' },
} as unknown as NotificationsModule;

function load(): NotificationsModule {
  if (unsupportedInExpoGo) {
    console.warn(
      'expo-notifications is disabled in Expo Go on Android (removed in SDK 53). Notifications are no-ops; use a development build.'
    );
    return stub;
  }
  try {
    return require('expo-notifications') as NotificationsModule;
  } catch (error) {
    console.warn('expo-notifications failed to load; notifications disabled:', error);
    return stub;
  }
}

export const Notifications = load();
export const notificationsSupported = Notifications !== stub;
