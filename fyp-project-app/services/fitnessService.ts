import axios from 'axios';

import { api, parseJsonData } from './api';

export type WorkoutLogEntry = {
  exercise: string;
  duration_min: number;
};

export type FitnessRecordDto = {
  id: string;
  userId: string;
  date: string;
  steps: number;
  caloriesBurned: string;
  sleepDurationMinutes: number | null;
  workoutLog: WorkoutLogEntry[] | null;
  createdAt: string;
  updatedAt: string;
  stepsAvailable: boolean;
  stepsRecordedAt: string | null;
  stepsObservedAt: string | null;
  stepSource: 'unknown' | 'manual' | 'sensor';
  estimatedActiveCalories: string | null;
  effectiveCaloriesBurned: string | null;
  calorieSource: 'manual' | 'walking_estimate' | 'unavailable';
  manualCaloriesRecordedAt: string | null;
  calorieEstimateMetadata: { version?: string; distance_m?: string; calculated_at?: string; [key: string]: unknown };
};

type FitnessRecordApiDto = {
  id: string;
  user_id: string;
  date: string;
  steps: number;
  calories_burned: string;
  sleep_duration_minutes: number | null;
  workout_log: WorkoutLogEntry[] | null;
  created_at: string;
  updated_at: string;
  steps_available: boolean;
  steps_recorded_at: string | null;
  steps_observed_at: string | null;
  step_source: FitnessRecordDto['stepSource'];
  estimated_active_calories: string | null;
  effective_calories_burned: string | null;
  calorie_source: FitnessRecordDto['calorieSource'];
  manual_calories_recorded_at: string | null;
  calorie_estimate_metadata: FitnessRecordDto['calorieEstimateMetadata'];
};

export type TrendRow = {
  date: string;
  steps: number;
  caloriesBurned: number | null;
  stepsAvailable: boolean;
  calorieSource: FitnessRecordDto['calorieSource'];
  sleepDurationMinutes: number | null;
};

type TrendApiRow = {
  date: string;
  steps: number;
  calories_burned: number | string;
  sleep_duration_minutes: number | null;
  effective_calories_burned: string | null;
  steps_available: boolean;
  calorie_source: FitnessRecordDto['calorieSource'];
};

export type GoalType = 'steps' | 'calories' | 'sleep' | 'workout_frequency';

export type GoalProgress = {
  period: 'daily' | 'weekly';
  period_start: string;
  period_end: string;
  timezone: string;
  available: boolean;
  unavailable_reason: string | null;
  current: number | null;
  remaining: number | null;
  percent: number | null;
  complete: boolean;
  achievement_notified: boolean;
};

export type FitnessGoalDto = {
  id: string;
  userId: string;
  goalType: GoalType;
  targetValue: string;
  isActive: boolean;
  unit: string;
  progress: GoalProgress;
  createdAt: string;
  updatedAt: string;
};

type FitnessGoalApiDto = {
  id: string;
  user_id: string;
  goal_type: GoalType;
  target_value: string;
  is_active: boolean;
  unit: string;
  progress: GoalProgress;
  created_at: string;
  updated_at: string;
};

function normalizeRecord(item: FitnessRecordApiDto): FitnessRecordDto {
  return {
    id: String(item.id),
    userId: item.user_id,
    date: item.date,
    steps: Number(item.steps ?? 0),
    caloriesBurned: item.calories_burned,
    sleepDurationMinutes: item.sleep_duration_minutes ?? null,
    workoutLog: item.workout_log ?? null,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    stepsAvailable: item.steps_available,
    stepsRecordedAt: item.steps_recorded_at,
    stepsObservedAt: item.steps_observed_at,
    stepSource: item.step_source,
    estimatedActiveCalories: item.estimated_active_calories,
    effectiveCaloriesBurned: item.effective_calories_burned,
    calorieSource: item.calorie_source,
    manualCaloriesRecordedAt: item.manual_calories_recorded_at,
    calorieEstimateMetadata: item.calorie_estimate_metadata,
  };
}

function normalizeGoal(item: FitnessGoalApiDto): FitnessGoalDto {
  return {
    id: String(item.id),
    userId: item.user_id,
    goalType: item.goal_type,
    targetValue: item.target_value,
    isActive: Boolean(item.is_active),
    unit: item.unit,
    progress: item.progress,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

export async function getToday(): Promise<FitnessRecordDto> {
  const response = await api.get('/api/fitness/records/today/');
  const data = parseJsonData<FitnessRecordApiDto>(response.data);
  return normalizeRecord(data);
}

export async function upsertToday(data: {
  date?: string;
  steps?: number;
  caloriesBurned?: number | null;
  stepSource?: 'manual' | 'sensor';
  stepsObservedAt?: string;
  todayOnly?: boolean;
  sleepDurationMinutes?: number | null;
  workoutLog?: WorkoutLogEntry[];
}): Promise<FitnessRecordDto> {
  // Only include keys the caller actually provided — omitted keys are preserved by the
  // backend's upsert (see fitness/views.py), so sending them as undefined/null here would
  // risk wiping data the caller never meant to touch.
  const payload: Record<string, unknown> = {};
  if (data.date !== undefined) payload.date = data.date;
  if (data.steps !== undefined) payload.steps = data.steps;
  if (data.caloriesBurned === null) payload.clear_manual_calories = true;
  else if (data.caloriesBurned !== undefined) payload.calories_burned = data.caloriesBurned;
  if (data.stepSource !== undefined) payload.step_source = data.stepSource;
  if (data.stepsObservedAt !== undefined) payload.steps_observed_at = data.stepsObservedAt;
  if (data.todayOnly !== undefined) payload.today_only = data.todayOnly;
  if (data.sleepDurationMinutes !== undefined) payload.sleep_duration_minutes = data.sleepDurationMinutes;
  if (data.workoutLog !== undefined) payload.workout_log = data.workoutLog;

  const response = await api.post('/api/fitness/records/', payload);
  const result = parseJsonData<FitnessRecordApiDto>(response.data);
  return normalizeRecord(result);
}

export async function getTrends(days = 7): Promise<TrendRow[]> {
  const response = await api.get('/api/fitness/records/trends/', { params: { days } });
  const data = parseJsonData<unknown>(response.data);
  const raw = Array.isArray(data) ? data : [];
  return raw.map((item) => {
    const row = item as TrendApiRow;
    return {
      date: row.date,
      steps: Number(row.steps ?? 0),
      caloriesBurned: row.effective_calories_burned === null ? null : Number(row.effective_calories_burned),
      stepsAvailable: row.steps_available,
      calorieSource: row.calorie_source,
      sleepDurationMinutes: row.sleep_duration_minutes ?? null,
    };
  });
}

export async function getGoals(isActive?: boolean): Promise<FitnessGoalDto[]> {
  const response = await api.get('/api/fitness/goals/', {
    params: { is_active: isActive === undefined ? undefined : String(isActive) },
  });
  const data = parseJsonData<unknown>(response.data);
  const raw = Array.isArray(data) ? data : [];
  return raw.map((item) => normalizeGoal(item as FitnessGoalApiDto));
}

export async function createOrUpdateGoal(data: {
  goalType: GoalType;
  targetValue: string;
  isActive?: boolean;
}): Promise<FitnessGoalDto> {
  const payload: Record<string, unknown> = {
    goal_type: data.goalType,
    target_value: data.targetValue,
  };
  if (data.isActive !== undefined) payload.is_active = data.isActive;

  const response = await api.post('/api/fitness/goals/', payload);
  const result = parseJsonData<FitnessGoalApiDto>(response.data);
  return normalizeGoal(result);
}

export async function patchGoal(
  id: string,
  data: { isActive?: boolean; targetValue?: string }
): Promise<FitnessGoalDto> {
  const payload: Record<string, unknown> = {};
  if (data.isActive !== undefined) payload.is_active = data.isActive;
  if (data.targetValue !== undefined) payload.target_value = data.targetValue;

  const response = await api.patch(`/api/fitness/goals/${id}/`, payload);
  const result = parseJsonData<FitnessGoalApiDto>(response.data);
  return normalizeGoal(result);
}

export async function deleteGoal(id: string): Promise<void> {
  await api.delete(`/api/fitness/goals/${id}/`);
}

export async function claimGoalAchievements(): Promise<{ goal_id: string; goal_type: GoalType; period_start: string }[]> {
  const response = await api.post('/api/fitness/goals/achievements/', {});
  return parseJsonData(response.data);
}

export type SleepRecordDto = {
  id: string;
  bedtime: string;
  wake_time: string;
  duration_minutes: number;
  wake_date: string;
  created_at: string;
  updated_at: string;
};

export type SleepSummary = {
  timezone: string;
  recorded_nights: number;
  average_minutes: number | null;
  days: { date: string; duration_minutes: number | null }[];
};

export type SleepHistory = { count: number; next: string | null; results: SleepRecordDto[] };

export async function getSleepRecords(page = 1): Promise<SleepHistory> {
  const response = await api.get('/api/fitness/sleep/', { params: { page } });
  return parseJsonData(response.data);
}

export async function getSleepSummary(): Promise<SleepSummary> {
  const response = await api.get('/api/fitness/sleep/summary/');
  return parseJsonData(response.data);
}

export async function saveSleepRecord(data: { bedtime: string; wake_time: string }, id?: string): Promise<SleepRecordDto> {
  const response = id
    ? await api.patch(`/api/fitness/sleep/${id}/`, data)
    : await api.post('/api/fitness/sleep/', data);
  return parseJsonData(response.data);
}

export async function deleteSleepRecord(id: string): Promise<void> {
  await api.delete(`/api/fitness/sleep/${id}/`);
}

export type Gender = 'male' | 'female' | 'other';

export type FitnessProfileDto = {
  id: string;
  userId: string;
  gender: Gender | null;
  heightCm: string | null;
  waterGoalMl: number;
  weightKg: string | null;
  age: number | null;
  displayUnits: 'metric' | 'imperial';
  calorieProfileReady: boolean;
  // Read-only, backend-computed — null until the backend has enough info to suggest one
  // (see fitness/serializers.py). Never recompute these client-side.
  suggestedStepGoal: number | null;
  estimatedStrideCm: number | null;
  createdAt: string;
  updatedAt: string;
};

type FitnessProfileApiDto = {
  id: string;
  user_id: string;
  gender: Gender | null;
  height_cm: string | null;
  water_goal_ml: number;
  weight_kg: string | null;
  age: number | null;
  display_units: FitnessProfileDto['displayUnits'];
  calorie_profile_ready: boolean;
  suggested_step_goal: number | null;
  estimated_stride_cm: number | null;
  created_at: string;
  updated_at: string;
};

export type WaterIntakeDto = {
  id: string;
  userId: string;
  date: string;
  amountMl: number;
  createdAt: string;
  updatedAt: string;
};

type WaterIntakeApiDto = {
  id: string;
  user_id: string;
  date: string;
  amount_ml: number;
  created_at: string;
  updated_at: string;
};

function normalizeProfile(item: FitnessProfileApiDto): FitnessProfileDto {
  return {
    id: String(item.id),
    userId: item.user_id,
    gender: item.gender ?? null,
    heightCm: item.height_cm ?? null,
    waterGoalMl: Number(item.water_goal_ml ?? 2000),
    weightKg: item.weight_kg,
    age: item.age,
    displayUnits: item.display_units,
    calorieProfileReady: item.calorie_profile_ready,
    suggestedStepGoal: item.suggested_step_goal ?? null,
    estimatedStrideCm: item.estimated_stride_cm ?? null,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function normalizeWaterIntake(item: WaterIntakeApiDto): WaterIntakeDto {
  return {
    id: String(item.id),
    userId: item.user_id,
    date: item.date,
    amountMl: Number(item.amount_ml ?? 0),
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

export async function getProfile(): Promise<FitnessProfileDto> {
  const response = await api.get('/api/fitness/profile/');
  const data = parseJsonData<FitnessProfileApiDto>(response.data);
  return normalizeProfile(data);
}

export async function updateProfile(data: {
  gender?: Gender | null;
  heightCm?: number | null;
  waterGoalMl?: number;
  weightKg?: number | null;
  age?: number | null;
  displayUnits?: FitnessProfileDto['displayUnits'];
}): Promise<FitnessProfileDto> {
  // Only include keys the caller actually provided — this is a PATCH (partial_update), so
  // omitted keys are left untouched server-side rather than reset to their defaults.
  const payload: Record<string, unknown> = {};
  if (data.gender !== undefined) payload.gender = data.gender;
  if (data.heightCm !== undefined) payload.height_cm = data.heightCm;
  if (data.waterGoalMl !== undefined) payload.water_goal_ml = data.waterGoalMl;
  if (data.weightKg !== undefined) payload.weight_kg = data.weightKg;
  if (data.age !== undefined) payload.age = data.age;
  if (data.displayUnits !== undefined) payload.display_units = data.displayUnits;

  const response = await api.patch('/api/fitness/profile/', payload);
  const result = parseJsonData<FitnessProfileApiDto>(response.data);
  return normalizeProfile(result);
}

export async function getWaterToday(): Promise<WaterIntakeDto> {
  const response = await api.get('/api/fitness/water/today/');
  const data = parseJsonData<WaterIntakeApiDto>(response.data);
  return normalizeWaterIntake(data);
}

export async function logWater(amountMl: number, date?: string): Promise<WaterIntakeDto> {
  // Upsert-by-date, same as upsertToday: amount_ml here is the day's running TOTAL, not an
  // increment — see WaterIntakeViewSet.perform_create. Only send `date` if the caller
  // explicitly provided one; otherwise let the backend default to today itself.
  const payload: Record<string, unknown> = { amount_ml: amountMl };
  if (date !== undefined) payload.date = date;

  const response = await api.post('/api/fitness/water/', payload);
  const result = parseJsonData<WaterIntakeApiDto>(response.data);
  return normalizeWaterIntake(result);
}

// Keeps the same raw, snake_case shape as WorkoutLogEntry above — these are JSON blob
// entries, not individually-mapped model fields, so there's nothing to camelCase. sets/reps
// and duration_min are mutually exclusive in practice (an exercise is rep-based OR
// duration-based) but both stay optional here since the backend only actually requires
// `exercise` (see fitness/serializers.py's validate_exercises).
export type RoutineExercise = {
  exercise: string;
  sets?: number;
  reps?: number;
  duration_min?: number;
};

export type WorkoutRoutineDto = {
  id: string;
  userId: string;
  name: string;
  exercises: RoutineExercise[];
  createdAt: string;
  updatedAt: string;
};

type WorkoutRoutineApiDto = {
  id: string;
  user_id: string;
  name: string;
  exercises: RoutineExercise[];
  created_at: string;
  updated_at: string;
};

function normalizeRoutine(item: WorkoutRoutineApiDto): WorkoutRoutineDto {
  return {
    id: String(item.id),
    userId: item.user_id,
    name: item.name,
    exercises: Array.isArray(item.exercises) ? item.exercises : [],
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

export async function getRoutines(): Promise<WorkoutRoutineDto[]> {
  const response = await api.get('/api/fitness/routines/');
  const data = parseJsonData<unknown>(response.data);
  const raw = Array.isArray(data) ? data : [];
  return raw.map((item) => normalizeRoutine(item as WorkoutRoutineApiDto));
}

export async function createRoutine(data: {
  name: string;
  exercises: RoutineExercise[];
}): Promise<WorkoutRoutineDto> {
  const response = await api.post('/api/fitness/routines/', { name: data.name, exercises: data.exercises });
  const result = parseJsonData<WorkoutRoutineApiDto>(response.data);
  return normalizeRoutine(result);
}

export async function updateRoutine(
  id: string,
  data: { name?: string; exercises?: RoutineExercise[] }
): Promise<WorkoutRoutineDto> {
  const payload: Record<string, unknown> = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.exercises !== undefined) payload.exercises = data.exercises;

  const response = await api.patch(`/api/fitness/routines/${id}/`, payload);
  const result = parseJsonData<WorkoutRoutineApiDto>(response.data);
  return normalizeRoutine(result);
}

export async function deleteRoutine(id: string): Promise<void> {
  await api.delete(`/api/fitness/routines/${id}/`);
}

export async function logRoutine(id: string): Promise<FitnessRecordDto> {
  // Returns the updated FitnessRecord (today's record with this routine's exercises
  // appended onto workout_log — see WorkoutRoutineViewSet.log) so the caller can update its
  // own today-record state directly from this response instead of a separate refetch.
  const response = await api.post(`/api/fitness/routines/${id}/log/`, {});
  const result = parseJsonData<FitnessRecordApiDto>(response.data);
  return normalizeRecord(result);
}

// No established field-error-extraction helper exists elsewhere in this project yet (both
// AddTransactionScreen and LogFitnessScreen just show toApiErrorMessage's first-message
// fallback as one generic banner) — this is deliberately narrow and reuses the same
// DRF error-shape assumptions toApiErrorMessage already relies on, just scoped to one
// named field so a caller can attach it to the right input instead of a generic banner.
export function getFieldError(error: unknown, field: string): string | null {
  if (!axios.isAxiosError(error)) return null;
  const data = error.response?.data;
  if (!data || typeof data !== 'object') return null;

  const value = (data as Record<string, unknown>)[field];
  if (typeof value === 'string' && value.trim()) return value;
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string' && value[0].trim()) {
    return value[0];
  }
  return null;
}
