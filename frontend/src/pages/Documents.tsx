import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useRef } from 'react'
import { Upload, FileText, Trash2, AlertCircle, CheckCircle } from 'lucide-react'
import { uploadsApi } from '../services/api'
import CarfaxImport from '../components/CarfaxImport'

export default function Documents() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const { data: documents, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: uploadsApi.list,
  })

  const uploadMutation = useMutation({
    mutationFn: uploadsApi.upload,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      setUploadStatus({ type: 'success', message: data.message })
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    onError: (error: any) => {
      setUploadStatus({
        type: 'error',
        message: error.response?.data?.detail || 'Upload failed'
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: uploadsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      setUploadStatus({ type: 'success', message: 'Document deleted successfully' })
    },
  })

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadStatus(null)
      uploadMutation.mutate(file)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getDocumentTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      manual: "Owner's Manual",
      qrg: 'Quick Reference Guide',
      carfax: 'CARFAX Report',
      maintenance_report: 'Maintenance Report',
      other: 'Other Document',
    }
    return types[type] || type
  }

  const getDocumentTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      manual: 'bg-blue-100 text-blue-700',
      qrg: 'bg-green-100 text-green-700',
      carfax: 'bg-purple-100 text-purple-700',
      maintenance_report: 'bg-yellow-100 text-yellow-700',
      other: 'bg-gray-100 text-gray-700',
    }
    return colors[type] || colors.other
  }

  if (isLoading) {
    return <div className="text-center py-12">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Documents</h1>
        <p className="text-gray-600">
          Upload your vehicle manuals, CARFAX reports, and other documents for AI-powered search.
        </p>
      </div>

      {/* CARFAX Import Section */}
      <CarfaxImport />

      {/* Upload Area */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-toyota-red transition-colors">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="hidden"
            id="file-upload"
          />
          <label htmlFor="file-upload" className="cursor-pointer">
            <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-lg font-medium text-gray-700">
              Click to upload a document
            </p>
            <p className="text-sm text-gray-500 mt-1">
              PDF files only, max 50MB
            </p>
          </label>
        </div>

        {uploadMutation.isPending && (
          <div className="mt-4 text-center text-gray-600">
            Uploading...
          </div>
        )}

        {uploadStatus && (
          <div className={`mt-4 p-3 rounded-md flex items-center gap-2 ${
            uploadStatus.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {uploadStatus.type === 'success' ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
            {uploadStatus.message}
          </div>
        )}
      </div>

      {/* Supported Document Types */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Supported Documents</h3>
        <div className="flex flex-wrap gap-2">
          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">Owner's Manual</span>
          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">Quick Reference Guide</span>
          <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">CARFAX Report</span>
          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded">Maintenance Reports</span>
        </div>
      </div>

      {/* Document List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Your Documents</h2>
        </div>
        {documents && documents.length > 0 ? (
          <div className="divide-y">
            {documents.map((doc) => (
              <div key={doc.filename} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-8 w-8 text-red-500" />
                    <div>
                      <p className="font-medium text-gray-900">{doc.filename}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-2 py-0.5 text-xs rounded ${getDocumentTypeColor(doc.document_type)}`}>
                          {getDocumentTypeLabel(doc.document_type)}
                        </span>
                        <span className="text-sm text-gray-500">
                          {formatFileSize(doc.size)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${doc.filename}"?`)) {
                        deleteMutation.mutate(doc.filename)
                      }
                    }}
                    className="p-2 text-gray-400 hover:text-red-500"
                    title="Delete document"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            <FileText className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p>No documents uploaded yet.</p>
            <p className="text-sm mt-1">
              Upload your vehicle manual and CARFAX report to enable AI-powered search.
            </p>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-800 mb-2">After Uploading</h3>
        <p className="text-sm text-blue-700">
          After uploading documents, run the document ingestion script to enable AI search:
        </p>
        <code className="block mt-2 p-2 bg-blue-100 rounded text-xs text-blue-800">
          python scripts/ingest_documents.py
        </code>
      </div>
    </div>
  )
}
