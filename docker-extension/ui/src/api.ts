import { createDockerDesktopClient } from "@docker/extension-api-client";

const ddClient = createDockerDesktopClient();

// The backend runs as the first service in the extension's compose file.
// Docker Desktop SDK routes requests to it automatically.
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const service = ddClient.extension.vm?.service;
  if (!service) {
    throw new Error("Docker Desktop VM service not available");
  }

  let res;
  const url = `/api${path}`;

  switch (method) {
    case "GET":
      res = await service.get(url);
      break;
    case "POST":
      res = await service.post(url, body);
      break;
    case "PATCH":
      res = await service.patch(url, body);
      break;
    case "DELETE":
      res = await service.delete(url);
      break;
    default:
      throw new Error(`Unsupported method: ${method}`);
  }

  return res as T;
}

// ── Vehicle ──────────────────────────────────────────────────────────
export interface Vehicle {
  id: number;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  engine?: string;
  transmission?: string;
  drivetrain?: string;
  color_exterior?: string;
  color_interior?: string;
  purchase_date?: string;
  purchase_mileage?: number;
  current_mileage?: number;
  last_mileage_update?: string;
  created_at: string;
  updated_at?: string;
}

export const vehicleApi = {
  get: () => request<Vehicle>("GET", "/vehicle"),
  updateMileage: (mileage: number) =>
    request<Vehicle>("PATCH", `/vehicle/mileage/${mileage}`),
};

// ── Maintenance ──────────────────────────────────────────────────────
export interface MaintenanceRecord {
  id: number;
  vehicle_id: number;
  maintenance_type: string;
  description?: string;
  date_performed: string;
  mileage: number;
  cost?: number;
  parts_cost?: number;
  labor_cost?: number;
  service_provider?: string;
  location?: string;
  parts_used?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface MaintenanceSummary {
  type: string;
  count: number;
  total_cost: number;
  last_performed?: string;
  last_mileage?: number;
}

export const maintenanceApi = {
  getAll: (limit = 50) =>
    request<MaintenanceRecord[]>("GET", `/maintenance?limit=${limit}`),
  getSummary: () =>
    request<MaintenanceSummary[]>("GET", "/maintenance/types/summary"),
  create: (data: Partial<MaintenanceRecord>) =>
    request<MaintenanceRecord>("POST", "/maintenance", data),
};

// ── Reminders ────────────────────────────────────────────────────────
export interface Reminder {
  id: number;
  vehicle_id: number;
  title: string;
  description?: string;
  reminder_type: string;
  due_date?: string;
  due_mileage?: number;
  is_recurring: boolean;
  is_active: boolean;
  is_completed: boolean;
  completed_at?: string;
  created_at: string;
}

export interface SmartReminder {
  service_key: string;
  name: string;
  description: string;
  interval_miles: number;
  interval_months: number;
  priority: "high" | "medium" | "low";
  estimated_cost: number;
  next_mileage: number;
  next_date: string;
  miles_remaining: number;
  days_remaining: number;
  status: "overdue" | "due_soon" | "ok";
  last_service?: {
    date: string;
    mileage: number;
    service_type: string;
  };
}

export const remindersApi = {
  getUpcoming: (mileage: number) =>
    request<Reminder[]>("GET", `/reminders/upcoming?current_mileage=${mileage}`),
  getSmart: (mileage: number) =>
    request<SmartReminder[]>("GET", `/reminders/smart?current_mileage=${mileage}`),
  complete: (id: number) =>
    request<Reminder>("POST", `/reminders/${id}/complete`),
};

// ── Chat ─────────────────────────────────────────────────────────────
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  message: string;
  sources: Array<{
    document_name: string;
    page_number: number;
    content_preview?: string;
    thumbnail_url?: string;
  }>;
  session_id: string;
  model: string;
  query_intent: string;
}

export const chatApi = {
  send: (messages: ChatMessage[], sessionId?: string) =>
    request<ChatResponse>("POST", "/chat", {
      messages,
      session_id: sessionId,
    }),
  clearSession: (sessionId: string) =>
    request<void>("DELETE", `/chat/${sessionId}`),
};

// ── Search ───────────────────────────────────────────────────────────
export interface AskResponse {
  answer: string;
  sources: Array<{
    document_name: string;
    page_number: number;
    content_preview?: string;
  }>;
  key_terms: string[];
  model: string;
}

export const searchApi = {
  ask: (query: string) =>
    request<AskResponse>("POST", "/search/ask", { query }),
};

// ── Health ───────────────────────────────────────────────────────────
export const healthApi = {
  check: () => request<Record<string, unknown>>("GET", "/../health"),
};

export { ddClient };
