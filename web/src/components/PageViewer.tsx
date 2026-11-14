import { useState } from 'react'
import { X, ZoomIn, ExternalLink } from 'lucide-react'
import type { AskSource } from '@/types'

interface PageViewerProps {
  sources: AskSource[]
}

export default function PageViewer({ sources }: PageViewerProps) {
  const [selectedPage, setSelectedPage] = useState<AskSource | null>(null)

  const withImages = sources.filter((s) => s.thumbnail_url && s.fullsize_url)
  if (withImages.length === 0) return null

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mt-3 pt-3 border-t border-gray-300/50">
        {withImages.map((source, i) => (
          <button
            key={`${source.document}-${source.page}-${i}`}
            onClick={() => setSelectedPage(source)}
            className="group relative bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-accent hover:shadow-md transition-all"
          >
            <div className="aspect-3/4 bg-gray-100">
              <img
                src={source.thumbnail_url}
                alt={`${source.document} page ${source.page}`}
                className="w-full h-full object-contain"
                loading="lazy"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            </div>
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all flex items-center justify-center">
              <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="p-1.5 text-[10px] leading-tight">
              <div className="font-medium text-gray-900 truncate">{source.document}</div>
              <div className="text-gray-500">Page {source.page}</div>
            </div>
          </button>
        ))}
      </div>

      {selectedPage && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          onClick={() => setSelectedPage(null)}
        >
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-medium text-gray-900">{selectedPage.document}</h3>
                <p className="text-sm text-gray-500">Page {selectedPage.page}</p>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={selectedPage.fullsize_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-gray-500 hover:text-gray-700"
                  title="Open in new tab"
                >
                  <ExternalLink className="h-5 w-5" />
                </a>
                <button onClick={() => setSelectedPage(null)} className="p-2 text-gray-500 hover:text-gray-700">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-gray-100">
              <img
                src={selectedPage.fullsize_url}
                alt={`${selectedPage.document} page ${selectedPage.page}`}
                className="w-full h-auto mx-auto shadow-lg"
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
