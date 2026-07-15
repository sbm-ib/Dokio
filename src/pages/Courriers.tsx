import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Trash2, Loader2, ArrowRight } from 'lucide-react'
import { useCourriers } from '../hooks/useCourriers'
import { getLetterTypeLabel } from '../lib/letterTypes'
import { formatDateShort } from '../lib/utils'
import CourrierDetailModal from '../components/CourrierDetailModal'
import type { Courrier } from '../types'
import toast from 'react-hot-toast'

function excerpt(text: string, length = 120): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > length ? clean.slice(0, length) + '…' : clean
}

export default function Courriers() {
  const { courriers, loading, deleteCourrier } = useCourriers()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<Courrier | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce courrier définitivement ?')) return
    setDeleting(id)
    try {
      await deleteCourrier(id)
      toast.success('Courrier supprimé')
    } catch {
      toast.error('Erreur lors de la suppression')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mes courriers</h1>
        <p className="text-gray-500 text-sm mt-1">
          {courriers.length} courrier{courriers.length !== 1 ? 's' : ''} généré{courriers.length !== 1 ? 's' : ''}
        </p>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-40 bg-white rounded-2xl animate-pulse shadow-sm" />
          ))}
        </div>
      ) : courriers.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
          <div className="w-14 h-14 bg-paperliss-light rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Mail size={24} className="text-paperliss" />
          </div>
          <p className="text-gray-500 text-sm mb-4">Tu n'as encore généré aucun courrier.</p>
          <button
            onClick={() => navigate('/documents')}
            className="inline-flex items-center gap-2 bg-paperliss hover:bg-paperliss-dark text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            Aller sur Mes Documents
            <ArrowRight size={15} />
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {courriers.map(c => (
            <div
              key={c.id}
              onClick={() => setSelected(c)}
              className="bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-2.5 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold text-paperliss bg-paperliss-light px-2 py-0.5 rounded-full">
                  {getLetterTypeLabel(c.type)}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(c.id) }}
                  disabled={deleting === c.id}
                  className="p-1.5 text-gray-400 hover:text-danger hover:bg-danger-light rounded-lg transition-colors shrink-0 disabled:opacity-40"
                  title="Supprimer"
                >
                  {deleting === c.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>

              {c.destinataire && <p className="text-sm font-semibold text-gray-900 truncate">{c.destinataire}</p>}
              {c.objet && <p className="text-sm text-gray-600 truncate">{c.objet}</p>}
              <p className="text-xs text-gray-400 line-clamp-2">{excerpt(c.contenu)}</p>

              <p className="text-xs text-gray-300 mt-auto pt-1">{formatDateShort(c.created_at)}</p>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <CourrierDetailModal courrier={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
