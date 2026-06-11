const SYSTEM_PROMPT = `Tu es un expert en administration belge et française. Analyse ce document et réponds UNIQUEMENT avec ce JSON (aucun texte avant ou après) :
{
  "organisme": "nom de l'organisme expéditeur (SPF Finances, CPAS, Mutualité, ONSS, SPW, etc.)",
  "categorie": "OBLIGATOIRE : exactement l'un de ces 4 mots : courriers | factures | identite | autres",
  "explication": "2-3 phrases simples comme à un ami, le plus important en premier",
  "action_recommandee": "ce que l'utilisateur doit faire concrètement",
  "date_limite": "YYYY-MM-DD si trouvée, sinon null",
  "urgence": false,
  "lien_officiel": "URL officielle si applicable, sinon null"
}
RÈGLE ABSOLUE pour categorie — utilise UNIQUEMENT ces valeurs exactes, rien d'autre :
- "courriers"  → lettres officielles, convocations, notifications, contrats
- "factures"   → factures, relevés, avis de paiement
- "identite"   → carte d'identité, passeport, permis, documents personnels
- "autres"     → tout ce qui ne rentre pas dans les 3 catégories ci-dessus
Contexte : SPF Finances = impôts, CPAS = aide sociale, Mutualité = assurance maladie, ONSS = cotisations sociales.`

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const { text } = req.body ?? {}

  if (!text || text.trim().length < 10) {
    return res.status(400).json({ error: 'Texte trop court pour être analysé' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurée' })
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
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

    if (!response.ok) {
      const err = await response.text()
      console.error(`[Anthropic] ${response.status}:`, err)
      if (response.status === 400 && err.includes('credit balance')) {
        return res.status(402).json({ error: 'Solde Anthropic insuffisant — recharge ton compte sur console.anthropic.com' })
      }
      return res.status(response.status).json({ error: `Anthropic ${response.status}: ${err}` })
    }

    const data = await response.json()
    const content = data.content?.[0]?.text ?? ''

    const match = content.match(/```json\s*([\s\S]*?)```/) ?? content.match(/(\{[\s\S]*\})/)
    if (!match) {
      console.error('[Anthropic] Pas de JSON:', content)
      return res.status(500).json({ error: "Réponse inattendue de l'IA" })
    }

    const result = JSON.parse(match[1] ?? match[0])

    const VALID_CATEGORIES = ['courriers', 'factures', 'identite', 'autres']
    const raw = (result.categorie ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    const ALIASES = {
      courrier: 'courriers', facture: 'factures',
      identite: 'identite', identité: 'identite',
      autre: 'autres', contrat: 'courriers',
      salaire: 'factures', impot: 'factures', impôt: 'factures',
    }
    result.categorie = VALID_CATEGORIES.includes(raw) ? raw : (ALIASES[raw] ?? 'autres')

    if (result.date_limite) {
      const diff = (new Date(result.date_limite).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      result.urgence = diff >= 0 && diff < 7
    } else {
      result.urgence = false
    }

    return res.status(200).json(result)
  } catch (err) {
    console.error('[Serverless] Erreur:', err)
    return res.status(500).json({ error: err.message })
  }
}
