import type { TransactionDto } from '../services/budgetService';

export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  Login: undefined;
  Signup: undefined;
  ConfirmCode: { email?: string };
  MainTabs: undefined;
  AddTask: undefined;
  AddHabit: undefined;
  AllHabits: undefined;
  HabitAnalytics: undefined;
  AllTasks: undefined;
  TaskAnalytics: undefined;
  Calendar: undefined;
  Reports: undefined;
  TaskDetail: { taskId: string };
  PrayerTime: undefined;
  Qibla: undefined;
  AdhanSettings: undefined;
  Profile: undefined;
  Medication: undefined;
  AddMedication: undefined;
  MedicationHistory: undefined;
  AllMedications: undefined;
  More: undefined;
  EditProfile: undefined;
  Budget: undefined;
  AddTransaction: { transaction?: TransactionDto } | undefined;
  BudgetSettings: undefined;
  Fitness: undefined;
  LogFitness: undefined;
  FitnessGoals: undefined;
  FitnessProfile: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Tasks: undefined;
  Habits: undefined;
  Weather: undefined;
  More: undefined;
};
