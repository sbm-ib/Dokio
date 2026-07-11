import { getSupabaseAdmin } from '../lib/supabase-admin.js'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const secret = req.headers['x-cron-secret']
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const supabase = getSupabaseAdmin()
    // Fetch all profiles that have a push token
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, prenom, expo_push_token, notif_frequence, date_rappel_exacte')
      .not('expo_push_token', 'is', null)

    if (error) throw error

    const now = new Date()
    const messages: object[] = []

    for (const profile of profiles ?? []) {
      if (!profile.expo_push_token) continue

      let shouldSend = false
      let title = 'Dokio'
      let body = 'N\'oublie pas de vérifier tes documents administratifs.'

      // Check exact date reminder
      if (profile.date_rappel_exacte) {
        const reminderDate = new Date(profile.date_rappel_exacte)
        const diffMs = Math.abs(reminderDate.getTime() - now.getTime())
        if (diffMs < 60 * 60 * 1000) {
          shouldSend = true
          title = '⏰ Rappel Dokio'
          body = 'Tu avais prévu un rappel administratif maintenant.'
        }
      }

      // Check weekly reminder (every Monday at the configured hour)
      if (!shouldSend && profile.notif_frequence === 'hebdo' && now.getDay() === 1) {
        shouldSend = true
        title = '📋 Récap hebdomadaire Dokio'
        body = 'Consulte tes documents et deadlines de la semaine.'
      }

      if (shouldSend) {
        messages.push({
          to: profile.expo_push_token,
          title,
          body,
          sound: 'default',
          data: { screen: 'Accueil' },
        })
      }
    }

    if (messages.length === 0) {
      return res.status(200).json({ sent: 0, message: 'No notifications to send' })
    }

    // Send via Expo Push Service (no VAPID keys needed)
    const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(messages),
    })

    const expoData = await expoRes.json()
    return res.status(200).json({ sent: messages.length, expo: expoData })
  } catch (err: any) {
    console.error('[push] error:', err)
    return res.status(500).json({ error: err?.message ?? 'Internal error' })
  }
}
