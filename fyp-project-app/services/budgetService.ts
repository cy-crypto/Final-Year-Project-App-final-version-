import { api, parseJsonData } from './api';

export type TransactionType = 'income' | 'expense';

export type TransactionDto = {
  id: string;
  userId: string;
  type: TransactionType;
  amount: string;
  category: string | null;
  description: string | null;
  date: string;
  createdAt: string;
  updatedAt: string;
};

type TransactionApiDto = {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: string;
  category: string | null;
  description: string | null;
  date: string;
  created_at: string;
  updated_at: string;
};

export type SummaryRow = {
  category: string | null;
  type: TransactionType;
  totalAmount: number;
};

type SummaryApiRow = {
  category: string | null;
  type: TransactionType;
  total_amount: number | string;
};

export type BudgetSettingsDto = {
  id: string;
  userId: string;
  monthlyLimit: string | null;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

type BudgetSettingsApiDto = {
  id: string;
  user_id: string;
  monthly_limit: string | null;
  currency: string;
  created_at: string;
  updated_at: string;
};

function normalizeTransaction(item: TransactionApiDto): TransactionDto {
  return {
    id: String(item.id),
    userId: item.user_id,
    type: item.type,
    amount: item.amount,
    category: item.category ?? null,
    description: item.description ?? null,
    date: item.date,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function normalizeSettings(item: BudgetSettingsApiDto): BudgetSettingsDto {
  return {
    id: String(item.id),
    userId: item.user_id,
    monthlyLimit: item.monthly_limit,
    currency: item.currency,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

export async function getTransactions(filters?: {
  type?: TransactionType;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}): Promise<TransactionDto[]> {
  const response = await api.get('/api/budget/transactions/', {
    params: {
      type: filters?.type,
      category: filters?.category,
      date_from: filters?.dateFrom,
      date_to: filters?.dateTo,
      search: filters?.search,
    },
  });
  const data = parseJsonData<unknown>(response.data);
  const raw = Array.isArray(data) ? data : [];
  return raw.map((item) => normalizeTransaction(item as TransactionApiDto));
}

export async function createTransaction(data: {
  type: TransactionType;
  amount: string;
  category?: string;
  description?: string;
  date: string;
}): Promise<TransactionDto> {
  const response = await api.post('/api/budget/transactions/', data);
  const result = parseJsonData<TransactionApiDto>(response.data);
  return normalizeTransaction(result);
}

export async function updateTransaction(
  id: string,
  data: Partial<{
    type: TransactionType;
    amount: string;
    category: string | null;
    description: string | null;
    date: string;
  }>
): Promise<TransactionDto> {
  const response = await api.patch(`/api/budget/transactions/${id}/`, data);
  const result = parseJsonData<TransactionApiDto>(response.data);
  return normalizeTransaction(result);
}

export async function deleteTransaction(id: string): Promise<void> {
  await api.delete(`/api/budget/transactions/${id}/`);
}

export async function getSummary(): Promise<SummaryRow[]> {
  const response = await api.get('/api/budget/transactions/summary/');
  const data = parseJsonData<unknown>(response.data);
  const raw = Array.isArray(data) ? data : [];
  return raw.map((item) => {
    const row = item as SummaryApiRow;
    return {
      category: row.category ?? null,
      type: row.type,
      totalAmount: Number(row.total_amount ?? 0),
    };
  });
}

export async function getSettings(): Promise<BudgetSettingsDto> {
  const response = await api.get('/api/budget/settings/');
  const data = parseJsonData<BudgetSettingsApiDto>(response.data);
  return normalizeSettings(data);
}

export async function updateSettings(data: {
  monthlyLimit?: string | null;
  currency?: string;
}): Promise<BudgetSettingsDto> {
  const payload: Record<string, unknown> = {};
  if (data.monthlyLimit !== undefined) {
    payload.monthly_limit = data.monthlyLimit;
  }
  if (data.currency !== undefined) {
    payload.currency = data.currency;
  }
  const response = await api.patch('/api/budget/settings/', payload);
  const result = parseJsonData<BudgetSettingsApiDto>(response.data);
  return normalizeSettings(result);
}
