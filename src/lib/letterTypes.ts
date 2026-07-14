import type { Document } from '../types'

export type LetterType =
  | 'contestation'
  | 'reclamation'
  | 'demande_plan_paiement'
  | 'resiliation'
  | 'demande_information'
  | 'recours'
  | 'mise_en_demeure'

export const LETTER_TYPES: { value: LetterType; label: string }[] = [
  { value: 'contestation', label: 'Contestation' },
  { value: 'reclamation', label: 'Réclamation' },
  { value: 'demande_plan_paiement', label: 'Demande de plan de paiement' },
  { value: 'resiliation', label: 'Résiliation' },
  { value: 'demande_information', label: "Demande d'information" },
  { value: 'recours', label: 'Recours' },
  { value: 'mise_en_demeure', label: 'Mise en demeure' },
]

/**
 * Devine le type de courrier le plus probable à partir du document analysé.
 * Simple point de départ pré-sélectionné — l'utilisateur peut toujours changer.
 */
export function guessLetterType(doc: Document): LetterType {
  const text = `${doc.explication_ia ?? ''} ${doc.action_recommandee ?? ''}`.toLowerCase()

  if (/décision|refus|rejet|rejeté/.test(text)) return 'recours'
  if (/mise en demeure/.test(text)) return 'contestation'
  if (/résiliat/.test(text)) return 'resiliation'

  if (doc.categorie === 'factures' && (doc.urgence || doc.montant_eur)) {
    return 'demande_plan_paiement'
  }

  if (doc.categorie === 'identite') return 'demande_information'

  return 'reclamation'
}
