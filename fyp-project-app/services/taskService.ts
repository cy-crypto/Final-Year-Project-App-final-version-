import { api, parseJsonData } from './api';

export type TaskPriority = 'high' | 'medium' | 'low';
export type TaskStatus = 'pending' | 'in_progress' | 'done';

export type TaskAttachment = {
  id: number;
  attachment_type: 'file' | 'url';
  file_url: string | null;
  url: string | null;
  name: string;
  created_at: string;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: TaskPriority;
  status: TaskStatus;
  /** Derived from status, kept for screens that only care about done / not done. */
  done: boolean;
  deadline: string | null;
  reminder_time: string | null;
  time_slot_start: string | null;
  time_slot_end: string | null;
  links: string[];
  time_spent_seconds: number;
  progress_percentage: number;
  email_reminder_enabled: boolean;
  attachments: TaskAttachment[];
  completed_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type TaskInput = Partial<
  Pick<
    Task,
    | 'title'
    | 'description'
    | 'category'
    | 'priority'
    | 'status'
    | 'deadline'
    | 'reminder_time'
    | 'links'
    | 'progress_percentage'
    | 'email_reminder_enabled'
  >
>;

export type TaskFilters = {
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: string;
  search?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
};

export type TaskReport = {
  period: 'daily' | 'weekly' | 'monthly';
  summary: {
    total: number;
    completed: number;
    pending: number;
    in_progress: number;
    completed_in_period: number;
    overdue: number;
    time_spent_seconds: number;
  };
  by_priority: Record<string, { label: string; total: number; completed: number; color: string }>;
  by_category: Record<string, { label: string; total: number; completed: number; color: string }>;
  chart_data: { labels: string[]; completed: number[]; created: number[] };
};

const PRIORITIES: TaskPriority[] = ['high', 'medium', 'low'];
const STATUSES: TaskStatus[] = ['pending', 'in_progress', 'done'];

export function normalizeTask(raw: any): Task {
  const priority = String(raw?.priority ?? '').toLowerCase() as TaskPriority;
  const status = String(raw?.status ?? '').toLowerCase() as TaskStatus;
  const safeStatus = STATUSES.includes(status) ? status : 'pending';
  return {
    id: String(raw?.id),
    title: raw?.title ?? 'Untitled task',
    description: raw?.description ?? '',
    category: raw?.category ?? '',
    priority: PRIORITIES.includes(priority) ? priority : 'medium',
    status: safeStatus,
    done: safeStatus === 'done',
    deadline: raw?.deadline ?? null,
    reminder_time: raw?.reminder_time ?? null,
    time_slot_start: raw?.time_slot_start ?? null,
    time_slot_end: raw?.time_slot_end ?? null,
    links: Array.isArray(raw?.links) ? raw.links : [],
    time_spent_seconds: Number(raw?.time_spent_seconds ?? 0),
    progress_percentage: Number(raw?.progress_percentage ?? 0),
    email_reminder_enabled: Boolean(raw?.email_reminder_enabled),
    attachments: Array.isArray(raw?.attachments) ? raw.attachments : [],
    completed_at: raw?.completed_at ?? null,
    created_at: raw?.created_at,
    updated_at: raw?.updated_at,
  };
}

export async function getTasks(filters: TaskFilters = {}): Promise<Task[]> {
  const response = await api.get('/tasks/', {
    params: {
      status: filters.status,
      priority: filters.priority,
      category: filters.category,
      search: filters.search || undefined,
      deadline_from: filters.deadlineFrom,
      deadline_to: filters.deadlineTo,
    },
  });
  const data = parseJsonData<any>(response.data);
  const raw = Array.isArray(data) ? data : data?.results ?? [];
  return raw.map(normalizeTask);
}

export async function getTask(id: string): Promise<Task> {
  const response = await api.get(`/tasks/${id}/`);
  return normalizeTask(parseJsonData(response.data));
}

export async function createTask(input: TaskInput): Promise<Task> {
  const response = await api.post('/tasks/', input);
  return normalizeTask(parseJsonData(response.data));
}

export async function updateTask(id: string, input: TaskInput): Promise<Task> {
  const response = await api.patch(`/tasks/${id}/`, input);
  return normalizeTask(parseJsonData(response.data));
}

export async function toggleTask(id: string): Promise<Task> {
  const response = await api.post(`/tasks/${id}/toggle/`);
  return normalizeTask(parseJsonData(response.data));
}

export async function deleteTask(id: string): Promise<void> {
  await api.delete(`/tasks/${id}/`);
}

export async function logTaskTime(id: string, seconds: number): Promise<Task> {
  const response = await api.post(`/tasks/${id}/log-time/`, { seconds: Math.round(seconds) });
  return normalizeTask(parseJsonData(response.data));
}

export async function sendTaskReminderEmail(id: string): Promise<string> {
  const response = await api.post(`/tasks/${id}/send-reminder/`);
  return parseJsonData<{ detail: string }>(response.data).detail;
}

export async function addTaskLink(id: string, url: string): Promise<TaskAttachment> {
  const response = await api.post(`/tasks/${id}/attachments/`, { attachment_type: 'url', url });
  return parseJsonData<TaskAttachment>(response.data);
}

export async function addTaskFile(
  id: string,
  file: { uri: string; name: string; mimeType?: string | null }
): Promise<TaskAttachment> {
  const form = new FormData();
  form.append('attachment_type', 'file');
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as any);
  const response = await api.post(`/tasks/${id}/attachments/`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    transformRequest: (data) => data,
  });
  return parseJsonData<TaskAttachment>(response.data);
}

export async function removeTaskAttachment(id: string, attachmentId: number): Promise<void> {
  await api.delete(`/tasks/${id}/attachments/${attachmentId}/`);
}

export async function getTaskReport(period: TaskReport['period']): Promise<TaskReport> {
  const response = await api.get('/tasks/report/', { params: { period } });
  return parseJsonData<TaskReport>(response.data);
}
