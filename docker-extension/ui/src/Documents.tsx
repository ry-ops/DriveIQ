import { useEffect, useState } from "react";
import { FileText, Trash2, CheckCircle, BookOpen, Database } from "lucide-react";
import { uploadsApi } from "./api";
import type { DocumentInfo, IngestedDocumentInfo } from "./types";

function getDocumentTypeLabel(type: string | null) {
  const types: Record<string, string> = {
    manual: "Owner's Manual",
    qrg: "Quick Reference Guide",
    carfax: "CARFAX Report",
    maintenance_report: "Maintenance Report",
    receipt: "Receipt",
    other: "Other Document",
  };
  return types[type || "other"] || type || "Other";
}

function getDocumentTypeColor(type: string | null) {
  const colors: Record<string, string> = {
    manual: "bg-blue-100 text-blue-700",
    qrg: "bg-green-100 text-green-700",
    carfax: "bg-purple-100 text-purple-700",
    maintenance_report: "bg-yellow-100 text-yellow-700",
    receipt: "bg-orange-100 text-orange-700",
    other: "bg-gray-100 text-gray-700",
  };
  return colors[type || "other"] || colors.other;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Documents() {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [ingestedDocs, setIngestedDocs] = useState<IngestedDocumentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [docs, ingested] = await Promise.all([
        uploadsApi.list(),
        uploadsApi.listIngested(),
      ]);
      setDocuments(docs);
      setIngestedDocs(ingested);
    } catch { /* */ } finally { setLoading(false); }
  }

  async function handleDelete(filename: string) {
    await uploadsApi.delete(filename);
    loadData();
  }

  const totalChunks = ingestedDocs.reduce((sum, d) => sum + d.chunk_count, 0);

  if (loading) return <div className="text-center py-12">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Documents</h1>
        <p className="text-gray-600">
          Vehicle documents for AI-powered search. Manuals and guides are kept as reference; other documents are auto-ingested and searchable.
        </p>
      </div>

      {/* Reference Library */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Reference Library</h2>
          <span className="text-sm text-gray-500">{documents.length} documents</span>
        </div>

        {documents.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc) => (
              <div key={doc.filename} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg flex-shrink-0 ${doc.document_type === "manual" ? "bg-blue-50" : "bg-green-50"}`}>
                    {doc.document_type === "manual" ? (
                      <BookOpen className="h-6 w-6 text-blue-600" />
                    ) : (
                      <FileText className="h-6 w-6 text-green-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate" title={doc.filename}>{doc.filename}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 text-xs rounded ${getDocumentTypeColor(doc.document_type)}`}>
                        {getDocumentTypeLabel(doc.document_type)}
                      </span>
                      <span className="text-xs text-gray-500">{formatFileSize(doc.size)}</span>
                    </div>
                  </div>
                  <button onClick={() => handleDelete(doc.filename)} className="p-1.5 text-gray-400 hover:text-red-500 rounded flex-shrink-0" title="Delete">
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
            <p className="text-sm mt-1">Upload your vehicle manual to enable AI-powered search.</p>
          </div>
        )}
      </div>

      {/* Knowledge Base */}
      {ingestedDocs.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-cyan-600" />
            <h2 className="text-xl font-semibold text-gray-900">Knowledge Base</h2>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {totalChunks.toLocaleString()} chunks
            </span>
          </div>
          <p className="text-sm text-gray-500">All ingested documents are searchable via AI, even after the source PDF is removed.</p>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y">
            {ingestedDocs.map((doc) => (
              <div key={doc.document_name} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-1.5 rounded flex-shrink-0 ${getDocumentTypeColor(doc.document_type)}`}>
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate" title={doc.document_name}>{doc.document_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">{doc.chunk_count} chunks</span>
                      <span className="text-xs text-gray-400">|</span>
                      <span className="text-xs text-gray-500">{doc.page_count} pages</span>
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0 ml-3">
                  {doc.on_disk ? (
                    <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> On disk</span>
                  ) : (
                    <span className="text-xs text-gray-400 flex items-center gap-1"><Database className="h-3 w-3" /> Vectors only</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
