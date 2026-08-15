import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Header "Authorization: Bearer <token>" à joindre aux appels vers nos
 * routes /api qui doivent identifier l'utilisateur connecté.
 * Renvoie un objet vide si personne n'est connecté.
 */
export async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * URL temporaire (expire après `expiresInSeconds`) pour accéder à un fichier
 * du bucket privé "documents". Le bucket n'étant plus public, c'est le seul
 * moyen d'obtenir un lien de téléchargement — à régénérer à chaque usage,
 * jamais à réutiliser un lien stocké au-delà de sa durée de vie.
 */
export async function getSignedDocumentUrl(path: string, expiresInSeconds = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, expiresInSeconds)
  if (error) {
    console.error('[getSignedDocumentUrl] Erreur:', error)
    return null
  }
  return data.signedUrl
}
