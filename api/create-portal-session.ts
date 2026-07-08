import Stripe from 'stripe'

export default async function handler(req: any, res: any): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {})
  const customerId: string | undefined = body.customerId

  if (!customerId) {
    res.status(400).json({ error: 'customerId requis' })
    return
  }

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    res.status(500).json({ error: 'Stripe non configuré sur le serveur' })
    return
  }

  try {
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
