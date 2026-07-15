import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, ScanLine, FileText, CheckCircle, AlertTriangle,
  ExternalLink, X, Camera, Loader2, ClipboardPaste,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { extractText, extractTextFromEml, extractTextFromDocx, anonymize } from '../lib/ocr'
import { analyzeDocument, LimitReachedError } from '../lib/ai'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import UpgradeModal from '../components/UpgradeModal'
import { CATEGORIE_LABELS } from '../lib/utils'
import toast from 'react-hot-toast'
import type { AIAnalysisResult } from '../types'

type Step = 'upload' | 'analyzing' | 'result'

const ACCEPTED_EXT = '.jpg,.jpeg,.png,.pdf,.eml,.docx'

const PROGRESS_LABELS = [
  'Lecture du document…',
  'Extraction du texte…',
  'Anonymisation des données…',
  'Analyse par l\'IA…',
  'Enregistrement…',
]

export default function Scanner() {
  const { user, refreshProfile } = useAuth()
  const { profile, canAnalyze, remainingAnalyses } = useProfile()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [pastedText, setPastedText] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [result, setResult] = useState<AIAnalysisResult | null>(null)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [consentGiven] = useState(() => localStorage.getItem('pl_consent') === '1')
  const [showConsent, setShowConsent] = useState(!consentGiven)

  const inputRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const acceptConsent = () => {
    localStorage.setItem('pl_consent', '1')
    setShowConsent(false)
  }

  const getFileLabel = (f: File) => {
    if (f.name.endsWith('.eml')) return 'Email'
    if (f.name.endsWith('.docx')) return 'Document Word'
    if (f.type === 'application/pdf') return 'PDF'
    return 'Image'
  }

  const setFileAndPreview = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
    const allowed = ['jpg', 'jpeg', 'png', 'pdf', 'eml', 'docx']
    if (!allowed.includes(ext)) {
      toast.error('Format non supporté. Utilise JPG, PNG, PDF, Word ou Email (.eml).')
      return
    }
    if (f.size > 20 * 1024 * 1024) {
      toast.error('Fichier trop lourd (20 Mo maximum)')
      return
    }
    setFile(f)
    setShowPaste(false)
    if (f.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(f))
    } else {
      setPreview(null)
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) setFileAndPreview(f)
  }, [])

  const getExtractedText = async (onProgress: (p: number) => void): Promise<string> => {
    if (pastedText.trim()) {
      onProgress(50)
      return pastedText
    }
    if (!file) throw new Error('Aucun fichier sélectionné')
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (ext === 'eml') return extractTextFromEml(file, onProgress)
    if (ext === 'docx') return extractTextFromDocx(file, onProgress)
    return extractText(file, onProgress)
  }

  const handleAnalyze = async () => {
    if (!file && !pastedText.trim()) return
    if (!user) return

    if (!canAnalyze()) {
      setShowUpgrade(true)
      return
    }

    setStep('analyzing')
    setProgress(0)

    try {
      setProgressLabel(PROGRESS_LABELS[1])
      const rawText = await getExtractedText((pct) => setProgress(pct))

      setProgressLabel(PROGRESS_LABELS[2])
      setProgress(55)
      const anonText = anonymize(rawText)

      setProgressLabel('Envoi du fichier…')
      setProgress(60)

      let fileUrl: string | null = null
      if (file) {
        const ext = file.name.split('.').pop()
        const filename = `${Date.now()}.${ext}`
        const path = `${user.id}/${filename}`
        const { error: storageErr } = await supabase.storage
          .from('documents')
          .upload(path, file, { contentType: file.type })
        if (!storageErr) {
          const { data } = supabase.storage.from('documents').getPublicUrl(path)
          fileUrl = data.publicUrl
        }
      }

      setProgressLabel(PROGRESS_LABELS[3])
      setProgress(65)
      const analysis = await analyzeDocument(anonText, user.id)
      setProgress(90)

      setProgressLabel(PROGRESS_LABELS[4])
      const docName = file ? file.name : `Texte collé — ${new Date().toLocaleDateString('fr-FR')}`
      const { error: dbErr } = await supabase.from('documents').insert({
        user_id: user.id,
        nom_fichier: docName,
        url_fichier: fileUrl,
        texte_extrait: rawText.slice(0, 5000),
        categorie: analysis.categorie,
        statut: 'nouveau',
        date_limite: analysis.date_limite,
        urgence: analysis.urgence,
        explication_ia: analysis.explication,
        action_recommandee: analysis.action_recommandee,
        organisme_detecte: analysis.organisme,
        lien_officiel: analysis.lien_officiel,
        montant_eur: analysis.montant_eur,
      })

      if (dbErr) throw new Error(dbErr.message)

      await refreshProfile()
      setProgress(100)
      setResult(analysis)
      setStep('result')
      toast.success('Document analysé avec succès !')
    } catch (err: unknown) {
      if (err instanceof LimitReachedError) {
        setShowUpgrade(true)
        setStep('upload')
        setProgress(0)
        return
      }
      console.error('[PaperLiss] Erreur analyse:', err)
      const msg = err instanceof Error ? err.message : String(err)
      const friendly = msg.includes('Gemini') ? `Erreur IA — ${msg}`
        : msg.includes('storage') ? 'Problème d\'envoi du fichier. Réessaie !'
        : `Oups, quelque chose s\'est mal passé : ${msg}`
      toast.error(friendly, { duration: 6000 })
      setStep('upload')
      setProgress(0)
    }
  }

  const reset = () => {
    setStep('upload')
    setFile(null)
    setPreview(null)
    setPastedText('')
    setShowPaste(false)
    setProgress(0)
    setProgressLabel('')
    setResult(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const hasContent = file !== null || pastedText.trim().length > 0

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Scanner un document</h1>
          {profile?.plan === 'gratuit' && (
            <span className="text-xs font-semibold text-paperliss bg-paperliss-light px-2.5 py-1 rounded-full shrink-0">
              {profile.analyses_count ?? 0} / 5 analyses ce mois
            </span>
          )}
        </div>
        <p className="text-gray-500 text-sm mt-1">Upload ton courrier, l'IA l'analyse et t'explique quoi faire.</p>
      </div>

      {/* Consent modal */}
      {showConsent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="w-10 h-10 bg-paperliss-light rounded-xl flex items-center justify-center mb-4">
              <ScanLine size={20} className="text-paperliss" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Avant de commencer</h2>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              Pour analyser ton document, PaperLiss va :<br />
              <strong>1.</strong> Extraire le texte (traitement local)<br />
              <strong>2.</strong> <strong>Anonymiser</strong> les données sensibles<br />
              <strong>3.</strong> Envoyer le texte anonymisé à l'IA
            </p>
            <p className="text-xs text-gray-400 mb-5">Aucune donnée personnelle identifiable n'est transmise à l'IA.</p>
            <button
              onClick={acceptConsent}
              className="w-full bg-paperliss hover:bg-paperliss-dark text-white font-semibold py-3 rounded-xl transition-colors min-h-[48px]"
            >
              J'accepte et je continue
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full text-gray-500 hover:text-gray-700 text-sm mt-3 py-2"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {showUpgrade && (
        <UpgradeModal onClose={() => setShowUpgrade(false)} remaining={remainingAnalyses()} />
      )}

      {/* ── Upload ── */}
      {step === 'upload' && (
        <div className="space-y-4">
          {/* Zone drag & drop */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => !showPaste && inputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
              dragging ? 'border-paperliss bg-paperliss-light'
              : file ? 'border-success bg-success-light cursor-default'
              : 'border-gray-200 bg-white hover:border-paperliss hover:bg-paperliss-light/30'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_EXT}
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setFileAndPreview(f) }}
            />

            {file ? (
              <div>
                {preview
                  ? <img src={preview} alt="Aperçu" className="max-h-48 mx-auto rounded-xl mb-3 object-contain" />
                  : (
                    <div className="w-14 h-14 bg-success-light rounded-xl flex items-center justify-center mx-auto mb-3">
                      <FileText size={24} className="text-success" />
                    </div>
                  )
                }
                <p className="text-sm font-semibold text-slate-900">{file.name}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {getFileLabel(file)} · {(file.size / 1024 / 1024).toFixed(2)} Mo
                </p>
              </div>
            ) : (
              <>
                <div className="w-14 h-14 bg-paperliss-light rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Upload size={24} className="text-paperliss" />
                </div>
                <p className="text-gray-700 font-medium mb-1">Glisse ton document ici</p>
                <p className="text-sm text-gray-400">ou clique pour sélectionner</p>
                <p className="text-xs text-gray-300 mt-3">JPG · PNG · PDF · Word (.docx) · Email (.eml) — 20 Mo max</p>
              </>
            )}
          </div>

          {/* Coller du texte */}
          {showPaste ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">Colle le texte de ton email ou courrier</p>
                <button onClick={() => setShowPaste(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              </div>
              <textarea
                value={pastedText}
                onChange={e => setPastedText(e.target.value)}
                placeholder="Colle ici le contenu de ton email ou document…"
                className="w-full h-40 text-sm border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-paperliss resize-none"
              />
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => cameraRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 py-3 rounded-xl text-sm font-medium transition-colors min-h-[48px]"
              >
                <Camera size={16} />
                Prendre en photo
              </button>
              <button
                onClick={() => { setShowPaste(true); setFile(null); setPreview(null) }}
                className="flex-1 flex items-center justify-center gap-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 py-3 rounded-xl text-sm font-medium transition-colors min-h-[48px]"
              >
                <ClipboardPaste size={16} />
                Coller du texte
              </button>
              {file && (
                <button
                  onClick={reset}
                  className="px-4 border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 rounded-xl transition-colors min-h-[48px]"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )}

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) setFileAndPreview(f) }}
          />

          {/* Bouton analyser — grand + pulsant */}
          {hasContent && (
            <button
              onClick={handleAnalyze}
              className="relative w-full bg-paperliss hover:bg-paperliss-dark text-white font-bold py-6 rounded-2xl transition-all flex items-center justify-center gap-3 text-lg shadow-xl shadow-paperliss/30 hover:scale-[1.02] active:scale-[0.98] min-h-[72px]"
            >
              <span className="absolute inset-0 rounded-2xl bg-paperliss animate-ping opacity-20" />
              <ScanLine size={24} />
              Analyser ce document
            </button>
          )}
        </div>
      )}

      {/* ── Analyse en cours ── */}
      {step === 'analyzing' && (
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
          <div className="w-16 h-16 bg-paperliss-light rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Loader2 size={28} className="text-paperliss animate-spin" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Analyse en cours…</h2>
          <p className="text-sm text-gray-500 mb-6">{progressLabel}</p>
          <div className="w-full bg-gray-100 rounded-full h-2.5 mb-2">
            <div
              className="bg-paperliss h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400">{progress}%</p>
        </div>
      )}

      {/* ── Résultat ── */}
      {step === 'result' && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-success font-semibold">
            <CheckCircle size={20} />
            Document analysé avec succès
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Organisme</p>
                <p className="font-bold text-gray-900">{result.organisme || '—'}</p>
              </div>
              <span className="bg-paperliss-light text-paperliss text-sm px-3 py-1 rounded-full font-medium">
                {CATEGORIE_LABELS[result.categorie]}
              </span>
            </div>

            <hr className="border-gray-100" />

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Ce que ça veut dire</p>
              <p className="text-gray-800 leading-relaxed">{result.explication}</p>
            </div>

            {result.action_recommandee && (
              <div className="bg-paperliss-light rounded-xl p-4">
                <p className="text-xs font-semibold text-paperliss uppercase tracking-wide mb-1">Ce que tu dois faire</p>
                <p className="text-paperliss font-medium">{result.action_recommandee}</p>
              </div>
            )}

            {result.date_limite && (
              <div className={`rounded-xl p-3 flex items-center gap-2 ${result.urgence ? 'bg-danger-light' : 'bg-warning-light'}`}>
                {result.urgence
                  ? <AlertTriangle size={16} className="text-danger shrink-0" />
                  : <span className="text-base">📅</span>
                }
                <p className={`text-sm font-semibold ${result.urgence ? 'text-danger' : 'text-warning'}`}>
                  {result.urgence ? 'Urgent — ' : ''}Date limite : {result.date_limite}
                </p>
              </div>
            )}

            {result.lien_officiel && (
              <a
                href={result.lien_officiel}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-paperliss hover:underline text-sm font-medium"
              >
                <ExternalLink size={14} />
                Accéder au site officiel
              </a>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => navigate('/documents')}
              className="flex-1 bg-paperliss hover:bg-paperliss-dark text-white font-semibold py-3 rounded-xl transition-colors min-h-[48px]"
            >
              Voir mes documents
            </button>
            <button
              onClick={reset}
              className="flex-1 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-semibold py-3 rounded-xl transition-colors min-h-[48px]"
            >
              Scanner un autre
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
