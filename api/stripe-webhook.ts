import Stripe from 'stripe'
import { getSupabaseAdmin } from '../lib/supabase-admin'

export const config = {
  api: {
    bodyParser: false,
  },
}

function readRawBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return }

  const secretKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secretKey || !webhookSecret) {
    res.status(500).json({ error: 'Stripe non configuré sur le serveur' })
    return
  }

  const stripe = new Stripe(secretKey)
  const signature = req.headers['stripe-signature']

  let event: Stripe.Event
  try {
    const rawBody = await readRawBody(req)
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err: any) {
    console.error('[stripe-webhook] Signature invalide:', err?.message)
    res.status(400).json({ error: `Webhook signature invalide: ${err?.message}` })
    return
  }

  try {
    const supabase = getSupabaseAdmin()

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.client_reference_id
        if (userId) {
          await supabase
            .from('profiles')
            .update({
              plan: 'premium',
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: session.subscription as string,
            })
            .eq('id', userId)
        }
        break
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string
        const isActive = subscription.status === 'active' || subscription.status === 'trialing'
        if (!isActive) {
          await supabase
            .from('profiles')
            .update({ plan: 'gratuit' })
            .eq('stripe_customer_id', customerId)
        }
        break
      }

      default:
        break
    }

    res.status(200).json({ received: true })
  } catch (err: any) {
    console.error('[stripe-webhook] Erreur traitement:', err)
    res.status(500).json({ error: err?.message ?? 'Erreur interne' })
  }
}
