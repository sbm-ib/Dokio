import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, ScanLine, FileText, CheckCircle, AlertTriangle,
  ExternalLink, X, Camera, Loader2, ClipboardPaste,
} from 'lucide-react'
import { supabase, getSignedDocumentUrl } from '../lib/supabase'
import { extractText, extractTextFromEml, extractTextFromDocx, anonymize } from '../lib/ocr'
import { combineImagesToPdf } from '../lib/imagesToPdf'
import { analyzeDocument, LimitReachedError } from '../lib/ai'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import UpgradeModal from '../components/UpgradeModal'
import { CATEGORIE_LABELS } from '../lib/utils'
import toast from 'react-hot-toast'
import type { AIAnalysisResult } from '../types'

type Step = 'upload' | 'analyzing' | 'result'

interface CapturedPage {
  file: File
  previewUrl: string
}

const ACCEPTED_EXT = '.jpg,.jpeg,.png,.pdf,.eml,.docx'
const MAX_FILE_SIZE = 20 * 1024 * 1024

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
  // Pages capturées via l'appareil photo (ou choisies en rafale dans la
  // galerie) pour un document de plusieurs pages — voir addCapturedPage.
  // Distinct de `file` : ce dernier reste réservé au flux "un seul document"
  // (drag & drop / clic / coller du texte), inchangé.
  const [capturedPages, setCapturedPages] = useState<CapturedPage[]>([])

  const inputRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

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
    if (f.size > MAX_FILE_SIZE) {
      toast.error('Fichier trop lourd (20 Mo maximum)')
      return
    }
    setFile(f)
    setShowPaste(false)
    setCapturedPages([])
    if (f.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(f))
    } else {
      setPreview(null)
    }
  }

  // Le sélecteur de fichier classique (drag & drop / clic / coller du texte)
  // ne gère qu'un seul document à la fois : si plusieurs fichiers sont
  // sélectionnés ou déposés là, on prévient l'utilisateur au lieu d'ignorer
  // les autres en silence. Le flux caméra/galerie multi-pages (capturedPages
  // ci-dessous) est le seul moyen d'analyser plusieurs fichiers en une fois.
  const pickFirstFile = (files: FileList | null): File | null => {
    if (!files || files.length === 0) return null
    if (files.length > 1) {
      toast('Un seul document à la fois pour ce sélecteur — seul le premier a été pris en compte. Utilise "Prendre en photo" pour un document de plusieurs pages.', { icon: '📎' })
    }
    return files[0]
  }

  // Ajoute une ou plusieurs photos comme nouvelles pages d'un document
  // multi-pages : une photo à la fois depuis la caméra, ou plusieurs d'un
  // coup depuis une sélection multiple dans la galerie. On traite tout le
  // lot en une seule fois (plutôt qu'un appel par fichier) pour deux
  // raisons : additionner correctement la taille totale d'un coup — un
  // forEach appelant cette fonction une fois par fichier verrait `capturedPages`
  // inchangé à chaque itération (le composant ne se re-rend qu'après la fin
  // du handler, donc `prev` resterait le même état de départ pour tous les
  // fichiers du lot) ; et éviter un toast.error() dans le updater de
  // setCapturedPages, que le StrictMode de React (main.tsx) invoque deux fois
  // en dev et afficherait donc en double. L'ordre d'ajout est préservé (c'est
  // l'ordre du document) : on ajoute toujours en fin de tableau.
  const addCapturedPages = (newFiles: File[]) => {
    if (newFiles.length === 0) return

    const validFiles: File[] = []
    for (const f of newFiles) {
      if (!f.type.startsWith('image/')) {
        toast.error(`"${f.name}" n'est pas une image et a été ignoré.`)
        continue
      }
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`Photo trop lourde (20 Mo maximum) : ${f.name}`)
        continue
      }
      validFiles.push(f)
    }
    if (validFiles.length === 0) return

    const existingSize = capturedPages.reduce((sum, p) => sum + p.file.size, 0)
    const newSize = validFiles.reduce((sum, f) => sum + f.size, 0)
    if (existingSize + newSize > MAX_FILE_SIZE) {
      toast.error('Taille totale des pages trop importante (20 Mo maximum au total)')
      return
    }

    // Une photo ajoutée démarre (ou poursuit) le flux multi-pages : on efface
    // le document unique éventuellement en cours pour éviter toute ambiguïté
    // sur ce qui sera analysé.
    setFile(null)
    setPreview(null)
    setPastedText('')
    setShowPaste(false)
    setCapturedPages(prev => [
      ...prev,
      ...validFiles.map(f => ({ file: f, previewUrl: URL.createObjectURL(f) })),
    ])
  }

  const removeCapturedPage = (index: number) => {
    setCapturedPages(prev => {
      URL.revokeObjectURL(prev[index].previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  const resetCapturedPages = () => {
    setCapturedPages(prev => {
      prev.forEach(p => URL.revokeObjectURL(p.previewUrl))
      return []
    })
    if (cameraRef.current) cameraRef.current.value = ''
    if (galleryRef.current) galleryRef.current.value = ''
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = pickFirstFile(e.dataTransfer.files)
    if (f) setFileAndPreview(f)
  }, [])

  const getExtractedText = async (fileForAnalysis: File | null, onProgress: (p: number) => void): Promise<string> => {
    if (pastedText.trim()) {
      onProgress(50)
      return pastedText
    }
    if (!fileForAnalysis) throw new Error('Aucun fichier sélectionné')
    const ext = fileForAnalysis.name.split('.').pop()?.toLowerCase() ?? ''
    if (ext === 'eml') return extractTextFromEml(fileForAnalysis, onProgress)
    if (ext === 'docx') return extractTextFromDocx(fileForAnalysis, onProgress)
    return extractText(fileForAnalysis, onProgress)
  }

  // Cœur de l'analyse, partagé entre le flux "un seul document" (handleAnalyze,
  // fileForAnalysis = `file`) et le flux multi-pages (handleAnalyzeMultiPage,
  // fileForAnalysis = le PDF assemblé à partir des photos capturées) — d'où
  // le paramètre explicite plutôt qu'une lecture de `file` depuis la closure.
  const runAnalysis = async (fileForAnalysis: File | null) => {
    if (!fileForAnalysis && !pastedText.trim()) return
    if (!user) return

    if (!canAnalyze()) {
      setShowUpgrade(true)
      return
    }

    setStep('analyzing')
    setProgress(0)

    try {
      setProgressLabel(PROGRESS_LABELS[1])
      const rawText = await getExtractedText(fileForAnalysis, (pct) => setProgress(pct))

      setProgressLabel(PROGRESS_LABELS[2])
      setProgress(55)
      const anonText = anonymize(rawText)

      setProgressLabel('Envoi du fichier…')
      setProgress(60)

      let fileUrl: string | null = null
      if (fileForAnalysis) {
        const ext = fileForAnalysis.name.split('.').pop()
        const filename = `${Date.now()}.${ext}`
        const path = `${user.id}/${filename}`
        const { error: storageErr } = await supabase.storage
          .from('documents')
          .upload(path, fileForAnalysis, { contentType: fileForAnalysis.type })
        if (!storageErr) {
          fileUrl = await getSignedDocumentUrl(path)
        }
      }

      setProgressLabel(PROGRESS_LABELS[3])
      setProgress(65)
      const analysis = await analyzeDocument(anonText)
      setProgress(90)

      setProgressLabel(PROGRESS_LABELS[4])
      const docName = fileForAnalysis ? fileForAnalysis.name : `Texte collé — ${new Date().toLocaleDateString('fr-FR')}`
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
        : `Oups, quelque chose s'est mal passé : ${msg}`
      // Duration longue + largeur augmentée : le diagnostic d'erreur (voir
      // logIfMissingFunction dans ocr.ts) peut être assez long, et la
      // personne doit avoir le temps de le lire ou d'en faire une capture
      // d'écran pour nous le transmettre.
      toast.error(friendly, { duration: 15000, style: { maxWidth: '420px' } })
      setStep('upload')
      setProgress(0)
    }
  }

  const handleAnalyze = () => runAnalysis(file)

  // Assemble les photos capturées en un seul PDF (une image par page, voir
  // src/lib/imagesToPdf.ts) puis lance l'analyse normale dessus — le reste du
  // pipeline (extraction, anonymisation, upload, appel IA) ne voit aucune
  // différence avec un PDF multi-pages classique uploadé directement.
  const handleAnalyzeMultiPage = async () => {
    if (capturedPages.length === 0) return
    setStep('analyzing')
    setProgress(0)
    setProgressLabel('Assemblage des pages…')
    try {
      const pdfFile = await combineImagesToPdf(capturedPages.map(p => p.file))
      await runAnalysis(pdfFile)
    } catch (err) {
      console.error('[PaperLiss] Échec assemblage PDF multi-pages:', err)
      toast.error('Impossible d\'assembler les pages en un seul document. Réessaie.', { duration: 8000 })
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
    resetCapturedPages()
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
          {capturedPages.length === 0 && (
            <>
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
                  onChange={e => { const f = pickFirstFile(e.target.files); if (f) setFileAndPreview(f) }}
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
            </>
          )}

          {/* Document de plusieurs pages : une photo par page (caméra ou galerie
              en rafale), assemblées en un seul PDF juste avant l'analyse — voir
              handleAnalyzeMultiPage / src/lib/imagesToPdf.ts. */}
          {capturedPages.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">
                  {capturedPages.length} page{capturedPages.length > 1 ? 's' : ''} capturée{capturedPages.length > 1 ? 's' : ''}
                </p>
                <button
                  onClick={resetCapturedPages}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                >
                  <X size={14} />
                  Tout effacer
                </button>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {capturedPages.map((page, i) => (
                  <div key={page.previewUrl} className="relative">
                    <img
                      src={page.previewUrl}
                      alt={`Page ${i + 1}`}
                      className="w-full aspect-[3/4] object-cover rounded-lg border border-gray-200"
                    />
                    <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
                      {i + 1}
                    </span>
                    <button
                      onClick={() => removeCapturedPage(i)}
                      aria-label={`Supprimer la page ${i + 1}`}
                      className="absolute -top-1.5 -right-1.5 bg-white border border-gray-200 rounded-full p-1 shadow-sm text-gray-500 hover:text-danger"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => cameraRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 py-2.5 rounded-xl text-sm font-medium transition-colors min-h-[44px]"
                >
                  <Camera size={16} />
                  Ajouter une autre page
                </button>
                <button
                  onClick={() => galleryRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 py-2.5 rounded-xl text-sm font-medium transition-colors min-h-[44px]"
                >
                  <Upload size={16} />
                  Depuis la galerie
                </button>
              </div>
            </div>
          )}

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => { addCapturedPages(Array.from(e.target.files ?? [])); e.target.value = '' }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => { addCapturedPages(Array.from(e.target.files ?? [])); e.target.value = '' }}
          />

          {/* Bouton analyser — grand + pulsant */}
          {capturedPages.length > 0 ? (
            <button
              onClick={handleAnalyzeMultiPage}
              className="relative w-full bg-paperliss hover:bg-paperliss-dark text-white font-bold py-6 rounded-2xl transition-all flex items-center justify-center gap-3 text-lg shadow-xl shadow-paperliss/30 hover:scale-[1.02] active:scale-[0.98] min-h-[72px]"
            >
              <span className="absolute inset-0 rounded-2xl bg-paperliss animate-ping opacity-20" />
              <ScanLine size={24} />
              Analyser ({capturedPages.length} page{capturedPages.length > 1 ? 's' : ''})
            </button>
          ) : hasContent && (
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

          {result.texte_tronque && (
            <div className="flex items-start gap-2 bg-warning-light text-warning text-sm rounded-xl p-3">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>Ce document est long — seule une partie a pu être analysée. Certains détails (notamment en fin de document) peuvent manquer.</span>
            </div>
          )}

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
