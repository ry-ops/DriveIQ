import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { format } from 'date-fns'
import { Plus, X, Tag, List, Clock, Upload, Paperclip, Trash2 } from 'lucide-react'
import { maintenanceApi, vehicleApi, serviceRecordsApi } from '../services/api'
import type { ServiceRecord, ServiceRecordUpdate } from '../services/api'
import ServiceHistoryTimeline from '../components/ServiceHistoryTimeline'
import MaintenanceCard from '../components/MaintenanceCard'
import { useChat } from '../context/ChatContext'

export default function Maintenance() {
  const queryClient = useQueryClient()
  const { openWithMessage } = useChat()
  const [showForm, setShowForm] = useState(false)
  const [editServiceRecord, setEditServiceRecord] = useState<ServiceRecord | null>(null)
  const [newTag, setNewTag] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])

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
    mutationFn: async (data: Parameters<typeof maintenanceApi.create>[0]) => {
      const record = await maintenanceApi.create(data)
      // Upload any selected files
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          await maintenanceApi.uploadDocument(record.id, file)
        }
      }
      return record
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-summary'] })
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
      setShowForm(false)
      setSelectedFiles([])
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

    const mileageStr = formData.get('mileage') as string
    const mileage = mileageStr ? parseInt(mileageStr) : undefined

    const data: ServiceRecordUpdate = {
      date: formData.get('date') as string,
      mileage: !isNaN(mileage as number) ? mileage : undefined,
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

  // Handle "Ask about this" from MaintenanceCard
  const handleAskAbout = (maintenanceType: string) => {
    const friendlyType = maintenanceType.replace(/_/g, ' ')
    const vehicleInfo = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'my vehicle'
    const question = `Tell me about the ${friendlyType} procedure for ${vehicleInfo}. What are the steps, specifications, and any important tips?`
    openWithMessage(question)
  }

  if (isLoading || serviceLoading) {
    return <div className="text-center py-12">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Maintenance Log</h1>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex rounded-md shadow-sm">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-l-md border ${
                viewMode === 'list'
                  ? 'bg-gray-100 text-gray-900 border-gray-300'
                  : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <List className="h-4 w-4" />
              List
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={`flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-r-md border-t border-r border-b ${
                viewMode === 'timeline'
                  ? 'bg-gray-100 text-gray-900 border-gray-300'
                  : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Clock className="h-4 w-4" />
              Timeline
            </button>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-toyota-red text-white rounded-md hover:bg-red-700"
          >
            <Plus className="h-4 w-4" />
            Add Record
          </button>
        </div>
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
                  <optgroup label="Routine Maintenance">
                    <option value="oil_change">Oil Change</option>
                    <option value="tire_rotation">Tire Rotation</option>
                    <option value="air_filter">Air Filter</option>
                    <option value="cabin_filter">Cabin Air Filter</option>
                    <option value="wiper_blades">Wiper Blades</option>
                    <option value="inspection">Inspection</option>
                  </optgroup>
                  <optgroup label="Tires & Alignment">
                    <option value="tire_replacement">Tire Replacement</option>
                    <option value="wheel_alignment">Wheel Alignment</option>
                    <option value="tire_balance">Tire Balance</option>
                  </optgroup>
                  <optgroup label="Brakes">
                    <option value="brakes_checked">Brakes Checked</option>
                    <option value="brake_pads">Brake Pads</option>
                    <option value="brake_rotors">Brake Rotors</option>
                    <option value="brake_fluid_flush">Brake Fluid Flush</option>
                  </optgroup>
                  <optgroup label="Fluids & Filters">
                    <option value="transmission_service">Transmission Service</option>
                    <option value="coolant_flush">Coolant Flush</option>
                    <option value="power_steering_flush">Power Steering Flush</option>
                    <option value="differential_service">Differential Service</option>
                    <option value="fuel_filter">Fuel Filter</option>
                  </optgroup>
                  <optgroup label="Engine & Drivetrain">
                    <option value="spark_plugs">Spark Plugs</option>
                    <option value="timing_belt">Timing Belt/Chain</option>
                    <option value="serpentine_belt">Serpentine Belt</option>
                    <option value="fuel_system_service">Fuel System Service</option>
                  </optgroup>
                  <optgroup label="Electrical & Climate">
                    <option value="battery">Battery</option>
                    <option value="alternator">Alternator</option>
                    <option value="starter">Starter</option>
                    <option value="ac_service">A/C Service</option>
                  </optgroup>
                  <optgroup label="Suspension & Steering">
                    <option value="shocks_struts">Shocks/Struts</option>
                    <option value="ball_joints">Ball Joints</option>
                    <option value="tie_rods">Tie Rods</option>
                  </optgroup>
                  <optgroup label="Other">
                    <option value="airbag_system_checked">Airbag System Checked</option>
                    <option value="recall">Recall Service</option>
                    <option value="diagnostic">Diagnostic</option>
                    <option value="other">Other</option>
                  </optgroup>
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Receipts / Documents
              </label>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 cursor-pointer">
                  <Upload className="h-4 w-4" />
                  Choose Files
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.gif"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) {
                        setSelectedFiles(Array.from(e.target.files))
                      }
                    }}
                  />
                </label>
                <span className="text-sm text-gray-500">
                  {selectedFiles.length > 0
                    ? `${selectedFiles.length} file(s) selected`
                    : 'PDF, JPG, PNG (max 10MB each)'}
                </span>
              </div>
              {selectedFiles.length > 0 && (
                <div className="mt-2 space-y-1">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm text-gray-600">
                      <Paperclip className="h-3 w-3" />
                      {file.name}
                      <button
                        type="button"
                        onClick={() => setSelectedFiles(files => files.filter((_, i) => i !== index))}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
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

      {/* Conditional View Rendering */}
      {viewMode === 'timeline' ? (
        <ServiceHistoryTimeline />
      ) : (
        /* Records List - Using MaintenanceCard */
        <div className="space-y-3">
          {allRecords.length > 0 ? (
            allRecords.map((record, index) => (
              <MaintenanceCard
                key={`${record.source}-${record.id}-${index}`}
                record={record}
                onEdit={record.source !== 'manual' && 'originalRecord' in record
                  ? () => setEditServiceRecord(record.originalRecord as ServiceRecord)
                  : undefined
                }
                onDelete={record.source === 'manual'
                  ? () => deleteRecord.mutate(record.id)
                  : 'originalRecord' in record
                    ? () => deleteServiceRecord.mutate((record.originalRecord as ServiceRecord).id)
                    : undefined
                }
                onAskAbout={handleAskAbout}
              />
            ))
          ) : (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
              No maintenance records yet. Add your first record above or import a CARFAX report.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
