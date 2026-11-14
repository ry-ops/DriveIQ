import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useRef } from 'react'
import { Upload, FileText, Trash2, AlertCircle, CheckCircle, BookOpen, Database } from 'lucide-react'
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

  const { data: ingestedDocs } = useQuery({
    queryKey: ['ingested-documents'],
    queryFn: uploadsApi.listIngested,
  })

  const uploadMutation = useMutation({
    mutationFn: uploadsApi.upload,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      queryClient.invalidateQueries({ queryKey: ['ingested-documents'] })
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
      queryClient.invalidateQueries({ queryKey: ['ingested-documents'] })
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

  const getDocumentTypeLabel = (type: string | null) => {
    const types: Record<string, string> = {
      manual: "Owner's Manual",
      qrg: 'Quick Reference Guide',
      carfax: 'CARFAX Report',
      maintenance_report: 'Maintenance Report',
      receipt: 'Receipt',
      other: 'Other Document',
    }
    return types[type || 'other'] || type || 'Other'
  }

  const getDocumentTypeColor = (type: string | null) => {
    const colors: Record<string, string> = {
      manual: 'bg-blue-100 text-blue-700',
      qrg: 'bg-green-100 text-green-700',
      carfax: 'bg-purple-100 text-purple-700',
      maintenance_report: 'bg-yellow-100 text-yellow-700',
      receipt: 'bg-orange-100 text-orange-700',
      other: 'bg-gray-100 text-gray-700',
    }
    return colors[type || 'other'] || colors.other
  }

  const totalChunks = ingestedDocs?.reduce((sum, d) => sum + d.chunk_count, 0) || 0

  if (isLoading) {
    return <div className="text-center py-12">Loading...</div>
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Documents</h1>
        <p className="text-gray-600">
          Upload vehicle documents for AI-powered search. Manuals and guides are kept as reference; other documents are auto-ingested and searchable.
        </p>
      </div>

      {/* Side-by-side Upload Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: CARFAX Import */}
        <CarfaxImport />

        {/* Right: General PDF Upload */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Upload Document</h2>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-toyota-red transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <Upload className="h-10 w-10 mx-auto text-gray-400 mb-3" />
              <p className="text-sm font-medium text-gray-700">
                Click to upload a document
              </p>
              <p className="text-xs text-gray-500 mt-1">
                PDF files only, max 50MB
              </p>
            </label>
          </div>

          {uploadMutation.isPending && (
            <div className="mt-4 text-center text-gray-600 text-sm">
              Uploading...
            </div>
          )}

          {uploadStatus && (
            <div className={`mt-4 p-3 rounded-md flex items-center gap-2 text-sm ${
              uploadStatus.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {uploadStatus.type === 'success' ? (
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
              )}
              {uploadStatus.message}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">Manuals</span>
            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">Quick Reference Guides</span>
            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded">Service Records</span>
            <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">Other PDFs</span>
          </div>
        </div>
      </div>

      {/* Reference Library */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Reference Library</h2>
          <span className="text-sm text-gray-500">{documents?.length || 0} documents</span>
        </div>

        {documents && documents.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc) => (
              <div key={doc.filename} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg flex-shrink-0 ${
                    doc.document_type === 'manual' ? 'bg-blue-50' : 'bg-green-50'
                  }`}>
                    {doc.document_type === 'manual' ? (
                      <BookOpen className="h-6 w-6 text-blue-600" />
                    ) : (
                      <FileText className="h-6 w-6 text-green-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate" title={doc.filename}>
                      {doc.filename}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 text-xs rounded ${getDocumentTypeColor(doc.document_type)}`}>
                        {getDocumentTypeLabel(doc.document_type)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatFileSize(doc.size)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${doc.filename}" and all associated data?`)) {
                        deleteMutation.mutate(doc.filename)
                      }
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded flex-shrink-0"
                    title="Delete document"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-500">
            <BookOpen className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p>No reference documents yet.</p>
            <p className="text-sm mt-1">
              Upload your vehicle manual to enable AI-powered search.
            </p>
          </div>
        )}
      </div>

      {/* Knowledge Base */}
      {ingestedDocs && ingestedDocs.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-cyan-600" />
            <h2 className="text-xl font-semibold text-gray-900">Knowledge Base</h2>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {totalChunks.toLocaleString()} chunks
            </span>
          </div>
          <p className="text-sm text-gray-500">
            All ingested documents are searchable via AI, even after the source PDF is removed.
          </p>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y">
            {ingestedDocs.map((doc) => (
              <div key={doc.document_name} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-1.5 rounded flex-shrink-0 ${getDocumentTypeColor(doc.document_type)}`}>
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate" title={doc.document_name}>
                      {doc.document_name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">{doc.chunk_count} chunks</span>
                      <span className="text-xs text-gray-400">|</span>
                      <span className="text-xs text-gray-500">{doc.page_count} pages</span>
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0 ml-3">
                  {doc.on_disk ? (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" /> On disk
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Database className="h-3 w-3" /> Vectors only
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
