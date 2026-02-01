import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { format } from 'date-fns'
import { Gauge, Calendar, Plus, X, TrendingUp } from 'lucide-react'
import { vehicleApi, maintenanceApi, remindersApi } from '../services/api'
import type { Reminder } from '../types'

interface CarfaxReport {
  retail_value: number
  last_odometer: number
  owner_count: number
}

export default function Dashboard() {
  const queryClient = useQueryClient()
  const [mileageInput, setMileageInput] = useState('')
  const [logReminder, setLogReminder] = useState<Reminder | null>(null)
  const [logCost, setLogCost] = useState('')

  const { data: vehicle, isLoading: vehicleLoading } = useQuery({
    queryKey: ['vehicle'],
    queryFn: vehicleApi.get,
  })

  const { data: summary } = useQuery({
    queryKey: ['maintenance-summary'],
    queryFn: maintenanceApi.getSummary,
  })

  const { data: upcomingReminders } = useQuery({
    queryKey: ['upcoming-reminders', vehicle?.current_mileage],
    queryFn: () => remindersApi.getUpcoming(vehicle?.current_mileage),
    enabled: !!vehicle,
  })

  const { data: carfaxReport } = useQuery<CarfaxReport>({
    queryKey: ['carfax-report'],
    queryFn: async () => {
      const res = await fetch('/api/import/carfax-report')
      if (!res.ok) {
        if (res.status === 404) return null
        throw new Error('Failed to fetch CARFAX report')
      }
      return res.json()
    },
    retry: false
  })

  const updateMileage = useMutation({
    mutationFn: (mileage: number) => vehicleApi.updateMileage(mileage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle'] })
      queryClient.invalidateQueries({ queryKey: ['upcoming-reminders'] })
      setMileageInput('')
    },
  })

  const completeReminder = useMutation({
    mutationFn: (id: number) => remindersApi.complete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upcoming-reminders'] })
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
    },
  })

  const createMaintenanceFromReminder = useMutation({
    mutationFn: async ({ reminder, cost }: { reminder: Reminder; cost?: number }) => {
      // Convert reminder title to a maintenance type (snake_case)
      const maintenanceType = reminder.title.toLowerCase().replace(/\s+/g, '_')

      return maintenanceApi.create({
        vehicle_id: vehicle!.id,
        maintenance_type: maintenanceType,
        date_performed: format(new Date(), 'yyyy-MM-dd'),
        mileage: vehicle?.current_mileage || reminder.due_mileage || 0,
        cost: cost,
        description: `Completed from reminder: ${reminder.title}`,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-summary'] })
      queryClient.invalidateQueries({ queryKey: ['upcoming-reminders'] })
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
      setLogReminder(null)
      setLogCost('')
    },
  })

  if (vehicleLoading) {
    return <div className="text-center py-12">Loading...</div>
  }

  if (!vehicle) {
    return <div className="text-center py-12 text-red-500">Vehicle not found</div>
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </h1>
          <p className="text-gray-600">{vehicle.trim} • VIN: {vehicle.vin}</p>
        </div>

        {/* Update Mileage */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="number"
              value={mileageInput}
              onChange={(e) => setMileageInput(e.target.value)}
              placeholder="Update mileage"
              className="w-40 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-toyota-red focus:border-transparent"
            />
            <button
              onClick={() => updateMileage.mutate(parseInt(mileageInput))}
              disabled={!mileageInput || updateMileage.isPending}
              className="px-4 py-2 text-sm bg-toyota-red text-white rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              Update
            </button>
          </div>
          {vehicle.last_mileage_update && (
            <p className="text-xs text-gray-500 text-right">
              Last updated: {format(new Date(vehicle.last_mileage_update), 'MMM d, yyyy')}
            </p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <Gauge className="h-8 w-8 text-toyota-red" />
            <div>
              <p className="text-sm text-gray-500">Current Mileage</p>
              <p className="text-2xl font-bold">
                {vehicle.current_mileage?.toLocaleString() || '—'}
              </p>
            </div>
          </div>
        </div>

        {carfaxReport && (
          <>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center gap-3">
                <Calendar className="h-8 w-8 text-purple-500" />
                <div>
                  <p className="text-sm text-gray-500">Ownership</p>
                  <p className="text-2xl font-bold">
                    {carfaxReport.owner_count}-Owner
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-sm text-gray-500">CARFAX Retail Value</p>
                  <p className="text-2xl font-bold">
                    ${carfaxReport.retail_value?.toLocaleString() || '—'}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Upcoming Reminders */}
      {upcomingReminders && upcomingReminders.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Upcoming Maintenance</h2>
          <div className="space-y-3">
            {upcomingReminders.map((reminder) => (
              <div key={reminder.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-md">
                <div>
                  <p className="font-medium">{reminder.title}</p>
                  <p className="text-sm text-gray-600">
                    {reminder.due_date && `Due: ${format(new Date(reminder.due_date), 'MMM d, yyyy')}`}
                    {reminder.due_date && reminder.due_mileage && ' • '}
                    {reminder.due_mileage && `${reminder.due_mileage.toLocaleString()} miles`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setLogReminder(reminder)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700"
                    title="Log Service"
                  >
                    <Plus className="h-4 w-4" />
                    Log
                  </button>
                  <button
                    onClick={() => completeReminder.mutate(reminder.id)}
                    disabled={completeReminder.isPending}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50"
                    title="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log Service Modal */}
      {logReminder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Log Service</h2>
              <button
                onClick={() => {
                  setLogReminder(null)
                  setLogCost('')
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500">Service Type</p>
                <p className="font-medium">{logReminder.title}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Date</p>
                <p className="font-medium">{format(new Date(), 'MMM d, yyyy')}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Mileage</p>
                <p className="font-medium">{(vehicle?.current_mileage || logReminder.due_mileage || 0).toLocaleString()} miles</p>
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Cost (optional)</label>
                <input
                  type="number"
                  value={logCost}
                  onChange={(e) => setLogCost(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setLogReminder(null)
                    setLogCost('')
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => createMaintenanceFromReminder.mutate({
                    reminder: logReminder,
                    cost: logCost ? parseFloat(logCost) : undefined
                  })}
                  disabled={createMaintenanceFromReminder.isPending}
                  className="flex-1 px-4 py-2 bg-toyota-red text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {createMaintenanceFromReminder.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Maintenance Summary */}
      {summary && summary.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Maintenance Summary</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500">
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Count</th>
                  <th className="pb-3">Total Cost</th>
                  <th className="pb-3">Last Performed</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {summary.map((s) => (
                  <tr key={s.type} className="border-t">
                    <td className="py-3 capitalize">{s.type.replace('_', ' ')}</td>
                    <td className="py-3">{s.count}</td>
                    <td className="py-3">${s.total_cost.toFixed(2)}</td>
                    <td className="py-3">
                      {s.last_performed && format(new Date(s.last_performed), 'MMM d, yyyy')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
