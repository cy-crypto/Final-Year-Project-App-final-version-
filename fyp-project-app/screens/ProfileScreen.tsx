import React, { useEffect, useState, useMemo } from 'react';
import { 
  Alert, 
  Image, 
  Pressable, 
  ScrollView, 
  StyleSheet, 
  Text, 
  View, 
  RefreshControl,
  Switch,
  Platform,
  SafeAreaView 
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, MainTabParamList } from '../navigation/types';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';

import { Colors, Fonts } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import { requestNotificationPermissions } from '../services/notificationService';
import Constants from 'expo-constants';

type ProfileScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface ModuleStats {
  tasksActive: number;
  tasksDueToday: number;
  habitsDaily: number;
  habitNames: string[];
  medicationsCount: number;
  nextMedTime: string;
  firstMedName: string;
}

export function ProfileScreen() {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const { user, logout } = useAuth();
  const { tasks, habits, fetchTasks, fetchHabits } = useAppContext();
  
  const [refreshing, setRefreshing] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<boolean | null>(null);
  const [appVersion] = useState(Constants.expoConfig?.version || '1.0.0');
  const [moduleStats, setModuleStats] = useState<ModuleStats>({
    tasksActive: 0,
    tasksDueToday: 0,
    habitsDaily: 0,
    habitNames: [],
    medicationsCount: 0,
    nextMedTime: '',
    firstMedName: '',
  });

  // Calculate user statistics
  const userStats = useMemo(() => {
    if (!user) return { daysSinceJoin: 0, weeksSinceJoin: 0, memberSince: '' };
    
    const createdAt = new Date('2024-01-01'); // TODO: Use actual user.createdAt when available
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - createdAt.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const weeksSinceJoin = Math.floor(diffDays / 7);
    
    return {
      daysSinceJoin: diffDays,
      weeksSinceJoin,
      memberSince: createdAt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    };
  }, [user]);

  // Calculate habit and prayer completions (lifetime totals)
  const lifetimeStats = useMemo(() => {
    // TODO: Connect to actual habit completion tracking
    const totalHabitCompletions = habits.reduce((sum, habit) => sum + (habit.streakCount || 0), 0);
    // TODO: Connect to actual prayer completion tracking
    const totalPrayerCompletions = 0;
    
    return {
      totalHabitCompletions,
      totalPrayerCompletions,
      totalWins: totalHabitCompletions + totalPrayerCompletions
    };
  }, [habits]);

  // Check notification permissions on mount
  useEffect(() => {
    const checkNotificationPermissions = async () => {
      try {
        const status = await Notifications.getPermissionsAsync();
        setNotificationPermission(status.status === 'granted');
        setNotificationsEnabled(status.status === 'granted');
      } catch (error) {
        console.warn('Failed to check notification permissions:', error);
        setNotificationPermission(false);
      }
    };
    
    checkNotificationPermissions();
  }, []);

  // Calculate module statistics
  useEffect(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    const activeTasks = tasks.filter(task => task.status !== 'done');
    const dueTodayTasks = tasks.filter(task => {
      if (!task.deadline) return false;
      const deadline = new Date(task.deadline);
      return deadline <= today && deadline >= new Date(today.getFullYear(), today.getMonth(), today.getDate());
    });
    
    const dailyHabits = habits.filter(habit => habit.frequency === 'daily' as any);
    const habitNames = dailyHabits.slice(0, 3).map(h => h.name);
    
    setModuleStats({
      tasksActive: activeTasks.length,
      tasksDueToday: dueTodayTasks.length,
      habitsDaily: dailyHabits.length,
      habitNames,
      medicationsCount: 0, // TODO: Connect to medication store
      nextMedTime: '', // TODO: Calculate next medication time
      firstMedName: '', // TODO: Get first medication name
    });
  }, [tasks, habits]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchTasks(true), fetchHabits(true)]);
    } catch (error) {
      console.warn('Failed to refresh data:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleNotificationToggle = async (value: boolean) => {
    if (value && !notificationPermission) {
      // Request permission when enabling
      const granted = await requestNotificationPermissions();
      if (!granted) {
        Alert.alert(
          'Notifications',
          'To enable notifications, please grant permission in your device settings.'
        );
        return;
      }
    }
    
    if (!value && notificationsEnabled) {
      Alert.alert(
        'Turn off notifications?',
        'This will stop all reminders for prayers, medication, and habits.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Turn off',
            style: 'destructive',
            onPress: () => setNotificationsEnabled(false),
          },
        ]
      );
    } else {
      setNotificationsEnabled(value);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            logout();
            navigation.navigate('Login' as any);
          },
        },
      ]
    );
  };

  const getUserInitial = () => {
    return user?.fullName?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U';
  };

  const getJourneyText = () => {
    const { weeksSinceJoin, daysSinceJoin } = userStats;
    const { totalWins } = lifetimeStats;
    
    if (daysSinceJoin < 7) {
      return `Fresh start — ${daysSinceJoin} days in. Welcome.`;
    }
    
    if (totalWins === 0) {
      return `${weeksSinceJoin} weeks with you. Ready when you are.`;
    }
    
    return `${weeksSinceJoin} weeks with you, and ${totalWins} small wins. Steady as ever.`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Pressable 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.topBarTitle}>Profile</Text>
        <View style={styles.topBarSpacer} />
      </View>

      {/* Hero Card */}
      <View style={styles.heroCard}>
        <View style={styles.heroRow}>
          <View style={styles.avatarContainer}>
            {user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>{getUserInitial()}</Text>
              </View>
            )}
            <Pressable 
              style={styles.cameraButton}
              onPress={() => navigation.navigate('EditProfile')}
            >
              <Ionicons name="camera" size={16} color={Colors.white} />
            </Pressable>
          </View>
          <View style={styles.identityContainer}>
            <Text style={styles.userName}>{user?.fullName || 'User'}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
            <View style={styles.pill}>
              <Text style={styles.pillText}>Companion since {userStats.memberSince}</Text>
            </View>
          </View>
        </View>
        <Pressable 
          style={styles.editProfileButton}
          onPress={() => navigation.navigate('EditProfile')}
        >
          <Text style={styles.editProfileText}>Edit Profile</Text>
        </Pressable>
      </View>

      {/* Your Gentle Journey Card */}
      <View style={styles.journeyCard}>
        <Text style={styles.journeyLabel}>YOUR GENTLE JOURNEY</Text>
        <Text style={styles.journeyText}>{getJourneyText()}</Text>
        <View style={styles.statsTiles}>
          <View style={styles.statTile}>
            <Text style={styles.statTileValue}>{userStats.daysSinceJoin}</Text>
            <Text style={styles.statTileLabel}>Days</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statTileValue}>{lifetimeStats.totalHabitCompletions}</Text>
            <Text style={styles.statTileLabel}>Habits</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statTileValue}>{lifetimeStats.totalPrayerCompletions}</Text>
            <Text style={styles.statTileLabel}>Prayers</Text>
          </View>
        </View>
      </View>

      {/* Preferences Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <Text style={styles.sectionHint}>Tap to change</Text>
        </View>
        <View style={styles.card}>
          <Pressable 
            style={styles.row}
            onPress={() => {
              // TODO: navigate to PrayerSettingsScreen
              console.log('Navigate to Prayer Settings');
            }}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="time-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.rowLabel} numberOfLines={1} ellipsizeMode="tail">Prayer calculation</Text>
            <Text style={styles.rowValue} numberOfLines={1} ellipsizeMode="tail">Karachi · Hanafi madhab</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textHint} />
          </Pressable>
          
          <Pressable 
            style={styles.row}
            onPress={() => {
              // TODO: navigate to LocationSettingsScreen
              console.log('Navigate to Location Settings');
            }}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="location-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.rowLabel} numberOfLines={1} ellipsizeMode="tail">Location</Text>
            <Text style={styles.rowValue} numberOfLines={1} ellipsizeMode="tail">{user?.selectedCity || 'Not set'}, Pakistan</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textHint} />
          </Pressable>
          
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="notifications-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.rowLabel} numberOfLines={1} ellipsizeMode="tail">Notifications</Text>
            <Text style={styles.rowValue} numberOfLines={1} ellipsizeMode="tail">Prayers, medication, habits</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleNotificationToggle}
              trackColor={{ false: Colors.borderLight, true: Colors.primaryLight }}
              thumbColor={notificationsEnabled ? Colors.primary : Colors.textHint}
            />
          </View>
          
          <Pressable 
            style={styles.row}
            onPress={() => {
              // TODO: navigate to ThemePickerScreen
              console.log('Navigate to Theme Picker');
            }}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="color-palette-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.rowLabel} numberOfLines={1} ellipsizeMode="tail">Appearance</Text>
            <Text style={styles.rowValue} numberOfLines={1} ellipsizeMode="tail">Soft sage · Light</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textHint} />
          </Pressable>
          
          <Pressable 
            style={styles.row}
            onPress={() => {
              // TODO: navigate to LanguagePickerScreen
              console.log('Navigate to Language Picker');
            }}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="language-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.rowLabel} numberOfLines={1} ellipsizeMode="tail">Language</Text>
            <Text style={styles.rowValue} numberOfLines={1} ellipsizeMode="tail">English · اردو available</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textHint} />
          </Pressable>
        </View>
      </View>

      {/* Your Modules Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your modules</Text>
          <Text style={styles.sectionHint}>Active</Text>
        </View>
        <View style={styles.card}>
          <Pressable 
            style={styles.row}
            onPress={() => navigation.navigate('Tasks' as any)}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="checkbox-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.rowLabel}>Tasks</Text>
            <Text style={styles.rowValue}>
              {moduleStats.tasksActive} active · {moduleStats.tasksDueToday} due today
            </Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textHint} />
          </Pressable>
          
          <Pressable 
            style={styles.row}
            onPress={() => navigation.navigate('Habits' as any)}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="repeat-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.rowLabel}>Habits</Text>
            <Text style={styles.rowValue}>
              {moduleStats.habitsDaily} daily · {moduleStats.habitNames.join(', ')}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textHint} />
          </Pressable>
          
          <Pressable 
            style={styles.row}
            onPress={() => navigation.navigate('Medication' as any)}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="medical-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.rowLabel}>Medication</Text>
            <Text style={styles.rowValue}>
              {moduleStats.medicationsCount > 0 
                ? `${moduleStats.firstMedName} · daily at ${moduleStats.nextMedTime}`
                : 'No medications'
              }
            </Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textHint} />
          </Pressable>
          
          <Pressable 
            style={styles.row}
            onPress={() => navigation.navigate('Weather' as any)}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="partly-sunny-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.rowLabel}>Weather</Text>
            <Text style={styles.rowValue}>Auto-location · °C</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textHint} />
          </Pressable>
        </View>
      </View>

      {/* Account Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <Pressable 
            style={styles.row}
            onPress={() => {
              // TODO: navigate to ChangeEmailScreen
              console.log('Navigate to Change Email');
            }}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="mail-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.rowLabel}>Email</Text>
            <Text style={styles.rowValue}>{user?.email}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textHint} />
          </Pressable>
          
          <Pressable 
            style={styles.row}
            onPress={() => {
              // TODO: navigate to ChangePasswordScreen
              console.log('Navigate to Change Password');
            }}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.rowLabel}>Change password</Text>
            <Text style={styles.rowValue}>Last changed at signup</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textHint} />
          </Pressable>
          
          <Pressable 
            style={styles.row}
            onPress={() => {
              // TODO: navigate to PrivacyScreen
              console.log('Navigate to Privacy & Data');
            }}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="shield-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.rowLabel}>Privacy & data</Text>
            <Text style={styles.rowValue}>Export, delete, control</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textHint} />
          </Pressable>
          
          <Pressable 
            style={styles.row}
            onPress={() => {
              // TODO: navigate to AboutScreen
              console.log('Navigate to About & Help');
            }}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="help-circle-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.rowLabel}>About & help</Text>
            <Text style={styles.rowValue}>Version {appVersion} · Send feedback</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textHint} />
          </Pressable>
        </View>
      </View>

      {/* Sign Out */}
      <View style={styles.signOutContainer}>
        <Pressable style={styles.signOutButton} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color={Colors.warning} />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>

      {/* App Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerTitle}>Companion</Text>
        <Text style={styles.footerSubtitle}>made with care · v{appVersion}</Text>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgLight,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 100,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontFamily: Fonts.serif,
  },
  topBarSpacer: {
    width: 40,
  },
  heroCard: {
    backgroundColor: Colors.primary,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarContainer: {
    marginRight: 16,
    position: 'relative',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1a3d2b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholder: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.white,
  },
  identityContainer: {
    flex: 1,
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: 4,
    fontFamily: Fonts.serif,
  },
  userEmail: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 8,
  },
  pill: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.white,
  },
  editProfileButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  editProfileText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  journeyCard: {
    backgroundColor: '#FFF8E7', // Warm cream/beige
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
  },
  journeyLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.accentAmber,
    marginBottom: 12,
    letterSpacing: 1,
  },
  journeyText: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 20,
    lineHeight: 28,
    fontFamily: Fonts.serif,
  },
  statsTiles: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderRadius: 12,
    padding: 16,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
  },
  statTileValue: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 4,
  },
  statTileLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontFamily: Fonts.serif,
  },
  sectionHint: {
    fontSize: 12,
    color: Colors.textHint,
    fontWeight: '600',
  },
  card: {
    backgroundColor: Colors.surfaceLight,
    marginHorizontal: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  rowLabel: {
    width: 110,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  rowValue: {
    flex: 1,
    fontSize: 14,
    color: Colors.textSecondary,
    marginRight: 8,
  },
  signOutContainer: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 16,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.warning,
    marginLeft: 8,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  footerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    fontFamily: Fonts.serif,
    fontStyle: 'italic',
  },
  footerSubtitle: {
    fontSize: 11,
    color: Colors.textHint,
    marginTop: 4,
  },
});
