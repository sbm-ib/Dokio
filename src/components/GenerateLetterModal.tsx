import { useState } from 'react'
import { X, Loader2, FileText, AlertTriangle, Send, Copy, Check, Save, Download } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { LETTER_TYPES, suggestLetterTypes, getLetterTypeLabel, type LetterType } from '../lib/letterTypes'
import { getDocLabel, formatDate } from '../lib/utils'
import { downloadLetterPdf, buildLetterFilename } from '../lib/letterPdf'
import type { Document, LetterResult, Profile } from '../types'
import toast from 'react-hot-toast'

interface Props {
  doc: Document
  onClose: () => void
}

function buildExpediteur(profile: Profile | null, email: string) {
  const nom = [profile?.prenom, profile?.nom].filter(Boolean).join(' ') || '[Votre nom]'
  const adresse = profile?.adresse
    ? `${profile.adresse}, ${profile.code_postal ?? ''} ${profile.ville ?? ''}`.trim()
    : '[Votre adresse]'
  return { nom, adresse, email: email || '[Votre email]' }
}

export default function GenerateLetterModal({ doc, onClose }: Props) {
  const { profile, user } = useAuth()
  const suggestions = suggestLetterTypes(doc)
  const [selectedType, setSelectedType] = useState<LetterType>(() => suggestions[0])
  const [showAllTypes, setShowAllTypes] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<LetterResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [destinataire, setDestinataire] = useState('')
  const [objet, setObjet] = useState('')
  const [corps, setCorps] = useState('')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  const profileIncomplete = !profile?.prenom && !profile?.nom || !profile?.adresse

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)

    const expediteur = buildExpediteur(profile, user?.email ?? '')

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
          expediteur,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Erreur serveur')
      const letter: LetterResult = body.data
      setResult(letter)
      setDestinataire(letter.destinataire)
      setObjet(letter.objet)
      setCorps(letter.corps)
    } catch (err: any) {
      console.error('[GenerateLetterModal] error:', err)
      setError(err?.message ?? 'Erreur inconnue')
      toast.error('Oups, la génération a échoué. Réessaie !')
    } finally {
      setLoading(false)
    }
  }

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
      const filename = buildLetterFilename(doc.organisme_detecte || destinataire)
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
      console.error('[GenerateLetterModal] pdf error:', err)
      toast.error('Impossible de générer le PDF.')
    }
  }

  const handleSave = async () => {
    if (!user?.id) return
    setSaving(true)
    try {
      const { error: saveErr } = await supabase.from('courriers').insert({
        user_id: user.id,
        document_id: doc.id,
        type: selectedType,
        destinataire,
        objet,
        contenu: corps,
      })
      if (saveErr) throw saveErr
      toast.success('Courrier enregistré !')
    } catch (err) {
      console.error('[GenerateLetterModal] save error:', err)
      toast.error("Oups, impossible d'enregistrer le courrier.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
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
            <p className="text-sm font-medium text-gray-700 mb-2">Quelle est ta situation ?</p>
            <div className="space-y-2.5 mb-3">
              {suggestions.map(value => (
                <button
                  key={value}
                  onClick={() => setSelectedType(value)}
                  className={`w-full text-left px-4 py-3.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                    selectedType === value
                      ? 'border-paperliss bg-paperliss-light text-paperliss'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {getLetterTypeLabel(value)}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowAllTypes(s => !s)}
              className="text-xs text-gray-400 hover:text-gray-600 hover:underline mb-4"
            >
              {showAllTypes ? 'Masquer les autres options' : 'Autre type de courrier'}
            </button>

            {showAllTypes && (
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
            )}

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
          <div className="space-y-5">
            {result.champs_a_completer.length > 0 && (
              <div className="bg-warning-light rounded-xl p-4">
                <p className="flex items-center gap-2 text-sm font-bold text-warning mb-2">
                  <AlertTriangle size={16} />
                  {result.champs_a_completer.length} champ{result.champs_a_completer.length > 1 ? 's' : ''} à compléter avant l'envoi
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {result.champs_a_completer.map((f, i) => (
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

            <div className="bg-paperliss-light rounded-xl p-4 flex items-start gap-2.5">
              <FileText size={16} className="text-paperliss shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-paperliss uppercase tracking-wide mb-1">Conseils d'envoi</p>
                <p className="text-sm text-paperliss">{result.conseils_envoi}</p>
              </div>
            </div>

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
          </div>
        )}
      </div>
    </div>
  )
}
