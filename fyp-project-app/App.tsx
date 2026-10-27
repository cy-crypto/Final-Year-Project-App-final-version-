import 'react-native-gesture-handler';

import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';

import { applyAppearance, isDarkMode, loadAppearance } from './constants/appearance';

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const [Root, setRoot] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    loadAppearance().then((settings) => {
      applyAppearance(settings);
      // Screens are loaded only now, so their styles are built with the saved theme and text size.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { AppRoot } = require('./AppRoot') as typeof import('./AppRoot');
      setRoot(() => AppRoot);
    });
  }, []);

  if ((!fontsLoaded && !fontError) || !Root) {
    return null;
  }

  return (
    <>
      <StatusBar style={isDarkMode() ? 'light' : 'dark'} />
      <Root />
    </>
  );
}
