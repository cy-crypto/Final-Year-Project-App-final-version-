import React, { useEffect } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';

import { BottomTabs } from './BottomTabs';
import type { RootStackParamList } from './types';
import { SplashScreen } from '../screens/SplashScreen';
import { AddTaskScreen } from '../screens/AddTaskScreen';
import { AddHabitScreen } from '../screens/AddHabitScreen';
import { AllHabitsScreen } from '../screens/AllHabitsScreen';
import { HabitAnalyticsScreen } from '../screens/HabitAnalyticsScreen';
import { AllTasksScreen } from '../screens/AllTasksScreen';
import { TaskAnalyticsScreen } from '../screens/TaskAnalyticsScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
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
import { MedicationHistoryScreen } from '../screens/MedicationHistoryScreen';
import { AllMedicationsScreen } from '../screens/AllMedicationsScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { BudgetScreen } from '../screens/BudgetScreen';
import { AddTransactionScreen } from '../screens/AddTransactionScreen';
import { BudgetSettingsScreen } from '../screens/BudgetSettingsScreen';
import { FitnessScreen } from '../screens/FitnessScreen';
import { LogFitnessScreen } from '../screens/LogFitnessScreen';
import { FitnessGoalsScreen } from '../screens/FitnessGoalsScreen';
import { FitnessProfileScreen } from '../screens/FitnessProfileScreen';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';

const Stack = createNativeStackNavigator<RootStackParamList>();

const appTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#f8fafc',
  },
};

export function AppNavigator() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { preloadDashboardData } = useAppContext();

  useEffect(() => {
    if (isAuthenticated) {
      preloadDashboardData();
    }
  }, [isAuthenticated, preloadDashboardData]);

  console.log('Navigator rendering, isAuthenticated:', isAuthenticated, 'user:', user);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#1d4ed8" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={appTheme}>
      <Stack.Navigator initialRouteName="Splash">
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
        <Stack.Screen name="AllHabits" component={AllHabitsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="HabitAnalytics" component={HabitAnalyticsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AllTasks" component={AllTasksScreen} options={{ headerShown: false }} />
        <Stack.Screen name="TaskAnalytics" component={TaskAnalyticsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="PrayerTime" component={PrayerTimeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Qibla" component={QiblaScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AdhanSettings" component={AdhanSettingsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Medication" component={MedicationScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AddMedication" component={AddMedicationScreen} options={{ headerShown: false }} />
        <Stack.Screen name="MedicationHistory" component={MedicationHistoryScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AllMedications" component={AllMedicationsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Reports" component={ReportsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="More" component={MoreScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Budget" component={BudgetScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AddTransaction" component={AddTransactionScreen} options={{ headerShown: false }} />
        <Stack.Screen name="BudgetSettings" component={BudgetSettingsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Fitness" component={FitnessScreen} options={{ headerShown: false }} />
        <Stack.Screen name="LogFitness" component={LogFitnessScreen} options={{ headerShown: false }} />
        <Stack.Screen name="FitnessGoals" component={FitnessGoalsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="FitnessProfile" component={FitnessProfileScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
