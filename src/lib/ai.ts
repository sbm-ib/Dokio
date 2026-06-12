import type { AIAnalysisResult } from '../types'

export async function analyzeDocument(anonymizedText: string): Promise<AIAnalysisResult> {
  let response: Response
  try {
    response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: anonymizedText }),
    })
  } catch {
    throw new Error('Impossible de joindre le serveur — vérifie ta connexion internet.')
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `Erreur ${response.status}` }))
    if (response.status === 401) throw new Error('Clé API Anthropic invalide')
    if (response.status === 429) throw new Error('Trop de requêtes — réessaie dans quelques secondes')
    throw new Error(body.error ?? `Erreur serveur ${response.status}`)
  }

  return response.json() as Promise<AIAnalysisResult>
}
