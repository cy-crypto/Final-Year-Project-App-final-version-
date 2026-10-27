import React, { useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  FlatList,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { RootStackParamList } from '../navigation/types';
import { Colors, Font, Radius, Shadows } from '../constants/theme';
import {
  ChatbotIllustration,
  FitnessIllustration,
  MedicineIllustration,
  BudgetIllustration,
  DashboardIllustration,
} from '../components/OnboardingIllustrations';

interface Slide {
  key: string;
  eyebrow: string;
  title: string;
  description: string;
  Illustration: React.ComponentType;
}

const slides: Slide[] = [
  {
    key: 'chatbot',
    eyebrow: 'AI CHATBOT',
    title: 'Ask. Get answers instantly.',
    description: 'Chat with your in-app assistant to check your budget, set reminders and get quick help — by text or voice.',
    Illustration: ChatbotIllustration,
  },
  {
    key: 'fitness',
    eyebrow: 'FITNESS',
    title: 'Move more, feel better',
    description: 'Track workouts, steps and calories, set goals and watch your progress grow every day.',
    Illustration: FitnessIllustration,
  },
  {
    key: 'medicine',
    eyebrow: 'MEDICINE',
    title: 'Never miss a dose',
    description: 'Schedule medications, get timely reminders and keep a clear history of what you have taken.',
    Illustration: MedicineIllustration,
  },
  {
    key: 'budget',
    eyebrow: 'BUDGET',
    title: 'Spend smarter, save more',
    description: 'Log income and expenses, set monthly limits and see exactly where your money goes.',
    Illustration: BudgetIllustration,
  },
  {
    key: 'dashboard',
    eyebrow: 'SMART DASHBOARD',
    title: 'Your whole day, one screen',
    description: 'Tasks, habits, prayer times, weather and more — everything that matters, at a glance.',
    Illustration: DashboardIllustration,
  },
];

export function OnboardingScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const listRef = useRef<FlatList<Slide>>(null);

  const isLast = currentIndex === slides.length - 1;

  const finish = async () => {
    try {
      await AsyncStorage.setItem('onboarding_complete', 'true');
    } catch (error) {
      console.error('Failed to save onboarding status:', error);
    } finally {
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
  };

  const handleNext = () => {
    if (isLast) {
      finish();
      return;
    }
    listRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Soft orange glow behind the illustrations */}
      <View style={styles.glow} />

      {/* Top bar: step counter + skip */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.step}>
          {currentIndex + 1}
          <Text style={styles.stepTotal}> / {slides.length}</Text>
        </Text>
        {!isLast && (
          <TouchableOpacity style={styles.skip} onPress={finish} hitSlop={10}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
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
            setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / width)),
        })}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.illustrationBox}>
              <item.Illustration />
            </View>
            <View style={styles.eyebrowPill}>
              <Text style={styles.eyebrowText}>{item.eyebrow}</Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>
          </View>
        )}
      />

      {/* Dots */}
      <View style={styles.dots}>
        {slides.map((_, i) => {
          const range = [(i - 1) * width, i * width, (i + 1) * width];
          return (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                {
                  width: scrollX.interpolate({
                    inputRange: range,
                    outputRange: [10, 28, 10],
                    extrapolate: 'clamp',
                  }),
                  opacity: scrollX.interpolate({
                    inputRange: range,
                    outputRange: [0.3, 1, 0.3],
                    extrapolate: 'clamp',
                  }),
                },
              ]}
            />
          );
        })}
      </View>

      {/* CTA */}
      <TouchableOpacity
        style={[styles.cta, { marginBottom: Math.max(insets.bottom, 16) + 12 }]}
        onPress={handleNext}
        activeOpacity={0.9}
      >
        <Text style={styles.ctaText}>{isLast ? 'Get Started' : 'Next'}</Text>
        <Ionicons name="arrow-forward" size={20} color={Colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  glow: {
    position: 'absolute',
    top: -120,
    alignSelf: 'center',
    width: 520,
    height: 520,
    borderRadius: 260,
    backgroundColor: Colors.primarySurface,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    height: 96,
  },
  step: { fontFamily: Font.extrabold, fontSize: 20, color: Colors.primary },
  stepTotal: { fontFamily: Font.semibold, fontSize: 16, color: Colors.textHint },
  skip: {
    backgroundColor: Colors.white,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    ...Shadows.card,
  },
  skipText: { fontFamily: Font.bold, fontSize: 15, color: Colors.primary },

  slide: { flex: 1, alignItems: 'center', paddingHorizontal: 28 },
  illustrationBox: { height: 350, justifyContent: 'center', alignItems: 'center' },
  eyebrowPill: {
    backgroundColor: Colors.primarySurface,
    borderRadius: Radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 14,
  },
  eyebrowText: { fontFamily: Font.extrabold, fontSize: 12, color: Colors.primary, letterSpacing: 1 },
  title: {
    fontFamily: Font.extrabold,
    fontSize: 26,
    lineHeight: 33,
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.6,
    marginTop: 12,
  },
  description: {
    fontFamily: Font.medium,
    fontSize: 15,
    lineHeight: 23,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
  },

  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginVertical: 20 },
  dot: { height: 10, borderRadius: 5, backgroundColor: Colors.primary, marginHorizontal: 4 },

  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.primary,
    marginHorizontal: 24,
    paddingVertical: 18,
    borderRadius: Radius.lg,
    ...Shadows.button,
  },
  ctaText: { fontFamily: Font.bold, fontSize: 19, color: Colors.white },
});
