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

export interface MaintenanceRecord {
  id: number;
  vehicle_id: number;
  maintenance_type: string;
  description?: string;
  date_performed: string;
  mileage: number;
  cost?: number | null;
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

export interface Reminder {
  id: number;
  vehicle_id: number;
  title: string;
  description?: string;
  reminder_type: string;
  due_date?: string;
  due_mileage?: number;
  is_recurring: boolean;
  recurrence_interval_days?: number;
  recurrence_interval_miles?: number;
  is_active: boolean;
  is_completed: boolean;
  completed_at?: string;
  notify_days_before: number;
  notify_miles_before: number;
  last_notified?: string;
  created_at: string;
  updated_at?: string;
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
  next_date: string | null;
  miles_remaining: number;
  days_remaining: number | null;
  status: "overdue" | "due_soon" | "ok";
  last_service: {
    date: string;
    mileage: number;
    service_type: string;
  } | null;
}

export interface SearchResult {
  content: string;
  document_name: string;
  page_number?: number;
  score: number;
}

export interface ChatSource {
  document: string;
  page: number;
  chapter?: string;
  section?: string;
  relevance?: number;
  thumbnail_url: string;
  fullsize_url: string;
  highlighted_url?: string | null;
}

export interface ChatResponse {
  message: string;
  sources: ChatSource[];
  session_id: string;
  model: string;
  query_intent: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AskSource {
  document: string;
  page: number;
  chapter?: string;
  section?: string;
  topics?: string[];
  thumbnail_url: string;
  fullsize_url: string;
  highlighted_url?: string | null;
}

export interface AskResponse {
  answer: string;
  sources: AskSource[];
  key_terms?: string[];
  model: string;
}

export interface ServiceRecord {
  id: number;
  date: string;
  mileage: number | null;
  service_type: string;
  description: string | null;
  category: string;
  source: string;
  location: string | null;
  tags: string[];
}

export interface DocumentInfo {
  filename: string;
  size: number;
  path: string;
  document_type: string;
}

export interface IngestedDocumentInfo {
  document_name: string;
  document_type: string | null;
  chunk_count: number;
  page_count: number;
  topics: string[];
  on_disk: boolean;
}

export interface CarfaxReport {
  retail_value: number;
  last_odometer: number;
  owner_count: number;
}

export interface AutoGenerateResponse {
  message: string;
  reminders: {
    service_key: string;
    name: string;
    due_date: string | null;
    due_mileage: number;
  }[];
}
