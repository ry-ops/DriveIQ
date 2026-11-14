import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { X, FileUp, CheckCircle2, AlertTriangle } from 'lucide-react'
import { ingestPdf, type UploadProgress } from '@/lib/pdfIngest'

interface UploadDocumentModalProps {
  open: boolean
  onClose: () => void
}

const PHASE_LABEL: Record<UploadProgress['phase'], string> = {
  parsing: 'Reading pages',
  'indexing-text': 'Indexing text',
  'rendering-images': 'Rendering page images',
  done: 'Done',
}

export default function UploadDocumentModal({ open, onClose }: UploadDocumentModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [documentName, setDocumentName] = useState('')
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('No file selected')
      return ingestPdf(file, documentName.trim(), setProgress)
    },
  })

  if (!open) return null

  const reset = () => {
    setFile(null)
    setDocumentName('')
    setProgress(null)
    upload.reset()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null
    if (picked && picked.type !== 'application/pdf') {
      upload.reset()
      setFile(null)
      setDocumentName('')
      return
    }
    setFile(picked)
    if (picked) setDocumentName(picked.name.replace(/\.pdf$/i, ''))
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="bg-white rounded-lg max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-gray-900">Upload document</h3>
          <button onClick={handleClose} className="p-1 text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {upload.status === 'idle' && (
            <>
              <div>
                <label className="block text-sm text-gray-500 mb-1">PDF file</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleFileChange}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 file:mr-3 file:px-3 file:py-1 file:rounded-md file:border-0 file:bg-gray-100 file:text-gray-700"
                />
              </div>
              {file && file.type !== 'application/pdf' && (
                <p className="text-sm text-red-600 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Please choose a PDF file.
                </p>
              )}
              <div>
                <label className="block text-sm text-gray-500 mb-1">Document name</label>
                <input
                  type="text"
                  value={documentName}
                  onChange={(e) => setDocumentName(e.target.value)}
                  placeholder="e.g. Roof Rack Installation Guide"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <p className="text-xs text-gray-400">
                Processing happens in this browser tab — keep it open until upload finishes.
              </p>
              <button
                onClick={() => upload.mutate()}
                disabled={!file || !documentName.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-accent text-white font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                <FileUp className="h-4 w-4" />
                Start upload
              </button>
            </>
          )}

          {upload.status === 'pending' && progress && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-900">{PHASE_LABEL[progress.phase]}</p>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%` }}
                />
              </div>
              <p className="text-xs text-gray-500">
                {progress.current} / {progress.total}
              </p>
            </div>
          )}

          {upload.status === 'success' && (
            <div className="text-center py-4 space-y-2">
              <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto" />
              <p className="font-medium text-gray-900">Indexed — you can ask Aiana about it now.</p>
              <button onClick={handleClose} className="mt-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
                Close
              </button>
            </div>
          )}

          {upload.status === 'error' && (
            <div className="space-y-3">
              <p className="text-sm text-red-600 flex items-start gap-1.5">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                {upload.error instanceof Error ? upload.error.message : 'Upload failed.'}
              </p>
              <p className="text-xs text-gray-400">
                Retrying after a failed text-indexing step may create duplicate search entries for chunks already
                indexed.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => upload.mutate()}
                  className="flex-1 px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-red-600"
                >
                  Retry
                </button>
                <button onClick={handleClose} className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300">
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
