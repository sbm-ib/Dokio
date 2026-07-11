import { getSupabaseAdmin } from '../lib/supabase-admin.js'

const SYSTEM_PROMPT = `Tu es l'assistant administratif de Dokio, spécialisé dans l'administration BELGE (Wallonie-Bruxelles). On te donne l'ensemble des documents administratifs d'un utilisateur (déjà résumés). Ta mission : produire une synthèse GLOBALE de sa situation en raisonnant sur TOUS les documents ensemble, pas un par un.

Utilise le vocabulaire belge : CPAS, mutualité, ONSS, SPF Finances, allocations familiales, prime énergie, tarif social, Justice de Paix, Fédération Wallonie-Bruxelles, etc.

Analyse et déduis :
1. L'argent qui doit RENTRER (allocations, remboursements, versements attendus).
2. L'argent en DANGER (pénalités, majorations, délais bientôt dépassés).
3. Les ACTIONS concrètes à faire, triées par urgence (la plus urgente d'abord).
4. Les ANTICIPATIONS : ce qui va logiquement arriver ensuite et quand agir si ça n'arrive pas.
5. Les CONNEXIONS entre documents.

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {})
  const userId: string | undefined = body.userId

  if (!userId) {
    res.status(400).json({ error: 'userId requis' })
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
      res.status(200).json({ data: existing.data, documents_count: existing.documents_count })
      return
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurée sur Vercel' })
      return
    }

    const upstream = await step('appel Claude', () => fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Documents à analyser :\n\n${JSON.stringify(documents)}` }],
      }),
    }))

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

    res.status(200).json({ data: radarData, documents_count: documents.length })
  } catch (err: any) {
    console.error('[radar] Erreur:', err, 'cause:', err?.cause)
    const cause = err?.cause?.message ?? err?.cause
    res.status(500).json({
      error: `${err?.message ?? 'Erreur interne'}${cause ? ` — cause: ${cause}` : ''}`,
    })
  }
}
