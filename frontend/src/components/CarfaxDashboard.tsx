import { useQuery } from '@tanstack/react-query'
import { DollarSign, Shield, User, Wrench, Car, Star, AlertTriangle, CheckCircle } from 'lucide-react'

interface CarfaxReport {
  vin: string
  vehicle: string
  year: number
  make: string
  model: string
  trim: string
  retail_value: number
  report_date: string
  owner_count: number
  accidents: number
  no_accidents: boolean
  single_owner: boolean
  cpo_status: string | null
  has_service_history: boolean
  personal_vehicle: boolean
  annual_miles: number
  last_odometer: number
  year_purchased: number
  ownership_length: string
  cpo_warranty: string | null
  cpo_inspection_points: number | null
}

export default function CarfaxDashboard() {
  const { data: report, isLoading, error } = useQuery<CarfaxReport>({
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

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div className="h-8 bg-gray-200 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    )
  }

  if (error || !report) {
    return null // Don't show anything if no CARFAX data
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(value)
  }

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(value)
  }

  return (
    <div className="space-y-4 mb-8">
      {/* Main Value Card */}
      <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-lg shadow-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-green-100 text-sm font-medium">CARFAX Retail Value</p>
            <p className="text-4xl font-bold mt-1">{formatCurrency(report.retail_value)}</p>
            <p className="text-green-100 text-sm mt-2">
              {report.vehicle} | {formatNumber(report.last_odometer)} miles
            </p>
          </div>
          <div className="bg-white/20 rounded-full p-4">
            <DollarSign className="h-10 w-10" />
          </div>
        </div>
      </div>

      {/* Value Factors */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-sm font-semibold text-gray-600 mb-3">Value Impact Factors</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className={`flex items-center gap-2 p-2 rounded-lg ${report.no_accidents ? 'bg-green-50' : 'bg-red-50'}`}>
            {report.no_accidents ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-red-600" />
            )}
            <span className={`text-sm font-medium ${report.no_accidents ? 'text-green-700' : 'text-red-700'}`}>
              {report.no_accidents ? 'No Accidents' : `${report.accidents} Accident(s)`}
            </span>
          </div>

          <div className={`flex items-center gap-2 p-2 rounded-lg ${report.single_owner ? 'bg-blue-50' : 'bg-gray-50'}`}>
            <User className={`h-5 w-5 ${report.single_owner ? 'text-blue-600' : 'text-gray-500'}`} />
            <span className={`text-sm font-medium ${report.single_owner ? 'text-blue-700' : 'text-gray-600'}`}>
              {report.owner_count}-Owner
            </span>
          </div>

          {report.cpo_status && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-yellow-50">
              <Star className="h-5 w-5 text-yellow-600" />
              <span className="text-sm font-medium text-yellow-700">
                CPO {report.cpo_status}
              </span>
            </div>
          )}

          <div className={`flex items-center gap-2 p-2 rounded-lg ${report.has_service_history ? 'bg-purple-50' : 'bg-gray-50'}`}>
            <Wrench className={`h-5 w-5 ${report.has_service_history ? 'text-purple-600' : 'text-gray-500'}`} />
            <span className={`text-sm font-medium ${report.has_service_history ? 'text-purple-700' : 'text-gray-600'}`}>
              Service History
            </span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Car className="h-4 w-4" />
            <span className="text-xs font-medium">Annual Miles</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{formatNumber(report.annual_miles)}</p>
          <p className="text-xs text-gray-500">per year</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <User className="h-4 w-4" />
            <span className="text-xs font-medium">Ownership</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{report.ownership_length || `Since ${report.year_purchased}`}</p>
          <p className="text-xs text-gray-500">{report.personal_vehicle ? 'Personal' : 'Commercial'}</p>
        </div>

        {report.cpo_status && report.cpo_inspection_points && (
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <Shield className="h-4 w-4" />
              <span className="text-xs font-medium">CPO Inspection</span>
            </div>
            <p className="text-xl font-bold text-gray-900">{report.cpo_inspection_points}</p>
            <p className="text-xs text-gray-500">point inspection</p>
          </div>
        )}
      </div>

      {/* CPO Warranty Info */}
      {report.cpo_warranty && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-600" />
            <span className="font-medium text-yellow-800">Toyota Certified Pre-Owned - {report.cpo_status}</span>
          </div>
          <p className="text-sm text-yellow-700 mt-1">
            Warranty: {report.cpo_warranty}
          </p>
        </div>
      )}
    </div>
  )
}
