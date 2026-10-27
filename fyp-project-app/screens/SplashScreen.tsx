import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { Colors, Font } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/types';

const MODULES: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'chat', label: 'Chatbot', icon: 'chatbubble-ellipses' },
  { key: 'fitness', label: 'Fitness', icon: 'barbell' },
  { key: 'medicine', label: 'Medicine', icon: 'medkit' },
  { key: 'budget', label: 'Budget', icon: 'wallet' },
  { key: 'dash', label: 'Dashboard', icon: 'grid' },
];

export function SplashScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { isAuthenticated } = useAuth();

  const logoScale = useRef(new Animated.Value(0.4)).current;
  const logoFade = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const textFade = useRef(new Animated.Value(0)).current;
  const textRise = useRef(new Animated.Value(16)).current;
  const chips = useRef(MODULES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(ring, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true })
    ).start();

    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoFade, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(textFade, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(textRise, { toValue: 0, duration: 450, useNativeDriver: true }),
      ]),
      Animated.stagger(
        90,
        chips.map((v) => Animated.spring(v, { toValue: 1, friction: 6, useNativeDriver: true }))
      ),
    ]).start();

    const timer = setTimeout(() => {
      // A restored Supabase session skips onboarding and login.
      navigation.reset({ index: 0, routes: [{ name: isAuthenticated ? 'MainTabs' : 'Onboarding' }] });
    }, 3200);
    return () => clearTimeout(timer);
  }, [navigation, isAuthenticated, ring, logoFade, logoScale, textFade, textRise, chips]);

  const ringStyle = {
    opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
    transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] }) }],
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.blob, styles.blobTop]} />
      <View style={[styles.blob, styles.blobBottom]} />

      <View style={styles.center}>
        <View style={styles.logoWrap}>
          <Animated.View style={[styles.pulseRing, ringStyle]} />
          <Animated.View style={[styles.logoTile, { opacity: logoFade, transform: [{ scale: logoScale }] }]}>
            <MaterialCommunityIcons name="leaf" size={70} color={Colors.primary} />
          </Animated.View>
        </View>

        <Animated.View style={{ opacity: textFade, transform: [{ translateY: textRise }], alignItems: 'center' }}>
          <Text style={styles.title}>Personal{'\n'}Companion</Text>
          <Text style={styles.tagline}>Your health, money & day — in one place</Text>
        </Animated.View>
      </View>

      <View style={styles.modules}>
        {MODULES.map((m, i) => (
          <Animated.View
            key={m.key}
            style={[
              styles.module,
              {
                opacity: chips[i],
                transform: [
                  { translateY: chips[i].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
                  { scale: chips[i] },
                ],
              },
            ]}
          >
            <View style={styles.moduleIcon}>
              <Ionicons name={m.icon} size={22} color={Colors.primary} />
            </View>
            <Text style={styles.moduleLabel}>{m.label}</Text>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, overflow: 'hidden' },
  blob: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)' },
  blobTop: { width: 340, height: 340, top: -120, right: -120 },
  blobBottom: { width: 300, height: 300, bottom: -110, left: -110 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  logoWrap: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center', marginBottom: 36 },
  pulseRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 40,
    backgroundColor: Colors.white,
  },
  logoTile: {
    width: 140,
    height: 140,
    borderRadius: 40,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7C2D12',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  title: {
    fontFamily: Font.extrabold,
    fontSize: 42,
    lineHeight: 48,
    color: Colors.white,
    textAlign: 'center',
    letterSpacing: -1,
  },
  tagline: {
    fontFamily: Font.medium,
    fontSize: 17,
    lineHeight: 24,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    marginTop: 12,
    maxWidth: 280,
  },

  modules: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingHorizontal: 8,
    paddingBottom: 52,
  },
  module: { alignItems: 'center', gap: 8, width: 66 },
  moduleIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleLabel: { fontFamily: Font.semibold, fontSize: 12, color: 'rgba(255,255,255,0.95)' },
});
