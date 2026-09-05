import type { Document, Profile } from '../types'

export type LetterType =
  | 'contestation'
  | 'reclamation'
  | 'demande_plan_paiement'
  | 'resiliation'
  | 'demande_information'
  | 'recours'
  | 'mise_en_demeure'
  | 'autre'

// Le type qui déclenche le champ de demande libre dans l'UI.
export const FREE_FORM_TYPE: LetterType = 'autre'

// Intitulés en langage courant — le type technique (à gauche) est celui
// envoyé à /api/generate-letter.ts, l'utilisateur ne voit que le label.
export const LETTER_TYPES: { value: LetterType; label: string }[] = [
  { value: 'contestation', label: "Je ne suis pas d'accord / je conteste" },
  { value: 'reclamation', label: 'Je réclame quelque chose qu\'on me doit' },
  { value: 'demande_plan_paiement', label: 'Je demande un délai ou un plan de paiement' },
  { value: 'resiliation', label: 'Je veux résilier / arrêter' },
  { value: 'demande_information', label: 'Je demande une information ou une explication' },
  { value: 'recours', label: 'Je fais un recours contre une décision' },
  { value: 'mise_en_demeure', label: 'Je mets en demeure (dernier recours avant action)' },
  { value: 'autre', label: 'Autre demande — je décris ma situation moi-même' },
]

const LETTER_TYPE_LABELS: Record<LetterType, string> = Object.fromEntries(
  LETTER_TYPES.map(t => [t.value, t.label]),
) as Record<LetterType, string>

// Tolérant : `type` vient parfois tel quel de la base (colonne text libre),
// donc pas forcément un LetterType valide — on retombe sur la valeur brute.
export function getLetterTypeLabel(type: string): string {
  return LETTER_TYPE_LABELS[type as LetterType] ?? type
}

export function buildExpediteur(profile: Profile | null, email: string) {
  const nom = [profile?.prenom, profile?.nom].filter(Boolean).join(' ') || '[Votre nom]'
  const adresse = profile?.adresse
    ? `${profile.adresse}, ${profile.code_postal ?? ''} ${profile.ville ?? ''}`.trim()
    : '[Votre adresse]'
  return { nom, adresse, email: email || '[Votre email]' }
}

/**
 * Classe les types de courrier du plus probable au moins probable pour CE
 * document, à partir de ce que l'IA a déjà déduit (catégorie, urgence,
 * mots-clés du résumé). Les 2-3 premiers servent de suggestions mises en
 * avant ; le reste de la liste (via LETTER_TYPES) couvre tous les cas.
 */
export function suggestLetterTypes(doc: Document): LetterType[] {
  const text = `${doc.explication_ia ?? ''} ${doc.action_recommandee ?? ''}`.toLowerCase()

  if (/décision|refus|rejet|rejeté/.test(text)) {
    return ['recours', 'demande_information', 'contestation']
  }
  if (/mise en demeure/.test(text)) {
    return ['contestation', 'demande_plan_paiement', 'reclamation']
  }
  if (/résiliat/.test(text)) {
    return ['resiliation', 'reclamation', 'demande_information']
  }
  if (doc.categorie === 'factures' && (doc.urgence || doc.montant_eur)) {
    return ['demande_plan_paiement', 'contestation', 'reclamation']
  }
  if (doc.categorie === 'identite') {
    return ['demande_information', 'reclamation', 'contestation']
  }
  return ['reclamation', 'demande_information', 'contestation']
}
