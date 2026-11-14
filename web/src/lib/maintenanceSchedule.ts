// Forecast: when each service on the owner's schedule is next due, from the
// schedule (GET /api/schedule, editable in Settings) and service history.
import type { MaintenanceRecord, ScheduleItem } from '@/types'
import { categorize, type Category } from '@/lib/maintenanceCategories'

export interface UpcomingItem {
  type: string
  name: string
  intervalMiles: number | null
  intervalMonths: number | null
  category: Category
  lastPerformedDate: string | null
  lastPerformedMileage: number | null
  dueMileage: number | null
  milesRemaining: number | null
  status: 'overdue' | 'due_soon' | 'ok'
  dueDate: string | null
}

/** Estimates a calendar due date from the last-performed date + interval. Only
 * meaningful when there's a real last-performed record to anchor it to. */
function estimateDueDate(lastPerformedDate: string | null, intervalMonths: number | null): string | null {
  if (!lastPerformedDate || !intervalMonths) return null
  const [y, m, d] = lastPerformedDate.split('-').map(Number)
  const due = new Date(y, m - 1 + intervalMonths, d)
  return `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`
}

export function computeUpcoming(
  schedule: ScheduleItem[],
  records: MaintenanceRecord[],
  currentMileage: number,
  dueSoonWindowMiles = 1000,
  today = new Date().toISOString().slice(0, 10)
): UpcomingItem[] {
  return schedule
    .map((item) => {
      // records arrive newest first
      const last = records.find((r) => r.maintenance_type === item.type)
      const dueMileage = item.interval_miles ? (last ? last.mileage : 0) + item.interval_miles : null
      const milesRemaining = dueMileage != null ? dueMileage - currentMileage : null
      const dueDate = estimateDueDate(last?.date_performed ?? null, item.interval_months)

      let status: UpcomingItem['status'] = 'ok'
      if ((milesRemaining != null && milesRemaining <= 0) || (dueDate != null && dueDate <= today)) status = 'overdue'
      else if (milesRemaining != null && milesRemaining <= dueSoonWindowMiles) status = 'due_soon'

      return {
        type: item.type,
        name: item.name,
        intervalMiles: item.interval_miles,
        intervalMonths: item.interval_months,
        category: categorize(item.type),
        lastPerformedDate: last?.date_performed ?? null,
        lastPerformedMileage: last?.mileage ?? null,
        dueMileage,
        milesRemaining,
        status,
        dueDate,
      }
    })
    .sort((a, b) => (a.milesRemaining ?? Infinity) - (b.milesRemaining ?? Infinity))
}

// Reminder['maintenance_type'] holds the set of schedule `type` slugs a
// reminder covers (one visit can cover several services), JSON-encoded. A
// plain string is also accepted, for a single type.
export function parseMaintenanceTypes(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((t): t is string => typeof t === 'string')
  } catch {
    // Not JSON: a single type.
  }
  return [raw]
}
