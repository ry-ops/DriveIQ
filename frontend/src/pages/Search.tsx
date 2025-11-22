import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Search as SearchIcon, Send, BookOpen } from 'lucide-react'
import { searchApi } from '../services/api'

export default function Search() {
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState<{ text: string; sources: Array<{ document: string; page: number }> } | null>(null)

  const askQuestion = useMutation({
    mutationFn: (q: string) => searchApi.ask(q),
    onSuccess: (data) => {
      setAnswer({ text: data.answer, sources: data.sources })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      askQuestion.mutate(query)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Ask About Your 4Runner</h1>
        <p className="text-gray-600">
          Ask questions about your vehicle using the owner's manual and service documentation.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} className="flex gap-4">
          <div className="flex-1 relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., How do I reset the tire pressure warning light?"
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-toyota-red focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={!query.trim() || askQuestion.isPending}
            className="flex items-center gap-2 px-6 py-3 bg-toyota-red text-white rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Ask
          </button>
        </form>
      </div>

      {askQuestion.isPending && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="animate-pulse">
            <p className="text-gray-600">Searching documentation...</p>
          </div>
        </div>
      )}

      {answer && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="prose max-w-none">
            <p className="text-gray-800 whitespace-pre-wrap">{answer.text}</p>
          </div>

          {answer.sources.length > 0 && (
            <div className="pt-4 border-t">
              <h3 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Sources
              </h3>
              <div className="flex flex-wrap gap-2">
                {answer.sources.map((source, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 bg-gray-100 text-gray-600 text-sm rounded"
                  >
                    {source.document}{source.page && `, p.${source.page}`}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Example Questions */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Example Questions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            'How do I check the oil level?',
            'What is the recommended tire pressure?',
            'How do I use the 4WD system?',
            'What does the check engine light mean?',
            'How do I reset the maintenance reminder?',
            'What type of oil should I use?',
          ].map((example) => (
            <button
              key={example}
              onClick={() => setQuery(example)}
              className="text-left px-4 py-2 bg-white border border-gray-200 rounded-md hover:border-toyota-red text-sm"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
