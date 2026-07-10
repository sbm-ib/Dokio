import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
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

    fetch('/api/radar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    })
      .then(async res => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? `Erreur serveur ${res.status}`)
        return body
      })
      .then(body => { if (!cancelled) setData(body.data ?? null) })
      .catch(err => {
        console.error('[useRadar] error:', err)
        if (!cancelled) setError(err?.message ?? 'Erreur inconnue')
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [user, documentsCount])

  return { data, loading, error }
}
