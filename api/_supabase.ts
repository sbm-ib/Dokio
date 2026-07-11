import { createClient } from '@supabase/supabase-js'

// Fichier utilitaire partagé — le préfixe "_" indique à Vercel de ne pas
// le traiter comme une route API.
export function getSupabaseAdmin() {
  const rawUrl = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!rawUrl || !key) {
    const missing = [
      !rawUrl && 'SUPABASE_URL',
      !key && 'SUPABASE_SERVICE_ROLE_KEY',
    ].filter(Boolean).join(', ')
    throw new Error(`Variables Supabase manquantes côté serveur : ${missing}`)
  }

  let url: string
  try {
    // .origin normalise l'URL (retire tout /rest/v1, slash final, espace
    // collé par erreur, etc.) — supabase-js attend l'URL du projet seule.
    url = new URL(rawUrl).origin
  } catch {
    throw new Error(`SUPABASE_URL invalide : "${rawUrl}"`)
  }

  return createClient(url, key)
}
