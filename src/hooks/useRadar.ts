import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { getAuthHeader } from '../lib/supabase'
import type { RadarData } from '../types'

export function useRadar(documentsCount: number) {
  const { user } = useAuth()
  const [data, setData] = useState<RadarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user || documentsCount === 0) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    getAuthHeader()
      .then(authHeader => fetch('/api/radar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({}),
      }))
      .then(async res => {
        // DEBUG TEMPORAIRE : on lit le texte brut avant tout parsing, pour ne
        // jamais avaler une réponse inattendue en silence (à retirer une fois
        // le Radar stabilisé).
        const text = await res.text()

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} — ${text.slice(0, 400)}`)
        }

        let body: any
        try {
          body = JSON.parse(text)
        } catch {
          throw new Error(`HTTP ${res.status} mais réponse non-JSON — ${text.slice(0, 400)}`)
        }

        if (!body || typeof body.data === 'undefined') {
          throw new Error(`HTTP ${res.status} — champ "data" absent de la réponse : ${text.slice(0, 400)}`)
        }

        return body
      })
      .then(body => { if (!cancelled) setData(body.data) })
      .catch(err => {
        console.error('[useRadar] error:', err)
        if (!cancelled) setError(err?.message ?? 'Erreur inconnue')
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [user, documentsCount])

  return { data, loading, error }
}
