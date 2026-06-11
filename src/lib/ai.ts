import type { AIAnalysisResult } from '../types'

export async function analyzeDocument(anonymizedText: string): Promise<AIAnalysisResult> {
  const apiBase = `http://${window.location.hostname}:3001`
  const response = await fetch(`${apiBase}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: anonymizedText }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `Erreur ${response.status}` }))
    if (response.status === 401) throw new Error('Clé API Anthropic invalide')
    if (response.status === 429) throw new Error('Trop de requêtes — réessaie dans quelques secondes')
    throw new Error(body.error ?? `Erreur serveur ${response.status}`)
  }

  return response.json() as Promise<AIAnalysisResult>
}
