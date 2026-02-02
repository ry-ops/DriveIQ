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
export interface MaintenanceDocument {
  filename: string
  size: number
  path: string
}

export const maintenanceApi = {
  getAll: (type?: string) => api.get<MaintenanceRecord[]>('/maintenance', { params: { maintenance_type: type } }).then(r => r.data),
  get: (id: number) => api.get<MaintenanceRecord>(`/maintenance/${id}`).then(r => r.data),
  create: (data: Omit<MaintenanceRecord, 'id' | 'created_at' | 'updated_at'>) => api.post<MaintenanceRecord>('/maintenance', data).then(r => r.data),
  update: (id: number, data: Partial<MaintenanceRecord>) => api.patch<MaintenanceRecord>(`/maintenance/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/maintenance/${id}`),
  getSummary: () => api.get<MaintenanceSummary[]>('/maintenance/types/summary').then(r => r.data),
  // Document management
  uploadDocument: (recordId: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<MaintenanceRecord>(`/maintenance/${recordId}/documents`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data)
  },
  getDocuments: (recordId: number) => api.get<MaintenanceDocument[]>(`/maintenance/${recordId}/documents`).then(r => r.data),
  deleteDocument: (recordId: number, filename: string) => api.delete(`/maintenance/${recordId}/documents/${encodeURIComponent(filename)}`),
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
export interface AskSource {
  document: string
  page: number
  chapter?: string
  section?: string
  topics?: string[]
  thumbnail_url: string
  fullsize_url: string
  highlighted_url?: string | null
}

export interface AskResponse {
  answer: string
  sources: AskSource[]
  key_terms?: string[]
  model: string
}

export const searchApi = {
  search: (query: string, limit = 5) => api.post<SearchResult[]>('/search', { query, limit }).then(r => r.data),
  ask: (query: string) => api.post<AskResponse>('/search/ask', { query }).then(r => r.data),
}

// Chat API
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatSource {
  document: string
  page: number
  chapter?: string
  section?: string
  relevance?: number
  thumbnail_url: string
  fullsize_url: string
  highlighted_url?: string | null
}

export interface ChatResponse {
  message: string
  sources: ChatSource[]
  session_id: string
  model: string
  query_intent: string
}

export const chatApi = {
  send: (messages: ChatMessage[], sessionId?: string | null) =>
    api.post<ChatResponse>('/chat', { messages, session_id: sessionId }).then(r => r.data),
  clearSession: (sessionId: string) => api.delete(`/chat/${sessionId}`),
}

// Service Records API (CARFAX imports)
export interface ServiceRecord {
  id: number
  date: string
  mileage: number | null
  service_type: string
  description: string | null
  category: string
  source: string
  location: string | null
  tags: string[]
}

export interface ServiceRecordUpdate {
  date?: string
  mileage?: number
  service_type?: string
  description?: string
  category?: string
  source?: string
  location?: string
  tags?: string[]
}

export const serviceRecordsApi = {
  getAll: () => api.get<ServiceRecord[]>('/import/service-records').then(r => r.data),
  get: (id: number) => api.get<ServiceRecord>(`/import/service-records/${id}`).then(r => r.data),
  update: (id: number, data: ServiceRecordUpdate) => {
    const params = new URLSearchParams()
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (key === 'tags' && Array.isArray(value)) {
          value.forEach(tag => params.append('tags', tag))
        } else {
          params.append(key, String(value))
        }
      }
    })
    return api.patch(`/import/service-records/${id}?${params.toString()}`).then(r => r.data)
  },
  delete: (id: number) => api.delete(`/import/service-records/${id}`),
  getKPIs: () => api.get('/import/kpis').then(r => r.data),
  getTags: () => api.get<string[]>('/import/tags').then(r => r.data),
}

// Uploads API
export interface DocumentInfo {
  filename: string
  size: number
  path: string
  document_type: string
}

export const uploadsApi = {
  list: () => api.get<DocumentInfo[]>('/uploads').then(r => r.data),
  upload: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<{ filename: string; size: number; message: string }>('/uploads', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data)
  },
  delete: (filename: string) => api.delete(`/uploads/${encodeURIComponent(filename)}`),
}

export default api
