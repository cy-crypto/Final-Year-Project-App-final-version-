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
  Transactions: undefined;
  Subscriptions: undefined;
  AddTransaction: { transaction?: TransactionDto } | undefined;
  BudgetSettings: undefined;
  Fitness: undefined;
  LogFitness: undefined;
  FitnessGoals: undefined;
  SleepTracking: undefined;
  FitnessProfile: undefined;
  Assistant: undefined;
  Community: undefined;
  ComposePost: { share?: boolean } | undefined;
  PostDetail: { postId: number };
  CreateChallenge: undefined;
  ChallengeDetail: { challengeId: number };
};

export type MainTabParamList = {
  Dashboard: undefined;
  Tasks: undefined;
  Habits: undefined;
  Weather: undefined;
  More: undefined;
};
