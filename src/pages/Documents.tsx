import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, FileText, Trash2, Archive, CheckCircle, ExternalLink, Plus, Filter } from 'lucide-react'
import { useDocuments } from '../hooks/useDocuments'
import {
  CATEGORIE_LABELS, CATEGORIE_COLORS, STATUT_COLORS, STATUT_LABELS,
  getDaysUntil, deadlineColor, formatDateShort,
} from '../lib/utils'
import type { Document } from '../types'
import toast from 'react-hot-toast'

type CatFilter = Document['categorie'] | 'tous'
type StatutFilter = Document['statut'] | 'tous'

const CATEGORIES: { value: CatFilter; label: string }[] = [
  { value: 'tous', label: 'Tous' },
  { value: 'courriers', label: 'Courriers' },
  { value: 'factures', label: 'Factures' },
  { value: 'identite', label: 'Identité' },
  { value: 'autres', label: 'Autres' },
]

const STATUTS: { value: StatutFilter; label: string }[] = [
  { value: 'tous', label: 'Tous les statuts' },
  { value: 'nouveau', label: 'Nouveau' },
  { value: 'traite', label: 'Traité' },
  { value: 'archive', label: 'Archivé' },
]

export default function Documents() {
  const { documents, loading, updateStatus, deleteDocument } = useDocuments()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<CatFilter>('tous')
  const [statutFilter, setStatutFilter] = useState<StatutFilter>('tous')
  const [deleting, setDeleting] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return documents.filter(doc => {
      if (catFilter !== 'tous' && doc.categorie !== catFilter) return false
      if (statutFilter !== 'tous' && doc.statut !== statutFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          doc.nom_fichier.toLowerCase().includes(q) ||
          (doc.explication_ia ?? '').toLowerCase().includes(q) ||
          (doc.organisme_detecte ?? '').toLowerCase().includes(q) ||
          CATEGORIE_LABELS[doc.categorie].toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [documents, catFilter, statutFilter, search])

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce document définitivement ?')) return
    setDeleting(id)
    try {
      await deleteDocument(id)
      toast.success('Document supprimé')
    } catch {
      toast.error('Erreur lors de la suppression')
    } finally {
      setDeleting(null)
    }
  }

  const handleStatus = async (id: string, statut: Document['statut']) => {
    await updateStatus(id, statut)
    toast.success(`Document marqué comme "${STATUT_LABELS[statut]}"`)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes Documents</h1>
          <p className="text-gray-500 text-sm mt-1">{documents.length} document{documents.length !== 1 ? 's' : ''} au total</p>
        </div>
        <button
          onClick={() => navigate('/scanner')}
          className="flex items-center gap-2 bg-paperliss hover:bg-paperliss-dark text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
        >
          <Plus size={16} />
          Ajouter
        </button>
      </div>

      {/* Filtres catégories */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {CATEGORIES.map(c => (
          <button
            key={c.value}
            onClick={() => setCatFilter(c.value)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              catFilter === c.value
                ? 'bg-paperliss text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Barre recherche + filtre statut */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher dans vos documents…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:ring-2 focus:ring-paperliss transition"
          />
        </div>
        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <select
            value={statutFilter}
            onChange={e => setStatutFilter(e.target.value as StatutFilter)}
            className="pl-8 pr-8 py-2.5 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:ring-2 focus:ring-paperliss appearance-none cursor-pointer transition"
          >
            {STATUTS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-40 bg-white rounded-2xl animate-pulse shadow-sm" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-14 h-14 bg-paperliss-light rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileText size={24} className="text-paperliss" />
          </div>
          <p className="text-gray-600 font-medium mb-1">Aucun document trouvé</p>
          <p className="text-gray-400 text-sm">
            {search || catFilter !== 'tous' || statutFilter !== 'tous'
              ? 'Modifie tes filtres pour voir plus de résultats'
              : 'Commence par scanner ton premier document'}
          </p>
          {!search && catFilter === 'tous' && statutFilter === 'tous' && (
            <button
              onClick={() => navigate('/scanner')}
              className="mt-4 bg-paperliss hover:bg-paperliss-dark text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              Scanner un document
            </button>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map(doc => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              deleting={deleting === doc.id}
              onDelete={handleDelete}
              onStatusChange={handleStatus}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DocumentCard({
  doc,
  deleting,
  onDelete,
  onStatusChange,
}: {
  doc: Document
  deleting: boolean
  onDelete: (id: string) => void
  onStatusChange: (id: string, statut: Document['statut']) => void
}) {
  const days = doc.date_limite ? getDaysUntil(doc.date_limite) : null

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
            <FileText size={16} className="text-gray-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{doc.nom_fichier}</p>
            {doc.organisme_detecte && (
              <p className="text-xs text-gray-400 truncate">{doc.organisme_detecte}</p>
            )}
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORIE_COLORS[doc.categorie]}`}>
            {CATEGORIE_LABELS[doc.categorie]}
          </span>
          {doc.urgence && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-danger-light text-danger">
              Urgent
            </span>
          )}
        </div>
      </div>

      {/* Explication */}
      {doc.explication_ia && (
        <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">{doc.explication_ia}</p>
      )}

      {/* Action recommandée */}
      {doc.action_recommandee && (
        <div className="bg-paperliss-light rounded-xl px-3 py-2 text-sm text-paperliss font-medium">
          → {doc.action_recommandee}
        </div>
      )}

      {/* Deadline */}
      {doc.date_limite && days !== null && (
        <div className={`flex items-center gap-1.5 text-xs font-medium ${deadlineColor(days)}`}>
          <span>📅</span>
          Échéance le {formatDateShort(doc.date_limite)}
          {days >= 0 && <span>({days === 0 ? "aujourd'hui" : `dans ${days} j`})</span>}
          {days < 0 && <span className="text-danger">(dépassée)</span>}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-50">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUT_COLORS[doc.statut]}`}>
            {STATUT_LABELS[doc.statut]}
          </span>
          <span className="text-xs text-gray-300">{formatDateShort(doc.created_at)}</span>
        </div>

        <div className="flex items-center gap-1">
          {doc.lien_officiel && (
            <a
              href={doc.lien_officiel}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-gray-400 hover:text-paperliss hover:bg-paperliss-light rounded-lg transition-colors"
              title="Site officiel"
            >
              <ExternalLink size={14} />
            </a>
          )}
          {doc.statut !== 'traite' && (
            <button
              onClick={() => onStatusChange(doc.id, 'traite')}
              className="p-1.5 text-gray-400 hover:text-success hover:bg-success-light rounded-lg transition-colors"
              title="Marquer comme traité"
            >
              <CheckCircle size={14} />
            </button>
          )}
          {doc.statut !== 'archive' && (
            <button
              onClick={() => onStatusChange(doc.id, 'archive')}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Archiver"
            >
              <Archive size={14} />
            </button>
          )}
          <button
            onClick={() => onDelete(doc.id)}
            disabled={deleting}
            className="p-1.5 text-gray-400 hover:text-danger hover:bg-danger-light rounded-lg transition-colors disabled:opacity-40"
            title="Supprimer"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
