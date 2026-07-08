import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const SYSTEM_PROMPT = `Tu es un expert en administration belge et française. On te donne la liste de TOUS les documents administratifs d'un utilisateur (déjà analysés individuellement). Ton rôle : croiser ces documents pour faire ressortir ce qui compte vraiment — échéances qui se chevauchent, factures impayées qui s'accumulent, documents liés entre eux, urgences à ne pas manquer.

Réponds UNIQUEMENT avec ce JSON (aucun texte avant ou après) :
{
  "resume": "2-3 phrases résumant la situation administrative globale de l'utilisateur, comme à un ami",
  "priorites": [
    {
      "titre": "titre court de la priorité",
      "description": "1-2 phrases expliquant pourquoi c'est important et quoi faire",
      "urgence": "haute" | "moyenne" | "basse",
      "document_ids": ["uuid des documents concernés"]
    }
  ]
}
RÈGLES :
- Trie "priorites" de la plus urgente à la moins urgente.
- Si rien n'est urgent, "priorites" peut être une liste courte de simples recommandations utiles.
- "document_ids" doit contenir uniquement des ids présents dans la liste fournie.`

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

  try {
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, organisme_detecte, categorie, explication_ia, action_recommandee, date_limite, urgence, statut, created_at')
      .eq('user_id', userId)
      .neq('statut', 'archive')

    if (docsError) throw docsError

    if (!documents || documents.length === 0) {
      res.status(200).json({ data: { resume: '', priorites: [] }, documents_count: 0 })
      return
    }

    const { data: existing } = await supabase
      .from('radar_snapshots')
      .select('data, documents_count')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing && existing.documents_count === documents.length) {
      res.status(200).json({ data: existing.data, documents_count: existing.documents_count })
      return
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurée sur Vercel' })
      return
    }

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Documents à analyser :\n\n${JSON.stringify(documents)}` }],
      }),
    })

    if (!upstream.ok) {
      const err = await upstream.text()
      console.error(`[radar] Anthropic ${upstream.status}:`, err)
      res.status(upstream.status).json({ error: `Anthropic ${upstream.status}: ${err}` })
      return
    }

    const upstreamData = await upstream.json()
    const content: string = upstreamData?.content?.[0]?.text ?? ''

    const match = content.match(/```json\s*([\s\S]*?)```/) ?? content.match(/(\{[\s\S]*\})/)
    if (!match) {
      console.error('[radar] Pas de JSON:', content)
      res.status(500).json({ error: "Réponse inattendue de l'IA" })
      return
    }

    const radarData = JSON.parse(match[1] ?? match[0])

    await supabase.from('radar_snapshots').delete().eq('user_id', userId)
    await supabase.from('radar_snapshots').insert({
      user_id: userId,
      data: radarData,
      documents_count: documents.length,
    })

    res.status(200).json({ data: radarData, documents_count: documents.length })
  } catch (err: any) {
    console.error('[radar] Erreur:', err)
    res.status(500).json({ error: err?.message ?? 'Erreur interne' })
  }
}
