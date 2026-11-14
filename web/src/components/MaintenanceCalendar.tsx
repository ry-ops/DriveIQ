import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { formatDate } from '@/lib/date'
import { categorize, type Category } from '@/lib/maintenanceCategories'
import type { MaintenanceRecord } from '@/types'
import type { UpcomingItem } from '@/lib/maintenanceSchedule'

interface CalendarEvent {
  date: string
  kind: 'performed' | 'due' | 'overdue'
  type: string
  label: string
  category: Category
  record?: MaintenanceRecord
  upcoming?: UpcomingItem
}

const DOT_COLOR: Record<Category, string> = {
  fluids: 'bg-blue-500',
  filters: 'bg-emerald-500',
  brakes: 'bg-red-500',
  tires: 'bg-gray-600',
  inspections: 'bg-purple-500',
  electrical: 'bg-yellow-500',
  other: 'bg-amber-500',
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTH_LABEL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function buildEvents(records: MaintenanceRecord[], upcoming: UpcomingItem[]): CalendarEvent[] {
  const today = todayStr()
  const events: CalendarEvent[] = records.map((r) => ({
    date: r.date_performed,
    kind: 'performed',
    type: r.maintenance_type,
    label: r.maintenance_type.replace(/_/g, ' '),
    category: categorize(r.maintenance_type),
    record: r,
  }))
  for (const item of upcoming) {
    if (!item.dueDate) continue
    events.push({
      date: item.dueDate,
      kind: item.dueDate < today ? 'overdue' : 'due',
      type: item.type,
      label: item.name,
      category: item.category,
      upcoming: item,
    })
  }
  return events
}

export default function MaintenanceCalendar({
  records,
  upcoming,
}: {
  records: MaintenanceRecord[]
  upcoming: UpcomingItem[]
}) {
  const today = todayStr()
  const [viewedMonth, setViewedMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const events = useMemo(() => buildEvents(records, upcoming), [records, upcoming])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      if (!map.has(e.date)) map.set(e.date, [])
      map.get(e.date)!.push(e)
    }
    return map
  }, [events])

  const cells = useMemo(() => {
    const year = viewedMonth.getFullYear()
    const month = viewedMonth.getMonth()
    const firstWeekday = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const out: { date: string | null }[] = []
    for (let i = 0; i < firstWeekday; i++) out.push({ date: null })
    for (let d = 1; d <= daysInMonth; d++) {
      out.push({ date: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
    }
    return out
  }, [viewedMonth])

  const selectedEvents = selectedDate ? eventsByDate.get(selectedDate) ?? [] : []

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 max-w-xs mx-auto lg:mx-0">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setViewedMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            const d = new Date()
            setViewedMonth(new Date(d.getFullYear(), d.getMonth(), 1))
            setSelectedDate(null)
          }}
          className="text-sm font-bold text-gray-900"
        >
          {MONTH_LABEL[viewedMonth.getMonth()]} {viewedMonth.getFullYear()}
        </button>
        <button
          onClick={() => setViewedMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div key={i}>{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell.date) return <div key={i} />
          const dayEvents = eventsByDate.get(cell.date) ?? []
          const isToday = cell.date === today
          const isSelected = cell.date === selectedDate
          const hasOverdue = dayEvents.some((e) => e.kind === 'overdue')
          return (
            <button
              key={cell.date}
              onClick={() => setSelectedDate(cell.date === selectedDate ? null : cell.date)}
              className={`aspect-square rounded-md flex flex-col items-center justify-center gap-0.5 text-xs transition-colors ${
                isSelected
                  ? 'bg-accent text-white'
                  : isToday
                    ? 'bg-red-50 text-accent font-bold'
                    : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span className="flex items-center gap-0.5">
                {cell.date.slice(-2).replace(/^0/, '')}
                {hasOverdue && !isSelected && <AlertTriangle className="h-2.5 w-2.5 text-red-500" />}
              </span>
              {dayEvents.length > 0 && (
                <span className="flex gap-0.5">
                  {dayEvents.slice(0, 3).map((e, j) => (
                    <span
                      key={j}
                      className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-white' : DOT_COLOR[e.category]}`}
                    />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {selectedDate && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          <p className="text-xs font-semibold text-gray-500">{formatDate(selectedDate)}</p>
          {selectedEvents.length === 0 ? (
            <p className="text-sm text-gray-400">No events this day.</p>
          ) : (
            selectedEvents.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className={`h-2 w-2 rounded-full shrink-0 ${DOT_COLOR[e.category]}`} />
                <span className="capitalize text-gray-900 flex-1">{e.label}</span>
                {e.kind === 'performed' && e.record && (
                  <span className="text-xs text-gray-500">{e.record.mileage.toLocaleString()} mi</span>
                )}
                {e.kind === 'overdue' && <span className="text-xs font-medium text-red-600">Overdue</span>}
                {e.kind === 'due' && <span className="text-xs font-medium text-amber-600">Est. due</span>}
              </div>
            ))
          )}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" /> Performed
        </span>
        <span className="flex items-center gap-1">
          <AlertTriangle className="h-2.5 w-2.5 text-red-500" /> Overdue
        </span>
      </div>
    </div>
  )
}
