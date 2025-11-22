import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { format } from 'date-fns'
import { Plus, Trash2, Edit } from 'lucide-react'
import { maintenanceApi, vehicleApi } from '../services/api'
import type { MaintenanceRecord } from '../types'

export default function Maintenance() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editRecord, setEditRecord] = useState<MaintenanceRecord | null>(null)

  const { data: vehicle } = useQuery({
    queryKey: ['vehicle'],
    queryFn: vehicleApi.get,
  })

  const { data: records, isLoading } = useQuery({
    queryKey: ['maintenance'],
    queryFn: () => maintenanceApi.getAll(),
  })

  const createRecord = useMutation({
    mutationFn: maintenanceApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-summary'] })
      setShowForm(false)
    },
  })

  const deleteRecord = useMutation({
    mutationFn: maintenanceApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-summary'] })
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    const data = {
      vehicle_id: vehicle!.id,
      maintenance_type: formData.get('type') as string,
      description: formData.get('description') as string || undefined,
      date_performed: formData.get('date') as string,
      mileage: parseInt(formData.get('mileage') as string),
      cost: formData.get('cost') ? parseFloat(formData.get('cost') as string) : undefined,
      service_provider: formData.get('provider') as string || undefined,
      notes: formData.get('notes') as string || undefined,
    }

    createRecord.mutate(data)
  }

  if (isLoading) {
    return <div className="text-center py-12">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Maintenance Log</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-toyota-red text-white rounded-md hover:bg-red-700"
        >
          <Plus className="h-4 w-4" />
          Add Record
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">New Maintenance Record</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type *
                </label>
                <select
                  name="type"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="oil_change">Oil Change</option>
                  <option value="tire_rotation">Tire Rotation</option>
                  <option value="brake_service">Brake Service</option>
                  <option value="air_filter">Air Filter</option>
                  <option value="cabin_filter">Cabin Filter</option>
                  <option value="transmission_service">Transmission Service</option>
                  <option value="coolant_flush">Coolant Flush</option>
                  <option value="spark_plugs">Spark Plugs</option>
                  <option value="battery">Battery</option>
                  <option value="inspection">Inspection</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  name="date"
                  required
                  defaultValue={format(new Date(), 'yyyy-MM-dd')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mileage *
                </label>
                <input
                  type="number"
                  name="mileage"
                  required
                  defaultValue={vehicle?.current_mileage || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cost ($)
                </label>
                <input
                  type="number"
                  name="cost"
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Service Provider
                </label>
                <input
                  type="text"
                  name="provider"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  name="description"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                name="notes"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={createRecord.isPending}
                className="px-4 py-2 bg-toyota-red text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                Save Record
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Records List */}
      <div className="bg-white rounded-lg shadow">
        {records && records.length > 0 ? (
          <div className="divide-y">
            {records.map((record) => (
              <div key={record.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium capitalize">
                      {record.maintenance_type.replace('_', ' ')}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {format(new Date(record.date_performed), 'MMM d, yyyy')} • {record.mileage.toLocaleString()} miles
                    </p>
                    {record.service_provider && (
                      <p className="text-sm text-gray-500">{record.service_provider}</p>
                    )}
                    {record.notes && (
                      <p className="text-sm text-gray-500 mt-1">{record.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    {record.cost && (
                      <span className="font-medium">${record.cost.toFixed(2)}</span>
                    )}
                    <button
                      onClick={() => deleteRecord.mutate(record.id)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            No maintenance records yet. Add your first record above.
          </div>
        )}
      </div>
    </div>
  )
}
