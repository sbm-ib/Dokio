import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import type { Profile } from '../types'

export function useProfile() {
  const { profile, refreshProfile } = useAuth()

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!profile) return
    const { error } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', profile.id)
    if (error) throw error
    await refreshProfile()
  }

  const canAnalyze = (): boolean => {
    if (!profile) return false
    if (profile.plan !== 'gratuit') return true
    const now = new Date()
    const resetDate = profile.analyses_reset_date ? new Date(profile.analyses_reset_date) : null
    if (!resetDate || now >= resetDate) return true
    return (profile.analyses_count ?? 0) < 3
  }

  const remainingAnalyses = (): number => {
    if (!profile || profile.plan !== 'gratuit') return Infinity
    const now = new Date()
    const resetDate = profile.analyses_reset_date ? new Date(profile.analyses_reset_date) : null
    if (!resetDate || now >= resetDate) return 3
    return Math.max(0, 3 - (profile.analyses_count ?? 0))
  }

  const incrementAnalysisCount = async () => {
    if (!profile || profile.plan !== 'gratuit') return
    const now = new Date()
    const resetDate = profile.analyses_reset_date ? new Date(profile.analyses_reset_date) : null

    let newCount = (profile.analyses_count ?? 0) + 1
    let newResetDate = profile.analyses_reset_date

    if (!resetDate || now >= resetDate) {
      newCount = 1
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      newResetDate = next.toISOString()
    }

    await supabase
      .from('profiles')
      .update({ analyses_count: newCount, analyses_reset_date: newResetDate })
      .eq('id', profile.id)
    await refreshProfile()
  }

  const deleteAllData = async () => {
    if (!profile) return
    await supabase.from('rappels').delete().eq('user_id', profile.id)
    await supabase.from('documents').delete().eq('user_id', profile.id)
    const { data: files } = await supabase.storage.from('documents').list(profile.id)
    if (files?.length) {
      const paths = files.map(f => `${profile.id}/${f.name}`)
      await supabase.storage.from('documents').remove(paths)
    }
    await supabase.from('profiles').delete().eq('id', profile.id)
    await supabase.auth.signOut()
  }

  return { profile, updateProfile, canAnalyze, remainingAnalyses, incrementAnalysisCount, deleteAllData }
}
