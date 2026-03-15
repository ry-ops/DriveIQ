import { useState } from "react";
import { Search as SearchIcon, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { searchApi } from "./api";
import type { AskSource } from "./types";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<{ text: string; sources: AskSource[]; keyTerms: string[] } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || loading) return;
    setLoading(true);
    try {
      const data = await searchApi.ask(query);
      setAnswer({ text: data.answer, sources: data.sources, keyTerms: data.key_terms || [] });
    } catch {
      setAnswer({ text: "Sorry, an error occurred.", sources: [], keyTerms: [] });
    } finally {
      setLoading(false);
    }
  }

  async function askExample(example: string) {
    setQuery(example);
    setLoading(true);
    try {
      const data = await searchApi.ask(example);
      setAnswer({ text: data.answer, sources: data.sources, keyTerms: data.key_terms || [] });
    } catch {
      setAnswer({ text: "Sorry, an error occurred.", sources: [], keyTerms: [] });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Ask About Your Vehicle</h1>
        <p className="text-gray-600">Ask questions about your vehicle using the owner's manual and service documentation.</p>
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
          <button type="submit" disabled={!query.trim() || loading} className="flex items-center gap-2 px-6 py-3 bg-toyota-red text-white rounded-md hover:bg-red-700 disabled:opacity-50">
            <Send className="h-4 w-4" />
            Ask
          </button>
        </form>
      </div>

      {loading && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="animate-pulse"><p className="text-gray-600">Searching documentation...</p></div>
        </div>
      )}

      {answer && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="prose prose-gray max-w-none prose-headings:text-gray-900 prose-h2:text-xl prose-h2:mt-4 prose-h2:mb-2 prose-h3:text-lg prose-h3:mt-3 prose-h3:mb-1 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-strong:font-semibold">
            <ReactMarkdown>{answer.text}</ReactMarkdown>
          </div>

          {answer.sources.length > 0 && (
            <div className="pt-4 border-t">
              <h3 className="text-sm font-medium text-gray-500 mb-3">Source Pages</h3>
              <div className="flex gap-2 flex-wrap">
                {answer.sources.map((s, i) => (
                  <span key={i} className="px-3 py-1 text-xs bg-blue-50 text-blue-700 rounded-full border border-blue-200">
                    {s.document} p.{s.page}
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
            "How do I check the oil level?",
            "What is the recommended tire pressure?",
            "How do I use the 4WD system?",
            "What does the check engine light mean?",
            "How do I reset the maintenance reminder?",
            "What type of oil should I use?",
          ].map((example) => (
            <button
              key={example}
              onClick={() => askExample(example)}
              disabled={loading}
              className="text-left px-4 py-2 bg-white border border-gray-200 rounded-md hover:border-toyota-red text-sm disabled:opacity-50"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
