import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { format } from 'date-fns'
import { Plus, Check, Trash2, Bell, Calendar, Wrench, AlertTriangle, Clock, DollarSign } from 'lucide-react'
import { remindersApi, vehicleApi } from '../services/api'
import type { SmartReminder } from '../services/api'

function getStatusColor(status: SmartReminder['status']) {
  switch (status) {
    case 'overdue': return { border: 'border-l-red-500', bg: 'bg-red-50', text: 'text-red-700', badge: 'bg-red-100 text-red-800' }
    case 'due_soon': return { border: 'border-l-yellow-500', bg: 'bg-yellow-50', text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-800' }
    case 'ok': return { border: 'border-l-green-500', bg: 'bg-green-50', text: 'text-green-700', badge: 'bg-green-100 text-green-800' }
  }
}

function getPriorityBadge(priority: SmartReminder['priority']) {
  switch (priority) {
    case 'high': return <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">High</span>
    case 'medium': return <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">Medium</span>
    case 'low': return <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">Low</span>
  }
}

function getStatusLabel(status: SmartReminder['status']) {
  switch (status) {
    case 'overdue': return 'Overdue'
    case 'due_soon': return 'Due Soon'
    case 'ok': return 'OK'
  }
}

export default function Reminders() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)

  const { data: vehicle } = useQuery({
    queryKey: ['vehicle'],
    queryFn: vehicleApi.get,
  })

  const { data: reminders, isLoading } = useQuery({
    queryKey: ['reminders'],
    queryFn: () => remindersApi.getAll(false),
  })

  const { data: smartReminders, isLoading: isLoadingSmart } = useQuery({
    queryKey: ['smart-reminders', vehicle?.current_mileage],
    queryFn: () => remindersApi.getSmart(vehicle!.current_mileage!),
    enabled: !!vehicle?.current_mileage,
  })

  const createReminder = useMutation({
    mutationFn: remindersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
      queryClient.invalidateQueries({ queryKey: ['upcoming-reminders'] })
      setShowForm(false)
    },
  })

  const completeReminder = useMutation({
    mutationFn: remindersApi.complete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
      queryClient.invalidateQueries({ queryKey: ['upcoming-reminders'] })
    },
  })

  const deleteReminder = useMutation({
    mutationFn: remindersApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
      queryClient.invalidateQueries({ queryKey: ['upcoming-reminders'] })
    },
  })

  const autoGenerate = useMutation({
    mutationFn: () => remindersApi.autoGenerate(vehicle!.id, vehicle!.current_mileage!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
      queryClient.invalidateQueries({ queryKey: ['smart-reminders'] })
      queryClient.invalidateQueries({ queryKey: ['upcoming-reminders'] })
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    const reminderType = formData.get('reminder_type') as string
    const dueDate = formData.get('due_date') as string
    const dueMileage = formData.get('due_mileage') as string

    const data = {
      vehicle_id: vehicle!.id,
      title: formData.get('title') as string,
      description: formData.get('description') as string || undefined,
      reminder_type: reminderType,
      due_date: reminderType !== 'mileage' && dueDate ? dueDate : undefined,
      due_mileage: reminderType !== 'date' && dueMileage ? parseInt(dueMileage) : undefined,
      is_recurring: formData.get('is_recurring') === 'on',
      recurrence_interval_days: formData.get('interval_days') ? parseInt(formData.get('interval_days') as string) : undefined,
      recurrence_interval_miles: formData.get('interval_miles') ? parseInt(formData.get('interval_miles') as string) : undefined,
      notify_days_before: parseInt(formData.get('notify_days') as string) || 7,
      notify_miles_before: parseInt(formData.get('notify_miles') as string) || 500,
    }

    createReminder.mutate(data)
  }

  if (isLoading) {
    return <div className="text-center py-12">Loading...</div>
  }

  const activeReminders = reminders?.filter(r => !r.is_completed) || []
  const completedReminders = reminders?.filter(r => r.is_completed) || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Reminders</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-toyota-red text-white rounded-md hover:bg-red-700"
        >
          <Plus className="h-4 w-4" />
          Add Reminder
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">New Reminder</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  placeholder="e.g., Oil Change"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reminder Type *
                </label>
                <select
                  name="reminder_type"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="both">Date & Mileage</option>
                  <option value="date">Date Only</option>
                  <option value="mileage">Mileage Only</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  name="due_date"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Due Mileage
                </label>
                <input
                  type="number"
                  name="due_mileage"
                  placeholder="e.g., 75000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="is_recurring"
                  id="is_recurring"
                  className="h-4 w-4"
                />
                <label htmlFor="is_recurring" className="text-sm text-gray-700">
                  Recurring reminder
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                name="description"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={createReminder.isPending}
                className="px-4 py-2 bg-toyota-red text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                Save Reminder
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

      {/* Maintenance Schedule */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wrench className="h-5 w-5 text-gray-600" />
            <div>
              <h2 className="text-lg font-semibold">Maintenance Schedule</h2>
              {vehicle?.current_mileage && (
                <p className="text-sm text-gray-500">
                  Current mileage: {vehicle.current_mileage.toLocaleString()} miles
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => autoGenerate.mutate()}
            disabled={autoGenerate.isPending || !vehicle}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            <Calendar className="h-4 w-4" />
            {autoGenerate.isPending ? 'Generating...' : 'Auto-Generate Reminders'}
          </button>
        </div>

        {autoGenerate.isSuccess && (
          <div className="mx-6 mt-4 p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700">
            {autoGenerate.data.message}
          </div>
        )}

        {isLoadingSmart ? (
          <div className="p-8 text-center text-gray-500">Loading maintenance schedule...</div>
        ) : smartReminders && smartReminders.length > 0 ? (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {smartReminders.map((item) => {
              const colors = getStatusColor(item.status)
              return (
                <div
                  key={item.service_key}
                  className={`border-l-4 ${colors.border} rounded-lg border border-gray-200 p-4 ${colors.bg}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-medium text-gray-900 text-sm">{item.name}</h3>
                    {getPriorityBadge(item.priority)}
                  </div>

                  <span className={`inline-block mb-3 px-2 py-0.5 text-xs font-medium rounded ${colors.badge}`}>
                    {getStatusLabel(item.status)}
                  </span>

                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center gap-2 text-gray-700">
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>
                        Next: {item.next_mileage.toLocaleString()} mi
                        {item.miles_remaining > 0
                          ? <span className="text-gray-500"> ({item.miles_remaining.toLocaleString()} mi remaining)</span>
                          : <span className="text-red-600 font-medium"> (overdue)</span>
                        }
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-gray-700">
                      <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>
                        {item.last_service
                          ? `Last: ${format(new Date(item.last_service.date), 'MMM d, yyyy')} at ${item.last_service.mileage.toLocaleString()} mi`
                          : 'No service history'
                        }
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-gray-500">
                      <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>Every {item.interval_miles.toLocaleString()} mi / {item.interval_months} mo</span>
                    </div>

                    <div className="flex items-center gap-2 text-gray-500">
                      <DollarSign className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>Est. ${item.estimated_cost}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            {vehicle?.current_mileage
              ? 'No maintenance schedule data available.'
              : 'Set your current mileage to see the maintenance schedule.'
            }
          </div>
        )}
      </div>

      {/* Active Reminders */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Active Reminders</h2>
        </div>
        {activeReminders.length > 0 ? (
          <div className="divide-y">
            {activeReminders.map((reminder) => (
              <div key={reminder.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <Bell className="h-5 w-5 text-toyota-red mt-0.5" />
                    <div>
                      <h3 className="font-medium">{reminder.title}</h3>
                      <p className="text-sm text-gray-600">
                        {reminder.due_date && `Due: ${format(new Date(reminder.due_date), 'MMM d, yyyy')}`}
                        {reminder.due_date && reminder.due_mileage && ' • '}
                        {reminder.due_mileage && `${reminder.due_mileage.toLocaleString()} miles`}
                      </p>
                      {reminder.description && (
                        <p className="text-sm text-gray-500 mt-1">{reminder.description}</p>
                      )}
                      {reminder.is_recurring && (
                        <span className="inline-block mt-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                          Recurring
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => completeReminder.mutate(reminder.id)}
                      className="p-2 text-gray-400 hover:text-green-500"
                      title="Mark complete"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deleteReminder.mutate(reminder.id)}
                      className="p-2 text-gray-400 hover:text-red-500"
                      title="Delete"
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
            No active reminders.
          </div>
        )}
      </div>

      {/* Completed Reminders */}
      {completedReminders.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-500">Completed</h2>
          </div>
          <div className="divide-y opacity-60">
            {completedReminders.map((reminder) => (
              <div key={reminder.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium line-through">{reminder.title}</h3>
                    {reminder.completed_at && (
                      <p className="text-sm text-gray-500">
                        Completed {format(new Date(reminder.completed_at), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => deleteReminder.mutate(reminder.id)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
