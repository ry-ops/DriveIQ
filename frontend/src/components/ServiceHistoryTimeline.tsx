import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  Wrench, Star, MapPin, Phone, Car, Shield, AlertCircle, CheckCircle,
  MessageCircle, ChevronLeft, ChevronRight, X, FileText
} from 'lucide-react'
import { maintenanceApi } from '../services/api'
import { useChat } from '../context/ChatContext'

interface ServiceRecord {
  id: number
  date: string
  mileage: number
  service_type: string
  description: string
  category: string
  source: string
  location: string | null
  tags: string[]
  dealer_name: string | null
  dealer_rating: number | null
  dealer_phone: string | null
}

const categoryColors: Record<string, { bg: string; text: string; icon: typeof Wrench }> = {
  maintenance: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Wrench },
  repair: { bg: 'bg-orange-100', text: 'text-orange-700', icon: AlertCircle },
  inspection: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle },
  recall: { bg: 'bg-red-100', text: 'text-red-700', icon: Shield },
}

// Convert service type to maintenance type for RAG lookup
function toMaintenanceType(serviceType: string): string {
  return serviceType.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

// Document Carousel Component
function DocumentCarousel({ serviceType }: { serviceType: string }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)

  const maintenanceType = toMaintenanceType(serviceType)

  const { data: relatedDocs, isLoading } = useQuery({
    queryKey: ['related-docs', maintenanceType],
    queryFn: () => maintenanceApi.getRelatedDocs(maintenanceType, 6),
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="flex gap-2 mt-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="w-16 h-20 bg-gray-200 animate-pulse rounded" />
        ))}
      </div>
    )
  }

  if (!relatedDocs || relatedDocs.documents.length === 0) {
    return null
  }

  const docs = relatedDocs.documents
  const showNav = docs.length > 3

  const scroll = (direction: 'left' | 'right') => {
    if (direction === 'left') {
      setCurrentIndex(Math.max(0, currentIndex - 1))
    } else {
      setCurrentIndex(Math.min(docs.length - 3, currentIndex + 1))
    }
  }

  const visibleDocs = docs.slice(currentIndex, currentIndex + 3)

  return (
    <>
      <div className="mt-3 border-t border-gray-200 pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
            <FileText className="h-3 w-3" />
            Related Manual Pages
          </span>
          {showNav && (
            <div className="flex gap-1">
              <button
                onClick={() => scroll('left')}
                disabled={currentIndex === 0}
                className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => scroll('right')}
                disabled={currentIndex >= docs.length - 3}
                className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-2 overflow-hidden">
          {visibleDocs.map((doc, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedImage(doc.fullsize_url)}
              className="flex-shrink-0 group relative"
              title={`${doc.document_name} - Page ${doc.page_number}`}
            >
              <img
                src={doc.thumbnail_url}
                alt={`Page ${doc.page_number}`}
                className="w-16 h-20 object-cover rounded border border-gray-200 group-hover:border-toyota-red transition-colors"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none'
                }}
              />
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[8px] px-1 py-0.5 rounded-b text-center">
                p.{doc.page_number}
              </div>
            </button>
          ))}
        </div>
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
              alt="Document page"
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </>
  )
}

export default function ServiceHistoryTimeline() {
  const { openWithMessage } = useChat()

  const { data: records, isLoading, error } = useQuery<ServiceRecord[]>({
    queryKey: ['service-records'],
    queryFn: async () => {
      const res = await fetch('/api/import/service-records')
      if (!res.ok) throw new Error('Failed to fetch service records')
      return res.json()
    },
  })

  const { data: vehicle } = useQuery({
    queryKey: ['vehicle'],
    queryFn: async () => {
      const res = await fetch('/api/vehicle')
      if (!res.ok) throw new Error('Failed to fetch vehicle')
      return res.json()
    },
  })

  const handleAskAbout = (serviceType: string) => {
    const vehicleInfo = vehicle
      ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
      : 'my vehicle'
    const question = `Tell me about the ${serviceType.toLowerCase()} procedure for ${vehicleInfo}. What are the steps, specifications, and any important tips?`
    openWithMessage(question)
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-16 w-1 bg-gray-200 rounded"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                <div className="h-3 bg-gray-200 rounded w-3/4"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error || !records || records.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Service History Timeline</h2>
        <p className="text-gray-500 text-center py-8">
          No service records found. Import a CARFAX report to see your service history.
        </p>
      </div>
    )
  }

  // Group records by year
  const recordsByYear: Record<string, ServiceRecord[]> = {}
  records.forEach((record) => {
    const year = new Date(record.date).getFullYear().toString()
    if (!recordsByYear[year]) {
      recordsByYear[year] = []
    }
    recordsByYear[year].push(record)
  })

  const years = Object.keys(recordsByYear).sort((a, b) => parseInt(b) - parseInt(a))

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Service History Timeline</h2>
        <span className="text-sm text-gray-500">{records.length} records</span>
      </div>

      <div className="space-y-8">
        {years.map((year) => (
          <div key={year}>
            <div className="sticky top-0 bg-white py-2 z-10">
              <h3 className="text-sm font-bold text-gray-900 bg-gray-100 inline-block px-3 py-1 rounded-full">
                {year}
              </h3>
            </div>

            <div className="relative ml-4 space-y-0">
              {/* Timeline line */}
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gray-200"></div>

              {recordsByYear[year].map((record) => {
                const category = categoryColors[record.category] || categoryColors.maintenance
                const CategoryIcon = category.icon

                return (
                  <div key={record.id} className="relative pl-8 pb-6">
                    {/* Timeline dot */}
                    <div className={`absolute left-0 w-3 h-3 rounded-full transform -translate-x-1/2 mt-1.5 ${category.bg} border-2 border-white shadow`}></div>

                    <div className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${category.bg} ${category.text}`}>
                              <CategoryIcon className="h-3 w-3" />
                              {record.category}
                            </span>
                            <h4 className="font-medium text-gray-900">{record.service_type}</h4>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                            <span>{format(new Date(record.date), 'MMM d, yyyy')}</span>
                            {record.mileage > 0 && (
                              <span className="flex items-center gap-1">
                                <Car className="h-3 w-3" />
                                {record.mileage.toLocaleString()} mi
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {record.source && (
                            <span className={`text-xs px-2 py-0.5 rounded ${record.source === 'CARFAX' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-200 text-gray-600'}`}>
                              {record.source}
                            </span>
                          )}
                          <button
                            onClick={() => handleAskAbout(record.service_type)}
                            className="p-1 text-gray-400 hover:text-toyota-red transition-colors"
                            title="Ask about this service"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Description */}
                      {record.description && (
                        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                          {record.description}
                        </p>
                      )}

                      {/* Document Carousel */}
                      <DocumentCarousel serviceType={record.service_type} />

                      {/* Dealer Info */}
                      {(record.dealer_name || record.location) && (
                        <div className="border-t border-gray-200 pt-3 mt-3">
                          <div className="flex items-start gap-4 text-sm">
                            {record.dealer_name && (
                              <div className="flex items-start gap-2">
                                <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                                <div>
                                  <p className="font-medium text-gray-700">{record.dealer_name}</p>
                                  {record.dealer_rating && (
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <Star className="h-3 w-3 text-yellow-500 fill-current" />
                                      <span className="text-gray-600">{record.dealer_rating}/5.0</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            {record.dealer_phone && (
                              <div className="flex items-center gap-1 text-gray-500">
                                <Phone className="h-3 w-3" />
                                <span>{record.dealer_phone}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Tags */}
                      {record.tags && record.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {record.tags.map((tag) => (
                            <span key={tag} className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="border-t border-gray-200 mt-6 pt-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          {Object.entries(categoryColors).map(([cat, colors]) => {
            const count = records.filter((r) => r.category === cat).length
            if (count === 0) return null
            const Icon = colors.icon
            return (
              <div key={cat} className={`p-2 rounded-lg ${colors.bg}`}>
                <div className="flex items-center justify-center gap-1">
                  <Icon className={`h-4 w-4 ${colors.text}`} />
                  <span className={`text-sm font-medium ${colors.text} capitalize`}>{cat}</span>
                </div>
                <p className={`text-lg font-bold ${colors.text}`}>{count}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
