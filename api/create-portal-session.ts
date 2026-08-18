import Stripe from 'stripe'
import { getAuthenticatedUserId } from '../lib/auth.js'
import { getSupabaseAdmin } from '../lib/supabase-admin.js'

export default async function handler(req: any, res: any): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return }

  let userId: string
  try {
    userId = await getAuthenticatedUserId(req)
  } catch (err: any) {
    res.status(401).json({ error: err?.message ?? 'Authentification requise' })
    return
  }

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    res.status(500).json({ error: 'Stripe non configuré sur le serveur' })
    return
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data: profileRow, error: profileErr } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single()

    if (profileErr || !profileRow?.stripe_customer_id) {
      res.status(404).json({ error: 'Aucun abonnement Stripe associé à ce compte' })
      return
    }

    const customerId: string = profileRow.stripe_customer_id

    const stripe = new Stripe(secretKey)
    const origin = req.headers.origin ?? `https://${req.headers.host}`

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/profil`,
    })

    res.status(200).json({ url: session.url })
  } catch (err: any) {
    console.error('[create-portal-session] Erreur:', err)
    res.status(500).json({ error: err?.message ?? 'Erreur interne' })
  }
}
