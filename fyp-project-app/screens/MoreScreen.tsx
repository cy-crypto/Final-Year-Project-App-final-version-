import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Colors } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';

type MoreScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function MoreScreen() {
  const navigation = useNavigation<MoreScreenNavigationProp>();

  const features = [
    {
      id: 'prayer',
      emoji: '🕌',
      title: 'Prayer Times',
      description: 'Daily prayer times & Qibla direction',
      screen: 'PrayerTime' as keyof RootStackParamList,
    },
    {
      id: 'medication',
      emoji: '💊',
      title: 'Medication',
      description: 'Track medications & reminders',
      screen: 'Medication' as keyof RootStackParamList,
    },
    {
      id: 'budget',
      emoji: '💰',
      title: 'Budget',
      description: 'Track income, expenses & spending',
      screen: 'Budget' as keyof RootStackParamList,
    },
    {
      id: 'fitness',
      emoji: '🏃',
      title: 'Fitness',
      description: 'Log steps, calories, sleep & goals',
      screen: 'Fitness' as keyof RootStackParamList,
    },
    {
      id: 'profile',
      emoji: '👤',
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
            <Text style={styles.emoji}>{feature.emoji}</Text>
            <Text style={styles.cardTitle}>{feature.title}</Text>
            <Text style={styles.cardDescription}>{feature.description}</Text>
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
    paddingBottom: 30,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 12,
  },
  card: {
    width: '47%',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  cardDisabled: {
    opacity: 0.6,
  },
  emoji: {
    fontSize: 32,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  cardDescription: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
});
