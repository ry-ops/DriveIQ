import { createDockerDesktopClient } from "@docker/extension-api-client";
import type {
  Vehicle,
  MaintenanceRecord,
  MaintenanceSummary,
  Reminder,
  SmartReminder,
  ChatMessage,
  ChatResponse,
  AskResponse,
  ServiceRecord,
  DocumentInfo,
  IngestedDocumentInfo,
  AutoGenerateResponse,
  CarfaxReport,
} from "./types";

const ddClient = createDockerDesktopClient();

async function get<T>(path: string): Promise<T> {
  const service = ddClient.extension.vm?.service;
  if (!service) throw new Error("VM service not available");
  return (await service.get(path)) as T;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const service = ddClient.extension.vm?.service;
  if (!service) throw new Error("VM service not available");
  return (await service.post(path, body)) as T;
}

async function patch<T>(path: string, body?: unknown): Promise<T> {
  const service = ddClient.extension.vm?.service;
  if (!service) throw new Error("VM service not available");
  return (await service.patch(path, body)) as T;
}

async function del<T>(path: string): Promise<T> {
  const service = ddClient.extension.vm?.service;
  if (!service) throw new Error("VM service not available");
  return (await service.delete(path)) as T;
}

// Vehicle API
export const vehicleApi = {
  get: () => get<Vehicle>("/api/vehicle"),
  update: (data: Partial<Vehicle>) => patch<Vehicle>("/api/vehicle", data),
  updateMileage: (mileage: number) => patch<Vehicle>(`/api/vehicle/mileage/${mileage}`),
};

// Maintenance API
export const maintenanceApi = {
  getAll: (type?: string) =>
    get<MaintenanceRecord[]>(
      `/api/maintenance${type ? `?maintenance_type=${type}` : ""}`
    ),
  get: (id: number) => get<MaintenanceRecord>(`/api/maintenance/${id}`),
  create: (data: Partial<MaintenanceRecord>) =>
    post<MaintenanceRecord>("/api/maintenance", data),
  update: (id: number, data: Partial<MaintenanceRecord>) =>
    patch<MaintenanceRecord>(`/api/maintenance/${id}`, data),
  delete: (id: number) => del(`/api/maintenance/${id}`),
  getSummary: () => get<MaintenanceSummary[]>("/api/maintenance/types/summary"),
};

// Reminders API
export const remindersApi = {
  getAll: (activeOnly = true) =>
    get<Reminder[]>(`/api/reminders?active_only=${activeOnly}`),
  getUpcoming: (currentMileage?: number) =>
    get<Reminder[]>(
      `/api/reminders/upcoming${currentMileage ? `?current_mileage=${currentMileage}` : ""}`
    ),
  get: (id: number) => get<Reminder>(`/api/reminders/${id}`),
  create: (data: Partial<Reminder>) => post<Reminder>("/api/reminders", data),
  update: (id: number, data: Partial<Reminder>) =>
    patch<Reminder>(`/api/reminders/${id}`, data),
  complete: (id: number) => post<Reminder>(`/api/reminders/${id}/complete`),
  delete: (id: number) => del(`/api/reminders/${id}`),
  getSmart: (currentMileage: number) =>
    get<SmartReminder[]>(`/api/reminders/smart?current_mileage=${currentMileage}`),
  getSchedule: () => get("/api/reminders/schedule"),
  autoGenerate: (vehicleId: number, currentMileage: number) =>
    post<AutoGenerateResponse>(
      `/api/reminders/auto-generate?vehicle_id=${vehicleId}&current_mileage=${currentMileage}`
    ),
};

// Search API
export const searchApi = {
  search: (query: string, limit = 5) =>
    post("/api/search", { query, limit }),
  ask: (query: string) => post<AskResponse>("/api/search/ask", { query }),
};

// Chat API
export const chatApi = {
  send: (messages: ChatMessage[], sessionId?: string | null) =>
    post<ChatResponse>("/api/chat", { messages, session_id: sessionId }),
  clearSession: (sessionId: string) => del(`/api/chat/${sessionId}`),
};

// Service Records API (CARFAX imports)
export const serviceRecordsApi = {
  getAll: () => get<ServiceRecord[]>("/api/import/service-records"),
  get: (id: number) => get<ServiceRecord>(`/api/import/service-records/${id}`),
  delete: (id: number) => del(`/api/import/service-records/${id}`),
  getKPIs: () => get("/api/import/kpis"),
  getTags: () => get<string[]>("/api/import/tags"),
};

// Uploads API
export const uploadsApi = {
  list: () => get<DocumentInfo[]>("/api/uploads"),
  listIngested: () => get<IngestedDocumentInfo[]>("/api/uploads/ingested"),
  delete: (filename: string) => del(`/api/uploads/${encodeURIComponent(filename)}`),
};

// CARFAX report
export const importApi = {
  getCarfaxReport: () => get<CarfaxReport>("/api/import/carfax-report"),
};

export { ddClient };
