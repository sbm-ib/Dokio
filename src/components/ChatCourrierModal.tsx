import { useEffect, useRef, useState } from 'react'
import { X, Loader2, FileText, AlertTriangle, Send, Copy, Check, Save, Download } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { supabase, getAuthHeader } from '../lib/supabase'
import { buildExpediteur } from '../lib/letterTypes'
import { getDocLabel, formatDate } from '../lib/utils'
import { downloadLetterPdf, buildLetterFilename } from '../lib/letterPdf'
import UpgradeModal from './UpgradeModal'
import type { Document, LetterResult } from '../types'
import toast from 'react-hot-toast'

interface Props {
  doc: Document
  onClose: () => void
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

// Chaque ligne de la réponse streamée par api/chat-courrier.ts est un JSON
// newline-delimited — voir le protocole détaillé dans ce fichier serveur.
type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'lettre'; message: string; data: LetterResult }
  | { type: 'done' }
  | { type: 'error'; error: string; code?: string }

export default function ChatCourrierModal({ doc, onClose }: Props) {
  const { profile, user, refreshProfile } = useAuth()
  const { canGenerateLetter, remainingCourriers } = useProfile()

  const [loadingHistory, setLoadingHistory] = useState(true)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streamingText, setStreamingText] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)

  const [lettre, setLettre] = useState<LetterResult | null>(null)
  const [destinataire, setDestinataire] = useState('')
  const [objet, setObjet] = useState('')
  const [corps, setCorps] = useState('')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    if (!user) return
    ;(async () => {
      const { data } = await supabase
        .from('conversations_courrier')
        .select('messages, lettre_courante')
        .eq('document_id', doc.id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (data) {
        setMessages((data.messages as ChatMessage[]) ?? [])
        const saved = data.lettre_courante as LetterResult | null
        if (saved) {
          setLettre(saved)
          setDestinataire(saved.destinataire)
          setObjet(saved.objet)
          setCorps(saved.corps)
        }
      }
      setLoadingHistory(false)
    })()
    return () => { cancelled = true }
  }, [doc.id, user])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const applyLettre = (data: LetterResult) => {
    setLettre(data)
    setDestinataire(data.destinataire)
    setObjet(data.objet)
    setCorps(data.corps)
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return

    setInput('')
    setSending(true)
    setStreamingText('')
    const historyForRequest = messages
    setMessages(prev => [...prev, { role: 'user', content: text, created_at: new Date().toISOString() }])

    try {
      const expediteur = buildExpediteur(profile, user?.email ?? '')
      const res = await fetch('/api/chat-courrier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({
          document_id: doc.id,
          message: text,
          history: historyForRequest,
          current_lettre: lettre,
          expediteur,
        }),
      })

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}) as { error?: string; code?: string })
        throw Object.assign(new Error(body.error ?? `Erreur serveur (${res.status})`), { code: body.code })
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let assistantText = ''
      let finalLettreMessage: string | null = null
      let finalLettreData: LetterResult | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let newlineIndex: number
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newlineIndex).trim()
          buffer = buffer.slice(newlineIndex + 1)
          if (!line) continue
          const evt = JSON.parse(line) as StreamEvent
          if (evt.type === 'delta') {
            assistantText += evt.text
            setStreamingText(assistantText)
          } else if (evt.type === 'lettre') {
            finalLettreMessage = evt.message
            finalLettreData = evt.data
          } else if (evt.type === 'error') {
            throw Object.assign(new Error(evt.error), { code: evt.code })
          }
        }
      }

      if (finalLettreData) {
        applyLettre(finalLettreData)
        setMessages(prev => [...prev, { role: 'assistant', content: finalLettreMessage ?? '', created_at: new Date().toISOString() }])
        await refreshProfile()
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: assistantText, created_at: new Date().toISOString() }])
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
      if (code === 'limit_reached') {
        await refreshProfile()
        setShowUpgrade(true)
      } else {
        console.error('[ChatCourrierModal] error:', err)
        toast.error('Oups, un problème est survenu. Réessaie !', { duration: 8000 })
      }
      // Le message utilisateur optimiste n'a pas eu de réponse — on le retire
      // et on remet le texte dans le champ pour ne pas le faire perdre.
      setMessages(prev => prev.slice(0, -1))
      setInput(text)
    } finally {
      setSending(false)
      setStreamingText(null)
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
      console.error('[ChatCourrierModal] pdf error:', err)
      toast.error('Impossible de générer le PDF.')
    }
  }

  const handleSave = async () => {
    if (!user?.id || !lettre) return
    setSaving(true)
    try {
      const { error: saveErr } = await supabase.from('courriers').insert({
        user_id: user.id,
        document_id: doc.id,
        type: 'chat',
        destinataire,
        objet,
        contenu: corps,
        conseils_envoi: lettre.conseils_envoi,
        champs_a_completer: lettre.champs_a_completer,
      })
      if (saveErr) throw saveErr
      toast.success('Courrier enregistré !')
    } catch (err) {
      console.error('[ChatCourrierModal] save error:', err)
      toast.error("Oups, impossible d'enregistrer le courrier.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      {showUpgrade && (
        <UpgradeModal
          onClose={() => setShowUpgrade(false)}
          badgeLabel="Courriers"
          title="Passe Premium pour générer plus de courriers"
          description="Le plan gratuit permet de générer 1 courrier par mois. Passe à Premium pour des courriers illimités."
        />
      )}

      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex justify-between items-start p-6 pb-4 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Discuter de ce courrier</h2>
            <p className="text-sm text-gray-500 mt-0.5">{getDocLabel(doc)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-2 gap-4 px-6 pb-6 overflow-hidden">
          {/* ── Chat ── */}
          <div className="flex flex-col min-h-0 border border-gray-100 rounded-2xl overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingHistory ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-gray-300" />
                </div>
              ) : messages.length === 0 && streamingText === null ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  Pose une question sur ce document, ou décris ce que tu veux répondre —
                  par exemple « Je conteste ce montant, écris-moi une lettre ».
                </p>
              ) : (
                messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-paperliss text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {m.content}
                    </div>
                  </div>
                ))
              )}
              {streamingText !== null && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap bg-gray-100 text-gray-800">
                    {streamingText}
                    {streamingText === '' && <Loader2 size={14} className="animate-spin inline-block text-gray-400" />}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-gray-100 p-3 flex items-end gap-2 shrink-0">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Écris ton message…"
                rows={2}
                disabled={sending}
                className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-paperliss transition resize-none disabled:opacity-60"
              />
              <button
                onClick={handleSend}
                disabled={sending || !input.trim()}
                aria-label="Envoyer"
                className="shrink-0 w-10 h-10 flex items-center justify-center bg-paperliss hover:bg-paperliss-dark disabled:opacity-40 text-white rounded-xl transition-colors"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>

          {/* ── Lettre ── */}
          <div className="flex flex-col min-h-0 overflow-y-auto pr-1 space-y-4">
            {!lettre ? (
              <div className="flex-1 flex items-center justify-center text-center px-4">
                <p className="text-sm text-gray-400">
                  La lettre apparaîtra ici dès que tu en demanderas une dans le chat.
                </p>
              </div>
            ) : (
              <>
                {lettre.champs_a_completer.length > 0 && (
                  <div className="bg-warning-light rounded-xl p-4">
                    <p className="flex items-center gap-2 text-sm font-bold text-warning mb-2">
                      <AlertTriangle size={16} />
                      {lettre.champs_a_completer.length} champ{lettre.champs_a_completer.length > 1 ? 's' : ''} à compléter avant l'envoi
                    </p>
                    <ul className="flex flex-wrap gap-1.5">
                      {lettre.champs_a_completer.map((f, i) => (
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
                    rows={12}
                    className="w-full px-4 py-4 rounded-xl border border-gray-200 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap outline-none focus:ring-2 focus:ring-paperliss transition resize-y"
                  />
                </div>

                <div className="bg-paperliss-light rounded-xl p-4 flex items-start gap-2.5">
                  <FileText size={16} className="text-paperliss shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-paperliss uppercase tracking-wide mb-1">Conseils d'envoi</p>
                    <p className="text-sm text-paperliss">{lettre.conseils_envoi}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    onClick={handleCopy}
                    className="flex items-center justify-center gap-2 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 font-semibold rounded-xl transition-colors min-h-[44px] text-sm"
                  >
                    {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                    {copied ? 'Copié !' : 'Copier'}
                  </button>
                  <button
                    onClick={handleDownloadPdf}
                    className="flex items-center justify-center gap-2 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 font-semibold rounded-xl transition-colors min-h-[44px] text-sm"
                  >
                    <Download size={16} />
                    PDF
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center justify-center gap-2 bg-paperliss hover:bg-paperliss-dark disabled:opacity-60 text-white font-semibold rounded-xl transition-colors min-h-[44px] text-sm"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {saving ? '…' : 'Enregistrer'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {!canGenerateLetter() && (
          <p className="text-xs text-gray-400 text-center pb-4 px-6 shrink-0">
            {remainingCourriers() === 0
              ? 'Limite mensuelle de courriers générés atteinte — tu peux continuer à discuter, mais pas régénérer la lettre.'
              : `${remainingCourriers()} courrier(s) restant(s) ce mois.`}
          </p>
        )}
      </div>
    </div>
  )
}
