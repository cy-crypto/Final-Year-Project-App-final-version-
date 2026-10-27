/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

export const Colors = {
  primary: '#FF6B2C',        // Sunset orange — main CTA, active states, buttons
  primaryLight: '#FF8A55',   // Lighter orange — hover, highlights
  primarySurface: '#FFF3ED', // Soft orange tint — card backgrounds, chips
  accentOlive: '#EA580C',    // Deep orange — secondary accent
  accentAmber: '#F59E0B',    // Amber — weather module, warm indicators
  accentBlue: '#6366F1',     // Indigo — analytics, progress module
  accentTeal: '#0EA5E9',     // Sky blue — fitness / profile accent

  bgLight: '#F8FAFC',        // App background — light mode
  bgDark: '#0F1117',         // App background — dark mode
  surfaceLight: '#FFFFFF',   // Card surface — light mode
  surfaceDark: '#181B23',    // Card surface — dark mode
  borderLight: '#E2E8F0',    // Border — light mode
  borderDark: '#262A36',     // Border — dark mode
  borderSoft: '#F1F5F9',     // Hairline card border — light mode

  // Pastel tints + solid accents used for module tiles (prototype style)
  tintOrange: '#FFF3ED',
  tintAmber: '#FFFBEB',
  tintSky: '#F0F9FF',
  tintIndigo: '#EEF2FF',
  tintRose: '#FFF1F2',
  tintSlate: '#F1F5F9',
  tintGreen: '#ECFDF5',
  accentRose: '#F43F5E',

  textPrimary: '#18181B',    // Main text — light mode
  textPrimaryDark: '#FFFFFF',// Main text — dark mode
  textSecondary: '#64748B',  // Muted text — light mode
  textSecondaryDark: '#94A3B8', // Muted text — dark mode
  textHint: '#94A3B8',       // Hint/placeholder text

  success: '#10B981',
  warning: '#F59E0B',
  error: '#F43F5E',
  white: '#FFFFFF',

  // Legacy theme structure for backward compatibility
  light: {
    text: '#18181B',
    background: '#F8FAFC',
    tint: '#FF6B2C',
    icon: '#64748B',
    tabIconDefault: '#94A3B8',
    tabIconSelected: '#FF6B2C',
  },
  dark: {
    text: '#FFFFFF',
    background: '#0F1117',
    tint: '#FF6B2C',
    icon: '#94A3B8',
    tabIconDefault: '#94A3B8',
    tabIconSelected: '#FF6B2C',
  },
};

export const Radius = {
  sm: 10,
  md: 14,   // buttons, inputs, chips
  lg: 20,   // cards
  xl: 24,   // hero cards
  pill: 999,
};

export const Shadows = {
  // Soft, wide shadow used on white cards
  card: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  // Orange glow under primary buttons
  button: {
    shadowColor: '#FF6B2C',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

/** Plus Jakarta Sans family names (loaded in App.tsx). Use instead of fontWeight. */
export const Font = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
};
