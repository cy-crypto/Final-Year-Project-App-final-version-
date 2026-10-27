import { api, parseJsonData } from './api';

export type Frequency = 'daily' | 'twice_daily' | 'three_times_daily' | 'weekly' | 'as_needed';
export type DoseStatus = 'taken' | 'skipped' | 'deferred';
export type SlotState = DoseStatus | 'missed' | 'due' | 'upcoming';

export type Medication = {
  id: number;
  name: string;
  dosage: string;
  frequency: Frequency;
  schedule_times: string[];
  days_of_week: number[];
  start_date: string | null;
  end_date: string | null;
  dose_units: number;
  supply_count: number;
  refill_threshold: number;
  notes: string | null;
  doctor_name: string;
  instructions: string;
  is_active: boolean;
  needs_refill: boolean;
  days_of_supply_left: number | null;
  created_at: string;
  updated_at: string;
};

export type MedicationInput = Partial<
  Omit<Medication, 'id' | 'needs_refill' | 'days_of_supply_left' | 'created_at' | 'updated_at'>
>;

export type DoseSlot = {
  medication_id: number;
  name: string;
  dosage: string;
  instructions: string;
  time: string;
  scheduled_at: string;
  status: SlotState;
  log_id: number | null;
  logged_at: string | null;
  date?: string;
};

export type TodaySchedule = {
  date: string;
  slots: DoseSlot[];
  taken: number;
  total: number;
  next_dose: DoseSlot | null;
  refills: Medication[];
};

export type MedicationLog = {
  id: number;
  medication: number;
  medication_name: string;
  medication_dosage: string;
  status: DoseStatus;
  scheduled_time: string;
  dose_time: string;
  taken_at: string | null;
  notes: string | null;
  created_at: string;
};

export type Adherence = {
  days: { date: string; label: string; scheduled: number; taken: number; skipped: number; missed: number }[];
  scheduled: number;
  taken: number;
  rate: number | null;
};

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: 'Once a day',
  twice_daily: 'Twice a day',
  three_times_daily: '3 times a day',
  weekly: 'Weekly',
  as_needed: 'As needed',
};

export async function getMedications(): Promise<Medication[]> {
  const response = await api.get('/medications/');
  const data = parseJsonData<Medication[]>(response.data);
  return Array.isArray(data) ? data : [];
}

export async function getMedication(id: number): Promise<Medication> {
  const response = await api.get(`/medications/${id}/`);
  return parseJsonData<Medication>(response.data);
}

export async function createMedication(input: MedicationInput): Promise<Medication> {
  const response = await api.post('/medications/', input);
  return parseJsonData<Medication>(response.data);
}

export async function updateMedication(id: number, input: MedicationInput): Promise<Medication> {
  const response = await api.patch(`/medications/${id}/`, input);
  return parseJsonData<Medication>(response.data);
}

export async function deleteMedication(id: number): Promise<void> {
  await api.delete(`/medications/${id}/`);
}

export async function getTodaySchedule(): Promise<TodaySchedule> {
  const response = await api.get('/medications/today/');
  return parseJsonData<TodaySchedule>(response.data);
}

export async function logDose(
  medicationId: number,
  input: { status: DoseStatus; dose_time?: string; notes?: string }
): Promise<{ log: MedicationLog; medication: Medication }> {
  const response = await api.post(`/medications/${medicationId}/log/`, input);
  return parseJsonData(response.data);
}

export async function getMedicationLogs(filters: {
  medication?: number;
  status?: DoseStatus;
  dateFrom?: string;
  dateTo?: string;
} = {}): Promise<MedicationLog[]> {
  const response = await api.get('/medication-logs/', {
    params: {
      medication: filters.medication,
      status: filters.status,
      date_from: filters.dateFrom,
      date_to: filters.dateTo,
    },
  });
  const data = parseJsonData<MedicationLog[]>(response.data);
  return Array.isArray(data) ? data : [];
}

export async function getAdherence(days = 7): Promise<Adherence> {
  const response = await api.get('/medications/adherence/', { params: { days } });
  return parseJsonData<Adherence>(response.data);
}

export function formatTime12(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`;
}
