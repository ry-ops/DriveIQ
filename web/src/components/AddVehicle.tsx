import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Car } from 'lucide-react'
import { api } from '@/lib/api'

// First run: DriveIQ tracks one vehicle, added here.
export default function AddVehicle() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ year: '', make: '', model: '', trim: '', vin: '', current_mileage: '' })
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value })

  const create = useMutation({
    mutationFn: () =>
      api.vehicle.create({
        year: Number(form.year),
        make: form.make.trim(),
        model: form.model.trim(),
        trim: form.trim.trim() || null,
        vin: form.vin.trim() || null,
        current_mileage: form.current_mileage ? Number(form.current_mileage) : null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vehicle'] }),
  })

  const year = Number(form.year)
  const valid = Number.isInteger(year) && year >= 1950 && year <= new Date().getFullYear() + 1 && form.make.trim() && form.model.trim()
  const input = 'w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-accent'

  return (
    <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-md p-8">
      <div className="flex items-center gap-3 mb-2">
        <Car className="h-7 w-7 text-accent" />
        <h1 className="text-2xl font-bold text-gray-900">Add your vehicle</h1>
      </div>
      <p className="text-gray-600 mb-6">
        DriveIQ keeps one vehicle's service history, reminders and manuals. Start with the basics; you can add the rest later.
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) create.mutate()
        }}
      >
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Year</span>
            <input className={input} inputMode="numeric" value={form.year} onChange={set('year')} placeholder="2020" required />
          </label>
          <label className="block col-span-2">
            <span className="text-sm font-medium text-gray-700">Make</span>
            <input className={input} value={form.make} onChange={set('make')} placeholder="e.g. Honda" required />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Model</span>
            <input className={input} value={form.model} onChange={set('model')} placeholder="e.g. Civic" required />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Trim <span className="text-gray-400">(optional)</span></span>
            <input className={input} value={form.trim} onChange={set('trim')} />
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Current mileage</span>
          <input className={input} inputMode="numeric" value={form.current_mileage} onChange={set('current_mileage')} placeholder="e.g. 42000" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">VIN <span className="text-gray-400">(optional)</span></span>
          <input className={`${input} font-mono uppercase`} value={form.vin} onChange={set('vin')} maxLength={17} />
          <span className="text-xs text-gray-500">Stored only in your own database.</span>
        </label>
        {create.isError && <p className="text-sm text-red-600">{(create.error as Error).message}</p>}
        <button
          type="submit"
          disabled={!valid || create.isPending}
          className="w-full px-4 py-2 bg-accent text-white font-medium rounded-lg hover:bg-red-600 disabled:opacity-50"
        >
          {create.isPending ? 'Saving…' : 'Add vehicle'}
        </button>
      </form>
    </div>
  )
}
