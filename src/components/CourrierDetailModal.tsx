import { useState } from 'react'
import { X, Loader2, Copy, Check, Save, Download, Trash2, AlertTriangle, FileText } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useCourriers } from '../hooks/useCourriers'
import { buildExpediteur, getLetterTypeLabel } from '../lib/letterTypes'
import { formatDate } from '../lib/utils'
import { downloadLetterPdf, buildLetterFilename } from '../lib/letterPdf'
import type { Courrier } from '../types'
import toast from 'react-hot-toast'

interface Props {
  courrier: Courrier
  onClose: () => void
}

export default function CourrierDetailModal({ courrier, onClose }: Props) {
  const { profile, user } = useAuth()
  const { updateCourrier, deleteCourrier } = useCourriers()

  const [destinataire, setDestinataire] = useState(courrier.destinataire ?? '')
  const [objet, setObjet] = useState(courrier.objet ?? '')
  const [corps, setCorps] = useState(courrier.contenu)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(corps)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Impossible de copier le texte.')
    }
  }

  const handleDownloadPdf = () => {
    try {
      const expediteur = buildExpediteur(profile, user?.email ?? '')
      const lieu = profile?.ville || 'Bruxelles'
      const filename = buildLetterFilename(destinataire || getLetterTypeLabel(courrier.type))
      downloadLetterPdf({
        expediteurNom: expediteur.nom,
        expediteurAdresse: expediteur.adresse,
        expediteurEmail: expediteur.email,
        destinataire,
        objet,
        corps,
        lieu: `${lieu}, le ${formatDate(new Date().toISOString())}`,
      }, filename)
    } catch (err) {
      console.error('[CourrierDetailModal] pdf error:', err)
      toast.error('Impossible de générer le PDF.')
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateCourrier(courrier.id, { destinataire, objet, contenu: corps })
      toast.success('Courrier mis à jour !')
    } catch (err) {
      console.error('[CourrierDetailModal] save error:', err)
      toast.error("Oups, impossible d'enregistrer les modifications.")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Supprimer ce courrier définitivement ?')) return
    setDeleting(true)
    try {
      await deleteCourrier(courrier.id)
      toast.success('Courrier supprimé')
      onClose()
    } catch (err) {
      console.error('[CourrierDetailModal] delete error:', err)
      toast.error('Oups, impossible de supprimer ce courrier.')
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{getLetterTypeLabel(courrier.type)}</h2>
            <p className="text-sm text-gray-500 mt-0.5">Créé le {formatDate(courrier.created_at)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        <div className="space-y-5">
          {courrier.champs_a_completer && courrier.champs_a_completer.length > 0 && (
            <div className="bg-warning-light rounded-xl p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-warning mb-2">
                <AlertTriangle size={16} />
                {courrier.champs_a_completer.length} champ{courrier.champs_a_completer.length > 1 ? 's' : ''} à compléter avant l'envoi
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {courrier.champs_a_completer.map((f, i) => (
                  <li key={i} className="text-xs font-medium text-warning bg-white/60 px-2 py-1 rounded-lg">
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Destinataire</label>
            <input
              type="text"
              value={destinataire}
              onChange={e => setDestinataire(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-paperliss transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Objet</label>
            <input
              type="text"
              value={objet}
              onChange={e => setObjet(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-paperliss transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Lettre (modifiable)</label>
            <textarea
              value={corps}
              onChange={e => setCorps(e.target.value)}
              rows={16}
              className="w-full px-4 py-4 rounded-xl border border-gray-200 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap outline-none focus:ring-2 focus:ring-paperliss transition resize-y"
            />
          </div>

          {courrier.conseils_envoi && (
            <div className="bg-paperliss-light rounded-xl p-4 flex items-start gap-2.5">
              <FileText size={16} className="text-paperliss shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-paperliss uppercase tracking-wide mb-1">Conseils d'envoi</p>
                <p className="text-sm text-paperliss">{courrier.conseils_envoi}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={handleCopy}
              className="flex items-center justify-center gap-2 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 font-semibold rounded-xl transition-colors min-h-[48px]"
            >
              {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
              {copied ? 'Copié !' : 'Copier le texte'}
            </button>
            <button
              onClick={handleDownloadPdf}
              className="flex items-center justify-center gap-2 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 font-semibold rounded-xl transition-colors min-h-[48px]"
            >
              <Download size={16} />
              Télécharger en PDF
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center justify-center gap-2 bg-paperliss hover:bg-paperliss-dark disabled:opacity-60 text-white font-semibold rounded-xl transition-colors min-h-[48px]"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>

          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center justify-center gap-2 text-danger hover:bg-danger-light disabled:opacity-60 text-sm font-semibold rounded-xl transition-colors min-h-[44px] w-full"
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Supprimer ce courrier
          </button>
        </div>
      </div>
    </div>
  )
}
