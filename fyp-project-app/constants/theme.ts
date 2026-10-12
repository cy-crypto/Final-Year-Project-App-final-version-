/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

export const Colors = {
  primary: '#1D9E75',        // Forest green — main CTA, active states, buttons
  primaryLight: '#5DCAA5',   // Lighter green — hover, highlights
  primarySurface: '#D4EDDA', // Soft green surface — card backgrounds, chips
  accentOlive: '#639922',    // Olive green — secondary accent
  accentAmber: '#BA7517',    // Amber — weather module, warm indicators
  accentBlue: '#185FA5',     // Blue — analytics, progress module
  accentTeal: '#0F6E56',     // Deep teal — darker green accent

  bgLight: '#F4FAF5',        // App background — light mode
  bgDark: '#0F1A14',         // App background — dark mode
  surfaceLight: '#FFFFFF',   // Card surface — light mode
  surfaceDark: '#162318',    // Card surface — dark mode
  borderLight: '#C8E6C9',    // Border — light mode
  borderDark: '#1B3A24',     // Border — dark mode

  textPrimary: '#1A2E1E',    // Main text — light mode
  textPrimaryDark: '#E8F5E9',// Main text — dark mode
  textSecondary: '#4A7C59',  // Muted text — light mode
  textSecondaryDark: '#5DAA7A', // Muted text — dark mode
  textHint: '#7DA888',       // Hint/placeholder text

  success: '#1D9E75',
  warning: '#BA7517',
  error: '#C0392B',
  white: '#FFFFFF',

  // Legacy theme structure for backward compatibility
  light: {
    text: '#1A2E1E',
    background: '#F4FAF5',
    tint: '#1D9E75',
    icon: '#4A7C59',
    tabIconDefault: '#7DA888',
    tabIconSelected: '#1D9E75',
  },
  dark: {
    text: '#E8F5E9',
    background: '#0F1A14',
    tint: '#5DCAA5',
    icon: '#5DAA7A',
    tabIconDefault: '#7DA888',
    tabIconSelected: '#5DCAA5',
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
