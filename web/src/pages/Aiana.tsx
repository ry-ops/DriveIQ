import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Sparkles, Send, Upload, RotateCcw } from 'lucide-react'
import { api } from '@/lib/api'
import PageViewer from '@/components/PageViewer'
import UploadDocumentModal from '@/components/UploadDocumentModal'
import type { AskSource } from '@/types'

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: AskSource[]
}

export default function Aiana() {
  const queryClient = useQueryClient()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isAsking, setIsAsking] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const bottomRef = useRef<HTMLDivElement>(null)
  const deepLinkFired = useRef(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  // When the shared conversation resets if nothing new is asked (ISO).
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const askingRef = useRef(false)

  // Plain async function + local state rather than useMutation — this page
  // only ever has one ask in flight and doesn't need react-query's caching,
  // and a mutation triggered from an effect (the deep-link case below) can
  // otherwise land on a stale observer if StrictMode's dev-only double-effect
  // remounts the subscription between firing and settling.
  async function runAsk(query: string) {
    setIsAsking(true)
    askingRef.current = true
    try {
      const res = await api.aiana.ask(query)
      setMessages((prev) => [...prev, { role: 'assistant', content: res.answer, sources: res.sources }])
      setExpiresAt(res.expires_at ?? null)
      if (res.reminder_created || res.reminder_updated) {
        queryClient.invalidateQueries({ queryKey: ['reminders'] })
      }
    } catch (err) {
      const detail = err instanceof Error && err.message ? err.message : 'unknown error'
      setMessages((prev) => [...prev, { role: 'assistant', content: `Sorry — something went wrong asking Aiana (${detail}). Please try again.` }])
    } finally {
      setIsAsking(false)
      askingRef.current = false
    }
  }

  // The conversation is shared across devices and kept on the server, so
  // load it on arrival and again whenever this tab comes back into view
  // (another device may have added to it, or it may have reset).
  async function syncConversation(mode: 'prepend' | 'replace') {
    try {
      const conv = await api.aiana.conversation()
      // A refresh mid-question would drop the pending question from view.
      // The first load always applies: it returns well before a deep-linked
      // question (?q=) gets its answer, so nothing is duplicated.
      if (mode === 'replace' && askingRef.current) return
      setMessages((prev) => (mode === 'prepend' ? [...conv.messages, ...prev] : conv.messages))
      setExpiresAt(conv.expires_at)
    } catch {
      // Not fatal — the page still works, it just starts without history.
    }
  }

  useEffect(() => {
    syncConversation('prepend')
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncConversation('replace')
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  async function newChat() {
    if (askingRef.current) return
    try {
      await api.aiana.resetConversation()
      setMessages([])
      setExpiresAt(null)
    } catch (err) {
      const detail = err instanceof Error && err.message ? err.message : 'unknown error'
      setMessages((prev) => [...prev, { role: 'assistant', content: `Couldn't start a new chat (${detail}).` }])
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isAsking])

  // Deep link from a What's Next card (?q=...) — ask it once on arrival,
  // then drop it from the URL so refreshing doesn't re-ask.
  useEffect(() => {
    const initialQuery = searchParams.get('q')
    if (!initialQuery || deepLinkFired.current) return
    deepLinkFired.current = true
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('q')
      return next
    }, { replace: true })
    setMessages((prev) => [...prev, { role: 'user', content: initialQuery }])
    runAsk(initialQuery)
  }, [])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const query = input.trim()
    if (!query || isAsking) return
    setMessages((prev) => [...prev, { role: 'user', content: query }])
    setInput('')
    runAsk(query)
  }

  return (
    <>
    <div className="flex flex-col h-[calc(100vh-8rem)] max-h-[800px] bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-6 py-4 border-b border-gray-100 bg-linear-to-r from-gray-900 to-gray-800">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-5 w-5 text-accent shrink-0" />
          <div className="min-w-0">
            <h2 className="font-semibold text-white">Aiana</h2>
            <p className="text-xs text-gray-400">Ask about your owner's manual, service history, or reminders</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {messages.length > 0 && (
            <button
              onClick={newChat}
              disabled={isAsking}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 border border-white/20 rounded-lg hover:bg-white/10 disabled:opacity-50 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">New chat</span>
            </button>
          )}
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 border border-white/20 rounded-lg hover:bg-white/10 transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Upload document</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12 text-muted">
            <Sparkles className="h-8 w-8 mx-auto mb-3 text-gray-300" />
            <p>Ask Aiana anything about your vehicle: maintenance intervals, dashboard warnings, tire specs, service history…</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-lg px-4 py-3 text-sm ${
                m.role === 'user' ? 'bg-accent text-white whitespace-pre-wrap' : 'bg-gray-100 text-gray-900'
              }`}
            >
              {m.role === 'assistant' ? (
                <div className="prose prose-sm prose-gray max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_strong]:font-semibold [&_table]:text-xs [&_table]:border-collapse [&_th]:text-left [&_th]:pr-3 [&_th]:border-b [&_th]:border-gray-300 [&_th]:pb-1 [&_td]:pr-3 [&_td]:py-1">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              ) : (
                m.content
              )}
              {m.sources && m.sources.length > 0 && <PageViewer sources={m.sources} />}
            </div>
          </div>
        ))}

        {isAsking && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-500 rounded-lg px-4 py-3 text-sm">Thinking…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={submit} className="flex gap-2 p-4 border-t border-gray-100">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Aiana about your vehicle…"
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-hidden focus:ring-2 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={!input.trim() || isAsking}
          className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
        >
          <Send className="h-4 w-4" />
          Ask
        </button>
      </form>
      <p className="px-4 pb-3 -mt-2 text-xs text-muted">
        Aiana remembers this conversation on all your devices until 4 hours pass without a message
        {expiresAt
          ? ` (currently until ${new Date(expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})`
          : ''}
        .
      </p>
    </div>
    <UploadDocumentModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </>
  )
}
