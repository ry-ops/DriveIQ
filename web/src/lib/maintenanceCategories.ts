import { Droplets, Filter as FilterIcon, Disc, CircleDot, ClipboardCheck, Wrench, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type Category = 'fluids' | 'filters' | 'brakes' | 'tires' | 'inspections' | 'electrical' | 'other'

export const CATEGORY_META: Record<Category, { label: string; icon: LucideIcon; color: string }> = {
  fluids: { label: 'Fluids', icon: Droplets, color: 'text-blue-600 bg-blue-50' },
  filters: { label: 'Filters', icon: FilterIcon, color: 'text-emerald-600 bg-emerald-50' },
  brakes: { label: 'Brakes', icon: Disc, color: 'text-red-600 bg-red-50' },
  tires: { label: 'Tires', icon: CircleDot, color: 'text-gray-700 bg-gray-100' },
  inspections: { label: 'Inspections', icon: ClipboardCheck, color: 'text-purple-600 bg-purple-50' },
  electrical: { label: 'Electrical', icon: Zap, color: 'text-yellow-600 bg-yellow-50' },
  other: { label: 'Other', icon: Wrench, color: 'text-amber-600 bg-amber-50' },
}

const TYPE_TO_CATEGORY: Record<string, Category> = {
  oil_change: 'fluids',
  transmission_fluid: 'fluids',
  coolant: 'fluids',
  brake_fluid: 'fluids',
  air_filter: 'filters',
  cabin_filter: 'filters',
  brake_pads_front: 'brakes',
  brake_pads_rear: 'brakes',
  brake_rotors_front: 'brakes',
  brake_rotors_rear: 'brakes',
  tire_rotation: 'tires',
  tire_replacement: 'tires',
  alignment: 'tires',
  inspection: 'inspections',
  service: 'other',
  rustproofing: 'other',
  spark_plugs: 'other',
  drive_belt: 'other',
  battery: 'electrical',
  wiper_blades: 'other',
  front_differential: 'fluids',
  rear_differential: 'fluids',
  transfer_case: 'fluids',
}

export function categorize(maintenanceType: string): Category {
  return TYPE_TO_CATEGORY[maintenanceType] ?? 'other'
}
