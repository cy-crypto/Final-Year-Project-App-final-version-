import React, { useCallback, useRef, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View } from 'react-native';

import { Colors } from '../constants/theme';
import { SideDrawer, type DrawerItem } from '../components/SideDrawer';

import type { MainTabParamList } from './types';
import { HomeScreen } from '../screens/HomeScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { HabitsScreen } from '../screens/HabitsScreen';
import { WeatherScreen } from '../screens/WeatherScreen';
import { BudgetScreen } from '../screens/BudgetScreen';
import { MedicationScreen } from '../screens/MedicationScreen';
import { FitnessScreen } from '../screens/FitnessScreen';
import { PrayerTimeScreen } from '../screens/PrayerTimeScreen';
import { CommunityScreen } from '../screens/CommunityScreen';
import { ProfileScreen } from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

type TabKey = keyof MainTabParamList;

const tabIconMap: Partial<Record<TabKey, keyof typeof Ionicons.glyphMap>> = {
  Dashboard: 'home-outline',
  Budget: 'wallet-outline',
  Medication: 'medkit-outline',
  Fitness: 'pulse-outline',
  More: 'menu-outline',
};

const tabIconActiveMap: Partial<Record<TabKey, keyof typeof Ionicons.glyphMap>> = {
  Dashboard: 'home',
  Budget: 'wallet',
  Medication: 'medkit',
  Fitness: 'pulse',
  More: 'menu',
};

/** Pages that live in the side drawer (they are hidden tabs, so the tab bar and assistant stay on them). */
const DRAWER_PAGES: { key: TabKey; title: string; description: string }[] = [
  { key: 'Tasks', title: 'Tasks', description: 'Plan it, track it, finish it' },
  { key: 'Habits', title: 'Habits', description: 'Small steps, every day' },
  { key: 'Weather', title: 'Weather', description: 'Forecast, air quality & UV' },
  { key: 'PrayerTime', title: 'Prayer Times', description: 'Daily prayers & Qibla direction' },
  { key: 'Community', title: 'Family', description: 'Private posts, challenges & leaderboard' },
  { key: 'Profile', title: 'Profile', description: 'Your account & settings' },
];
const DRAWER_KEYS = DRAWER_PAGES.map((p) => p.key as string);

const hiddenTab = { tabBarItemStyle: { display: 'none' as const } };

type TabNav = { navigate: (name: never) => void };

const NullScreen = () => null;

export function BottomTabs() {
  const insets = useSafeAreaInsets();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<string>('Dashboard');
  const tabNav = useRef<TabNav | null>(null);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const drawerItems: DrawerItem[] = DRAWER_PAGES.map((page) => ({
    key: page.key,
    title: page.title,
    description: page.description,
    onPress: () => {
      setDrawerOpen(false);
      tabNav.current?.navigate(page.key as never);
    },
  }));

  return (
    <View style={{ flex: 1 }}>
    <Tab.Navigator
      // Back from any module (header arrow or Android back button) returns to the Dashboard.
      backBehavior="initialRoute"
      initialRouteName="Dashboard"
      screenListeners={({ route }) => ({
        focus: () => setCurrentRoute(route.name),
      })}
      screenOptions={({ route }) => ({
        headerShown: false,
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
          const key = route.name as TabKey;
          // "More" also lights up while one of the drawer pages is open.
          const active = key === 'More' ? focused || DRAWER_KEYS.includes(currentRoute) || drawerOpen : focused;
          const iconName = (active ? tabIconActiveMap[key] : tabIconMap[key]) ?? 'ellipse-outline';
          return (
            <View
              style={{
                width: 44,
                height: 28,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? Colors.tintOrange : 'transparent',
              }}>
              <Ionicons name={iconName} size={20} color={active ? Colors.primary : color} />
            </View>
          );
        },
      })}>
      <Tab.Screen name="Dashboard" component={HomeScreen} />
      <Tab.Screen name="Budget" component={BudgetScreen} />
      <Tab.Screen name="Medication" component={MedicationScreen} />
      <Tab.Screen name="Fitness" component={FitnessScreen} />
      <Tab.Screen
        name="More"
        component={NullScreen}
        listeners={({ navigation: tabNavigation }) => ({
          tabPress: (e) => {
            // "More" is a button, not a page: open the side drawer instead of switching tabs.
            e.preventDefault();
            tabNav.current = tabNavigation as unknown as TabNav;
            setDrawerOpen(true);
          },
        })}
      />

      {/* Drawer pages: not shown in the bar, opened from the side drawer or from other screens. */}
      <Tab.Screen name="Tasks" component={TasksScreen} options={hiddenTab} />
      <Tab.Screen name="Habits" component={HabitsScreen} options={hiddenTab} />
      <Tab.Screen name="Weather" component={WeatherScreen} options={hiddenTab} />
      <Tab.Screen name="PrayerTime" component={PrayerTimeScreen} options={hiddenTab} />
      <Tab.Screen name="Community" component={CommunityScreen} options={hiddenTab} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={hiddenTab} />
    </Tab.Navigator>

    <SideDrawer visible={drawerOpen} onClose={closeDrawer} items={drawerItems} activeKey={currentRoute} />
    </View>
  );
}
