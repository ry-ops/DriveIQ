// DriveIQ UI — API client. Same-origin /api/... requests to the Worker that
// also serves this app, so Cloudflare Access covers both.

import type { Vehicle, NewVehicle, MaintenanceRecord, Reminder, AskResponse, AianaConversation, VehicleSpec, IngestChunk, IngestResponse, Recall, ScheduleItem, Health } from '@/types';

const BASE = '';

// Sent with Aiana questions so "today" matches the owner's calendar.
const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export async function apiFetchRaw(path: string, init?: RequestInit): Promise<Response> {
  const hasBody = init?.body !== undefined && init.body !== null;
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { ...(hasBody ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.clone().json().catch(() => ({ detail: res.statusText }));
    throw Object.assign(new Error(body.detail || `HTTP ${res.status}`), { status: res.status, code: body.code as string | undefined, body });
  }
  return res;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetchRaw(path, init);
  return res.json() as Promise<T>;
}

const get = <T>(path: string) => apiFetch<T>(path);
const post = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined });
const patch = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined });
const put = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined });
const del = <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' });

export const api = {
  health: () => get<Health>('/api/health'),
  vehicle: {
    // null until the owner adds their vehicle (first run).
    get: () =>
      get<Vehicle>('/api/vehicle').catch((err) => {
        if (err?.status === 404) return null;
        throw err;
      }),
    create: (body: NewVehicle) => post<Vehicle>('/api/vehicle', body),
    update: (body: Partial<Pick<Vehicle, 'current_mileage' | 'color_exterior' | 'color_interior'>>) =>
      patch<Vehicle>('/api/vehicle', body),
    updateMileage: (mileage: number) => patch<Vehicle>(`/api/vehicle/mileage/${mileage}`),
  },
  maintenance: {
    list: (params?: { maintenance_type?: string; skip?: number; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.maintenance_type) qs.set('maintenance_type', params.maintenance_type);
      if (params?.skip) qs.set('skip', String(params.skip));
      if (params?.limit) qs.set('limit', String(params.limit));
      const suffix = qs.toString() ? `?${qs}` : '';
      return get<MaintenanceRecord[]>(`/api/maintenance${suffix}`);
    },
    get: (id: number) => get<MaintenanceRecord>(`/api/maintenance/${id}`),
    create: (body: Partial<MaintenanceRecord> & Pick<MaintenanceRecord, 'vehicle_id' | 'maintenance_type' | 'date_performed' | 'mileage'>) =>
      post<MaintenanceRecord>('/api/maintenance', body),
    update: (id: number, body: Partial<MaintenanceRecord>) => patch<MaintenanceRecord>(`/api/maintenance/${id}`, body),
    delete: (id: number) => del<{ message: string }>(`/api/maintenance/${id}`),
    summary: () =>
      get<{ type: string; count: number; total_cost: number; last_performed: string; last_mileage: number }[]>(
        '/api/maintenance/types/summary'
      ),
  },
  reminders: {
    list: (activeOnly = true) => get<Reminder[]>(`/api/reminders?active_only=${activeOnly}`),
    upcoming: (currentMileage?: number) =>
      get<Reminder[]>(`/api/reminders/upcoming${currentMileage !== undefined ? `?current_mileage=${currentMileage}` : ''}`),
    get: (id: number) => get<Reminder>(`/api/reminders/${id}`),
    create: (body: Partial<Reminder> & Pick<Reminder, 'vehicle_id' | 'title' | 'reminder_type'>) =>
      post<Reminder>('/api/reminders', body),
    update: (id: number, body: Partial<Reminder>) => patch<Reminder>(`/api/reminders/${id}`, body),
    complete: (id: number, body?: { mileage?: number; cost?: number; service_provider?: string; notes?: string }) =>
      post<Reminder>(`/api/reminders/${id}/complete`, body),
    delete: (id: number) => del<{ message: string }>(`/api/reminders/${id}`),
  },
  aiana: {
    ask: (query: string) => post<AskResponse>('/api/search/ask', { query, timezone: timezone() }),
    // A background lookup that neither reads nor joins the owner's shared
    // Aiana conversation (e.g. What's Next card spec previews).
    lookup: (query: string) => post<AskResponse>('/api/search/ask', { query, remember: false, timezone: timezone() }),
    documents: () => get<{ name: string; chunk_count: number; updated_at: string }[]>('/api/search/documents'),
    deleteDocument: (name: string) => del<{ document_name: string; removed: number }>(`/api/search/documents/${encodeURIComponent(name)}`),
    conversation: () => get<AianaConversation>('/api/search/conversation'),
    resetConversation: () => del<AianaConversation>('/api/search/conversation'),
    // Used by the document upload flow (src/lib/pdfIngest.ts).
    ingestChunks: (document_name: string, chunks: IngestChunk[]) =>
      post<IngestResponse>('/api/search/ingest', { document_name, chunks }),
    ingestPageImage: (document: string, page: number, variant: 'thumbnail' | 'full', bytes: ArrayBuffer) =>
      apiFetchRaw(`/api/pages/ingest/${encodeURIComponent(document)}/${page}/${variant}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: bytes,
      }),
  },
  vehicleSpecs: {
    list: () => get<VehicleSpec[]>('/api/vehicle-specs'),
    save: (body: Pick<VehicleSpec, 'vehicle_id' | 'maintenance_type' | 'spec_text'> & Partial<Pick<VehicleSpec, 'part_number' | 'source_note'>>) =>
      post<VehicleSpec>('/api/vehicle-specs', body),
    delete: (id: number) => del<{ message: string }>(`/api/vehicle-specs/${id}`),
  },
  schedule: {
    list: () => get<ScheduleItem[]>('/api/schedule'),
    save: (type: string, body: Partial<Pick<ScheduleItem, 'name' | 'interval_miles' | 'interval_months' | 'sort_order'>>) =>
      put<ScheduleItem>(`/api/schedule/${type}`, body),
    delete: (type: string) => del<{ message: string }>(`/api/schedule/${type}`),
  },
  recalls: {
    list: () => get<Recall[]>('/api/recalls'),
    updateStatus: (id: number, status: 'open' | 'remedied') => patch<Recall>(`/api/recalls/${id}`, { status }),
    check: () => post<{ checked: string; found: number; recalls: Recall[] }>('/api/recalls/check'),
  },
};
