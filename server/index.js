import 'dotenv/config'
import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))

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

app.post('/api/analyze', async (req, res) => {
  const { text } = req.body

  if (!text || text.trim().length < 10) {
    return res.status(400).json({ error: 'Texte trop court pour être analysé' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurée dans .env' })
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
      return res.status(500).json({ error: 'Réponse inattendue de l\'IA' })
    }

    const result = JSON.parse(match[1] ?? match[0])

    // Normalise la catégorie — l'IA retourne parfois des valeurs hors contrainte DB
    const VALID_CATEGORIES = ['courriers', 'factures', 'identite', 'autres']
    const raw = (result.categorie ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    const ALIASES = { courrier: 'courriers', facture: 'factures', identité: 'identite', identite: 'identite', autre: 'autres', contrat: 'courriers', salaire: 'factures', impot: 'factures', impôt: 'factures' }
    result.categorie = VALID_CATEGORIES.includes(raw) ? raw : (ALIASES[raw] ?? 'autres')

    if (result.date_limite) {
      const deadline = new Date(result.date_limite)
      const now = new Date()
      const diff = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      result.urgence = diff >= 0 && diff < 7
    } else {
      result.urgence = false
    }

    res.json(result)
  } catch (err) {
    console.error('[Serveur] Erreur:', err)
    res.status(500).json({ error: err.message })
  }
})

app.listen(3001, () => {
  console.log('Serveur Dokio API : http://localhost:3001')
})
