import { api, parseJsonData } from './api';
import { supabase } from './supabase';

export type Preferences = {
  temperature_unit: 'C' | 'F';
  notify_tasks: boolean;
  notify_habits: boolean;
  notify_medication: boolean;
  notify_prayer: boolean;
  notify_weather_alerts: boolean;
  prayer_method: number;
  prayer_school: number;
  community_visible: boolean;
};

export type AuthPayload = {
  email: string;
  user_id: string;
  full_name: string;
  avatar_url: string;
  bio: string;
  selected_city: string;
  timezone?: string;
  preferences?: Preferences;
  member_since?: string;
};

export type ProfilePayload = {
  full_name: string;
  avatar_url: string;
  bio: string;
  selected_city: string;
  timezone?: string;
  preferences?: Preferences;
  email?: string;
  member_since?: string;
};

type UpdateProfileInput = Partial<Omit<ProfilePayload, 'preferences' | 'email' | 'member_since'>> & {
  avatar_image_uri?: string;
  preferences?: Partial<Preferences>;
  remove_avatar?: boolean;
};

export async function me(): Promise<AuthPayload> {
  const response = await api.get('/auth/me/');
  return parseJsonData<AuthPayload>(response.data);
}

export async function getProfile(): Promise<ProfilePayload> {
  const response = await api.get('/auth/profile/');
  return parseJsonData<ProfilePayload>(response.data);
}

export async function updateProfile(input: UpdateProfileInput): Promise<ProfilePayload> {
  const hasImage = Boolean(input.avatar_image_uri);

  if (!hasImage) {
    const { avatar_image_uri, ...rest } = input;
    const response = await api.patch('/auth/profile/', rest);
    return parseJsonData<ProfilePayload>(response.data);
  }

  const formData = new FormData();
  if (typeof input.full_name === 'string') {
    formData.append('full_name', input.full_name);
  }
  if (typeof input.avatar_url === 'string') {
    formData.append('avatar_url', input.avatar_url);
  }
  if (typeof input.bio === 'string') {
    formData.append('bio', input.bio);
  }
  if (typeof input.selected_city === 'string') {
    formData.append('selected_city', input.selected_city);
  }

  const uri = input.avatar_image_uri as string;
  const fileName = uri.split('/').pop() || `avatar-${Date.now()}.jpg`;
  const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
  const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

  formData.append('avatar_image', {
    uri,
    name: fileName,
    type: mimeType,
  } as any);

  const response = await api.patch('/auth/profile/', formData);
  return parseJsonData<ProfilePayload>(response.data);
}

export async function requestPasswordReset(email: string): Promise<{ detail?: string }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) {
    throw new Error(error.message);
  }
  return { detail: 'If the account exists, a reset code was sent to your email.' };
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<{ detail?: string }> {
  const verified = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
  if (verified.error) {
    throw new Error(verified.error.message);
  }

  const updated = await supabase.auth.updateUser({ password: newPassword });
  if (updated.error) {
    throw new Error(updated.error.message);
  }

  // The recovery code signs the user in; make them log in explicitly with the new password.
  await supabase.auth.signOut();
  return { detail: 'Password updated. You can now sign in with the new password.' };
}
