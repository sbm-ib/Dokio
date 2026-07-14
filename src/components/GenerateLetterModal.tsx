import { useState } from 'react'
import { X, Loader2, FileText, AlertTriangle, Send } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { LETTER_TYPES, guessLetterType, type LetterType } from '../lib/letterTypes'
import { getDocLabel } from '../lib/utils'
import type { Document, LetterResult } from '../types'
import toast from 'react-hot-toast'

interface Props {
  doc: Document
  onClose: () => void
}

export default function GenerateLetterModal({ doc, onClose }: Props) {
  const { profile, user } = useAuth()
  const [selectedType, setSelectedType] = useState<LetterType>(() => guessLetterType(doc))
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<LetterResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const profileIncomplete = !profile?.prenom && !profile?.nom || !profile?.adresse

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)

    const nomComplet = [profile?.prenom, profile?.nom].filter(Boolean).join(' ') || '[Votre nom]'
    const adresseComplete = profile?.adresse
      ? `${profile.adresse}, ${profile.code_postal ?? ''} ${profile.ville ?? ''}`.trim()
      : '[Votre adresse]'

    try {
      const res = await fetch('/api/generate-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document: {
            organisme: doc.organisme_detecte,
            categorie: doc.categorie,
            resume: doc.explication_ia,
            montant: doc.montant_eur,
            date_limite: doc.date_limite,
            reference: null,
          },
          type_courrier: selectedType,
          expediteur: {
            nom: nomComplet,
            adresse: adresseComplete,
            email: user?.email ?? '',
          },
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Erreur serveur')
      setResult(body.data)
    } catch (err: any) {
      console.error('[GenerateLetterModal] error:', err)
      setError(err?.message ?? 'Erreur inconnue')
      toast.error('Oups, la génération a échoué. Réessaie !')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Générer une réponse</h2>
            <p className="text-sm text-gray-500 mt-0.5">{getDocLabel(doc)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {!result ? (
          <>
            <p className="text-sm font-medium text-gray-700 mb-2">Type de courrier</p>
            <div className="space-y-2 mb-4">
              {LETTER_TYPES.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setSelectedType(value)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium border-2 transition-colors ${
                    selectedType === value
                      ? 'border-paperliss bg-paperliss-light text-paperliss'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {profileIncomplete && (
              <div className="flex items-start gap-2 bg-warning-light text-warning text-xs rounded-xl p-3 mb-4">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  Ton profil (nom/adresse) n'est pas complet — la lettre laissera des champs
                  <span className="font-semibold"> [à compléter] </span>
                  à ces endroits. Tu peux compléter ton profil dans "Mon Profil".
                </span>
              </div>
            )}

            {error && (
              <p className="text-sm text-danger mb-4">{error}</p>
            )}

            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-paperliss hover:bg-paperliss-dark disabled:opacity-60 text-white font-semibold rounded-xl transition-colors min-h-[48px]"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {loading ? 'Génération en cours…' : 'Générer'}
            </button>
          </>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Destinataire</p>
              <p className="text-sm text-gray-800">{result.destinataire}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Objet</p>
              <p className="text-sm text-gray-800">{result.objet}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Lettre</p>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                {result.corps}
              </div>
            </div>
            {result.champs_a_completer.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Champs à compléter</p>
                <ul className="list-disc list-inside text-sm text-gray-600">
                  {result.champs_a_completer.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
            )}
            <div className="bg-paperliss-light rounded-xl p-3 flex items-start gap-2">
              <FileText size={14} className="text-paperliss shrink-0 mt-0.5" />
              <p className="text-sm text-paperliss">{result.conseils_envoi}</p>
            </div>

            <button
              onClick={onClose}
              className="w-full bg-paperliss hover:bg-paperliss-dark text-white font-semibold rounded-xl transition-colors min-h-[48px]"
            >
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
