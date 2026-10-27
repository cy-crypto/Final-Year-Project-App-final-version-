import React, { useEffect } from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';

import { BottomTabs } from './BottomTabs';
import type { RootStackParamList } from './types';
import { SplashScreen } from '../screens/SplashScreen';
import { AddTaskScreen } from '../screens/AddTaskScreen';
import { AddHabitScreen } from '../screens/AddHabitScreen';
import { HabitDetailScreen } from '../screens/HabitDetailScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { ConfirmCodeScreen } from '../screens/ConfirmCodeScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { PrayerTimeScreen } from '../screens/PrayerTimeScreen';
import { QiblaScreen } from '../screens/QiblaScreen';
import { AdhanSettingsScreen } from '../screens/AdhanSettingsScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { MedicationScreen } from '../screens/MedicationScreen';
import { AddMedicationScreen } from '../screens/AddMedicationScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { BudgetScreen } from '../screens/BudgetScreen';
import { TransactionsScreen } from '../screens/TransactionsScreen';
import { SubscriptionsScreen } from '../screens/SubscriptionsScreen';
import { AddTransactionScreen } from '../screens/AddTransactionScreen';
import { BudgetSettingsScreen } from '../screens/BudgetSettingsScreen';
import { FitnessScreen } from '../screens/FitnessScreen';
import { LogFitnessScreen } from '../screens/LogFitnessScreen';
import { FitnessGoalsScreen } from '../screens/FitnessGoalsScreen';
import { SleepTrackingScreen } from '../screens/SleepTrackingScreen';
import { FitnessProfileScreen } from '../screens/FitnessProfileScreen';
import { AssistantScreen } from '../screens/AssistantScreen';
import { CommunityScreen } from '../screens/CommunityScreen';
import { ComposePostScreen } from '../screens/ComposePostScreen';
import { PostDetailScreen } from '../screens/PostDetailScreen';
import { CreateChallengeScreen } from '../screens/CreateChallengeScreen';
import { ChallengeDetailScreen } from '../screens/ChallengeDetailScreen';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import { Colors } from '../constants/theme';
import { isDarkMode } from '../constants/appearance';

const Stack = createNativeStackNavigator<RootStackParamList>();

const baseTheme = isDarkMode() ? DarkTheme : DefaultTheme;
const appTheme = {
  ...baseTheme,
  colors: {
    ...baseTheme.colors,
    primary: Colors.primary,
    background: Colors.bgLight,
    card: Colors.surfaceLight,
    text: Colors.textPrimary,
    border: Colors.borderLight,
  },
};

export function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const { preloadDashboardData } = useAppContext();

  useEffect(() => {
    if (isAuthenticated) {
      preloadDashboardData();
    }
  }, [isAuthenticated, preloadDashboardData]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#FF6B2C" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={appTheme}>
      {/* Already signed in (restored session): open the app directly. Otherwise start with the splash. */}
      <Stack.Navigator initialRouteName={isAuthenticated ? 'MainTabs' : 'Splash'}>
        <Stack.Screen 
          name="Splash" 
          component={SplashScreen} 
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="Onboarding" 
          component={OnboardingScreen} 
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="Login" 
          component={LoginScreen} 
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="Signup" 
          component={SignupScreen} 
          options={{ title: 'Create Account' }} 
        />
        <Stack.Screen 
          name="ConfirmCode" 
          component={ConfirmCodeScreen} 
          options={{ title: 'Confirm' }} 
        />
        <Stack.Screen
          name="MainTabs"
          component={BottomTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="AddTask" component={AddTaskScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AddHabit" component={AddHabitScreen} options={{ headerShown: false }} />
        <Stack.Screen name="HabitDetail" component={HabitDetailScreen} options={{ headerShown: false }} />
        <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ headerShown: false }} />
        <Stack.Screen name="PrayerTime" component={PrayerTimeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Qibla" component={QiblaScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AdhanSettings" component={AdhanSettingsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Medication" component={MedicationScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AddMedication" component={AddMedicationScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Reports" component={ReportsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="More" component={MoreScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Budget" component={BudgetScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Subscriptions" component={SubscriptionsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Transactions" component={TransactionsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AddTransaction" component={AddTransactionScreen} options={{ headerShown: false }} />
        <Stack.Screen name="BudgetSettings" component={BudgetSettingsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Fitness" component={FitnessScreen} options={{ headerShown: false }} />
        <Stack.Screen name="LogFitness" component={LogFitnessScreen} options={{ headerShown: false }} />
        <Stack.Screen name="FitnessGoals" component={FitnessGoalsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="SleepTracking" component={SleepTrackingScreen} options={{ headerShown: false }} />
        <Stack.Screen name="FitnessProfile" component={FitnessProfileScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Assistant" component={AssistantScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Community" component={CommunityScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ComposePost" component={ComposePostScreen} options={{ headerShown: false }} />
        <Stack.Screen name="PostDetail" component={PostDetailScreen} options={{ headerShown: false }} />
        <Stack.Screen name="CreateChallenge" component={CreateChallengeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ChallengeDetail" component={ChallengeDetailScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
