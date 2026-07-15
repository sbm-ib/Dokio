import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import type { Profile } from '../types'

// Limites côté client — purement pour l'affichage (compteur, désactivation
// du bouton). La vraie limite est appliquée côté serveur (api/analyze.ts,
// api/generate-letter.ts) ; ces valeurs doivent juste rester synchronisées
// avec les USAGE_CONFIG de ces fichiers.
const SCAN_LIMITS: Record<Profile['plan'], number> = {
  gratuit: 5,
  premium: 100,
}

const COURRIER_LIMITS: Record<Profile['plan'], number> = {
  gratuit: 1,
  premium: 30,
}

function remainingFor(count: number, resetDate: string | null, limit: number): number {
  const now = new Date()
  const reset = resetDate ? new Date(resetDate) : null
  if (!reset || now >= reset) return limit
  return Math.max(0, limit - count)
}

export function useProfile() {
  const { profile, refreshProfile } = useAuth()

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!profile) return
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: profile.id, ...updates, updated_at: new Date().toISOString() })
    if (error) {
      console.error('[Supabase] updateProfile error:', error)
      throw error
    }
    await refreshProfile()
  }

  const canAnalyze = (): boolean => {
    if (!profile) return false
    return remainingFor(profile.analyses_count ?? 0, profile.analyses_reset_date, SCAN_LIMITS[profile.plan]) > 0
  }

  const remainingAnalyses = (): number => {
    if (!profile) return 0
    return remainingFor(profile.analyses_count ?? 0, profile.analyses_reset_date, SCAN_LIMITS[profile.plan])
  }

  const canGenerateLetter = (): boolean => {
    if (!profile) return false
    return remainingFor(profile.courriers_count ?? 0, profile.courriers_reset_date, COURRIER_LIMITS[profile.plan]) > 0
  }

  const remainingCourriers = (): number => {
    if (!profile) return 0
    return remainingFor(profile.courriers_count ?? 0, profile.courriers_reset_date, COURRIER_LIMITS[profile.plan])
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

  return {
    profile, updateProfile,
    canAnalyze, remainingAnalyses,
    canGenerateLetter, remainingCourriers,
    deleteAllData,
  }
}
