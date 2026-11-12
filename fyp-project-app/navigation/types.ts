import type { TransactionDto } from '../services/budgetService';

export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  Login: { email?: string } | undefined;
  Signup: undefined;
  ConfirmCode: { email?: string };
  MainTabs: undefined;
  AddTask: { taskId?: string } | undefined;
  AddHabit: { habitId?: string; preset?: string } | undefined;
  HabitDetail: { habitId: string };
  Reports: undefined;
  TaskDetail: { taskId: string };
  PrayerTime: undefined;
  Qibla: undefined;
  AdhanSettings: undefined;
  Profile: undefined;
  Medication: undefined;
  AddMedication: { medicationId?: number } | undefined;
  More: undefined;
  EditProfile: undefined;
  Budget: undefined;
  Transactions:
    | { type?: 'income' | 'expense'; category?: string; dateFrom?: string; dateTo?: string }
    | undefined;
  Subscriptions: undefined;
  AddTransaction: { transaction?: TransactionDto } | undefined;
  BudgetSettings: undefined;
  Fitness: undefined;
  LogFitness: undefined;
  FitnessGoals: undefined;
  SleepTracking: undefined;
  FitnessProfile: undefined;
  Assistant: { autoMic?: boolean } | undefined;
  Community: undefined;
  ComposePost: { share?: boolean } | undefined;
  PostDetail: { postId: number };
  CreateChallenge: undefined;
  ChallengeDetail: { challengeId: number };
};

// Bottom bar: Dashboard, Budget, Medication, Fitness and More (opens the side drawer).
// Tasks, Habits, Weather, PrayerTime, Community and Profile are hidden tabs reached from the drawer,
// so the tab bar and the assistant bot stay on every module page. (RootStackParamList above still
// lists Budget, Medication, Fitness, PrayerTime, Profile, Community and More only so navigate() calls type-check.)
export type MainTabParamList = {
  Dashboard: undefined;
  Budget: undefined;
  Medication: undefined;
  Fitness: undefined;
  More: undefined;
  Tasks: undefined;
  Habits: undefined;
  Weather: undefined;
  PrayerTime: undefined;
  Community: undefined;
  Profile: undefined;
};
