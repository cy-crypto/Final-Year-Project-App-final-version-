// App-wide appearance: light/dark theme and text size, saved on the device.
//
// Every screen builds its styles once with StyleSheet.create when its file is first loaded, so the
// appearance is applied before any screen is loaded (see App.tsx) and changing it reloads the app:
//  - the shared Colors palette is switched to dark values (covers styles that use Colors.*);
//  - StyleSheet.create is wrapped so font sizes are scaled and the light colours that screens
//    hard-code (#FFFFFF cards, #1F2937 text...) are swapped for their dark versions.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance, StyleSheet } from 'react-native';
import { reloadAppAsync } from 'expo';

import { Colors } from './theme';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type TextSizeChoice = 'small' | 'medium' | 'large';
export type AppearanceSettings = { theme: ThemeChoice; textSize: TextSizeChoice };

const STORAGE_KEY = 'app.appearance';
const DEFAULTS: AppearanceSettings = { theme: 'light', textSize: 'medium' };
export const TEXT_SCALE: Record<TextSizeChoice, number> = { small: 0.88, medium: 1, large: 1.15 };

const DARK = {
  bg: '#0F1117',
  surface: '#181B23',
  raised: '#20242E',
  border: '#2A2F3B',
  text: '#F1F5F9',
  textMuted: '#A3AEC2',
  textHint: '#6B778C',
  orange: '#3A2216',
  amber: '#33280F',
  sky: '#0F2A3A',
  indigo: '#22244A',
  rose: '#3A1820',
  green: '#0F3324',
};

let current: AppearanceSettings = DEFAULTS;
let dark = false;

export function getAppearance() {
  return current;
}

export function isDarkMode() {
  return dark;
}

export async function loadAppearance(): Promise<AppearanceSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

/** Saves the choice and restarts the JS app so every screen is rebuilt with it. */
export async function saveAppearance(next: AppearanceSettings) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  await reloadAppAsync('Appearance changed');
}

// Light colours used across the app (by Colors.* and as literals) and what they become in dark mode.
const BACKGROUNDS: Record<string, string> = {
  '#ffffff': DARK.surface, '#fff': DARK.surface, white: DARK.surface,
  '#f8fafc': DARK.bg, '#f9fafb': DARK.bg, '#fafafa': DARK.bg, '#f5f5f5': DARK.bg, '#f3f4f6': DARK.bg,
  '#f1f5f9': DARK.raised, '#e5e7eb': DARK.raised, '#e2e8f0': DARK.raised, '#f0f0f0': DARK.raised,
  '#fff3ed': DARK.orange, '#fff7ed': DARK.orange, '#ffedd5': DARK.orange,
  '#fffbeb': DARK.amber, '#fef3c7': DARK.amber,
  '#f0f9ff': DARK.sky, '#e0f2fe': DARK.sky,
  '#eef2ff': DARK.indigo, '#eff6ff': DARK.indigo, '#e0e7ff': DARK.indigo,
  '#fff1f2': DARK.rose, '#fef2f2': DARK.rose, '#fee2e2': DARK.rose, '#ffebee': DARK.rose,
  '#ecfdf5': DARK.green, '#f0fdf4': DARK.green, '#dcfce7': DARK.green, '#d1fae5': DARK.green,
};
const BORDERS: Record<string, string> = {
  '#e2e8f0': DARK.border, '#e5e7eb': DARK.border, '#f1f5f9': DARK.border, '#d1d5db': DARK.border,
  '#eeeeee': DARK.border, '#eee': DARK.border, '#e0e0e0': DARK.border, '#ddd': DARK.border, '#f3f4f6': DARK.border,
  '#ffffff': DARK.border, '#fff': DARK.border,
  '#fecdd3': '#5A2430', '#fde68a': '#4A3A12', '#a7f3d0': '#14513A',
};
const TEXT: Record<string, string> = {
  '#18181b': DARK.text, '#000': DARK.text, '#000000': DARK.text, '#111': DARK.text, '#111827': DARK.text,
  '#1f2937': DARK.text, '#0f172a': DARK.text, '#1e293b': DARK.text, '#334155': DARK.text, '#333': DARK.text,
  '#333333': DARK.text, '#222': DARK.text, black: DARK.text,
  '#374151': DARK.textMuted, '#4b5563': DARK.textMuted, '#475569': DARK.textMuted, '#64748b': DARK.textMuted,
  '#6b7280': DARK.textMuted, '#666': DARK.textMuted, '#666666': DARK.textMuted, '#555': DARK.textMuted,
  '#94a3b8': DARK.textHint, '#9ca3af': DARK.textHint, '#999': DARK.textHint, '#999999': DARK.textHint,
};
const BORDER_KEYS = ['borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor'];

function mapColor(table: Record<string, string>, value: unknown) {
  return typeof value === 'string' ? table[value.trim().toLowerCase()] ?? value : value;
}

function transformStyle(style: Record<string, any>, scale: number) {
  const out: Record<string, any> = { ...style };
  if (scale !== 1) {
    if (typeof out.fontSize === 'number') out.fontSize = Math.round(out.fontSize * scale * 2) / 2;
    if (typeof out.lineHeight === 'number') out.lineHeight = Math.round(out.lineHeight * scale);
  }
  if (dark) {
    if ('backgroundColor' in out) out.backgroundColor = mapColor(BACKGROUNDS, out.backgroundColor);
    if ('color' in out) out.color = mapColor(TEXT, out.color);
    for (const key of BORDER_KEYS) if (key in out) out[key] = mapColor(BORDERS, out[key]);
  }
  return out;
}

let patched = false;

export function applyAppearance(settings: AppearanceSettings) {
  current = settings;
  dark = settings.theme === 'dark' || (settings.theme === 'system' && Appearance.getColorScheme() === 'dark');
  const scale = TEXT_SCALE[settings.textSize] ?? 1;

  if (dark) {
    // Colors.white stays white: it is mostly text and icons on orange.
    Object.assign(Colors, {
      bgLight: DARK.bg,
      surfaceLight: DARK.surface,
      borderLight: DARK.border,
      borderSoft: DARK.border,
      primarySurface: DARK.orange,
      tintOrange: DARK.orange,
      tintAmber: DARK.amber,
      tintSky: DARK.sky,
      tintIndigo: DARK.indigo,
      tintRose: DARK.rose,
      tintSlate: DARK.raised,
      tintGreen: DARK.green,
      textPrimary: DARK.text,
      textSecondary: DARK.textMuted,
      textHint: DARK.textHint,
    });
    Object.assign(Colors.light, { text: DARK.text, background: DARK.bg, icon: DARK.textMuted });
  }

  if (!patched && (dark || scale !== 1)) {
    patched = true;
    const original = StyleSheet.create;
    (StyleSheet as any).create = (sheet: Record<string, any>) => {
      const next: Record<string, any> = {};
      for (const key of Object.keys(sheet)) {
        const value = sheet[key];
        next[key] = value && typeof value === 'object' && !Array.isArray(value) ? transformStyle(value, scale) : value;
      }
      return original(next);
    };
  }
}
