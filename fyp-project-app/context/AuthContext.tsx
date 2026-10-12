import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { toApiErrorMessage, setApiAuthToken, setApiRequestUserId } from '../services/api';
import {
  login as loginRequest,
  logout as logoutRequest,
  me as meRequest,
  signup as signupRequest,
  updateProfile as updateProfileRequest,
} from '../services/authService';

type AuthUser = {
  email: string;
  userId: string;
  token: string;
  fullName: string;
  avatarUrl: string;
  bio: string;
  selectedCity: string;
};

type AuthContextValue = {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signup: (email: string, password: string, fullName?: string) => Promise<{ ok: boolean; error?: string }>;
  updateProfile: (input: {
    fullName?: string;
    avatarUrl?: string;
    avatarImageUri?: string;
    bio?: string;
    selectedCity?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
};

const STORAGE_KEY = 'app.auth.user';
const memoryStore = new Map<string, string>();
let useMemoryStorage = false;

async function safeGetItem(key: string) {
  if (Platform.OS === 'web') {
    try {
      return window?.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  if (useMemoryStorage) {
    return memoryStore.get(key) ?? null;
  }

  try {
    return await AsyncStorage.getItem(key);
  } catch (error) {
    useMemoryStorage = true;
    console.warn('AsyncStorage unavailable, falling back to memory storage', error);
    return memoryStore.get(key) ?? null;
  }
}

async function safeSetItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    try {
      window?.localStorage?.setItem(key, value);
      return;
    } catch {
      return;
    }
  }

  if (useMemoryStorage) {
    memoryStore.set(key, value);
    return;
  }

  try {
    await AsyncStorage.setItem(key, value);
  } catch (error) {
    useMemoryStorage = true;
    console.warn('AsyncStorage unavailable, falling back to memory storage', error);
    memoryStore.set(key, value);
  }
}

async function safeRemoveItem(key: string) {
  if (Platform.OS === 'web') {
    try {
      window?.localStorage?.removeItem(key);
      return;
    } catch {
      return;
    }
  }

  if (useMemoryStorage) {
    memoryStore.delete(key);
    return;
  }

  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    useMemoryStorage = true;
    console.warn('AsyncStorage unavailable, falling back to memory storage', error);
    memoryStore.delete(key);
  }
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        // Clear tokens on every app start for demo purposes
        await safeRemoveItem(STORAGE_KEY);
        setApiAuthToken(null);
        setApiRequestUserId(null);
        setUser(null);
        return;

        const raw = await safeGetItem(STORAGE_KEY);
        if (!raw) {
          return;
        }

        const parsed = JSON.parse(raw) as AuthUser;
        if (parsed?.email && parsed?.token && parsed?.userId) {
          setApiAuthToken(parsed.token);
          setApiRequestUserId(parsed.userId);

          try {
            const current = await meRequest();
            const nextUser = {
              email: current.email,
              token: current.token,
              userId: current.user_id,
              fullName: current.full_name ?? '',
              avatarUrl: current.avatar_url ?? '',
              bio: current.bio ?? '',
              selectedCity: current.selected_city ?? '',
            };
            setUser(nextUser);
            await safeSetItem(STORAGE_KEY, JSON.stringify(nextUser));
            return;
          } catch (error) {
            console.warn('Stored auth token is invalid, clearing session', error);
            setApiAuthToken(null);
            setApiRequestUserId(null);
            await safeRemoveItem(STORAGE_KEY);
            setUser(null);
            return;
          }
        }

      } catch (error) {
        console.warn('Failed to restore auth session', error);
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { ok: false, error: 'Enter a valid email address.' };
    }

    if (password.length < 8) {
      return { ok: false, error: 'Password must be at least 8 characters.' };
    }

    try {
      const payload = await loginRequest(cleanEmail, password);
      const nextUser = {
        email: payload.email,
        token: payload.token,
        userId: payload.user_id,
        fullName: payload.full_name ?? '',
        avatarUrl: payload.avatar_url ?? '',
        bio: payload.bio ?? '',
        selectedCity: payload.selected_city ?? '',
      };

      setApiAuthToken(nextUser.token);
      setApiRequestUserId(nextUser.userId);
      setUser(nextUser);
      console.log('Login successful, user set:', nextUser);
      console.log('isAuthenticated should be:', Boolean(nextUser));
      await safeSetItem(STORAGE_KEY, JSON.stringify(nextUser));
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: toApiErrorMessage(error, 'Login failed. Please try again.'),
      };
    }
  };

  const signup = async (email: string, password: string, fullName?: string) => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { ok: false, error: 'Enter a valid email address.' };
    }

    if (password.length < 8) {
      return { ok: false, error: 'Password must be at least 8 characters.' };
    }

    try {
      const payload = await signupRequest(cleanEmail, password, fullName);
      const nextUser = {
        email: payload.email,
        token: payload.token,
        userId: payload.user_id,
        fullName: payload.full_name ?? '',
        avatarUrl: payload.avatar_url ?? '',
        bio: payload.bio ?? '',
        selectedCity: payload.selected_city ?? '',
      };

      setApiAuthToken(nextUser.token);
      setApiRequestUserId(nextUser.userId);
      setUser(nextUser);
      await safeSetItem(STORAGE_KEY, JSON.stringify(nextUser));
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: toApiErrorMessage(error, 'Signup failed. Please try again.'),
      };
    }
  };

  const updateProfile = async (input: {
    fullName?: string;
    avatarUrl?: string;
    avatarImageUri?: string;
    bio?: string;
    selectedCity?: string;
  }) => {
    if (!user) {
      return { ok: false, error: 'Not authenticated.' };
    }

    try {
      const payload = await updateProfileRequest({
        full_name: input.fullName,
        avatar_url: input.avatarUrl,
        avatar_image_uri: input.avatarImageUri,
        bio: input.bio,
        selected_city: input.selectedCity,
      });

      const nextUser: AuthUser = {
        ...user,
        fullName: payload.full_name ?? '',
        avatarUrl: payload.avatar_url ?? '',
        bio: payload.bio ?? '',
        selectedCity: payload.selected_city ?? '',
      };

      setUser(nextUser);
      await safeSetItem(STORAGE_KEY, JSON.stringify(nextUser));
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: toApiErrorMessage(error, 'Could not update profile.'),
      };
    }
  };

  const logout = async () => {
    try {
      await logoutRequest();
    } catch (error) {
      console.warn('Backend logout failed, clearing local session anyway', error);
    }

    setApiAuthToken(null);
    setApiRequestUserId(null);
    setUser(null);
    await safeRemoveItem(STORAGE_KEY);
  };

  const value = useMemo(
    () => ({
      isLoading,
      isAuthenticated: Boolean(user),
      user,
      login,
      signup,
      updateProfile,
      logout,
    }),
    [isLoading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
