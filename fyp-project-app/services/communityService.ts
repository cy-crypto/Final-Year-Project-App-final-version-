import { api, parseJsonData } from './api';

export type PostKind = 'post' | 'habit_streak' | 'task_milestone' | 'fitness_milestone';
export type Author = { id: string; name: string; avatar_url: string };

export type Comment = {
  id: number;
  post: number;
  author: Author;
  content: string;
  is_mine: boolean;
  created_at: string;
};

export type Post = {
  id: number;
  author: Author;
  content: string;
  kind: PostKind;
  meta: Record<string, any>;
  image_url: string | null;
  like_count: number;
  comment_count: number;
  liked: boolean;
  is_mine: boolean;
  recent_comments: Comment[];
  created_at: string;
};

export type FeedPage = { results: Post[]; next_before: number | null };

export type LeaderRow = {
  user_id: string;
  name: string;
  avatar_url: string;
  score: number;
  detail: string;
  is_me: boolean;
  rank: number;
};

export type Leaderboard = { metric: 'streak' | 'tasks'; rows: LeaderRow[]; me: LeaderRow | null };

export type ChallengeMetric = 'habit_checkins' | 'tasks_completed' | 'steps';

export type Challenge = {
  id: number;
  title: string;
  description: string;
  metric: ChallengeMetric;
  target: number;
  start_date: string;
  end_date: string;
  participant_count: number;
  joined: boolean;
  my_progress: number | null;
  is_mine: boolean;
  status: 'upcoming' | 'active' | 'ended';
  created_at: string;
};

export type Standing = { rank: number; name: string; progress: number; pct: number; completed: boolean; is_me: boolean };

export const METRIC_LABELS: Record<ChallengeMetric, { label: string; unit: string }> = {
  habit_checkins: { label: 'Habit check-ins', unit: 'check-ins' },
  tasks_completed: { label: 'Tasks completed', unit: 'tasks' },
  steps: { label: 'Steps walked', unit: 'steps' },
};

const BASE = '/api/community';

export async function getFeed(params: { before?: number | null; mine?: boolean } = {}): Promise<FeedPage> {
  const response = await api.get(`${BASE}/posts/`, {
    params: { before: params.before ?? undefined, mine: params.mine ? 1 : undefined },
  });
  return parseJsonData<FeedPage>(response.data);
}

export async function getPost(id: number): Promise<Post> {
  const response = await api.get(`${BASE}/posts/${id}/`);
  return parseJsonData<Post>(response.data);
}

export async function createPost(content: string, imageUri?: string | null): Promise<Post> {
  if (!imageUri) {
    const response = await api.post(`${BASE}/posts/`, { content });
    return parseJsonData<Post>(response.data);
  }
  const form = new FormData();
  form.append('content', content);
  const ext = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
  form.append('image', { uri: imageUri, name: `post_${Date.now()}.${ext}`, type: ext === 'png' ? 'image/png' : 'image/jpeg' } as any);
  const response = await api.post(`${BASE}/posts/`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    transformRequest: (data) => data,
  });
  return parseJsonData<Post>(response.data);
}

export async function deletePost(id: number): Promise<void> {
  await api.delete(`${BASE}/posts/${id}/`);
}

export async function toggleLike(id: number): Promise<{ liked: boolean; like_count: number }> {
  const response = await api.post(`${BASE}/posts/${id}/like/`);
  return parseJsonData(response.data);
}

export async function getComments(postId: number): Promise<Comment[]> {
  const response = await api.get(`${BASE}/posts/${postId}/comments/`);
  return parseJsonData<Comment[]>(response.data);
}

export async function addComment(postId: number, content: string): Promise<Comment> {
  const response = await api.post(`${BASE}/posts/${postId}/comments/`, { content });
  return parseJsonData<Comment>(response.data);
}

export async function deleteComment(id: number): Promise<void> {
  await api.delete(`${BASE}/comments/${id}/`);
}

export async function shareAchievement(kind: Exclude<PostKind, 'post'>, message = '', habitId?: number): Promise<Post> {
  const response = await api.post(`${BASE}/posts/share/`, { kind, message, habit_id: habitId });
  return parseJsonData<Post>(response.data);
}

export async function getLeaderboard(metric: 'streak' | 'tasks'): Promise<Leaderboard> {
  const response = await api.get(`${BASE}/posts/leaderboard/`, { params: { metric } });
  return parseJsonData<Leaderboard>(response.data);
}

export async function getChallenges(includeEnded = false): Promise<Challenge[]> {
  const response = await api.get(`${BASE}/challenges/`, { params: { include_ended: includeEnded ? 1 : undefined } });
  return parseJsonData<Challenge[]>(response.data);
}

export async function createChallenge(input: {
  title: string;
  description: string;
  metric: ChallengeMetric;
  target: number;
  start_date: string;
  end_date: string;
}): Promise<Challenge> {
  const response = await api.post(`${BASE}/challenges/`, input);
  return parseJsonData<Challenge>(response.data);
}

export async function deleteChallenge(id: number): Promise<void> {
  await api.delete(`${BASE}/challenges/${id}/`);
}

export async function toggleJoinChallenge(id: number): Promise<Challenge> {
  const response = await api.post(`${BASE}/challenges/${id}/join/`);
  return parseJsonData<Challenge>(response.data);
}

export async function getStandings(id: number): Promise<{ challenge: Challenge; rows: Standing[] }> {
  const response = await api.get(`${BASE}/challenges/${id}/standings/`);
  return parseJsonData(response.data);
}

export function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}
