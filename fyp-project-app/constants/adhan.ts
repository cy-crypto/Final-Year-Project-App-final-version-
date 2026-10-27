import AsyncStorage from '@react-native-async-storage/async-storage';

// Adhan recordings streamed from islamcan.com. Keys stay compatible with the old saved setting.
export const ADHAN_OPTIONS = [
  { id: 'adhan_makkah', label: 'Adhan 1', description: 'Classic recitation', url: 'https://www.islamcan.com/audio/adhan/azan1.mp3' },
  { id: 'adhan_madinah', label: 'Adhan 2', description: 'Slow, melodic recitation', url: 'https://www.islamcan.com/audio/adhan/azan2.mp3' },
  { id: 'adhan_aqsa', label: 'Adhan 3', description: 'Traditional recitation', url: 'https://www.islamcan.com/audio/adhan/azan3.mp3' },
  { id: 'adhan_egypt', label: 'Adhan 4', description: 'Egyptian style', url: 'https://www.islamcan.com/audio/adhan/azan4.mp3' },
  { id: 'default', label: 'Notification sound only', description: 'No Adhan audio, just the alert tone', url: null },
] as const;

export type AdhanId = (typeof ADHAN_OPTIONS)[number]['id'];

export const ADHAN_KEY = 'selected_adhan';
export const ADHAN_ENABLED_KEY = 'adhan_enabled';

export async function loadAdhanSettings(): Promise<{ id: AdhanId; enabled: boolean }> {
  try {
    const [id, enabled] = await Promise.all([AsyncStorage.getItem(ADHAN_KEY), AsyncStorage.getItem(ADHAN_ENABLED_KEY)]);
    const valid = ADHAN_OPTIONS.some((o) => o.id === id);
    return { id: (valid ? id : 'adhan_makkah') as AdhanId, enabled: enabled === 'true' };
  } catch {
    return { id: 'adhan_makkah', enabled: false };
  }
}

export function adhanUrl(id: AdhanId) {
  return ADHAN_OPTIONS.find((o) => o.id === id)?.url ?? null;
}
