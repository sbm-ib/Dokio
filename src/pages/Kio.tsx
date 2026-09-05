import { useState } from 'react'
import { Sparkles, Loader2, FileText } from 'lucide-react'
import { useDocuments } from '../hooks/useDocuments'
import { CATEGORIE_LABELS, CATEGORIE_COLORS, formatDateShort, getDocLabel } from '../lib/utils'
import KioChat from '../components/KioChat'
import type { Document } from '../types'

export default function Kio() {
  const { documents, loading } = useDocuments()
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null)

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <Sparkles size={20} className="text-paperliss" />
        <h1 className="text-2xl font-bold text-gray-900">Kio</h1>
      </div>
      <p className="text-gray-500 text-sm -mt-4 mb-6">
        Discute avec Kio pour comprendre un document et rédiger ta réponse au fil de la conversation.
      </p>

      {selectedDoc ? (
        <KioChat doc={selectedDoc} onChangeDocument={() => setSelectedDoc(null)} />
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-300" />
        </div>
      ) : documents.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
          <div className="w-14 h-14 bg-paperliss-light rounded-xl flex items-center justify-center mx-auto mb-4">
            <FileText size={24} className="text-paperliss" />
          </div>
          <p className="text-gray-700 font-medium mb-1">Aucun document pour l'instant</p>
          <p className="text-sm text-gray-400">Scanne d'abord un courrier pour pouvoir en discuter avec Kio.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6">
          <p className="text-sm font-medium text-gray-700 mb-3">Sur quel document veux-tu discuter ?</p>
          <div className="space-y-2">
            {documents.map(doc => (
              <button
                key={doc.id}
                onClick={() => setSelectedDoc(doc)}
                className="w-full flex items-center justify-between gap-3 p-3.5 rounded-xl border border-gray-100 hover:border-paperliss hover:bg-paperliss-light/30 transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{getDocLabel(doc)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDateShort(doc.created_at)}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full shrink-0 ${CATEGORIE_COLORS[doc.categorie]}`}>
                  {CATEGORIE_LABELS[doc.categorie]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
