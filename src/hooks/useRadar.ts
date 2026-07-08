import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import type { RadarData } from '../types'

export function useRadar(documentsCount: number) {
  const { user } = useAuth()
  const [data, setData] = useState<RadarData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || documentsCount === 0) {
      setData(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    fetch('/api/radar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    })
      .then(res => res.json())
      .then(body => { if (!cancelled) setData(body.data ?? null) })
      .catch(err => console.error('[useRadar] error:', err))
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [user, documentsCount])

  return { data, loading }
}
