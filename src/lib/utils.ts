import type { Document } from '../types'

export const CATEGORIE_LABELS: Record<Document['categorie'], string> = {
  courriers: 'Courriers',
  factures: 'Factures',
  identite: 'Identité',
  autres: 'Autres',
}

export const CATEGORIE_COLORS: Record<Document['categorie'], string> = {
  courriers: 'bg-blue-100 text-blue-700',
  factures:  'bg-orange-100 text-orange-700',
  identite:  'bg-purple-100 text-purple-700',
  autres:    'bg-gray-100 text-gray-600',
}

export const STATUT_LABELS: Record<Document['statut'], string> = {
  nouveau: 'Nouveau',
  traite:  'Traité',
  archive: 'Archivé',
}

export const STATUT_COLORS: Record<Document['statut'], string> = {
  nouveau: 'bg-paperliss-light text-paperliss',
  traite:  'bg-success-light text-success',
  archive: 'bg-gray-100 text-gray-500',
}

export function getDaysUntil(dateStr: string): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const deadline = new Date(dateStr)
  deadline.setHours(0, 0, 0, 0)
  return Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

export function deadlineColor(days: number): string {
  if (days <= 3) return 'text-danger'
  if (days <= 7) return 'text-warning'
  if (days <= 30) return 'text-success'
  return 'text-gray-500'
}

export function deadlineBg(days: number): string {
  if (days <= 3) return 'bg-danger-light border-danger/20'
  if (days <= 7) return 'bg-warning-light border-warning/20'
  if (days <= 30) return 'bg-success-light border-success/20'
  return 'bg-gray-50 border-gray-200'
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

export function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}
