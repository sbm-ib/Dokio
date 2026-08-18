import { getSupabaseAdmin } from './supabase-admin.js'

export interface AuthenticatedUser {
  id: string
  email: string | null
}

function extractBearerToken(req: any): string | undefined {
  const header = req.headers?.authorization ?? req.headers?.Authorization
  return typeof header === 'string' && header.startsWith('Bearer ')
    ? header.slice('Bearer '.length).trim()
    : undefined
}

/**
 * Lit le header "Authorization: Bearer <token>" envoyé par le client,
 * vérifie ce token auprès de Supabase Auth, et renvoie l'utilisateur
 * authentifié (id + email). Lève une erreur si le token est absent,
 * mal formé ou invalide — à l'appelant de répondre 401.
 */
export async function getAuthenticatedUser(req: any): Promise<AuthenticatedUser> {
  const token = extractBearerToken(req)

  if (!token) {
    throw new Error('Authentification requise')
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data?.user) {
    throw new Error('Token invalide ou expiré')
  }

  return { id: data.user.id, email: data.user.email ?? null }
}

/** Raccourci pour les endpoints qui n'ont besoin que de l'id utilisateur. */
export async function getAuthenticatedUserId(req: any): Promise<string> {
  const user = await getAuthenticatedUser(req)
  return user.id
}
