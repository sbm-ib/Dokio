import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import type { Courrier } from '../types'

export function useCourriers() {
  const { user } = useAuth()
  const [courriers, setCourriers] = useState<Courrier[]>([])
  const [loading, setLoading] = useState(true)

  const fetchCourriers = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('courriers')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (!error && data) setCourriers(data as Courrier[])
    setLoading(false)
  }, [user])

  useEffect(() => { fetchCourriers() }, [fetchCourriers])

  const deleteCourrier = async (id: string) => {
    await supabase.from('courriers').delete().eq('id', id)
    setCourriers(prev => prev.filter(c => c.id !== id))
  }

  const updateCourrier = async (id: string, updates: Partial<Courrier>) => {
    await supabase.from('courriers').update(updates).eq('id', id)
    setCourriers(prev => prev.map(c => (c.id === id ? { ...c, ...updates } : c)))
  }

  return { courriers, loading, fetchCourriers, deleteCourrier, updateCourrier }
}
