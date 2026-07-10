export interface Profile {
  id: string
  prenom: string | null
  nom: string | null
  adresse: string | null
  code_postal: string | null
  ville: string | null
  pays: 'belgique' | 'france'
  plan: 'gratuit' | 'premium'
  analyses_count: number
  analyses_reset_date: string | null
  notif_email: boolean
  notif_frequence: 'immediat' | 'hebdo' | 'jamais'
  heure_rappel: string
  jours_avant_rappel: number
  date_rappel_exacte: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  created_at: string
  updated_at: string
}

export interface Document {
  id: string
  user_id: string
  nom_fichier: string
  url_fichier: string | null
  texte_extrait: string | null
  categorie: 'courriers' | 'factures' | 'identite' | 'autres'
  statut: 'nouveau' | 'traite' | 'archive'
  date_limite: string | null
  urgence: boolean
  explication_ia: string | null
  action_recommandee: string | null
  organisme_detecte: string | null
  lien_officiel: string | null
  montant_eur: number | null
  created_at: string
}

export interface Rappel {
  id: string
  user_id: string
  document_id: string
  date_rappel: string
  message: string
  envoye: boolean
  created_at: string
}

export interface RadarArgentDetail {
  libelle: string
  montant_eur: number
  source?: string
  raison?: string
}

export interface RadarArgent {
  total_estime_eur: number
  details: RadarArgentDetail[]
}

export interface RadarAction {
  titre: string
  pourquoi: string
  urgence: 'haute' | 'moyenne' | 'basse'
  echeance: string | null
}

export interface RadarAnticipation {
  attendu: string
  quand: string
  si_rien_alors: string
}

export interface RadarConnexion {
  documents: string[]
  lien: string
}

export interface RadarData {
  argent_qui_rentre: RadarArgent
  argent_en_danger: RadarArgent
  actions_semaine: RadarAction[]
  anticipations: RadarAnticipation[]
  connexions: RadarConnexion[]
  resume_situation: string
}

export interface AIAnalysisResult {
  organisme: string
  categorie: Document['categorie']
  explication: string
  action_recommandee: string
  date_limite: string | null
  urgence: boolean
  lien_officiel: string | null
  montant_eur: number | null
}
