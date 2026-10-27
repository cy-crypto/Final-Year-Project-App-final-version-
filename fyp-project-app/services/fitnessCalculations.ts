/** Pure validation/formatting shared by the Fitness forms. Server remains authoritative. */
export function validateGoalTarget(kind: string, text: string): string | null {
  const value = Number(text.trim());
  if (!/^\d+(\.\d{1,2})?$/.test(text.trim()) || !Number.isFinite(value) || value <= 0 || value > 9999999999.99) {
    return 'Enter a positive target with at most two decimal places.';
  }
  if (['steps', 'workout_frequency'].includes(kind) && !Number.isInteger(value)) {
    return 'Steps and workout sessions must be whole numbers.';
  }
  return null;
}

export function validateSleepInterval(bedtime: Date | null, wakeTime: Date | null, now = new Date()): string | null {
  if (!bedtime || !wakeTime || !Number.isFinite(bedtime.getTime()) || !Number.isFinite(wakeTime.getTime())) {
    return 'Choose a valid bedtime and wake-up date and time.';
  }
  if (wakeTime.getTime() <= bedtime.getTime()) return 'Wake-up must be after bedtime.';
  if (wakeTime.getTime() > now.getTime()) return 'Completed sleep cannot be in the future.';
  return null;
}

export function sleepMinutes(bedtime: Date, wakeTime: Date): number {
  return (wakeTime.getTime() - bedtime.getTime()) / 60000;
}

export function hasSleepOverlap(records: { id: string; bedtime: string; wake_time: string }[], bed: Date, wake: Date, excludedId: string | null): boolean {
  return records.some((r) => r.id !== excludedId && new Date(r.bedtime) < wake && new Date(r.wake_time) > bed);
}

export function formatSleepDuration(minutes: number | null): string {
  if (minutes === null) return 'No data';
  const rounded = Math.round(minutes);
  if (rounded === 0 && minutes > 0) return '<1 min';
  return `${Math.floor(rounded / 60)}h ${rounded % 60}m`;
}

export function changeSleepDateTime(current: Date | null, selected: Date, mode: 'date' | 'time'): Date {
  const result = new Date(current ?? selected);
  if (mode === 'date') result.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
  else result.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
  return result;
}

export type FitnessUnits = 'metric' | 'imperial';
export const KG_PER_LB = 0.45359237;
export const CM_PER_INCH = 2.54;

export function toCanonicalMeasurements(weight: number, height: number, units: FitnessUnits) {
  return {
    weightKg: Number((units === 'imperial' ? weight * KG_PER_LB : weight).toFixed(2)),
    heightCm: Number((units === 'imperial' ? height * CM_PER_INCH : height).toFixed(1)),
  };
}

export function fromCanonicalMeasurement(value: number, kind: 'weight' | 'height', units: FitnessUnits): string {
  return String(Number((units === 'imperial' ? value / (kind === 'weight' ? KG_PER_LB : CM_PER_INCH) : value).toFixed(2)));
}

export function validateFitnessMeasurements(weight: string, height: string, age: string, units: FitnessUnits): string | null {
  for (const [label, value] of [['Weight', weight], ['Height', height], ['Age', age]]) {
    if (value.trim() && (!/^\d+(\.\d+)?$/.test(value.trim()) || !Number.isFinite(Number(value)))) return `${label} must be a valid positive number.`;
  }
  const rawWeight = units === 'imperial' ? Number(weight) * KG_PER_LB : Number(weight);
  const rawHeight = units === 'imperial' ? Number(height) * CM_PER_INCH : Number(height);
  // Allow only conversion-rounding tolerance; canonical values are validated by the API too.
  if (weight.trim() && (rawWeight < 24.995 || rawWeight > 350.005)) return 'Supported weight: 25–350 kg (55.12–771.62 lb).';
  if (height.trim() && (rawHeight < 99.95 || rawHeight > 250.05)) return 'Supported height: 100–250 cm (39.37–98.43 in).';
  if (age.trim() && (!Number.isInteger(Number(age)) || Number(age) < 18 || Number(age) > 120)) return 'Enter a whole-number age from 18 to 120 years.';
  return null;
}

export function localFitnessDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
