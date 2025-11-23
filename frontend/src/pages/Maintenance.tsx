import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { format } from 'date-fns'
import { Plus, Trash2, FileText, Car, Edit2, X, Tag } from 'lucide-react'
import { maintenanceApi, vehicleApi, serviceRecordsApi } from '../services/api'
import type { MaintenanceRecord } from '../types'
import type { ServiceRecord, ServiceRecordUpdate } from '../services/api'

export default function Maintenance() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editRecord, setEditRecord] = useState<MaintenanceRecord | null>(null)
  const [editServiceRecord, setEditServiceRecord] = useState<ServiceRecord | null>(null)
  const [newTag, setNewTag] = useState('')

  const { data: vehicle } = useQuery({
    queryKey: ['vehicle'],
    queryFn: vehicleApi.get,
  })

  const { data: records, isLoading } = useQuery({
    queryKey: ['maintenance'],
    queryFn: () => maintenanceApi.getAll(),
  })

  const { data: serviceRecords, isLoading: serviceLoading } = useQuery({
    queryKey: ['service-records'],
    queryFn: () => serviceRecordsApi.getAll(),
  })

  const { data: allTags } = useQuery({
    queryKey: ['tags'],
    queryFn: () => serviceRecordsApi.getTags(),
  })

  // Combine and sort all records by date
  const allRecords = [
    ...(records?.map(r => ({ ...r, source: 'manual' as const, tags: [] as string[] })) || []),
    ...(serviceRecords?.map(r => ({
      id: r.id,
      maintenance_type: r.service_type,
      date_performed: r.date,
      mileage: r.mileage || 0,
      description: r.description,
      service_provider: r.location,
      notes: r.description,
      cost: null,
      source: r.source as string,
      tags: r.tags || [],
      originalRecord: r,
    })) || []),
  ].sort((a, b) => new Date(b.date_performed).getTime() - new Date(a.date_performed).getTime())

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

  const updateServiceRecord = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ServiceRecordUpdate }) =>
      serviceRecordsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-records'] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      setEditServiceRecord(null)
    },
  })

  const deleteServiceRecord = useMutation({
    mutationFn: serviceRecordsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-records'] })
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

  const handleEditServiceRecord = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editServiceRecord) return

    const formData = new FormData(e.currentTarget)
    const tagsInput = formData.get('tags') as string
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : []

    const data: ServiceRecordUpdate = {
      date: formData.get('date') as string,
      mileage: parseInt(formData.get('mileage') as string),
      service_type: formData.get('service_type') as string,
      description: formData.get('description') as string || undefined,
      location: formData.get('location') as string || undefined,
      tags,
    }

    updateServiceRecord.mutate({ id: editServiceRecord.id, data })
  }

  const addTag = () => {
    if (!newTag.trim() || !editServiceRecord) return
    const currentTags = editServiceRecord.tags || []
    if (!currentTags.includes(newTag.trim())) {
      setEditServiceRecord({
        ...editServiceRecord,
        tags: [...currentTags, newTag.trim()],
      })
    }
    setNewTag('')
  }

  const removeTag = (tagToRemove: string) => {
    if (!editServiceRecord) return
    setEditServiceRecord({
      ...editServiceRecord,
      tags: editServiceRecord.tags.filter(t => t !== tagToRemove),
    })
  }

  if (isLoading || serviceLoading) {
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

      {/* Edit Service Record Modal */}
      {editServiceRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Edit Service Record</h2>
              <button
                onClick={() => setEditServiceRecord(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleEditServiceRecord} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Service Type
                </label>
                <input
                  type="text"
                  name="service_type"
                  defaultValue={editServiceRecord.service_type}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    name="date"
                    defaultValue={editServiceRecord.date}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mileage
                  </label>
                  <input
                    type="number"
                    name="mileage"
                    defaultValue={editServiceRecord.mileage || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={2}
                  defaultValue={editServiceRecord.description || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  name="location"
                  defaultValue={editServiceRecord.location || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              {/* Tags Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tags
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {editServiceRecord.tags?.map(tag => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm"
                    >
                      <Tag className="h-3 w-3" />
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTag()
                      }
                    }}
                    placeholder="Add tag (e.g., CARFAX, NAPA)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                    list="existing-tags"
                  />
                  <datalist id="existing-tags">
                    {allTags?.map(tag => (
                      <option key={tag} value={tag} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    onClick={addTag}
                    className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm"
                  >
                    Add
                  </button>
                </div>
                <input
                  type="hidden"
                  name="tags"
                  value={editServiceRecord.tags?.join(',') || ''}
                />
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Are you sure you want to delete this record?')) {
                      deleteServiceRecord.mutate(editServiceRecord.id, {
                        onSuccess: () => setEditServiceRecord(null)
                      })
                    }
                  }}
                  disabled={deleteServiceRecord.isPending}
                  className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 disabled:opacity-50 flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditServiceRecord(null)}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateServiceRecord.isPending}
                    className="px-4 py-2 bg-toyota-red text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Records List */}
      <div className="bg-white rounded-lg shadow">
        {allRecords.length > 0 ? (
          <div className="divide-y">
            {allRecords.map((record, index) => (
              <div key={`${record.source}-${record.id}-${index}`} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {record.source.toLowerCase() === 'carfax' ? (
                      <FileText className="h-5 w-5 text-blue-500 mt-0.5" />
                    ) : (
                      <Car className="h-5 w-5 text-gray-400 mt-0.5" />
                    )}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium capitalize">
                          {record.maintenance_type.replace(/_/g, ' ')}
                        </h3>
                        {record.source.toLowerCase() === 'carfax' && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">CARFAX</span>
                        )}
                        {record.tags?.map(tag => (
                          <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <p className="text-sm text-gray-600">
                        {format(new Date(record.date_performed), 'MMM d, yyyy')} • {record.mileage?.toLocaleString() || '—'} miles
                      </p>
                      {record.service_provider && (
                        <p className="text-sm text-gray-500">{record.service_provider}</p>
                      )}
                      {record.notes && record.source === 'manual' && (
                        <p className="text-sm text-gray-500 mt-1">{record.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {record.cost && (
                      <span className="font-medium mr-2">${record.cost.toFixed(2)}</span>
                    )}
                    {record.source !== 'manual' && 'originalRecord' in record && (
                      <button
                        onClick={() => setEditServiceRecord(record.originalRecord as ServiceRecord)}
                        className="text-gray-400 hover:text-blue-500 p-1"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    )}
                    {record.source === 'manual' ? (
                      <button
                        onClick={() => deleteRecord.mutate(record.id)}
                        className="text-gray-400 hover:text-red-500 p-1"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : 'originalRecord' in record && (
                      <button
                        onClick={() => deleteServiceRecord.mutate((record.originalRecord as ServiceRecord).id)}
                        className="text-gray-400 hover:text-red-500 p-1"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            No maintenance records yet. Add your first record above or import a CARFAX report.
          </div>
        )}
      </div>
    </div>
  )
}
