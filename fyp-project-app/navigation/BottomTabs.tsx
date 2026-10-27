import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Colors } from '../constants/theme';

import type { MainTabParamList, RootStackParamList } from './types';
import { HomeScreen } from '../screens/HomeScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { HabitsScreen } from '../screens/HabitsScreen';
import { WeatherScreen } from '../screens/WeatherScreen';
import { MoreScreen } from '../screens/MoreScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

const tabIconMap: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
  Dashboard: 'home-outline',
  Tasks: 'checkbox-outline',
  Habits: 'flame-outline',
  Weather: 'partly-sunny-outline',
  More: 'grid-outline',
};

const tabIconActiveMap: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
  Dashboard: 'home',
  Tasks: 'checkbox',
  Habits: 'flame',
  Weather: 'partly-sunny',
  More: 'grid',
};

export function BottomTabs() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  
  return (
    <View style={{ flex: 1 }}>
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        headerStyle: {
          backgroundColor: Colors.bgLight,
        },
        headerShadowVisible: false,
        headerTitleStyle: {
          fontWeight: '800',
          fontSize: 18,
          color: Colors.textPrimary,
        },
        sceneStyle: {
          backgroundColor: Colors.bgLight,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textHint,
        tabBarStyle: {
          paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
          paddingTop: 8,
          height: 66 + (insets.bottom > 0 ? insets.bottom : 0),
          borderTopColor: Colors.borderSoft,
          borderTopWidth: 1,
          backgroundColor: Colors.surfaceLight,
          shadowColor: '#0F172A',
          shadowOpacity: 0.05,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -4 },
          elevation: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: 2,
        },
        tabBarIcon: ({ color, focused }) => {
          const key = route.name as keyof MainTabParamList;
          const iconName = (focused ? tabIconActiveMap[key] : tabIconMap[key]) ?? 'ellipse-outline';
          return (
            <View
              style={{
                width: 44,
                height: 28,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: focused ? Colors.tintOrange : 'transparent',
              }}>
              <Ionicons name={iconName} size={20} color={color} />
            </View>
          );
        },
      })}>
      <Tab.Screen name="Dashboard" component={HomeScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Tasks" component={TasksScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Habits" component={HabitsScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Weather" component={WeatherScreen} options={{ headerShown: false }} />
      <Tab.Screen name="More" component={MoreScreen} options={{ headerShown: false }} />
    </Tab.Navigator>
    <Pressable
      accessibilityLabel="Open assistant"
      onPress={() => navigation.navigate('Assistant')}
      style={{
        position: 'absolute',
        right: 16,
        bottom: 66 + (insets.bottom > 0 ? insets.bottom : 10) + 16,
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: Colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#0F172A',
        shadowOpacity: 0.2,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      }}>
      <Ionicons name="happy" size={28} color={Colors.white} />
    </Pressable>
    </View>
  );
}
