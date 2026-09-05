import type { Profile } from '../types'

// Intitulés en langage courant pour les types de courriers déjà enregistrés
// (colonne `type` de la table "courriers", texte libre) — affichés dans
// Courriers.tsx / CourrierDetailModal.tsx. Le chat (ChatCourrierModal) ne
// fait plus choisir de type explicitement : les lettres qu'il génère sont
// enregistrées avec le type générique "chat".
const LETTER_TYPE_LABELS: Record<string, string> = {
  contestation: "Je ne suis pas d'accord / je conteste",
  reclamation: 'Je réclame quelque chose qu\'on me doit',
  demande_plan_paiement: 'Je demande un délai ou un plan de paiement',
  resiliation: 'Je veux résilier / arrêter',
  demande_information: 'Je demande une information ou une explication',
  recours: 'Je fais un recours contre une décision',
  mise_en_demeure: 'Je mets en demeure (dernier recours avant action)',
  autre: 'Autre demande',
  chat: 'Courrier (chat)',
}

// Tolérant : `type` vient parfois tel quel de la base (colonne text libre),
// donc pas forcément une clé connue — on retombe sur la valeur brute.
export function getLetterTypeLabel(type: string): string {
  return LETTER_TYPE_LABELS[type] ?? type
}

export function buildExpediteur(profile: Profile | null, email: string) {
  const nom = [profile?.prenom, profile?.nom].filter(Boolean).join(' ') || '[Votre nom]'
  const adresse = profile?.adresse
    ? `${profile.adresse}, ${profile.code_postal ?? ''} ${profile.ville ?? ''}`.trim()
    : '[Votre adresse]'
  return { nom, adresse, email: email || '[Votre email]' }
}
