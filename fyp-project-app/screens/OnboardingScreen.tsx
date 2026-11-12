import React, { useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  FlatList,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import { Colors, Font, Shadows } from '../constants/theme';
import {
  ChatbotIllustration,
  FitnessIllustration,
  MedicineIllustration,
  BudgetIllustration,
  DashboardIllustration,
} from '../components/OnboardingIllustrations';

interface Slide {
  key: string;
  title: string;
  description: string;
  Illustration: React.ComponentType;
}

// Clean, minimal onboarding: one illustration, a short title and one line of text per page.
const slides: Slide[] = [
  {
    key: 'dashboard',
    title: 'Your Day, Simplified',
    description: 'Tasks, habits, prayers and weather — all on one calm screen.',
    Illustration: DashboardIllustration,
  },
  {
    key: 'chatbot',
    title: 'Just Ask',
    description: 'Your assistant answers by text or voice, in your language.',
    Illustration: ChatbotIllustration,
  },
  {
    key: 'medicine',
    title: 'Never Miss a Dose',
    description: 'Gentle reminders for every medicine, right on time.',
    Illustration: MedicineIllustration,
  },
  {
    key: 'budget',
    title: 'Spend Smarter',
    description: 'See where your money goes and stay within your limits.',
    Illustration: BudgetIllustration,
  },
  {
    key: 'fitness',
    title: 'Live Healthier',
    description: 'Track steps, sleep and goals, and watch yourself grow.',
    Illustration: FitnessIllustration,
  },
];

export function OnboardingScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const listRef = useRef<FlatList<Slide>>(null);

  const isFirst = index === 0;
  const isLast = index === slides.length - 1;
  // Fit the 300×340 illustrations into the space above the text on any phone size.
  const artScale = Math.min((width - 64) / 300, (height * 0.42) / 340, 1);

  const finish = async () => {
    try {
      await AsyncStorage.setItem('onboarding_complete', 'true');
    } catch (error) {
      console.error('Failed to save onboarding status:', error);
    } finally {
      // Signed in already (restored session): straight into the app, otherwise to login.
      navigation.reset({ index: 0, routes: [{ name: isAuthenticated ? 'MainTabs' : 'Login' }] });
    }
  };

  const goTo = (next: number) => listRef.current?.scrollToOffset({ offset: next * width, animated: true });
  const handleNext = () => (isLast ? finish() : goTo(index + 1));

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Top bar: back + skip */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => goTo(index - 1)}
          disabled={isFirst}
          hitSlop={12}
          style={[styles.back, isFirst && { opacity: 0 }]}
          accessibilityLabel="Previous"
        >
          <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
        </Pressable>
        {!isLast ? (
          <Pressable onPress={finish} hitSlop={12}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        ) : null}
      </View>

      <Animated.FlatList
        ref={listRef as any}
        data={slides}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: false,
          listener: (e: any) =>
            setIndex(Math.min(slides.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / width)))),
        })}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item, index: i }) => {
          const range = [(i - 1) * width, i * width, (i + 1) * width];
          // The illustration drifts a little slower than the page and the text fades in.
          const artShift = scrollX.interpolate({ inputRange: range, outputRange: [width * 0.25, 0, -width * 0.25], extrapolate: 'clamp' });
          const textFade = scrollX.interpolate({ inputRange: range, outputRange: [0, 1, 0], extrapolate: 'clamp' });
          return (
            <View style={[styles.page, { width }]}>
              <View style={styles.artArea}>
                {/* Soft orange blob behind the illustration */}
                <View style={[styles.blob, { width: width * 0.82, height: width * 0.82, borderRadius: width * 0.41 }]} />
                <Animated.View style={{ transform: [{ translateX: artShift }, { scale: artScale }] }}>
                  <item.Illustration />
                </Animated.View>
              </View>
              <Animated.View style={[styles.textBlock, { opacity: textFade }]}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.description}>{item.description}</Text>
              </Animated.View>
            </View>
          );
        }}
      />

      {/* Bottom bar: dots + round next button */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
        <View style={styles.dots}>
          {slides.map((_, i) => {
            const range = [(i - 1) * width, i * width, (i + 1) * width];
            return (
              <Animated.View
                key={i}
                style={[
                  styles.dot,
                  {
                    width: scrollX.interpolate({ inputRange: range, outputRange: [8, 22, 8], extrapolate: 'clamp' }),
                    opacity: scrollX.interpolate({ inputRange: range, outputRange: [0.3, 1, 0.3], extrapolate: 'clamp' }),
                  },
                ]}
              />
            );
          })}
        </View>

        <Pressable
          style={({ pressed }) => [styles.next, pressed && { transform: [{ scale: 0.94 }] }]}
          onPress={handleNext}
          accessibilityLabel={isLast ? 'Get started' : 'Next'}
        >
          <Ionicons name={isLast ? 'checkmark' : 'chevron-forward'} size={28} color={Colors.white} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  back: { width: 36, height: 36, justifyContent: 'center' },
  skip: { fontFamily: Font.semibold, fontSize: 15, color: Colors.textSecondary },

  page: { flex: 1, alignItems: 'center', paddingHorizontal: 32 },
  artArea: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  blob: { position: 'absolute', backgroundColor: Colors.primarySurface },
  textBlock: { alignItems: 'center', paddingTop: 12, paddingBottom: 8, minHeight: 130 },
  title: {
    fontFamily: Font.extrabold,
    fontSize: 26,
    lineHeight: 32,
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  description: {
    fontFamily: Font.medium,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
    maxWidth: 290,
  },

  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 8,
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  next: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.button,
  },
});
