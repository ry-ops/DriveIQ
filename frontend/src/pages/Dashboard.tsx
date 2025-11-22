import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { format } from 'date-fns'
import { Gauge, Calendar, DollarSign, AlertCircle } from 'lucide-react'
import { vehicleApi, maintenanceApi, remindersApi } from '../services/api'

export default function Dashboard() {
  const queryClient = useQueryClient()
  const [mileageInput, setMileageInput] = useState('')

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

  const updateMileage = useMutation({
    mutationFn: (mileage: number) => vehicleApi.updateMileage(mileage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle'] })
      queryClient.invalidateQueries({ queryKey: ['upcoming-reminders'] })
      setMileageInput('')
    },
  })

  if (vehicleLoading) {
    return <div className="text-center py-12">Loading...</div>
  }

  if (!vehicle) {
    return <div className="text-center py-12 text-red-500">Vehicle not found</div>
  }

  const totalSpent = summary?.reduce((acc, s) => acc + s.total_cost, 0) || 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          {vehicle.year} {vehicle.make} {vehicle.model}
        </h1>
        <p className="text-gray-600">{vehicle.trim} • VIN: {vehicle.vin}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <Calendar className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-sm text-gray-500">Service Records</p>
              <p className="text-2xl font-bold">
                {summary?.reduce((acc, s) => acc + s.count, 0) || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <DollarSign className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-sm text-gray-500">Total Spent</p>
              <p className="text-2xl font-bold">${totalSpent.toFixed(0)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-8 w-8 text-yellow-500" />
            <div>
              <p className="text-sm text-gray-500">Due Soon</p>
              <p className="text-2xl font-bold">{upcomingReminders?.length || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Update Mileage */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Update Mileage</h2>
        <div className="flex gap-4">
          <input
            type="number"
            value={mileageInput}
            onChange={(e) => setMileageInput(e.target.value)}
            placeholder="Enter current mileage"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-toyota-red focus:border-transparent"
          />
          <button
            onClick={() => updateMileage.mutate(parseInt(mileageInput))}
            disabled={!mileageInput || updateMileage.isPending}
            className="px-6 py-2 bg-toyota-red text-white rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            Update
          </button>
        </div>
        {vehicle.last_mileage_update && (
          <p className="mt-2 text-sm text-gray-500">
            Last updated: {format(new Date(vehicle.last_mileage_update), 'MMM d, yyyy h:mm a')}
          </p>
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
              </div>
            ))}
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
