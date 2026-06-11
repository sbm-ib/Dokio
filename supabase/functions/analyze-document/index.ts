import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `Tu es un expert en administration belge et française. Analyse ce document administratif et réponds en JSON avec exactement ces champs :
{
  "organisme": "nom de l'organisme expéditeur (ex: SPF Finances, CPAS, Mutualité, ONSS, SPW, Commune de Bruxelles...)",
  "categorie": "une de : courriers/factures/identite/autres",
  "explication": "explication en 2-3 phrases maximum en langage simple et direct, comme si tu parlais à un ami. Commence par le plus important.",
  "action_recommandee": "que doit faire l'utilisateur concrètement ?",
  "date_limite": "date au format YYYY-MM-DD si trouvée, sinon null",
  "urgence": false,
  "lien_officiel": "URL vers le formulaire ou service officiel belge si applicable, sinon null"
}
Contexte belge : SPF Finances = impôts, CPAS = aide sociale (remplace CAF), Mutualité = assurance maladie (remplace CPAM), ONSS = cotisations sociales (remplace URSSAF), SPW = Wallonie, VDAB = emploi flamand, Actiris = emploi Bruxelles.
Les catégories : "courriers" = courriers officiels/admin généraux, "factures" = factures et relevés de compte, "identite" = documents d'identité et de situation, "autres" = tout le reste.
Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const { text } = await req.json()

    if (!text || text.trim().length < 10) {
      return new Response(
        JSON.stringify({ error: 'Texte trop court pour être analysé' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      )
    }

    // En prod Supabase : supabase secrets set GEMINI_API_KEY=...
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) throw new Error('GEMINI_API_KEY non configurée')

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: `Document à analyser :\n\n${text.slice(0, 8000)}` }] }],
          generationConfig: { maxOutputTokens: 1024 },
        }),
      },
    )

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`API Gemini : ${response.status} — ${err}`)
    }

    const gemini = await response.json()
    const content: string = gemini.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    const match = content.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Format de réponse inattendu')

    const result = JSON.parse(match[0])

    if (result.date_limite) {
      const deadline = new Date(result.date_limite)
      const now = new Date()
      const diff = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      result.urgence = diff >= 0 && diff < 7
    } else {
      result.urgence = false
    }

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }
})
