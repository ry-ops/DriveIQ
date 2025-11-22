import axios from 'axios'
import type { Vehicle, MaintenanceRecord, Reminder, SearchResult, MaintenanceSummary } from '../types'

const api = axios.create({
  baseURL: '/api',
})

// Vehicle API
export const vehicleApi = {
  get: () => api.get<Vehicle>('/vehicle').then(r => r.data),
  update: (data: Partial<Vehicle>) => api.patch<Vehicle>('/vehicle', data).then(r => r.data),
  updateMileage: (mileage: number) => api.patch<Vehicle>(`/vehicle/mileage/${mileage}`).then(r => r.data),
}

// Maintenance API
export const maintenanceApi = {
  getAll: (type?: string) => api.get<MaintenanceRecord[]>('/maintenance', { params: { maintenance_type: type } }).then(r => r.data),
  get: (id: number) => api.get<MaintenanceRecord>(`/maintenance/${id}`).then(r => r.data),
  create: (data: Omit<MaintenanceRecord, 'id' | 'created_at' | 'updated_at'>) => api.post<MaintenanceRecord>('/maintenance', data).then(r => r.data),
  update: (id: number, data: Partial<MaintenanceRecord>) => api.patch<MaintenanceRecord>(`/maintenance/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/maintenance/${id}`),
  getSummary: () => api.get<MaintenanceSummary[]>('/maintenance/types/summary').then(r => r.data),
}

// Reminders API
export const remindersApi = {
  getAll: (activeOnly = true) => api.get<Reminder[]>('/reminders', { params: { active_only: activeOnly } }).then(r => r.data),
  getUpcoming: (currentMileage?: number) => api.get<Reminder[]>('/reminders/upcoming', { params: { current_mileage: currentMileage } }).then(r => r.data),
  get: (id: number) => api.get<Reminder>(`/reminders/${id}`).then(r => r.data),
  create: (data: Omit<Reminder, 'id' | 'created_at' | 'updated_at' | 'is_active' | 'is_completed' | 'completed_at' | 'last_notified'>) => api.post<Reminder>('/reminders', data).then(r => r.data),
  update: (id: number, data: Partial<Reminder>) => api.patch<Reminder>(`/reminders/${id}`, data).then(r => r.data),
  complete: (id: number) => api.post<Reminder>(`/reminders/${id}/complete`).then(r => r.data),
  delete: (id: number) => api.delete(`/reminders/${id}`),
}

// Search API
export const searchApi = {
  search: (query: string, limit = 5) => api.post<SearchResult[]>('/search', { query, limit }).then(r => r.data),
  ask: (query: string) => api.post<{ answer: string; sources: Array<{ document: string; page: number }> }>('/search/ask', { query }).then(r => r.data),
}

export default api
