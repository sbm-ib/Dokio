import { getSupabaseAdmin } from './supabase-admin.js'

export interface UsageConfig {
  countColumn: 'analyses_count' | 'courriers_count'
  resetColumn: 'analyses_reset_date' | 'courriers_reset_date'
  freeLimit: number
  premiumLimit: number
}

interface UsageStatus {
  allowed: boolean
  remaining: number
}

async function fetchProfileUsage(userId: string, config: UsageConfig) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('profiles')
    .select(`plan, ${config.countColumn}, ${config.resetColumn}`)
    .eq('id', userId)
    .single()

  if (error || !data) throw new Error('Profil introuvable pour la vérification de limite')
  return data as any
}

function isExpired(resetDate: string | null): boolean {
  if (!resetDate) return true
  return new Date() >= new Date(resetDate)
}

/** Lecture seule — à appeler AVANT l'appel Claude pour ne rien payer inutilement. */
export async function getUsageStatus(userId: string, config: UsageConfig): Promise<UsageStatus> {
  const profile = await fetchProfileUsage(userId, config)
  const limit = profile.plan === 'premium' ? config.premiumLimit : config.freeLimit
  const expired = isExpired(profile[config.resetColumn])
  const currentCount = expired ? 0 : (profile[config.countColumn] ?? 0)

  return {
    allowed: currentCount < limit,
    remaining: Math.max(0, limit - currentCount),
  }
}

/** Écrit le nouveau compteur — à appeler uniquement APRÈS un succès. */
export async function incrementUsage(userId: string, config: UsageConfig): Promise<void> {
  const supabase = getSupabaseAdmin()
  const profile = await fetchProfileUsage(userId, config)
  const expired = isExpired(profile[config.resetColumn])

  const now = new Date()
  const newCount = expired ? 1 : (profile[config.countColumn] ?? 0) + 1
  const newResetDate = expired
    ? new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
    : profile[config.resetColumn]

  await supabase
    .from('profiles')
    .update({ [config.countColumn]: newCount, [config.resetColumn]: newResetDate })
    .eq('id', userId)
}
