// Row shapes from the Worker's D1 tables (migrations/0001_init.sql).

export interface Vehicle {
  id: number;
  vin: string | null;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  engine: string | null;
  transmission: string | null;
  drivetrain: string | null;
  color_exterior: string | null;
  color_interior: string | null;
  purchase_date: string | null;
  purchase_mileage: number | null;
  current_mileage: number | null;
  last_mileage_update: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface MaintenanceRecord {
  id: number;
  vehicle_id: number;
  maintenance_type: string;
  description: string | null;
  date_performed: string;
  mileage: number;
  cost: number | null;
  parts_cost: number | null;
  labor_cost: number | null;
  service_provider: string | null;
  location: string | null;
  parts_used: string | null;
  notes: string | null;
  documents: string | null;
  photos: string | null;
  created_at: string;
  updated_at: string | null;
}

// Exact specs the owner confirmed (oil capacity, tire size, part numbers),
// one per maintenance type. Aiana prefers these over document excerpts.
export interface VehicleSpec {
  id: number;
  vehicle_id: number;
  maintenance_type: string;
  spec_text: string;
  part_number: string | null;
  source_note: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface AskSource {
  document: string;
  page: number | null;
  relevance: number;
  thumbnail_url?: string;
  fullsize_url?: string;
}

export interface AskResponse {
  answer: string;
  sources: AskSource[];
  // True when Aiana called the create_reminder tool during this turn — the
  // caller should invalidate the ['reminders'] query so What's Next refreshes.
  reminder_created?: boolean;
  // True when Aiana called the update_reminder tool during this turn — same
  // invalidation as reminder_created, just for an edit instead of a new one.
  reminder_updated?: boolean;
  // When the shared conversation resets if no new message arrives (ISO).
  expires_at?: string;
}

// GET /api/search/conversation — Aiana's single shared conversation (same on
// every device). It resets after 4 hours with no new message.
export interface AianaConversation {
  messages: { role: 'user' | 'assistant'; content: string; sources?: AskSource[] }[];
  expires_at: string | null;
}

// Wire shapes for POST /api/search/ingest — used by the Aiana document
// upload flow (src/lib/pdfIngest.ts), which parses/chunks/renders PDFs
// client-side and posts the results to the Worker's ingest endpoints.
export interface IngestChunk {
  content: string;
  chunk_index: number;
  page_number: number | null;
}

export interface IngestResponse {
  ingested: number;
}

export interface Reminder {
  id: number;
  vehicle_id: number;
  title: string;
  description: string | null;
  reminder_type: 'mileage' | 'date' | 'both';
  due_date: string | null;
  due_mileage: number | null;
  is_recurring: 0 | 1;
  recurrence_interval_days: number | null;
  recurrence_interval_miles: number | null;
  is_active: 0 | 1;
  is_completed: 0 | 1;
  completed_at: string | null;
  notify_days_before: number;
  notify_miles_before: number;
  last_notified: string | null;
  // 'appointment' when Aiana created this via create_reminder from a chat
  // message; null for reminders the owner set up manually. Appointments skip
  // the Ask Aiana button — there's no manual page to look up for an event.
  category: 'appointment' | null;
  created_at: string;
  updated_at: string | null;
  // Short human-friendly reference (e.g. "DR-2026-0042") the backend derives
  // from id + created_at — see src/worker/core/reminders.ts.
  // Not stored; always present on API responses, nothing to backfill.
  reference_number: string;
  // JSON-encoded array of MAINTENANCE_SCHEDULE `type` slugs
  // (@/lib/maintenanceSchedule) this reminder/appointment already covers —
  // one ticket can span several services (e.g. front/rear differential +
  // transfer case in one visit). Null when it covers none. Use
  // parseMaintenanceTypes() rather than reading this directly — it also
  // accepts a bare (non-JSON) single type from before multi-type support.
  // Set via Aiana's create_reminder/update_reminder tools, or by hand via
  // PATCH. Dashboard uses it to hide the now-redundant Forecast card(s).
  maintenance_type: string | null;
}

// NHTSA recalls for the vehicle's make, model and year. status starts
// 'open': NHTSA doesn't say whether this vehicle's remedy was done.
export interface Recall {
  id: number;
  vehicle_id: number;
  nhtsa_campaign: string;
  component: string;
  summary: string;
  consequence: string | null;
  remedy: string | null;
  report_receipt_date: string | null;
  status: 'open' | 'remedied';
  created_at: string;
  updated_at: string | null;
}

export interface NewVehicle {
  vin?: string | null;
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  current_mileage?: number | null;
  purchase_date?: string | null;
  purchase_mileage?: number | null;
}

// A row of the owner's maintenance schedule (editable in Settings).
export interface ScheduleItem {
  type: string;
  name: string;
  interval_miles: number | null;
  interval_months: number | null;
  sort_order: number;
  updated_at: string | null;
}

export interface Health {
  status: string;
  version: string;
  access: 'ok' | 'access_not_configured' | 'not_signed_in' | 'invalid_token';
  anthropic_key: 'set' | 'missing';
}
