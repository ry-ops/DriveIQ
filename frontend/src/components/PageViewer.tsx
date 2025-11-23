import { useState } from 'react'
import { X, ZoomIn, ExternalLink } from 'lucide-react'

interface Source {
  document: string
  page: number
  chapter?: string
  section?: string
  topics?: string[]
  thumbnail_url: string
  fullsize_url: string
  highlighted_url?: string | null
}

interface PageViewerProps {
  sources: Source[]
  keyTerms?: string[]
}

export default function PageViewer({ sources, keyTerms = [] }: PageViewerProps) {
  const [selectedPage, setSelectedPage] = useState<Source | null>(null)
  const [showHighlighted, setShowHighlighted] = useState(true)

  const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const getImageUrl = (url: string) => {
    if (url.startsWith('http')) return url
    return `${apiBaseUrl}${url}`
  }

  const getDisplayUrl = (source: Source) => {
    if (showHighlighted && source.highlighted_url) {
      return getImageUrl(source.highlighted_url)
    }
    return getImageUrl(source.fullsize_url)
  }

  return (
    <>
      {/* Thumbnail Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {sources.map((source, i) => (
          <button
            key={`${source.document}-${source.page}-${i}`}
            onClick={() => setSelectedPage(source)}
            className="group relative bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-toyota-red hover:shadow-md transition-all"
          >
            <div className="aspect-[3/4] bg-gray-100">
              <img
                src={getImageUrl(source.thumbnail_url)}
                alt={`${source.document} page ${source.page}`}
                className="w-full h-full object-contain"
                loading="lazy"
              />
            </div>
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all flex items-center justify-center">
              <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="p-2 text-xs">
              <div className="font-medium text-gray-900 truncate">{source.document}</div>
              <div className="text-gray-500">Page {source.page}</div>
              {source.chapter && (
                <div className="text-gray-400 truncate text-[10px]">{source.chapter}</div>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Fullsize Modal */}
      {selectedPage && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-medium text-gray-900">{selectedPage.document}</h3>
                <p className="text-sm text-gray-500">
                  Page {selectedPage.page}
                  {selectedPage.chapter && ` - ${selectedPage.chapter}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {selectedPage.highlighted_url && keyTerms.length > 0 && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={showHighlighted}
                      onChange={(e) => setShowHighlighted(e.target.checked)}
                      className="rounded text-toyota-red focus:ring-toyota-red"
                    />
                    Show highlights
                  </label>
                )}
                <a
                  href={getDisplayUrl(selectedPage)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-gray-500 hover:text-gray-700"
                  title="Open in new tab"
                >
                  <ExternalLink className="h-5 w-5" />
                </a>
                <button
                  onClick={() => setSelectedPage(null)}
                  className="p-2 text-gray-500 hover:text-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Image */}
            <div className="flex-1 overflow-auto p-4 bg-gray-100">
              <img
                src={getDisplayUrl(selectedPage)}
                alt={`${selectedPage.document} page ${selectedPage.page}`}
                className="w-full h-auto mx-auto shadow-lg"
              />
            </div>

            {/* Footer with metadata */}
            {(selectedPage.section || (selectedPage.topics && selectedPage.topics.length > 0)) && (
              <div className="p-3 border-t text-sm">
                {selectedPage.section && (
                  <p className="text-gray-600">
                    <span className="font-medium">Section:</span> {selectedPage.section}
                  </p>
                )}
                {selectedPage.topics && selectedPage.topics.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {selectedPage.topics.map((topic) => (
                      <span
                        key={topic}
                        className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
