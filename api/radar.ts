import { getSupabaseAdmin } from '../lib/supabase-admin.js'
import { getAuthenticatedUserId } from '../lib/auth.js'

// vercel.json fixe maxDuration: 30 pour cette fonction. Avec ~38 documents
// actifs envoyés en une seule requête à Claude, l'appel dépassait cette
// limite et Vercel tuait la fonction en plein vol (FUNCTION_INVOCATION_TIMEOUT,
// une page d'erreur HTML illisible pour l'utilisateur, sans réponse JSON).
// Deux mitigations complémentaires : (1) réduire ce qu'on envoie à Claude
// (voir selectDocumentsForRadar plus bas) pour tenir largement dans le temps
// imparti, et (2) aborter nous-mêmes l'appel avant que Vercel ne le fasse
// (ANTHROPIC_TIMEOUT_MS très en dessous des 30s), pour renvoyer une erreur
// JSON propre au lieu de laisser la plateforme tuer la fonction brutalement.
const MAX_DOCUMENTS_FOR_RADAR = 25
const TEXT_FIELD_MAX_CHARS = 220
const ANTHROPIC_TIMEOUT_MS = 20_000
const MAX_RESPONSE_TOKENS = 2048

function restrictForPlan(data: any, plan: string) {
  if (plan === 'premium') return data
  const lockedCounts = {
    actions_semaine: data.actions_semaine?.length ?? 0,
    anticipations: data.anticipations?.length ?? 0,
    connexions: data.connexions?.length ?? 0,
  }
  return {
    ...data,
    actions_semaine: [],
    anticipations: [],
    connexions: [],
    locked_counts: lockedCounts,
  }
}

const SYSTEM_PROMPT = `Tu es l'assistant administratif de Dokio, spécialisé dans l'administration BELGE (Wallonie-Bruxelles). On te donne l'ensemble des documents administratifs d'un utilisateur (déjà résumés). Ta mission : produire une synthèse GLOBALE de sa situation en raisonnant sur TOUS les documents ensemble, pas un par un.

Utilise le vocabulaire belge : CPAS, mutualité, ONSS, SPF Finances, allocations familiales, prime énergie, tarif social, Justice de Paix, Fédération Wallonie-Bruxelles, etc.

Analyse et déduis :
1. L'argent qui doit RENTRER (allocations, remboursements, versements attendus).
2. L'argent en DANGER (pénalités, majorations, délais bientôt dépassés).
3. Les ACTIONS concrètes à faire, triées par urgence (la plus urgente d'abord).
4. Les ANTICIPATIONS : ce qui va logiquement arriver ensuite et quand agir si ça n'arrive pas.
5. Les CONNEXIONS entre documents.

Pour rester rapide à générer : limite chaque tableau à 5 éléments maximum (les plus importants/urgents en premier), et reste concis dans chaque champ texte libre (1 à 2 phrases).

Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ou après, sans balises Markdown. Format exact :

{
  "argent_qui_rentre": { "total_estime_eur": number, "details": [ { "libelle": string, "montant_eur": number, "source": string } ] },
  "argent_en_danger": { "total_estime_eur": number, "details": [ { "libelle": string, "montant_eur": number, "raison": string } ] },
  "actions_semaine": [ { "titre": string, "pourquoi": string, "urgence": "haute" | "moyenne" | "basse", "echeance": string | null } ],
  "anticipations": [ { "attendu": string, "quand": string, "si_rien_alors": string } ],
  "connexions": [ { "documents": [string], "lien": string } ],
  "resume_situation": string
}

Chaque document fourni peut contenir un champ "montant_eur" déjà extrait du texte original : utilise-le en priorité pour tes calculs. Si une information n'est pas déductible, mets une valeur nulle ou un tableau vide. N'invente jamais de montant absent des documents : si tu n'es pas sûr, laisse à 0 et explique dans le libellé.`

async function step<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  try {
    return await fn()
  } catch (err: any) {
    const e: any = new Error(`[étape: ${label}] ${err?.message ?? err}`)
    e.cause = err?.cause ?? err
    throw e
  }
}

interface RadarDocumentRow {
  id: string
  organisme_detecte: string | null
  categorie: string | null
  explication_ia: string | null
  action_recommandee: string | null
  date_limite: string | null
  urgence: boolean | null
  statut: string
  montant_eur: number | null
  created_at: string
}

function truncateText(text: string | null, maxChars: number): string | null {
  if (!text || text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}…`
}

// Réduit ce qu'on envoie réellement à Claude, indépendamment du nombre total
// de documents actifs de l'utilisateur (documents.length reste inchangé pour
// la comparaison avec le cache radar_snapshots — seul le sous-ensemble
// transmis au prompt est limité). On priorise ce qui compte pour un
// "radar" : les documents urgents, puis ceux dont l'échéance est la plus
// proche, puis les plus récents. Les champs texte libres (souvent les plus
// gros contributeurs de tokens) sont raccourcis plutôt que supprimés, pour
// garder le contexte utile à l'IA sans faire exploser la taille du prompt.
function selectDocumentsForRadar(documents: RadarDocumentRow[]): RadarDocumentRow[] {
  const sorted = [...documents].sort((a, b) => {
    if (!!a.urgence !== !!b.urgence) return a.urgence ? -1 : 1
    if (a.date_limite && b.date_limite) return String(a.date_limite).localeCompare(String(b.date_limite))
    if (a.date_limite) return -1
    if (b.date_limite) return 1
    return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
  })
  return sorted.slice(0, MAX_DOCUMENTS_FOR_RADAR).map(d => ({
    ...d,
    explication_ia: truncateText(d.explication_ia, TEXT_FIELD_MAX_CHARS),
    action_recommandee: truncateText(d.action_recommandee, TEXT_FIELD_MAX_CHARS),
  }))
}

function isAbortError(err: unknown): boolean {
  if (err instanceof Error && err.name === 'AbortError') return true
  const cause = err instanceof Error ? err.cause : undefined
  return cause instanceof Error && cause.name === 'AbortError'
}

function parseRadarJson(content: string): unknown {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/```\s*$/, '')
    .trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) throw new Error("Réponse inattendue de l'IA (pas de JSON trouvé)")
    return JSON.parse(match[0])
  }
}

export default async function handler(req: any, res: any): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return }

  let userId: string
  try {
    userId = await getAuthenticatedUserId(req)
  } catch (err: any) {
    res.status(401).json({ error: err?.message ?? 'Authentification requise' })
    return
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Erreur de configuration Supabase' })
    return
  }

  const emptyData = {
    argent_qui_rentre: { total_estime_eur: 0, details: [] },
    argent_en_danger: { total_estime_eur: 0, details: [] },
    actions_semaine: [],
    anticipations: [],
    connexions: [],
    resume_situation: '',
  }

  try {
    const { data: documents, error: docsError } = await step('lecture documents', () =>
      supabase
        .from('documents')
        .select('id, organisme_detecte, categorie, explication_ia, action_recommandee, date_limite, urgence, statut, montant_eur, created_at')
        .eq('user_id', userId)
        .neq('statut', 'archive')
    )

    if (docsError) throw new Error(`[étape: lecture documents] ${docsError.message}`)

    if (!documents || documents.length === 0) {
      res.status(200).json({ data: emptyData, documents_count: 0 })
      return
    }

    const { data: profileRow } = await step('lecture profil', () =>
      supabase.from('profiles').select('plan').eq('id', userId).single()
    )
    const plan: string = profileRow?.plan ?? 'gratuit'

    const { data: existing } = await step('lecture cache radar_snapshots', () =>
      supabase
        .from('radar_snapshots')
        .select('data, documents_count')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    )

    if (existing && existing.documents_count === documents.length) {
      res.status(200).json({ data: restrictForPlan(existing.data, plan), documents_count: existing.documents_count })
      return
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurée sur Vercel' })
      return
    }

    const documentsForPrompt = selectDocumentsForRadar(documents)

    let upstream: Response
    const abortController = new AbortController()
    const abortTimer = setTimeout(() => abortController.abort(), ANTHROPIC_TIMEOUT_MS)
    try {
      upstream = await step('appel Claude', () => fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: MAX_RESPONSE_TOKENS,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `Documents à analyser :\n\n${JSON.stringify(documentsForPrompt)}` }],
        }),
        signal: abortController.signal,
      }))
    } catch (err: unknown) {
      // step() enveloppe l'erreur d'origine dans e.cause — l'AbortError posé
      // par notre propre timeout (pas celui de Vercel) s'y retrouve donc.
      if (isAbortError(err)) {
        console.error(`[radar] Timeout appel Claude après ${ANTHROPIC_TIMEOUT_MS}ms (${documentsForPrompt.length}/${documents.length} documents envoyés)`)
        res.status(504).json({
          error: `L'IA a mis trop de temps à répondre (plus de ${ANTHROPIC_TIMEOUT_MS / 1000}s). Réessaie dans quelques instants.`,
        })
        return
      }
      throw err
    } finally {
      clearTimeout(abortTimer)
    }

    if (!upstream.ok) {
      const err = await upstream.text()
      console.error(`[radar] Anthropic ${upstream.status}:`, err)
      res.status(upstream.status).json({ error: `Anthropic ${upstream.status}: ${err}` })
      return
    }

    const upstreamData: any = await upstream.json()
    const content: string = upstreamData?.content?.[0]?.text ?? ''

    let radarData: unknown
    try {
      radarData = parseRadarJson(content)
    } catch (parseErr: any) {
      console.error('[radar] Échec de parsing JSON. Réponse brute Claude:', content)
      res.status(500).json({ error: `Réponse IA invalide: ${parseErr?.message ?? parseErr}` })
      return
    }

    await step('écriture cache radar_snapshots', async () => {
      await supabase.from('radar_snapshots').delete().eq('user_id', userId)
      await supabase.from('radar_snapshots').insert({
        user_id: userId,
        data: radarData,
        documents_count: documents.length,
      })
    })

    res.status(200).json({ data: restrictForPlan(radarData, plan), documents_count: documents.length })
  } catch (err: any) {
    console.error('[radar] Erreur:', err, 'cause:', err?.cause)
    const cause = err?.cause?.message ?? err?.cause
    res.status(500).json({
      error: `${err?.message ?? 'Erreur interne'}${cause ? ` — cause: ${cause}` : ''}`,
    })
  }
}
