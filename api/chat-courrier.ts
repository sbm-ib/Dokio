import { parseAiJson } from '../lib/parse-ai-json.js'
import { getUsageStatus, incrementUsage } from '../lib/usageLimits.js'
import { getAuthenticatedUserId } from '../lib/auth.js'
import { getSupabaseAdmin } from '../lib/supabase-admin.js'

const USAGE_CONFIG = {
  countColumn: 'courriers_count' as const,
  resetColumn: 'courriers_reset_date' as const,
  freeLimit: 1,
  premiumLimit: 30,
}

// Anthropic ne nous dit pas à l'avance si un tour va produire une simple
// réponse conversationnelle ou une nouvelle version de la lettre — c'est
// justement Claude qui en décide, message par message. Plutôt que de lui
// faire écrire un JSON à chaque tour (ce qui interdirait tout streaming
// token-par-token pour les réponses purement explicatives, puisqu'un JSON
// partiel n'est pas exploitable tel quel), on lui fait préfixer sa réponse
// par ce marqueur UNIQUEMENT quand elle contient une lettre. Le serveur lit
// le flux Anthropic caractère par caractère : tant que le préfixe reçu reste
// un préfixe valide du marqueur, on patiente sans rien renvoyer au client ;
// dès qu'il diverge, on sait qu'on est en mode "explication" et on peut
// streamer tout ce qui a été bufferisé puis chaque delta suivant tel quel.
const LETTRE_MARKER = '<<LETTRE>>'
const MAX_RESPONSE_TOKENS = 4096
const ANTHROPIC_TIMEOUT_MS = 45_000

function buildSystemPrompt(input: {
  document: unknown
  expediteur: unknown
  currentLettre: unknown
  canRegenerateLetter: boolean
}): string {
  return `Tu es un rédacteur administratif expert, spécialisé dans l'administration BELGE (Wallonie-Bruxelles). Tu discutes avec l'utilisateur, par CHAT, d'un document administratif qu'il a reçu — pour l'aider à le comprendre ET pour rédiger/affiner un courrier de réponse au fil de la conversation, sans qu'il ait besoin d'éditer le texte à la main.

Contexte fourni (JSON) :
- "document" : les données du document reçu (organisme, montant, date limite, résumé).
- "expediteur" : les coordonnées de l'utilisateur.
- "lettre_actuelle" : la version actuelle de la lettre si une a déjà été générée dans cette conversation, sinon null.

${JSON.stringify({ document: input.document, expediteur: input.expediteur, lettre_actuelle: input.currentLettre })}

À CHAQUE message de l'utilisateur, choisis EXACTEMENT un des deux modes de réponse suivants :

1. EXPLICATION — l'utilisateur pose une question, demande une clarification, discute de sa situation, ou son message ne demande pas de changement concret à la lettre. Réponds alors en texte libre, conversationnel, en français, court et clair. Ne mets JAMAIS de JSON ni le marqueur ci-dessous dans ce mode.

2. LETTRE — l'utilisateur demande de générer, régénérer, ou modifier la lettre (nouveau courrier, changement de ton, ajout d'un point, correction, etc.). Dans ce mode, ta réponse doit commencer EXACTEMENT par "${LETTRE_MARKER}" (rien avant, aucun espace ni retour à la ligne avant), suivi IMMÉDIATEMENT d'un objet JSON valide, sans texte après, sans balises Markdown. Format exact :
{
  "message": string,
  "lettre": {
    "destinataire": string,
    "objet": string,
    "corps": string,
    "conseils_envoi": string,
    "champs_a_completer": [string]
  }
}
- "message" = 1 à 2 phrases, en français, expliquant à l'utilisateur ce que tu as fait/changé (affiché dans le chat).
- "lettre.corps" = la lettre COMPLÈTE (pas juste la partie modifiée), avec sauts de ligne, prête à copier. Si "lettre_actuelle" existe, pars de son contenu et applique la demande — ne perds pas ce qui n'a pas été explicitement remis en cause.
- "lettre.conseils_envoi" = comment l'envoyer (ex : "Envoyer en recommandé avec accusé de réception avant le 18/07.").
- "lettre.champs_a_completer" = la liste des [crochets] que l'utilisateur doit encore remplir.

Ne mélange JAMAIS les deux modes dans une même réponse. En cas de doute, préfère EXPLICATION.

${input.canRegenerateLetter ? '' : "IMPORTANT : l'utilisateur a atteint sa limite mensuelle de courriers générés. Tu ne dois PAS produire de réponse au format LETTRE dans ce tour, même s'il te le demande explicitement — réponds en mode EXPLICATION en lui expliquant qu'il a atteint sa limite et qu'il peut passer Premium pour continuer."}

Règles de rédaction pour toute lettre produite :
- Ton formel, poli, mais ferme. Jamais agressif.
- Structure belge classique : coordonnées expéditeur, coordonnées destinataire, lieu et date, objet, corps, formule de politesse, signature.
- Cite précisément les éléments du document (montant exact, date, référence) — n'invente JAMAIS de donnée absente : si une information manque, insère un champ à compléter entre crochets, par exemple [Votre numéro de dossier].
- Mentionne les délais légaux applicables quand c'est pertinent.
- Vocabulaire belge : CPAS, mutualité, ONSS, SPF Finances, Justice de Paix, Fédération Wallonie-Bruxelles, recommandé avec accusé de réception.
- Longueur : concis, une page maximum.`
}

function isAbortError(err: unknown): boolean {
  if (err instanceof Error && err.name === 'AbortError') return true
  const cause = err instanceof Error ? err.cause : undefined
  return cause instanceof Error && cause.name === 'AbortError'
}

interface StoredMessage {
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export default async function handler(req: any, res: any): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {})
  const documentId: string | undefined = body.document_id
  const userMessage: string | undefined = typeof body.message === 'string' ? body.message.trim() : undefined
  const history: StoredMessage[] = Array.isArray(body.history) ? body.history : []
  const currentLettre = body.current_lettre ?? null
  const expediteur = body.expediteur

  if (!documentId) { res.status(400).json({ error: 'document_id requis' }); return }
  if (!userMessage) { res.status(400).json({ error: 'message requis' }); return }
  if (!expediteur || typeof expediteur !== 'object') { res.status(400).json({ error: 'expediteur requis' }); return }

  let userId: string
  try {
    userId = await getAuthenticatedUserId(req)
  } catch (err: any) {
    res.status(401).json({ error: err?.message ?? 'Authentification requise' })
    return
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurée sur Vercel' })
    return
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Erreur de configuration Supabase' })
    return
  }

  // On ne fait jamais confiance aux données de document envoyées par le
  // client pour la conversation — on relit le document nous-mêmes, scopé à
  // cet utilisateur, ce qui garantit à la fois la fraîcheur des données et
  // qu'on ne peut pas discuter d'un document appartenant à quelqu'un d'autre
  // (getSupabaseAdmin() contourne les policies RLS, donc ce filtre est
  // obligatoire ici, contrairement au client Supabase habituel du front).
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('id, organisme_detecte, categorie, explication_ia, action_recommandee, date_limite, urgence, montant_eur')
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle()

  if (docError) { res.status(500).json({ error: docError.message }); return }
  if (!document) { res.status(404).json({ error: 'Document introuvable' }); return }

  let usage: { allowed: boolean }
  try {
    usage = await getUsageStatus(userId, USAGE_CONFIG)
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Erreur de vérification de limite' })
    return
  }

  const systemPrompt = buildSystemPrompt({
    document,
    expediteur,
    currentLettre,
    canRegenerateLetter: usage.allowed,
  })

  const anthropicMessages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: userMessage },
  ]

  const abortController = new AbortController()
  const abortTimer = setTimeout(() => abortController.abort(), ANTHROPIC_TIMEOUT_MS)

  let upstream: Response
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: MAX_RESPONSE_TOKENS,
        system: systemPrompt,
        messages: anthropicMessages,
        stream: true,
      }),
      signal: abortController.signal,
    })
  } catch (err: unknown) {
    clearTimeout(abortTimer)
    if (isAbortError(err)) {
      res.status(504).json({ error: `L'IA a mis trop de temps à répondre (>${ANTHROPIC_TIMEOUT_MS / 1000}s). Réessaie dans quelques instants.` })
      return
    }
    console.error('[chat-courrier] Erreur réseau vers Anthropic:', err)
    res.status(500).json({ error: 'Impossible de contacter l\'IA' })
    return
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(abortTimer)
    const errText = await upstream.text().catch(() => '')
    console.error(`[chat-courrier] Anthropic ${upstream.status}:`, errText)
    res.status(upstream.status || 500).json({ error: `Anthropic ${upstream.status}: ${errText}` })
    return
  }

  // À partir d'ici, on répond en newline-delimited JSON (une ligne = un
  // événement) plutôt qu'un seul gros JSON, pour pouvoir streamer les
  // réponses purement conversationnelles dès qu'elles arrivent — voir le
  // commentaire sur LETTRE_MARKER plus haut pour la logique de bascule.
  res.status(200)
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')

  const send = (event: Record<string, unknown>) => {
    res.write(`${JSON.stringify(event)}\n`)
  }

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let sseBuffer = ''
  let textBuffer = ''
  let mode: 'undecided' | 'explication' | 'lettre' = 'undecided'
  let aborted = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      sseBuffer += decoder.decode(value, { stream: true })

      let newlineIndex: number
      while ((newlineIndex = sseBuffer.indexOf('\n')) >= 0) {
        const line = sseBuffer.slice(0, newlineIndex).trim()
        sseBuffer = sseBuffer.slice(newlineIndex + 1)
        if (!line.startsWith('data: ')) continue

        const payload = line.slice('data: '.length)
        let sseEvent: any
        try {
          sseEvent = JSON.parse(payload)
        } catch {
          continue
        }

        if (sseEvent.type !== 'content_block_delta' || sseEvent.delta?.type !== 'text_delta') continue
        const chunk: string = sseEvent.delta.text ?? ''
        if (!chunk) continue

        if (mode === 'lettre') {
          textBuffer += chunk
          continue
        }

        if (mode === 'explication') {
          textBuffer += chunk
          send({ type: 'delta', text: chunk })
          continue
        }

        // mode === 'undecided' : on accumule jusqu'à pouvoir trancher.
        textBuffer += chunk
        if (textBuffer.length < LETTRE_MARKER.length) {
          if (!LETTRE_MARKER.startsWith(textBuffer)) {
            mode = 'explication'
            send({ type: 'delta', text: textBuffer })
          }
          continue
        }
        if (textBuffer.startsWith(LETTRE_MARKER)) {
          mode = 'lettre'
        } else {
          mode = 'explication'
          send({ type: 'delta', text: textBuffer })
        }
      }
    }
  } catch (err) {
    if (!isAbortError(err)) console.error('[chat-courrier] Erreur de lecture du flux Anthropic:', err)
    aborted = true
  } finally {
    clearTimeout(abortTimer)
  }

  // Réponse terminée normalement mais plus courte que LETTRE_MARKER (ou un
  // préfixe du marqueur sans jamais diverger ni l'égaler) : on n'a encore
  // rien envoyé au client faute d'avoir pu trancher — on tranche ici pour
  // "explication" et on flushe tout ce qui a été bufferisé en un seul delta.
  if (!aborted && mode === 'undecided') {
    mode = 'explication'
    if (textBuffer) send({ type: 'delta', text: textBuffer })
  }

  if (aborted && mode !== 'lettre') {
    send({ type: 'error', error: `L'IA a mis trop de temps à répondre (>${ANTHROPIC_TIMEOUT_MS / 1000}s). Réessaie dans quelques instants.` })
    res.end()
    return
  }

  const now = new Date().toISOString()
  const newHistory: StoredMessage[] = [
    ...history,
    { role: 'user', content: userMessage, created_at: now },
  ]

  if (mode === 'lettre') {
    let parsed: { message?: string; lettre?: unknown }
    try {
      parsed = parseAiJson(textBuffer.slice(LETTRE_MARKER.length)) as { message?: string; lettre?: unknown }
    } catch (parseErr: any) {
      console.error('[chat-courrier] Échec de parsing JSON. Réponse brute Claude:', textBuffer)
      send({ type: 'error', error: `Réponse IA invalide: ${parseErr?.message ?? parseErr}` })
      res.end()
      return
    }

    if (!usage.allowed) {
      // Garde-fou serveur : même si le modèle a ignoré la consigne du
      // system prompt et produit une lettre malgré la limite atteinte, on
      // refuse de l'appliquer/enregistrer et de compter un usage.
      send({ type: 'error', error: 'Passe Premium pour générer des courriers illimités.', code: 'limit_reached' })
      res.end()
      return
    }

    try {
      await incrementUsage(userId, USAGE_CONFIG)
    } catch (err) {
      console.error('[chat-courrier] Échec incrementUsage (lettre déjà générée, on continue):', err)
    }

    const assistantMessage = typeof parsed.message === 'string' ? parsed.message : ''
    await supabase.from('conversations_courrier').upsert({
      user_id: userId,
      document_id: documentId,
      messages: [...newHistory, { role: 'assistant', content: assistantMessage, created_at: now }],
      lettre_courante: parsed.lettre,
      updated_at: now,
    }, { onConflict: 'user_id,document_id' })

    send({ type: 'lettre', message: assistantMessage, data: parsed.lettre })
    send({ type: 'done' })
    res.end()
    return
  }

  // mode === 'explication' (ou jamais tranché si la réponse était plus
  // courte que le marqueur — on la traite alors comme une explication).
  await supabase.from('conversations_courrier').upsert({
    user_id: userId,
    document_id: documentId,
    messages: [...newHistory, { role: 'assistant', content: textBuffer, created_at: now }],
    lettre_courante: currentLettre,
    updated_at: now,
  }, { onConflict: 'user_id,document_id' })

  send({ type: 'done' })
  res.end()
}
