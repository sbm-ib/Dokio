// Fonction de TEST — rappels par email pour les courriers dont l'échéance
// (celle du document source) tombe dans 7 jours ou demain.
//
// Mode test : tous les emails partent vers TEST_EMAIL, jamais vers l'adresse
// réelle de l'utilisateur. C'est une contrainte de Resend en gratuit : sans
// domaine vérifié, on ne peut envoyer qu'à sa propre adresse (celle du compte
// Resend). Pour passer en vrai envoi plus tard, il suffira de remplacer
// "to: testEmail" par l'email réel une fois un domaine vérifié sur Resend.
//
// Déclenchement : protégé par le header "x-cron-secret" (même mécanisme que
// api/send-push.ts) — plus question d'ouvrir l'URL dans le navigateur, il
// faut envoyer ce header (voir requête curl dans le README / vos notes de
// déploiement).

import { Resend } from 'resend'
import { getSupabaseAdmin } from '../lib/supabase-admin.js'

// Renvoie la date d'aujourd'hui + N jours, au format YYYY-MM-DD (le même
// format que la colonne "date" de Supabase, pour pouvoir comparer directement).
function dansNJours(nombreDeJours: number): string {
  const date = new Date()
  date.setDate(date.getDate() + nombreDeJours)
  return date.toISOString().slice(0, 10)
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  const secret = req.headers['x-cron-secret']
  if (secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const resendApiKey = process.env.RESEND_API_KEY
  const testEmail = process.env.TEST_EMAIL
  if (!resendApiKey || !testEmail) {
    res.status(500).json({ error: 'RESEND_API_KEY ou TEST_EMAIL manquant(e) sur Vercel' })
    return
  }

  try {
    const supabase = getSupabaseAdmin()
    const resend = new Resend(resendApiKey)

    const dateDans7Jours = dansNJours(7)
    const dateDemain = dansNJours(1)

    // On récupère tous les courriers qui ont un document source, en
    // demandant à Supabase d'embarquer directement la date d'échéance de ce
    // document (grâce à la relation courriers.document_id -> documents.id).
    const { data: courriers, error } = await supabase
      .from('courriers')
      .select('id, objet, destinataire, user_id, document_id, documents(date_limite)')
      .not('document_id', 'is', null)

    if (error) throw error

    // Filtrage en mémoire : on ne garde que les échéances qui tombent pile
    // dans 7 jours ou pile demain.
    const aRappeler = (courriers ?? []).filter((c: any) => {
      const echeance = c.documents?.date_limite
      return echeance === dateDans7Jours || echeance === dateDemain
    })

    let nombreEmailsEnvoyes = 0

    for (const courrier of aRappeler as any[]) {
      const echeance: string = courrier.documents.date_limite

      // L'email réel n'est pas dans notre table "profiles" — il faut le
      // demander à l'API d'authentification de Supabase. On ne s'en sert que
      // dans le corps de l'email de test (visible seulement par toi, sur
      // TEST_EMAIL) — jamais pour l'envoi réel, et jamais renvoyé dans la
      // réponse JSON de cette route.
      const { data: userData } = await supabase.auth.admin.getUserById(courrier.user_id)
      const emailReel = userData?.user?.email ?? null

      await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: testEmail,
        subject: `[TEST] Rappel d'échéance le ${echeance} — ${courrier.objet ?? 'votre courrier'}`,
        text: [
          'Ceci est un email de test (mode développement).',
          '',
          `Courrier : ${courrier.objet ?? '(sans objet)'}`,
          `Destinataire du courrier : ${courrier.destinataire ?? '-'}`,
          `Échéance du document source : ${echeance}`,
          '',
          `En production, ce rappel serait envoyé à : ${emailReel ?? 'adresse inconnue'}`,
        ].join('\n'),
      })

      nombreEmailsEnvoyes++
    }

    res.status(200).json({
      mode: 'test',
      tous_les_emails_envoyes_a: testEmail,
      nombre_emails_envoyes: nombreEmailsEnvoyes,
    })
  } catch (err: any) {
    console.error('[send-reminders] Erreur:', err)
    res.status(500).json({ error: err?.message ?? 'Erreur interne' })
  }
}
