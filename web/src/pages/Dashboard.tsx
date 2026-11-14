import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Gauge, FileText, Settings2, Wrench, Bell, Check, Plus, X,
  TrendingUp, CheckCircle2, ChevronDown, ChevronUp, MapPin, Clock, CalendarClock, Sparkles, AlertTriangle,
} from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate, daysSince, todayISO } from '@/lib/date'
import { CATEGORY_META } from '@/lib/maintenanceCategories'
import { computeUpcoming, parseMaintenanceTypes, type UpcomingItem } from '@/lib/maintenanceSchedule'
import { forecastAianaQuery, forecastSpecPreviewQuery, reminderAianaQuery, stripMarkdown } from '@/lib/aianaQueries'
import type { Reminder, MaintenanceRecord, VehicleSpec } from '@/types'
import AddVehicle from '@/components/AddVehicle'

function AskAianaLink({ query }: { query: string }) {
  return (
    <Link
      to={`/aiana?q=${encodeURIComponent(query)}`}
      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
      title="Ask Aiana about this"
    >
      <Sparkles className="h-4 w-4" />
      Ask Aiana
    </Link>
  )
}

const URGENCY_STYLE: Record<UpcomingItem['status'], { border: string; badge: string }> = {
  overdue: { border: 'border-red-500', badge: 'text-red-600 bg-red-50 border-red-200' },
  due_soon: { border: 'border-amber-500', badge: 'text-amber-600 bg-amber-50 border-amber-200' },
  ok: { border: 'border-emerald-500', badge: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
}

function Tag({ label, className }: { label: string; className: string }) {
  return (
    <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${className}`}>
      {label}
    </span>
  )
}

function ReminderCard({
  reminder,
  isExpanded,
  onToggle,
  onLogService,
  onMarkDone,
  isPending,
  typeName,
}: {
  reminder: Reminder
  typeName: (type: string) => string
  isExpanded: boolean
  onToggle: () => void
  onLogService: () => void
  onMarkDone: () => void
  isPending: boolean
}) {
  const isAppointment = reminder.category === 'appointment'
  const coveredTypeNames = parseMaintenanceTypes(reminder.maintenance_type).map(typeName)

  return (
    <div className={`bg-white rounded-xl shadow-md border-l-4 overflow-hidden ${isAppointment ? 'border-blue-500' : 'border-accent'}`}>
      <button onClick={onToggle} className="w-full p-4 text-left hover:bg-gray-50 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`p-2 rounded-lg shrink-0 ${isAppointment ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-accent'}`}>
              <CalendarClock className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
                <h3 className="font-semibold text-gray-900 wrap-break-word">{reminder.title}</h3>
                {isAppointment ? (
                  <Tag label="Appointment" className="bg-blue-600 text-white" />
                ) : (
                  <Tag label="Reminder" className="bg-accent text-white" />
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {reminder.due_date && `Due ${formatDate(reminder.due_date)}`}
                {reminder.due_date && reminder.due_mileage && ' • '}
                {reminder.due_mileage && `${reminder.due_mileage.toLocaleString()} mi`}
              </p>
              {/* Short reference (e.g. "DR-2026-0042") to quote back to Aiana
                  or a shop instead of the title — see reference_number on
                  the Reminder type. */}
              <p className="text-xs text-gray-400 font-mono mt-0.5">{reminder.reference_number}</p>
            </div>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-gray-400 shrink-0" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400 shrink-0" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-4 border-t bg-gray-50">
          {reminder.description && <p className="text-sm text-gray-600 mb-3">{reminder.description}</p>}
          {/* Explains why there's no separate Forecast card for this
              service (or services) — it's covered by this reminder instead,
              per coveredMaintenanceTypes filtering `upcoming` below. */}
          {coveredTypeNames.length > 0 && (
            <p className="text-xs text-gray-500 mb-3">
              Covers the forecasted {coveredTypeNames.join(', ')} service{coveredTypeNames.length > 1 ? 's' : ''}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onLogService}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              title="Log service with cost & provider"
            >
              <Plus className="h-4 w-4" />
              Log service
            </button>
            <button
              onClick={onMarkDone}
              disabled={isPending}
              className="flex-1 flex items-center justify-center gap-1.5 border border-accent text-accent px-3 py-1.5 rounded-lg font-medium text-sm hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              <Check className="h-4 w-4" />
              Mark done
            </button>
          </div>
          {/* Nothing to look up in the manual for a scheduled appointment —
              only for a part or fluid, so schedule-based reminders skip this. */}
          {!isAppointment && (
            <div className="mt-2">
              <AskAianaLink query={reminderAianaQuery(reminder.title)} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ForecastCard({
  item,
  lastRecord,
  curatedSpec,
  currentMileage,
  isExpanded,
  onToggle,
  onLogService,
  onMarkDone,
  isPending,
}: {
  item: UpcomingItem
  lastRecord?: MaintenanceRecord
  curatedSpec?: VehicleSpec
  currentMileage: number
  isExpanded: boolean
  onToggle: () => void
  onLogService: () => void
  onMarkDone: () => void
  isPending: boolean
}) {
  const meta = CATEGORY_META[item.category]
  const Icon = meta.icon
  const { border, badge } = URGENCY_STYLE[item.status]
  const aianaQuery = forecastAianaQuery(item.type, item.name)

  const statusLabel = {
    overdue: 'Overdue',
    due_soon: 'Due soon',
    ok: item.milesRemaining != null ? `${Math.round(item.milesRemaining).toLocaleString()} mi left` : item.dueDate ? `Due ${formatDate(item.dueDate)}` : 'On schedule',
  }[item.status]

  // Only hit the live LLM+RAG lookup for types without a curated spec — a
  // reviewed, exact fact beats a re-generated (and possibly re-truncated)
  // answer every time. Fetched once, on first expand, and cached
  // indefinitely — an LLM+RAG call per card isn't free, and the answer
  // doesn't change between page loads. Uses a plain-text-requesting variant
  // of the question — the deep-link (AskAianaLink below) uses the natural
  // one, since that opens the full chat page where markdown renders properly.
  const spec = useQuery({
    queryKey: ['aiana-spec', item.type],
    // lookup, not ask: a preview shouldn't land in the Aiana conversation.
    queryFn: () => api.aiana.lookup(forecastSpecPreviewQuery(item.type, item.name)),
    enabled: isExpanded && !curatedSpec,
    staleTime: Infinity,
    retry: false,
  })
  const specText = spec.data ? stripMarkdown(spec.data.answer) : null
  const specPreview = specText && specText.length > 220 ? `${specText.slice(0, 220).trim()}…` : specText

  return (
    <div className={`bg-white rounded-xl shadow-md border-l-4 overflow-hidden transition-all ${border}`}>
      <button onClick={onToggle} className="w-full p-4 text-left hover:bg-gray-50 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`p-2 rounded-lg shrink-0 ${meta.color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
                <h3 className="font-semibold text-gray-900 wrap-break-word">{item.name}</h3>
                <Tag label="Forecast" className="bg-gray-900 text-white" />
              </div>
              <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1 border ${badge}`}>
                {statusLabel}
              </div>
            </div>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-gray-400 shrink-0" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400 shrink-0" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 border-t bg-gray-50">
          <div className="grid grid-cols-2 gap-4 pt-4">
            {item.dueMileage != null && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Due Mileage</p>
                <p className="font-medium text-gray-900">{item.dueMileage.toLocaleString()} mi</p>
              </div>
            )}
            {item.dueDate && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Est. Due Date</p>
                <p className="font-medium text-gray-900">{formatDate(item.dueDate)}</p>
              </div>
            )}
          </div>

          {lastRecord?.service_provider && (
            <div className="mt-4 p-3 bg-white rounded-lg border flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-400" />
              <span className="font-medium text-gray-900">{lastRecord.service_provider}</span>
            </div>
          )}

          {item.lastPerformedDate && (
            <div className="mt-3 flex items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>{Math.floor(daysSince(item.lastPerformedDate) / 30)} months since last service</span>
              </div>
              {item.lastPerformedMileage !== null && (
                <div className="flex items-center gap-1">
                  <Gauge className="h-4 w-4" />
                  <span>{(currentMileage - item.lastPerformedMileage).toLocaleString()} mi since last</span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={onLogService}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              title="Log service with cost & provider"
            >
              <Plus className="h-4 w-4" />
              Log service
            </button>
            <button
              onClick={onMarkDone}
              disabled={isPending}
              className="flex-1 flex items-center justify-center gap-1.5 border border-accent text-accent px-3 py-1.5 rounded-lg font-medium text-sm hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              <Check className="h-4 w-4" />
              Mark done
            </button>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200">
            {curatedSpec ? (
              <>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">Spec</p>
                <p className="text-sm text-gray-700">{curatedSpec.spec_text}</p>
                {curatedSpec.part_number && (
                  <p className="text-xs text-gray-400 mt-1 font-mono">Part {curatedSpec.part_number}</p>
                )}
              </>
            ) : (
              <>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  From the manual
                </p>
                {spec.isLoading && <p className="text-sm text-gray-400">Asking Aiana…</p>}
                {spec.isError && <p className="text-sm text-gray-400">Couldn't reach Aiana just now.</p>}
                {specPreview && <p className="text-sm text-gray-700">{specPreview}</p>}
              </>
            )}
            <div className="mt-3">
              <AskAianaLink query={aianaQuery} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const queryClient = useQueryClient()
  const [mileageInput, setMileageInput] = useState('')
  const [blurredCards, setBlurredCards] = useState<Set<string>>(new Set())
  const [expandedForecast, setExpandedForecast] = useState<Set<string>>(new Set())
  const [expandedReminders, setExpandedReminders] = useState<Set<number>>(new Set())
  const [logTarget, setLogTarget] = useState<{ kind: 'reminder'; reminder: Reminder } | { kind: 'forecast'; item: UpcomingItem } | null>(null)
  const [logCost, setLogCost] = useState('')
  const [logProvider, setLogProvider] = useState('')
  const [logNotes, setLogNotes] = useState('')
  const [recallsOpen, setRecallsOpen] = useState(false)

  const closeLogModal = () => {
    setLogTarget(null)
    setLogCost('')
    setLogProvider('')
    setLogNotes('')
  }

  const toggleBlur = (cardId: string) => {
    setBlurredCards((prev) => {
      const next = new Set(prev)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  const toggleForecast = (type: string) => {
    setExpandedForecast((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const toggleReminder = (id: number) => {
    setExpandedReminders((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const { data: vehicle, isLoading, error } = useQuery({ queryKey: ['vehicle'], queryFn: api.vehicle.get })
  const { data: reminders } = useQuery({ queryKey: ['reminders'], queryFn: () => api.reminders.list() })
  const { data: records } = useQuery({ queryKey: ['maintenance'], queryFn: () => api.maintenance.list() })
  const { data: schedule } = useQuery({ queryKey: ['schedule'], queryFn: api.schedule.list })
  const { data: vehicleSpecs } = useQuery({ queryKey: ['vehicle-specs'], queryFn: api.vehicleSpecs.list })
  const { data: recalls } = useQuery({ queryKey: ['recalls'], queryFn: api.recalls.list })

  const updateMileage = useMutation({
    mutationFn: (mileage: number) => api.vehicle.updateMileage(mileage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle'] })
      setMileageInput('')
    },
  })

  const completeReminder = useMutation({
    mutationFn: ({ id, details }: { id: number; details?: { mileage?: number; cost?: number; service_provider?: string; notes?: string } }) =>
      api.reminders.complete(id, details),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-summary'] })
      closeLogModal()
    },
  })

  const checkRecalls = useMutation({
    mutationFn: api.recalls.check,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recalls'] }),
  })

  const updateRecallStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'open' | 'remedied' }) => api.recalls.updateStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recalls'] }),
  })

  // Forecast items aren't backed by a reminder — there's nothing to
  // "complete", so logging one directly creates a maintenance record instead.
  // That naturally resets the interval: computeUpcoming recomputes from this
  // new record next render, so the item drops out of (or moves down) the
  // upcoming list the same way completing a reminder does.
  const logMaintenance = useMutation({
    mutationFn: (input: { maintenance_type: string; cost?: number; service_provider?: string; notes?: string }) =>
      api.maintenance.create({
        vehicle_id: vehicle!.id,
        maintenance_type: input.maintenance_type,
        date_performed: todayISO(),
        mileage: vehicle?.current_mileage ?? 0,
        cost: input.cost,
        service_provider: input.service_provider,
        notes: input.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-summary'] })
      closeLogModal()
    },
  })

  // Types with an active reminder/appointment already covering them (see
  // Reminder['maintenance_type'] — one reminder can cover several types) —
  // their Forecast card is redundant once that reminder exists, so it's
  // filtered out below rather than shown alongside the scheduled one.
  const coveredMaintenanceTypes = useMemo(
    () => new Set((reminders ?? []).flatMap((r) => parseMaintenanceTypes(r.maintenance_type))),
    [reminders]
  )

  const upcoming = useMemo(() => {
    if (!records || !schedule || !vehicle?.current_mileage) return []
    return computeUpcoming(schedule, records, vehicle.current_mileage)
      .filter((item) => !coveredMaintenanceTypes.has(item.type))
      .slice(0, 6)
  }, [schedule, records, vehicle?.current_mileage, coveredMaintenanceTypes])

  const typeName = useMemo(() => {
    const names = new Map((schedule ?? []).map((s) => [s.type, s.name]))
    return (type: string) => names.get(type) ?? type.replace(/_/g, ' ')
  }, [schedule])

  const lastRecordByType = useMemo(() => {
    const map = new Map<string, MaintenanceRecord>()
    for (const r of records ?? []) {
      if (!map.has(r.maintenance_type)) map.set(r.maintenance_type, r)
    }
    return map
  }, [records])

  const specByType = useMemo(() => {
    const map = new Map<string, VehicleSpec>()
    for (const s of vehicleSpecs ?? []) map.set(s.maintenance_type, s)
    return map
  }, [vehicleSpecs])

  const openRecalls = useMemo(() => (recalls ?? []).filter((r) => r.status === 'open'), [recalls])

  const totalActionable = (reminders?.length ?? 0) + upcoming.length

  if (isLoading) return <p className="text-muted text-center py-12">Loading vehicle…</p>
  if (error) return <p className="text-red-600 text-center py-12">{(error as Error).message}</p>
  if (!vehicle) return <AddVehicle />

  return (
    <div className="space-y-6">
      {/* Vehicle block: title, mileage update, and all vehicle stats together */}
      <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-accent blur-3xl" />
          <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-blue-500 blur-3xl" />
        </div>

        <div className="relative p-8">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider bg-accent rounded-full">
                  {vehicle.year}
                </span>
              </div>
              <h1 className="text-4xl lg:text-5xl font-bold text-white tracking-tight">
                {vehicle.make} {vehicle.model}
              </h1>
              <p className="text-lg text-gray-400 mt-1">
                {vehicle.trim ?? ''}
                {vehicle.color_exterior ? ` • ${vehicle.color_exterior}` : ''}
              </p>
            </div>

            <div className="flex flex-col gap-2 lg:text-right">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  const mileage = Number(mileageInput)
                  if (Number.isFinite(mileage)) updateMileage.mutate(mileage)
                }}
              >
                <input
                  type="number"
                  value={mileageInput}
                  onChange={(e) => setMileageInput(e.target.value)}
                  placeholder="Update mileage"
                  className="w-40 px-3 py-2 text-sm text-gray-900 bg-white/90 backdrop-blur-sm border-0 rounded-lg focus:ring-2 focus:ring-accent"
                />
                <button
                  type="submit"
                  disabled={!mileageInput || updateMileage.isPending}
                  className="px-4 py-2 text-sm bg-accent text-white font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {updateMileage.isPending ? 'Saving…' : 'Update'}
                </button>
              </form>
              {vehicle.last_mileage_update && (
                <p className="text-xs text-gray-500">
                  Last updated: {formatDate(vehicle.last_mileage_update)}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              onClick={() => toggleBlur('odometer')}
              className="bg-white/5 backdrop-blur-xs rounded-xl p-4 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors"
              title="Click to blur/unblur"
            >
              <div className="flex items-center gap-2 mb-2">
                <Gauge className="h-5 w-5 text-blue-400" />
                <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Odometer</span>
              </div>
              <p
                className={`text-2xl lg:text-3xl font-bold text-white transition-all ${
                  blurredCards.has('odometer') ? 'blur-md select-none' : ''
                }`}
              >
                {vehicle.current_mileage?.toLocaleString() ?? '—'}
              </p>
              <p className="text-sm text-gray-500">miles</p>
            </div>

            <Link
              to="/maintenance"
              className="bg-white/5 backdrop-blur-xs rounded-xl p-4 border border-white/10 hover:bg-white/10 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-5 w-5 text-green-400" />
                <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Service history</span>
              </div>
              <p className="text-2xl lg:text-3xl font-bold text-white">{records?.length ?? '—'}</p>
              <p className="text-sm text-gray-500">services logged</p>
            </Link>

            <button
              onClick={() => recalls && setRecallsOpen(true)}
              disabled={!recalls}
              className={`text-left rounded-xl p-4 border backdrop-blur-xs transition-colors ${
                !recalls || recalls.length === 0
                  ? 'bg-white/5 border-white/10 hover:bg-white/10'
                  : openRecalls.length > 0
                    ? 'bg-red-500/10 border-red-500/20 hover:bg-red-500/15'
                    : 'bg-green-500/10 border-green-500/20 hover:bg-green-500/15'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {recalls && recalls.length > 0 ? (
                  openRecalls.length > 0 ? <AlertTriangle className="h-5 w-5 text-red-400" /> : <CheckCircle2 className="h-5 w-5 text-green-400" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-gray-400" />
                )}
                <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Recalls</span>
              </div>
              <p className={`text-2xl lg:text-3xl font-bold ${openRecalls.length > 0 ? 'text-red-400' : 'text-white'}`}>
                {!recalls || recalls.length === 0 ? '—' : openRecalls.length > 0 ? `${openRecalls.length} open` : 'None open'}
              </p>
              <p className="text-sm text-gray-500">{recalls && recalls.length > 0 ? 'Tap for details' : 'Tap to check with NHTSA'}</p>
            </button>

            <div className="bg-white/5 backdrop-blur-xs rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <Settings2 className="h-5 w-5 text-cyan-400" />
                <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Engine</span>
              </div>
              <p className="text-lg lg:text-xl font-bold text-white">{vehicle.engine ?? '—'}</p>
              <p className="text-sm text-gray-500">{vehicle.drivetrain ?? ''}</p>
            </div>

            <div className="bg-white/5 backdrop-blur-xs rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <Wrench className="h-5 w-5 text-amber-400" />
                <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Transmission</span>
              </div>
              <p className="text-lg lg:text-xl font-bold text-white">{vehicle.transmission ?? '—'}</p>
            </div>

            {vehicle.vin && (
            <div
              onClick={() => toggleBlur('vin')}
              className="bg-white/5 backdrop-blur-xs rounded-xl p-4 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors"
              title="Click to blur/unblur"
            >
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-5 w-5 text-purple-400" />
                <span className="text-xs font-medium uppercase tracking-wider text-gray-400">VIN</span>
              </div>
              <p
                className={`text-sm lg:text-base font-mono font-bold text-white truncate transition-all ${
                  blurredCards.has('vin') ? 'blur-md select-none' : ''
                }`}
                title={vehicle.vin ?? undefined}
              >
                {vehicle.vin}
              </p>
              <p className="text-sm text-gray-500">Vehicle ID</p>
            </div>
            )}

          </div>
        </div>
      </div>

      {/* Reminders + Maintenance Forecast, unified into one "what's next" grid.
          Reminders (fixed commitments) always sort first with a solid
          accent border/tag; forecast items (interval projections) follow,
          urgency-sorted, with a neutral tag and urgency-colored border. */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Bell className="h-5 w-5 text-accent" />
              What's Next
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">Reminders you've set, plus what's due based on service history</p>
          </div>
          {totalActionable > 0 && (
            <span className="shrink-0 px-3 py-1 rounded-full text-xs font-bold bg-accent text-white">
              {totalActionable} to review
            </span>
          )}
        </div>

        {/* items-start: without it, CSS Grid stretches every card in a row to
            match its tallest sibling, so a collapsed card would still look
            expanded-height next to an expanded one in the same row. */}
        {totalActionable === 0 ? (
          <p className="text-muted text-center py-6 bg-white rounded-xl shadow-md">Nothing due right now.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
            {reminders?.map((reminder) => (
              <ReminderCard
                key={`reminder-${reminder.id}`}
                reminder={reminder}
                isExpanded={expandedReminders.has(reminder.id)}
                onToggle={() => toggleReminder(reminder.id)}
                onLogService={() => setLogTarget({ kind: 'reminder', reminder })}
                onMarkDone={() => completeReminder.mutate({ id: reminder.id })}
                isPending={completeReminder.isPending}
                typeName={typeName}
              />
            ))}
            {upcoming.map((item) => (
              <ForecastCard
                key={`forecast-${item.type}`}
                item={item}
                lastRecord={lastRecordByType.get(item.type)}
                curatedSpec={specByType.get(item.type)}
                currentMileage={vehicle.current_mileage ?? 0}
                isExpanded={expandedForecast.has(item.type)}
                onToggle={() => toggleForecast(item.type)}
                onLogService={() => setLogTarget({ kind: 'forecast', item })}
                onMarkDone={() => logMaintenance.mutate({ maintenance_type: item.type })}
                isPending={logMaintenance.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {/* Log Service modal — shared by reminders (completes via /complete,
          which auto-logs a maintenance record server-side) and forecast
          items (no reminder to complete, so this logs a maintenance record
          directly). */}
      {logTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Log Service</h2>
              <button onClick={closeLogModal} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500">Service Type</p>
                <p className="font-medium">{logTarget.kind === 'reminder' ? logTarget.reminder.title : logTarget.item.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Mileage</p>
                <p className="font-medium">
                  {(vehicle.current_mileage ?? (logTarget.kind === 'reminder' ? logTarget.reminder.due_mileage : null) ?? 0).toLocaleString()} miles
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Service Provider (optional)</label>
                <input
                  type="text"
                  value={logProvider}
                  onChange={(e) => setLogProvider(e.target.value)}
                  placeholder="e.g. your dealer or shop"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Cost (optional)</label>
                <input
                  type="number"
                  value={logCost}
                  onChange={(e) => setLogCost(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Notes (optional)</label>
                <input
                  type="text"
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={closeLogModal} className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const cost = logCost ? parseFloat(logCost) : undefined
                    const service_provider = logProvider || undefined
                    const notes = logNotes || undefined
                    if (logTarget.kind === 'reminder') {
                      completeReminder.mutate({
                        id: logTarget.reminder.id,
                        details: { mileage: vehicle.current_mileage ?? logTarget.reminder.due_mileage ?? undefined, cost, service_provider, notes },
                      })
                    } else {
                      logMaintenance.mutate({ maintenance_type: logTarget.item.type, cost, service_provider, notes })
                    }
                  }}
                  disabled={completeReminder.isPending || logMaintenance.isPending}
                  className="flex-1 px-4 py-2 bg-accent text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {completeReminder.isPending || logMaintenance.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {recallsOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setRecallsOpen(false)}>
          <div
            className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b shrink-0">
              <h2 className="text-lg font-semibold">NHTSA Recalls</h2>
              <button onClick={() => setRecallsOpen(false)} className="p-1 text-gray-500 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="text-sm text-gray-600 space-y-2">
                <p>
                  Recalls for every {vehicle.year} {vehicle.make} {vehicle.model}, from NHTSA. NHTSA doesn't say whether a recall
                  was already done on your vehicle, so mark each one once it's fixed. For a definitive answer, check your VIN at{' '}
                  <a href="https://www.nhtsa.gov/recalls" target="_blank" rel="noreferrer" className="text-accent underline">nhtsa.gov/recalls</a>.
                </p>
                <button
                  onClick={() => checkRecalls.mutate()}
                  disabled={checkRecalls.isPending}
                  className="px-3 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
                >
                  {checkRecalls.isPending ? 'Checking NHTSA…' : (recalls ?? []).length > 0 ? 'Check again' : 'Check NHTSA now'}
                </button>
                {checkRecalls.isError && <p className="text-red-600">{(checkRecalls.error as Error).message}</p>}
                {checkRecalls.data && checkRecalls.data.found === 0 && (
                  <p className="text-green-700">NHTSA lists no recalls for a {checkRecalls.data.checked}.</p>
                )}
              </div>
              {(recalls ?? []).length === 0 && !checkRecalls.data && <p className="text-muted text-center py-6">Not checked yet.</p>}
              {(recalls ?? []).map((r) => (
                <div key={r.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-gray-900">{r.component}</p>
                      <p className="text-xs text-gray-500">
                        NHTSA {r.nhtsa_campaign}
                        {r.report_receipt_date && ` · ${formatDate(r.report_receipt_date)}`}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${
                        r.status === 'open' ? 'text-red-700 bg-red-50 border-red-200' : 'text-green-700 bg-green-50 border-green-200'
                      }`}
                    >
                      {r.status === 'open' ? 'Open' : 'Remedied'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{r.summary}</p>
                  {r.remedy && <p className="text-sm text-gray-500">{r.remedy}</p>}
                  <button
                    onClick={() => updateRecallStatus.mutate({ id: r.id, status: r.status === 'open' ? 'remedied' : 'open' })}
                    disabled={updateRecallStatus.isPending}
                    className="text-sm font-medium text-accent hover:text-red-700 disabled:opacity-50"
                  >
                    {r.status === 'open' ? 'Mark as remedied' : 'Mark as open'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
