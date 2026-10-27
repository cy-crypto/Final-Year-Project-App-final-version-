import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Ionicons } from '@expo/vector-icons';

import { Colors, Radius, Shadows } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';

type MoreScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function MoreScreen() {
  const navigation = useNavigation<MoreScreenNavigationProp>();

  const features = [
    {
      id: 'prayer',
      icon: 'compass' as keyof typeof Ionicons.glyphMap,
      tint: Colors.tintOrange,
      color: Colors.primary,
      title: 'Prayer Times',
      description: 'Daily prayer times & Qibla direction',
      screen: 'PrayerTime' as keyof RootStackParamList,
    },
    {
      id: 'medication',
      icon: 'medkit' as keyof typeof Ionicons.glyphMap,
      tint: Colors.tintRose,
      color: Colors.accentRose,
      title: 'Medication',
      description: 'Track medications & reminders',
      screen: 'Medication' as keyof RootStackParamList,
    },
    {
      id: 'budget',
      icon: 'wallet' as keyof typeof Ionicons.glyphMap,
      tint: Colors.tintIndigo,
      color: Colors.accentBlue,
      title: 'Budget',
      description: 'Track income, expenses & spending',
      screen: 'Budget' as keyof RootStackParamList,
    },
    {
      id: 'fitness',
      icon: 'pulse' as keyof typeof Ionicons.glyphMap,
      tint: Colors.tintSky,
      color: Colors.accentTeal,
      title: 'Fitness',
      description: 'Log steps, calories, sleep & goals',
      screen: 'Fitness' as keyof RootStackParamList,
    },
    {
      id: 'community',
      icon: 'people' as keyof typeof Ionicons.glyphMap,
      tint: Colors.tintOrange,
      color: Colors.accentOlive,
      title: 'Community',
      description: 'Posts, streaks & challenges',
      screen: 'Community' as keyof RootStackParamList,
    },
    {
      id: 'profile',
      icon: 'person' as keyof typeof Ionicons.glyphMap,
      tint: Colors.tintAmber,
      color: Colors.accentAmber,
      title: 'Profile',
      description: 'Manage your account & settings',
      screen: 'Profile' as keyof RootStackParamList,
    },
  ];

  const handleFeaturePress = (screen: keyof RootStackParamList | null) => {
    if (screen === 'PrayerTime') {
      navigation.navigate('PrayerTime');
    } else if (screen === 'Medication') {
      navigation.navigate('Medication');
    } else if (screen === 'Budget') {
      navigation.navigate('Budget');
    } else if (screen === 'Fitness') {
      navigation.navigate('Fitness');
    } else if (screen === 'Profile') {
      navigation.navigate('Profile');
    } else if (screen === 'Community') {
      navigation.navigate('Community');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>More</Text>
        <Text style={styles.subtitle}>All features in one place.</Text>
      </View>

      <View style={styles.grid}>
        {features.map((feature) => (
          <Pressable
            key={feature.id}
            style={({ pressed }) => [
              styles.card,
              pressed && styles.cardPressed,
              !feature.screen && styles.cardDisabled,
            ]}
            onPress={() => handleFeaturePress(feature.screen)}
            disabled={!feature.screen}
          >
            <View style={[styles.iconTile, { backgroundColor: feature.tint }]}>
              <Ionicons name={feature.icon} size={22} color={feature.color} />
            </View>
            <Text style={styles.cardTitle}>{feature.title}</Text>
            <Text style={styles.cardDescription}>{feature.description}</Text>
            <View style={styles.cardFooter}>
              <Text style={[styles.cardOpen, { color: feature.color }]}>Open</Text>
              <Ionicons name="chevron-forward" size={14} color={feature.color} />
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgLight,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.6,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    rowGap: 12,
  },
  card: {
    width: '48.5%',
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 16,
    ...Shadows.card,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  cardDisabled: {
    opacity: 0.6,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 10,
  },
  cardOpen: {
    fontSize: 12,
    fontWeight: '800',
  },
});
