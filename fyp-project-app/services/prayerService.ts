import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, parseJsonData } from './api';
import { syncPrayerReminders } from './reminderService';

export const PRAYER_NAMES = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
export type PrayerName = (typeof PRAYER_NAMES)[number];

export type PrayerDay = {
  date: string;
  times: Record<PrayerName | 'Imsak' | 'Sunrise', string>;
  hijri: { day: number; month: number; month_name: string; month_name_ar: string; year: number; holidays: string[] };
  is_ramadan: boolean;
  timezone: string;
  method: string;
};

export type PrayerResponse = {
  location: { lat: number | null; lon: number | null; city: string | null };
  qibla: number | null;
  method: number;
  school: number;
  days: PrayerDay[];
  next_prayer: { name: PrayerName; time: string; date: string; minutes_left: number } | null;
};

export type PrayerPlace = { lat: number; lon: number; label: string } | { city: string; label: string };

const CACHE_KEY = 'prayer.lastResponse';
const PLACE_KEY = 'prayer.place';
const ALERTS_KEY = 'prayer.alerts';

/** Fetches prayer times and keeps the last answer so the screen still works offline (UC-05 AF-2). */
export async function getPrayerTimes(place: PrayerPlace, days = 7): Promise<{ data: PrayerResponse; offline: boolean }> {
  try {
    const params = 'city' in place ? { city: place.city, days } : { lat: place.lat, lon: place.lon, days };
    const response = await api.get('/api/prayer/times/', { params });
    const data = parseJsonData<PrayerResponse>(response.data);
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data)).catch(() => {});
    return { data, offline: false };
  } catch (error) {
    const cached = await AsyncStorage.getItem(CACHE_KEY).catch(() => null);
    if (cached) return { data: JSON.parse(cached) as PrayerResponse, offline: true };
    throw error;
  }
}

export async function loadSavedPlace(): Promise<PrayerPlace | null> {
  try {
    const raw = await AsyncStorage.getItem(PLACE_KEY);
    return raw ? (JSON.parse(raw) as PrayerPlace) : null;
  } catch {
    return null;
  }
}

export async function savePlace(place: PrayerPlace | null) {
  if (place) await AsyncStorage.setItem(PLACE_KEY, JSON.stringify(place));
  else await AsyncStorage.removeItem(PLACE_KEY);
}

export type PrayerAlerts = Record<PrayerName, boolean>;
const ALL_ON: PrayerAlerts = { Fajr: true, Dhuhr: true, Asr: true, Maghrib: true, Isha: true };

export async function loadPrayerAlerts(): Promise<PrayerAlerts> {
  try {
    const raw = await AsyncStorage.getItem(ALERTS_KEY);
    return raw ? { ...ALL_ON, ...JSON.parse(raw) } : ALL_ON;
  } catch {
    return ALL_ON;
  }
}

export async function savePrayerAlerts(alerts: PrayerAlerts) {
  await AsyncStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
}

/** Re-schedules prayer alerts from the last loaded times (used after changing alert settings). */
export async function resyncPrayerReminders() {
  const [cached, place, alerts] = await Promise.all([
    AsyncStorage.getItem(CACHE_KEY).catch(() => null),
    loadSavedPlace(),
    loadPrayerAlerts(),
  ]);
  if (!cached) return;
  const data = JSON.parse(cached) as PrayerResponse;
  await syncPrayerReminders(data.days, alerts, place?.label ?? data.location.city ?? '');
}

export function formatPrayerTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function atLocal(date: string, hhmm: string) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}
