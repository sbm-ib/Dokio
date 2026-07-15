import { parseAiJson } from '../lib/parse-ai-json.js'

const SYSTEM_PROMPT = `Tu es un rédacteur administratif expert, spécialisé dans l'administration BELGE (Wallonie-Bruxelles). Tu rédiges des courriers formels, clairs et efficaces au nom de l'utilisateur.

On te donne :
- Les données d'un document administratif que l'utilisateur a reçu (organisme, montant, date limite, référence, résumé).
- Le TYPE de courrier qu'il veut envoyer.
- Ses coordonnées.
- Éventuellement, une "demande_libre" : l'utilisateur a décrit sa situation avec ses propres mots au lieu de choisir un type prédéfini.

Si "demande_libre" est fournie, c'est elle qui exprime l'INTENTION PRINCIPALE de la lettre — rédige pour y répondre précisément, tout en t'appuyant sur les données du document (organisme, montant, date, référence) pour que les faits cités soient exacts.

Rédige la lettre COMPLÈTE, prête à envoyer, déjà remplie avec les informations du document. N'invente JAMAIS de données : si une information manque (numéro de dossier, adresse exacte de l'organisme, ou un détail que la demande libre n'a pas précisé), insère un champ à compléter entre crochets, par exemple [Votre numéro de dossier].

Règles de rédaction :
- Ton formel, poli, mais ferme. Jamais agressif.
- Structure belge classique : coordonnées expéditeur, coordonnées destinataire, lieu et date, objet, corps, formule de politesse, signature.
- Cite précisément les éléments du document (montant exact, date, référence).
- Mentionne les délais légaux applicables quand c'est pertinent.
- Vocabulaire belge : CPAS, mutualité, ONSS, SPF Finances, Justice de Paix, Fédération Wallonie-Bruxelles, recommandé avec accusé de réception.
- Longueur : concis. Une page maximum.

Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ou après, sans balises Markdown. Format exact :

{
  "destinataire": string,
  "objet": string,
  "corps": string,
  "conseils_envoi": string,
  "champs_a_completer": [string]
}

- "corps" = la lettre complète, avec sauts de ligne, prête à copier.
- "conseils_envoi" = comment l'envoyer (ex : "Envoyer en recommandé avec accusé de réception avant le 18/07. Conservez une copie et la preuve d'envoi.").
- "champs_a_completer" = la liste des [crochets] que l'utilisateur doit remplir.`

const VALID_TYPES = [
  'contestation',
  'reclamation',
  'demande_plan_paiement',
  'resiliation',
  'demande_information',
  'recours',
  'mise_en_demeure',
  'autre',
]

const MIN_DEMANDE_LIBRE_LENGTH = 15

export default async function handler(req: any, res: any): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {})
  const document = body.document
  const typeCourrier: string | undefined = body.type_courrier
  const demandeLibre: string | undefined = typeof body.demande_libre === 'string' ? body.demande_libre.trim() : undefined
  const expediteur = body.expediteur

  if (!document || typeof document !== 'object') {
    res.status(400).json({ error: 'document requis' })
    return
  }
  if (!typeCourrier || !VALID_TYPES.includes(typeCourrier)) {
    res.status(400).json({ error: `type_courrier invalide. Valeurs acceptées : ${VALID_TYPES.join(', ')}` })
    return
  }
  if (typeCourrier === 'autre' && (!demandeLibre || demandeLibre.length < MIN_DEMANDE_LIBRE_LENGTH)) {
    res.status(400).json({ error: 'Décris ta demande avec un peu plus de détails avant de générer la lettre.' })
    return
  }
  if (!expediteur || typeof expediteur !== 'object') {
    res.status(400).json({ error: 'expediteur requis' })
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
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Document source, type de courrier demandé et coordonnées de l'expéditeur :\n\n${JSON.stringify({ document, type_courrier: typeCourrier, demande_libre: demandeLibre ?? null, expediteur })}`,
        }],
      }),
    })

    if (!upstream.ok) {
      const err = await upstream.text()
      console.error(`[generate-letter] Anthropic ${upstream.status}:`, err)
      res.status(upstream.status).json({ error: `Anthropic ${upstream.status}: ${err}` })
      return
    }

    const upstreamData: any = await upstream.json()
    const content: string = upstreamData?.content?.[0]?.text ?? ''

    let letter: unknown
    try {
      letter = parseAiJson(content)
    } catch (parseErr: any) {
      console.error('[generate-letter] Échec de parsing JSON. Réponse brute Claude:', content)
      res.status(500).json({ error: `Réponse IA invalide: ${parseErr?.message ?? parseErr}` })
      return
    }

    res.status(200).json({ data: letter })
  } catch (err: any) {
    console.error('[generate-letter] Erreur:', err)
    const cause = err?.cause?.message ?? err?.cause
    res.status(500).json({ error: `${err?.message ?? 'Erreur interne'}${cause ? ` — cause: ${cause}` : ''}` })
  }
}
