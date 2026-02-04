import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  Car, FileText, Edit2, Trash2, MessageCircle, ChevronDown, ChevronUp,
  X, ExternalLink, Camera, Upload, Loader2
} from 'lucide-react'
import { maintenanceApi } from '../services/api'

interface MaintenanceCardProps {
  record: {
    id: number
    maintenance_type: string
    date_performed: string
    mileage: number | null
    description?: string | null
    service_provider?: string | null
    notes?: string | null
    cost?: number | null
    source: string
    tags?: string[]
    originalRecord?: unknown
  }
  onEdit?: () => void
  onDelete?: () => void
  onAskAbout?: (maintenanceType: string) => void
}

export default function MaintenanceCard({ record, onEdit, onDelete, onAskAbout }: MaintenanceCardProps) {
  const queryClient = useQueryClient()
  const [isExpanded, setIsExpanded] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [showPhotoUpload, setShowPhotoUpload] = useState(false)
  const [photoType, setPhotoType] = useState<'before' | 'after' | 'general'>('general')
  const [photoCaption, setPhotoCaption] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch related documents when expanded
  const { data: relatedDocs, isLoading: docsLoading } = useQuery({
    queryKey: ['related-docs', record.maintenance_type],
    queryFn: () => maintenanceApi.getRelatedDocs(record.maintenance_type, 4),
    enabled: isExpanded,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch photos for this record (if it's a manual record with an ID)
  const { data: photos, refetch: refetchPhotos } = useQuery({
    queryKey: ['maintenance-photos', record.id],
    queryFn: () => maintenanceApi.getPhotos(record.id),
    enabled: isExpanded && record.source === 'manual',
    staleTime: 60 * 1000,
  })

  // Photo upload mutation
  const uploadPhoto = useMutation({
    mutationFn: async (file: File) => {
      return maintenanceApi.uploadPhoto(record.id, file, photoType, photoCaption || undefined)
    },
    onSuccess: () => {
      refetchPhotos()
      queryClient.invalidateQueries({ queryKey: ['maintenance-photos', record.id] })
      setShowPhotoUpload(false)
      setPhotoCaption('')
      setPhotoType('general')
    },
  })

  // Photo delete mutation
  const deletePhoto = useMutation({
    mutationFn: (filename: string) => maintenanceApi.deletePhoto(record.id, filename),
    onSuccess: () => {
      refetchPhotos()
      queryClient.invalidateQueries({ queryKey: ['maintenance-photos', record.id] })
    },
  })

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadPhoto.mutate(file)
    }
  }

  const isCarfax = record.source?.toLowerCase() === 'carfax'
  const isManual = record.source === 'manual'

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
        {/* Header */}
        <div
          className="p-4 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              {isCarfax ? (
                <div className="p-2 bg-blue-50 rounded-lg">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
              ) : (
                <div className="p-2 bg-gray-100 rounded-lg">
                  <Car className="h-5 w-5 text-gray-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-gray-900 capitalize">
                    {record.maintenance_type.replace(/_/g, ' ')}
                  </h3>
                  {isCarfax && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                      CARFAX
                    </span>
                  )}
                  {record.tags?.map(tag => (
                    <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                  <span>{format(new Date(record.date_performed), 'MMM d, yyyy')}</span>
                  {record.mileage && (
                    <span className="flex items-center gap-1">
                      <Car className="h-3 w-3" />
                      {record.mileage.toLocaleString()} mi
                    </span>
                  )}
                  {record.service_provider && (
                    <span className="truncate">{record.service_provider}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-2">
              {record.cost && (
                <span className="font-semibold text-gray-900">${record.cost.toFixed(2)}</span>
              )}
              <button className="p-1 text-gray-400 hover:text-gray-600">
                {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="border-t border-gray-100 p-4 space-y-4">
            {/* Notes/Description */}
            {(record.notes || record.description) && (
              <p className="text-sm text-gray-600">
                {record.notes || record.description}
              </p>
            )}

            {/* Related Manual Pages */}
            {docsLoading ? (
              <div className="flex gap-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-20 h-24 bg-gray-100 animate-pulse rounded" />
                ))}
              </div>
            ) : relatedDocs && relatedDocs.documents.length > 0 ? (
              <div>
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Related Manual Pages
                </h4>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {relatedDocs.documents.map((doc, idx) => (
                    <button
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedImage(doc.fullsize_url)
                      }}
                      className="flex-shrink-0 group relative"
                      title={`${doc.document_name} - Page ${doc.page_number}`}
                    >
                      <img
                        src={doc.thumbnail_url}
                        alt={`Page ${doc.page_number}`}
                        className="w-20 h-24 object-cover rounded border-2 border-gray-200 group-hover:border-toyota-red transition-colors"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] px-1 py-0.5 rounded-b">
                        <div className="truncate">p.{doc.page_number}</div>
                        <div className="text-[8px] opacity-75">{Math.round(doc.relevance * 100)}% match</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Photos Section (for manual records) */}
            {isManual && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Photos {photos && photos.length > 0 && `(${photos.length})`}
                  </h4>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowPhotoUpload(!showPhotoUpload)
                    }}
                    className="flex items-center gap-1 text-xs text-toyota-red hover:text-red-700"
                  >
                    <Camera className="h-3 w-3" />
                    Add Photo
                  </button>
                </div>

                {/* Photo Upload Form */}
                {showPhotoUpload && (
                  <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-3" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-2">
                      <select
                        value={photoType}
                        onChange={(e) => setPhotoType(e.target.value as 'before' | 'after' | 'general')}
                        className="text-sm border border-gray-300 rounded px-2 py-1"
                      >
                        <option value="before">Before</option>
                        <option value="after">After</option>
                        <option value="general">General</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Caption (optional)"
                        value={photoCaption}
                        onChange={(e) => setPhotoCaption(e.target.value)}
                        className="flex-1 text-sm border border-gray-300 rounded px-2 py-1"
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadPhoto.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 bg-toyota-red text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
                      >
                        {uploadPhoto.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        {uploadPhoto.isPending ? 'Uploading...' : 'Choose Photo'}
                      </button>
                      <button
                        onClick={() => setShowPhotoUpload(false)}
                        className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Photo Gallery */}
                {photos && photos.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {photos.map((photo, idx) => (
                      <div key={idx} className="flex-shrink-0 group relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedImage(photo.url)
                          }}
                          className="block"
                        >
                          <img
                            src={photo.thumbnail_url}
                            alt={photo.caption || `Photo ${idx + 1}`}
                            className="w-20 h-20 object-cover rounded border-2 border-gray-200 group-hover:border-toyota-red transition-colors"
                          />
                        </button>
                        <div className="absolute top-1 left-1">
                          <span className={`text-[9px] px-1 py-0.5 rounded ${
                            photo.type === 'before' ? 'bg-orange-500 text-white' :
                            photo.type === 'after' ? 'bg-green-500 text-white' :
                            'bg-gray-500 text-white'
                          }`}>
                            {photo.type}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm('Delete this photo?')) {
                              deletePhoto.mutate(photo.filename)
                            }
                          }}
                          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete photo"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        {photo.caption && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate rounded-b">
                            {photo.caption}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : !showPhotoUpload && (
                  <p className="text-xs text-gray-400 italic">No photos yet</p>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onAskAbout?.(record.maintenance_type)
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-toyota-red bg-red-50 hover:bg-red-100 rounded-md transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                Ask about this
              </button>

              {relatedDocs && relatedDocs.documents.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedImage(relatedDocs.documents[0].fullsize_url)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  View Procedure
                </button>
              )}

              <div className="flex-1" />

              {onEdit && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit()
                  }}
                  className="p-1.5 text-gray-400 hover:text-blue-500 rounded"
                  title="Edit"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
              )}

              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete()
                  }}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Full-size image modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-full">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300"
            >
              <X className="h-8 w-8" />
            </button>
            <img
              src={selectedImage}
              alt="Full size"
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </>
  )
}
