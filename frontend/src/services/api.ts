const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Startup {
  id: string;
  name: string;
  description: string;
  industry: string;
  stage: string;
  validation_score: number;
  executives: string[];
  meeting_count: number;
  created_at: string;
  updated_at: string;
  meetings?: Meeting[];
  decisions?: Decision[];
  reports?: Report[];
}

export interface Meeting {
  id: string;
  startup_id: string;
  meeting_type: string;
  executives: string[];
  status: string;
  created_at: string;
  completed_at?: string;
  messages?: MeetingMessage[];
  decisions?: Decision[];
}

export interface MeetingMessage {
  id: string;
  meeting_id: string;
  executive_role: string;
  content: string;
  message_type: string;
  stage: string;
  sequence_order: number;
  created_at: string;
}

export interface Report {
  id: string;
  startup_id: string;
  meeting_id: string;
  report_type: string;
  content: Record<string, any>;
  created_at: string;
}

export interface Decision {
  id: string;
  startup_id: string;
  meeting_id: string;
  decision_text: string;
  made_by: string;
  decision_type: string;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || 'API error');
  }
  return res.json();
}

// ─── Startups ─────────────────────────────────────────────────────────────────

export const api = {
  // Startups
  createStartup: (payload: { name: string; description: string; industry: string; executives: string[] }) =>
    apiFetch<Startup>('/api/startups', { method: 'POST', body: JSON.stringify(payload) }),

  listStartups: () =>
    apiFetch<Startup[]>('/api/startups'),

  getStartup: (id: string) =>
    apiFetch<Startup>(`/api/startups/${id}`),

  updateStage: (id: string, stage: string) =>
    apiFetch<Startup>(`/api/startups/${id}/stage?stage=${stage}`, { method: 'PATCH' }),

  deleteStartup: (id: string) =>
    apiFetch<{ status: string }>(`/api/startups/${id}`, { method: 'DELETE' }),

  // Meetings
  createMeeting: (payload: { startup_id: string; meeting_type: string; executives: string[] }) =>
    apiFetch<Meeting>('/api/meetings', { method: 'POST', body: JSON.stringify(payload) }),

  getMeeting: (id: string) =>
    apiFetch<Meeting>(`/api/meetings/${id}`),

  generateReport: (meetingId: string) =>
    apiFetch<{ status: string, report: Report }>(`/api/meetings/${meetingId}/report`, { method: 'POST' }),

  createFollowup: (meetingId: string, payload: { question: string }) =>
    apiFetch<{ status: string, meeting_id: string }>(`/api/meetings/${meetingId}/followup`, { method: 'POST', body: JSON.stringify(payload) }),

  // Health
  health: () =>
    apiFetch<{ status: string }>('/health'),
};
