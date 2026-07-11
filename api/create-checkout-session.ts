import Stripe from 'stripe'

export default async function handler(req: any, res: any): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {})
  const userId: string | undefined = body.userId
  const email: string | undefined = body.email
  const interval: string = body.interval === 'year' ? 'year' : 'month'

  if (!userId || !email) {
    res.status(400).json({ error: 'userId et email requis' })
    return
  }

  const secretKey = process.env.STRIPE_SECRET_KEY
  const priceId = interval === 'year'
    ? process.env.STRIPE_PRICE_ID_YEARLY
    : process.env.STRIPE_PRICE_ID_MONTHLY
  if (!secretKey || !priceId) {
    res.status(500).json({ error: 'Stripe non configuré sur le serveur' })
    return
  }

  try {
    const stripe = new Stripe(secretKey)
    const origin = req.headers.origin ?? `https://${req.headers.host}`

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId,
      customer_email: email,
      success_url: `${origin}/profil?checkout=success`,
      cancel_url: `${origin}/profil?checkout=cancel`,
    })

    res.status(200).json({ url: session.url })
  } catch (err: any) {
    console.error('[create-checkout-session] Erreur:', err)
    res.status(500).json({ error: err?.message ?? 'Erreur interne' })
  }
}
