import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, CheckCircle, AlertCircle, FileText, RefreshCw } from 'lucide-react'

interface ImportResult {
  message: string
  vehicle: string
  vin: string
  retail_value: number
  total_records: number
  imported_records: number
  owners: number
  accidents: number
  cpo_status: string | null
  last_odometer: number | null
  annual_miles: number | null
  no_accidents: boolean
  single_owner: boolean
}

export default function CarfaxImport() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const importMutation = useMutation({
    mutationFn: async (file: File): Promise<ImportResult> => {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/import/carfax', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: 'Import failed' }))
        throw new Error(errorData.detail || 'Import failed')
      }

      return res.json()
    },
    onSuccess: (data) => {
      setImportResult(data)
      setError(null)
      // Invalidate related queries to refresh the dashboard
      queryClient.invalidateQueries({ queryKey: ['carfax-report'] })
      queryClient.invalidateQueries({ queryKey: ['service-records'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-summary'] })
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    onError: (err: Error) => {
      setError(err.message)
      setImportResult(null)
    },
  })

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setError('Please select a PDF file')
        return
      }
      setError(null)
      setImportResult(null)
      importMutation.mutate(file)
    }
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
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Import CARFAX Report</h2>
        {importResult && (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            Last import successful
          </span>
        )}
      </div>

      {/* Upload Area */}
      <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
        importMutation.isPending
          ? 'border-gray-300 bg-gray-50'
          : 'border-gray-300 hover:border-yellow-500 cursor-pointer'
      }`}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileSelect}
          className="hidden"
          id="carfax-upload"
          disabled={importMutation.isPending}
        />
        <label htmlFor="carfax-upload" className={`${importMutation.isPending ? '' : 'cursor-pointer'}`}>
          {importMutation.isPending ? (
            <>
              <RefreshCw className="h-8 w-8 mx-auto text-yellow-500 mb-3 animate-spin" />
              <p className="text-sm font-medium text-gray-700">Importing CARFAX data...</p>
              <p className="text-xs text-gray-500 mt-1">This may take a moment</p>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 mx-auto text-gray-400 mb-3" />
              <p className="text-sm font-medium text-gray-700">
                Upload CARFAX PDF
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Import or re-import your CARFAX report
              </p>
            </>
          )}
        </label>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-3 rounded-md bg-red-50 text-red-700 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Success Result */}
      {importResult && (
        <div className="mt-4 space-y-3">
          <div className="p-3 rounded-md bg-green-50 text-green-700 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 flex-shrink-0" />
            <span className="text-sm">{importResult.message}</span>
          </div>

          {/* Import Summary */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-medium text-gray-900">{importResult.vehicle}</h3>
                <p className="text-xs text-gray-500">VIN: {importResult.vin}</p>

                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div>
                    <p className="text-xs text-gray-500">Retail Value</p>
                    <p className="text-sm font-semibold text-green-600">
                      {formatCurrency(importResult.retail_value)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Records Imported</p>
                    <p className="text-sm font-semibold">
                      {importResult.imported_records} / {importResult.total_records}
                    </p>
                  </div>
                  {importResult.last_odometer && (
                    <div>
                      <p className="text-xs text-gray-500">Odometer</p>
                      <p className="text-sm font-semibold">
                        {formatNumber(importResult.last_odometer)} mi
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-500">Owners</p>
                    <p className="text-sm font-semibold">{importResult.owners}</p>
                  </div>
                </div>

                {/* Status Badges */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {importResult.no_accidents && (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
                      No Accidents
                    </span>
                  )}
                  {importResult.single_owner && (
                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                      1-Owner
                    </span>
                  )}
                  {importResult.cpo_status && (
                    <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded">
                      CPO {importResult.cpo_status}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help Text */}
      <p className="mt-4 text-xs text-gray-500">
        Re-importing will update existing data and add any new service records.
      </p>
    </div>
  )
}
