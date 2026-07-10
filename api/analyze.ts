const SYSTEM_PROMPT = `Tu es un expert en administration belge et française. Analyse ce document et réponds UNIQUEMENT avec ce JSON (aucun texte avant ou après) :
{
  "organisme": "nom de l'organisme expéditeur (SPF Finances, CPAS, Mutualité, ONSS, SPW, etc.)",
  "categorie": "OBLIGATOIRE : exactement l'un de ces 4 mots : courriers | factures | identite | autres",
  "explication": "2-3 phrases simples comme à un ami, le plus important en premier",
  "action_recommandee": "ce que l'utilisateur doit faire concrètement",
  "date_limite": "YYYY-MM-DD si trouvée, sinon null",
  "urgence": false,
  "lien_officiel": "URL officielle si applicable, sinon null",
  "montant_eur": "montant en euros mentionné dans le document (à payer OU à recevoir), en nombre (ex: 149.90), sinon null — n'invente jamais un montant absent du texte"
}
RÈGLE ABSOLUE pour categorie — utilise UNIQUEMENT ces valeurs exactes, rien d'autre :
- "courriers"  → lettres officielles, convocations, notifications, contrats
- "factures"   → factures, relevés, avis de paiement
- "identite"   → carte d'identité, passeport, permis, documents personnels
- "autres"     → tout ce qui ne rentre pas dans les 3 catégories ci-dessus
Contexte : SPF Finances = impôts, CPAS = aide sociale, Mutualité = assurance maladie, ONSS = cotisations sociales.`

export default async function handler(req: any, res: any): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {})
  const text: string | undefined = body.text

  if (!text || text.trim().length < 10) {
    res.status(400).json({ error: 'Texte trop court pour être analysé' })
    return
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurée sur Vercel' })
    return
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Document à analyser :\n\n${text.slice(0, 8000)}` }],
      }),
    })

    if (!upstream.ok) {
      const err = await upstream.text()
      console.error(`[Anthropic] ${upstream.status}:`, err)
      if (upstream.status === 400 && err.includes('credit balance')) {
        res.status(402).json({ error: 'Solde Anthropic insuffisant — recharge sur console.anthropic.com' })
        return
      }
      res.status(upstream.status).json({ error: `Anthropic ${upstream.status}: ${err}` })
      return
    }

    const data = await upstream.json()
    const content: string = data?.content?.[0]?.text ?? ''

    const match = content.match(/```json\s*([\s\S]*?)```/) ?? content.match(/(\{[\s\S]*\})/)
    if (!match) {
      console.error('[Anthropic] Pas de JSON:', content)
      res.status(500).json({ error: "Réponse inattendue de l'IA" })
      return
    }

    const result = JSON.parse(match[1] ?? match[0])

    const VALID = ['courriers', 'factures', 'identite', 'autres']
    const raw: string = (result.categorie ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    const ALIASES: Record<string, string> = {
      courrier: 'courriers', facture: 'factures',
      identite: 'identite', identite2: 'identite',
      autre: 'autres', contrat: 'courriers',
      salaire: 'factures', impot: 'factures', impot2: 'factures',
    }
    result.categorie = VALID.includes(raw) ? raw : (ALIASES[raw] ?? 'autres')

    if (result.date_limite) {
      const diff = (new Date(result.date_limite).getTime() - Date.now()) / 86400000
      result.urgence = diff >= 0 && diff < 7
    } else {
      result.urgence = false
    }

    const montant = typeof result.montant_eur === 'string' ? parseFloat(result.montant_eur) : result.montant_eur
    result.montant_eur = typeof montant === 'number' && !isNaN(montant) ? montant : null

    res.status(200).json(result)
  } catch (err: any) {
    console.error('[analyze] Erreur:', err)
    res.status(500).json({ error: err?.message ?? 'Erreur interne' })
  }
}
