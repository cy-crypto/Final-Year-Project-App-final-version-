import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

function resolveBackendUrl() {
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();
  if (envUrl) {
    console.log('Using backend URL from environment:', envUrl);
    return envUrl;
  }

  // In development, the backend runs on the same computer that serves the Expo bundle,
  // so reuse that host (works for every teammate without editing IP addresses).
  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (devHost) {
    const BASE_URL = `http://${devHost}:8080`;
    console.log('Using backend URL from Expo dev host:', BASE_URL);
    return BASE_URL;
  }

  // Fallback when no dev host is available (e.g. web on the same machine)
  const BASE_URL = 'http://localhost:8080';
  console.log('Using fallback backend URL:', BASE_URL);
  return BASE_URL;
}

export const api = axios.create({
  baseURL: resolveBackendUrl(),
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let authToken: string | null = null;
let requestUserId: string | null = process.env.EXPO_PUBLIC_USER_ID?.trim() || null;

export function setApiAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    api.defaults.headers.common['Authorization'] = `Token ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
}

export function setApiRequestUserId(userId: string | null) {
  requestUserId = userId?.trim() || null;
}

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Token ${authToken}`;
  }

  if (requestUserId) {
    config.headers = config.headers ?? {};
    config.headers['X-User-Id'] = requestUserId;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!axios.isAxiosError(error) || !error.config) {
      return Promise.reject(error);
    }

    const method = error.config.method?.toLowerCase();
    const isTimeout = error.code === 'ECONNABORTED';
    const isSafeMethod = method === 'get';
    const hasRetried = Boolean((error.config as any).__retryOnce);

    if (isTimeout && isSafeMethod && !hasRetried) {
      (error.config as any).__retryOnce = true;
      return api.request(error.config);
    }

    return Promise.reject(error);
  }
);

export function parseJsonData<T>(data: unknown): T {
  if (typeof data === 'string') {
    return JSON.parse(data) as T;
  }

  return data as T;
}

export function toApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }

    const data = error.response?.data;
    if (data && typeof data === 'object') {
      for (const value of Object.values(data as Record<string, unknown>)) {
        if (typeof value === 'string' && value.trim()) {
          return value;
        }

        if (Array.isArray(value) && value.length > 0) {
          const first = value[0];
          if (typeof first === 'string' && first.trim()) {
            return first;
          }
        }
      }
    }

    if (error.code === 'ECONNABORTED') {
      return 'Request timed out. Please try again.';
    }

    if (!error.response) {
      return 'Cannot reach backend API. Check your network and backend URL.';
    }

    return `${fallback} (HTTP ${error.response.status})`;
  }

  return fallback;
}
