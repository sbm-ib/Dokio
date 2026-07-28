import { getSupabaseAdmin } from './supabase-admin.js'

/**
 * Lit le header "Authorization: Bearer <token>" envoyé par le client,
 * vérifie ce token auprès de Supabase Auth, et renvoie l'id de
 * l'utilisateur authentifié. Lève une erreur si le token est absent,
 * mal formé ou invalide — à l'appelant de répondre 401.
 */
export async function getAuthenticatedUserId(req: any): Promise<string> {
  const header = req.headers?.authorization ?? req.headers?.Authorization
  const token = typeof header === 'string' && header.startsWith('Bearer ')
    ? header.slice('Bearer '.length).trim()
    : undefined

  if (!token) {
    throw new Error('Authentification requise')
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data?.user) {
    throw new Error('Token invalide ou expiré')
  }

  return data.user.id
}
