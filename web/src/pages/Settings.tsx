import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarCog, FileText, Plus, Ruler, Trash2, Upload } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/date'
import UploadDocumentModal from '@/components/UploadDocumentModal'
import type { ScheduleItem } from '@/types'

const input = 'w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-accent'
const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v))

function ScheduleRow({ item }: { item: ScheduleItem }) {
  const queryClient = useQueryClient()
  const [miles, setMiles] = useState(item.interval_miles?.toString() ?? '')
  const [months, setMonths] = useState(item.interval_months?.toString() ?? '')
  const changed = miles !== (item.interval_miles?.toString() ?? '') || months !== (item.interval_months?.toString() ?? '')
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['schedule'] })

  const save = useMutation({
    mutationFn: () => api.schedule.save(item.type, { interval_miles: numOrNull(miles), interval_months: numOrNull(months) }),
    onSuccess: refresh,
  })
  const remove = useMutation({ mutationFn: () => api.schedule.delete(item.type), onSuccess: refresh })

  return (
    <tr className="border-t border-gray-100">
      <td className="py-2 pr-3 text-sm text-gray-900">{item.name}</td>
      <td className="py-2 pr-3 w-28">
        <input className={input} inputMode="numeric" value={miles} onChange={(e) => setMiles(e.target.value)} aria-label={`${item.name} miles`} />
      </td>
      <td className="py-2 pr-3 w-24">
        <input className={input} inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} aria-label={`${item.name} months`} />
      </td>
      <td className="py-2 text-right whitespace-nowrap">
        {changed && (
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="px-2 py-1 text-xs bg-accent text-white rounded-md hover:bg-red-600 disabled:opacity-50 mr-1"
          >
            Save
          </button>
        )}
        <button
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
          className="p-1 text-gray-400 hover:text-red-600"
          title="Stop tracking this service"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        {(save.isError || remove.isError) && (
          <p className="text-xs text-red-600">{((save.error ?? remove.error) as Error).message}</p>
        )}
      </td>
    </tr>
  )
}

function AddScheduleItem() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [miles, setMiles] = useState('')
  const [months, setMonths] = useState('')
  const type = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)
  const add = useMutation({
    mutationFn: () => api.schedule.save(type, { name: name.trim(), interval_miles: numOrNull(miles), interval_months: numOrNull(months) }),
    onSuccess: () => {
      setName('')
      setMiles('')
      setMonths('')
      queryClient.invalidateQueries({ queryKey: ['schedule'] })
    },
  })
  return (
    <form
      className="flex flex-wrap items-end gap-2 mt-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (type.length >= 2) add.mutate()
      }}
    >
      <label className="flex-1 min-w-40">
        <span className="text-xs text-gray-500">New service</span>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Differential Fluid" />
      </label>
      <label className="w-28">
        <span className="text-xs text-gray-500">Every … miles</span>
        <input className={input} inputMode="numeric" value={miles} onChange={(e) => setMiles(e.target.value)} />
      </label>
      <label className="w-24">
        <span className="text-xs text-gray-500">… or months</span>
        <input className={input} inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} />
      </label>
      <button
        type="submit"
        disabled={type.length < 2 || (!miles && !months) || add.isPending}
        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" /> Add
      </button>
      {add.isError && <p className="w-full text-xs text-red-600">{(add.error as Error).message}</p>}
    </form>
  )
}

function SpecsSection({ vehicleId, schedule }: { vehicleId: number; schedule: ScheduleItem[] }) {
  const queryClient = useQueryClient()
  const { data: specs } = useQuery({ queryKey: ['vehicle-specs'], queryFn: api.vehicleSpecs.list })
  const [type, setType] = useState('')
  const [text, setText] = useState('')
  const [part, setPart] = useState('')
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['vehicle-specs'] })
  const save = useMutation({
    mutationFn: () => api.vehicleSpecs.save({ vehicle_id: vehicleId, maintenance_type: type, spec_text: text.trim(), part_number: part.trim() || undefined }),
    onSuccess: () => {
      setText('')
      setPart('')
      refresh()
    },
  })
  const remove = useMutation({ mutationFn: (id: number) => api.vehicleSpecs.delete(id), onSuccess: refresh })
  const name = (t: string) => schedule.find((s) => s.type === t)?.name ?? t.replace(/_/g, ' ')

  return (
    <section className="bg-white rounded-xl shadow-md p-6">
      <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <Ruler className="h-5 w-5 text-accent" /> Specs you've confirmed
      </h2>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        Exact numbers from your owner's manual or a parts counter, like oil type and capacity or a filter part number. Aiana uses
        these before anything it finds in your documents.
      </p>
      <ul className="divide-y divide-gray-100">
        {(specs ?? []).map((s) => (
          <li key={s.id} className="py-2 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900">{name(s.maintenance_type)}</p>
              <p className="text-sm text-gray-700">{s.spec_text}</p>
              {s.part_number && <p className="text-xs text-gray-400 font-mono">Part {s.part_number}</p>}
            </div>
            <button onClick={() => remove.mutate(s.id)} className="p-1 text-gray-400 hover:text-red-600" title="Remove">
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        {specs?.length === 0 && <li className="py-2 text-sm text-gray-400">None yet.</li>}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2 mt-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (type && text.trim()) save.mutate()
        }}
      >
        <label className="w-48">
          <span className="text-xs text-gray-500">Service</span>
          <select className={input} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Choose…</option>
            {schedule.map((s) => (
              <option key={s.type} value={s.type}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1 min-w-48">
          <span className="text-xs text-gray-500">Spec</span>
          <input className={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. 0W-20, 4.4 qt with filter" />
        </label>
        <label className="w-36">
          <span className="text-xs text-gray-500">Part number</span>
          <input className={input} value={part} onChange={(e) => setPart(e.target.value)} />
        </label>
        <button
          type="submit"
          disabled={!type || !text.trim() || save.isPending}
          className="px-3 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
        >
          Save
        </button>
        {save.isError && <p className="w-full text-xs text-red-600">{(save.error as Error).message}</p>}
      </form>
    </section>
  )
}

function DocumentsSection() {
  const queryClient = useQueryClient()
  const [uploadOpen, setUploadOpen] = useState(false)
  const { data: documents } = useQuery({ queryKey: ['documents'], queryFn: api.aiana.documents })
  const remove = useMutation({
    mutationFn: (name: string) => api.aiana.deleteDocument(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  })
  return (
    <section className="bg-white rounded-xl shadow-md p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="h-5 w-5 text-accent" /> Documents Aiana can search
          </h2>
          <p className="text-sm text-gray-500 mt-1 mb-4">Your owner's manual, maintenance guide, service receipts. PDFs only.</p>
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-red-600"
        >
          <Upload className="h-4 w-4" /> Upload
        </button>
      </div>
      <ul className="divide-y divide-gray-100">
        {(documents ?? []).map((d) => (
          <li key={d.name} className="py-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900">{d.name}</p>
              <p className="text-xs text-gray-500">
                {d.chunk_count} sections · updated {formatDate(d.updated_at.slice(0, 10))}
              </p>
            </div>
            <button
              onClick={() => {
                if (window.confirm(`Remove "${d.name}" from Aiana's search?`)) remove.mutate(d.name)
              }}
              className="p-1 text-gray-400 hover:text-red-600"
              title="Remove from search"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        {documents?.length === 0 && <li className="py-2 text-sm text-gray-400">Nothing uploaded yet. Start with your owner's manual.</li>}
      </ul>
      <UploadDocumentModal
        open={uploadOpen}
        onClose={() => {
          setUploadOpen(false)
          queryClient.invalidateQueries({ queryKey: ['documents'] })
        }}
      />
    </section>
  )
}

export default function Settings() {
  const { data: vehicle } = useQuery({ queryKey: ['vehicle'], queryFn: api.vehicle.get })
  const { data: schedule } = useQuery({ queryKey: ['schedule'], queryFn: api.schedule.list })

  return (
    <div className="space-y-6 max-w-4xl">
      <section className="bg-white rounded-xl shadow-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <CalendarCog className="h-5 w-5 text-accent" /> Maintenance schedule
        </h2>
        <p className="text-sm text-gray-500 mt-1 mb-4">
          These start as general intervals. Change them to match your owner's manual: whichever comes first, miles or months.
        </p>
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="pb-2 font-medium">Service</th>
              <th className="pb-2 font-medium">Miles</th>
              <th className="pb-2 font-medium">Months</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(schedule ?? []).map((item) => (
              <ScheduleRow key={`${item.type}-${item.updated_at}`} item={item} />
            ))}
          </tbody>
        </table>
        <AddScheduleItem />
      </section>

      <DocumentsSection />

      {vehicle && schedule && <SpecsSection vehicleId={vehicle.id} schedule={schedule} />}
    </div>
  )
}
