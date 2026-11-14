export interface Vehicle {
  id: number
  vin: string
  year: number
  make: string
  model: string
  trim?: string
  engine?: string
  transmission?: string
  drivetrain?: string
  color_exterior?: string
  color_interior?: string
  purchase_date?: string
  purchase_mileage?: number
  current_mileage?: number
  last_mileage_update?: string
  created_at: string
  updated_at?: string
}

export interface MaintenanceRecord {
  id: number
  vehicle_id: number
  maintenance_type: string
  description?: string
  date_performed: string
  mileage: number
  cost?: number
  parts_cost?: number
  labor_cost?: number
  service_provider?: string
  location?: string
  parts_used?: string
  notes?: string
  created_at: string
  updated_at?: string
}

export interface Reminder {
  id: number
  vehicle_id: number
  title: string
  description?: string
  reminder_type: string
  due_date?: string
  due_mileage?: number
  is_recurring: boolean
  recurrence_interval_days?: number
  recurrence_interval_miles?: number
  is_active: boolean
  is_completed: boolean
  completed_at?: string
  notify_days_before: number
  notify_miles_before: number
  last_notified?: string
  created_at: string
  updated_at?: string
}

export interface SearchResult {
  content: string
  document_name: string
  page_number?: number
  score: number
}

export interface MaintenanceSummary {
  type: string
  count: number
  total_cost: number
  last_performed: string
  last_mileage: number
}
