import { api, parseJsonData } from './api';
import type { DoseSlot } from './medicationService';

export type ProfileSummary = {
  member_since: string;
  days_active: number;
  tasks: { open: number; done: number; due_today: number; done_this_week: number };
  habits: { count: number; best_streak: number; current_streak: number };
  medication: { active: number; needs_refill: number; adherence_7d: number | null; next_dose: DoseSlot | null };
  community?: { posts: number };
};

export async function getProfileSummary(): Promise<ProfileSummary> {
  const response = await api.get('/auth/profile/summary/');
  return parseJsonData<ProfileSummary>(response.data);
}
