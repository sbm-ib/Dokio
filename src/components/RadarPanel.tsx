import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Radar as RadarIcon, TrendingUp, TrendingDown, Calendar,
  ChevronDown, ChevronUp, Bell, Link2,
} from 'lucide-react'
import { getDocLabel } from '../lib/utils'
import type { Document, RadarAction, RadarAnticipation, RadarArgent, RadarConnexion, RadarData } from '../types'

const URGENCE_STYLES: Record<RadarAction['urgence'], string> = {
  haute: 'bg-danger-light text-danger',
  moyenne: 'bg-warning-light text-warning',
  basse: 'bg-gray-100 text-gray-500',
}

const URGENCE_BORDER: Record<RadarAction['urgence'], string> = {
  haute: 'border-l-danger',
  moyenne: 'border-l-warning',
  basse: 'border-l-gray-300',
}

const URGENCE_LABELS: Record<RadarAction['urgence'], string> = {
  haute: 'Haute urgence',
  moyenne: 'Urgence moyenne',
  basse: 'Basse urgence',
}

function ArgentCard({ label, argent, tone }: { label: string; argent: RadarArgent; tone: 'in' | 'out' }) {
  const color = tone === 'in' ? 'text-success' : 'text-danger'
  const bg = tone === 'in' ? 'bg-success-light' : 'bg-danger-light'
  const Icon = tone === 'in' ? TrendingUp : TrendingDown
  return (
    <div className={`rounded-2xl p-5 ${bg} min-w-0`}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={14} className={color} />
        <p className={`text-xs font-bold uppercase tracking-wide ${color}`}>{label}</p>
      </div>
      <p className={`text-4xl font-extrabold ${color} truncate`}>
        {argent.total_estime_eur.toLocaleString('fr-BE')} €
      </p>
      {argent.details.length > 0 && (
        <ul className="mt-3 pt-3 border-t border-black/5 space-y-2">
          {argent.details.map((d, i) => (
            <li key={i} className="text-sm text-slate-600 flex justify-between gap-2">
              <span className="truncate">{d.libelle}</span>
              <span className="shrink-0 font-medium text-slate-700">{d.montant_eur} €</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CompactActionCard({ action }: { action: RadarAction }) {
  return (
    <div className="rounded-xl border border-gray-100 p-3">
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-sm font-semibold text-gray-900">{action.titre}</p>
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${URGENCE_STYLES[action.urgence]}`}>
          {action.urgence}
        </span>
      </div>
      <p className="text-xs text-gray-500">{action.pourquoi}</p>
      {action.echeance && (
        <p className="text-xs text-gray-400 mt-1">Échéance : {action.echeance}</p>
      )}
    </div>
  )
}

function NextActionSection({ actions }: { actions: RadarAction[] }) {
  const [expanded, setExpanded] = useState(false)
  const [next, ...rest] = actions

  return (
    <div>
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Prochaine action</p>
      <div className={`bg-white border border-gray-100 border-l-4 rounded-2xl p-5 ${URGENCE_BORDER[next.urgence]}`}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${URGENCE_STYLES[next.urgence]}`}>
            {URGENCE_LABELS[next.urgence]}
          </span>
          {next.echeance && (
            <span className="flex items-center gap-1 text-xs text-gray-500 font-medium shrink-0">
              <Calendar size={12} />
              {next.echeance}
            </span>
          )}
        </div>
        <p className="text-lg font-bold text-gray-900 leading-snug mb-1">{next.titre}</p>
        <p className="text-sm text-gray-500">{next.pourquoi}</p>
      </div>

      {rest.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center justify-center gap-1.5 text-sm font-medium text-paperliss hover:underline py-1"
          >
            {expanded ? 'Masquer' : `Voir les ${rest.length} autre${rest.length > 1 ? 's' : ''} action${rest.length > 1 ? 's' : ''}`}
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {expanded && (
            <div className="space-y-2 mt-2">
              {rest.map((a, i) => <CompactActionCard key={i} action={a} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AnticipationCard({ anticipation }: { anticipation: RadarAnticipation }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-full bg-paperliss-light flex items-center justify-center shrink-0">
          <Bell size={13} className="text-paperliss" />
        </div>
        <p className="text-sm font-bold text-gray-900 leading-snug">{anticipation.attendu}</p>
      </div>
      <p className="text-xs text-gray-500 mb-1">{anticipation.quand}</p>
      <p className="text-xs text-gray-400">Sinon : {anticipation.si_rien_alors}</p>
    </div>
  )
}

function PlaceholderActionCard() {
  return (
    <div className="rounded-xl border border-gray-100 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="h-3.5 bg-gray-200 rounded w-2/3" />
        <div className="h-4 bg-gray-200 rounded-full w-14 shrink-0" />
      </div>
      <div className="h-3 bg-gray-100 rounded w-full mb-1.5" />
      <div className="h-3 bg-gray-100 rounded w-4/5" />
    </div>
  )
}

function PlaceholderAnticipationCard() {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-full bg-gray-100 shrink-0" />
        <div className="h-3.5 bg-gray-200 rounded w-3/4" />
      </div>
      <div className="h-3 bg-gray-100 rounded w-full mb-1.5" />
      <div className="h-3 bg-gray-100 rounded w-2/3" />
    </div>
  )
}

function PlaceholderConnexionCard() {
  return (
    <div className="bg-paperliss-light border-l-4 border-paperliss rounded-2xl p-4">
      <div className="flex gap-1.5 mb-2">
        <div className="h-5 bg-white/70 rounded-full w-20" />
        <div className="h-5 bg-white/70 rounded-full w-20" />
      </div>
      <div className="h-3 bg-white/50 rounded w-full mb-1.5" />
      <div className="h-3 bg-white/50 rounded w-3/4" />
    </div>
  )
}

const CONNEXION_PREVIEW_COUNT = 3

function ConnexionDocChip({ id, docsById }: { id: string; docsById: Map<string, Document> }) {
  const navigate = useNavigate()
  const doc = docsById.get(id)
  const label = doc ? getDocLabel(doc) : 'Document'

  return (
    <button
      onClick={() => navigate(`/documents?doc=${id}`)}
      className="bg-white/70 hover:bg-white text-paperliss text-xs font-medium px-2 py-0.5 rounded-full truncate max-w-[160px] transition-colors"
      title={label}
    >
      {label}
    </button>
  )
}

function ConnexionCard({ connexion, docsById }: { connexion: RadarConnexion; docsById: Map<string, Document> }) {
  const [expanded, setExpanded] = useState(false)
  const visibleIds = expanded ? connexion.documents : connexion.documents.slice(0, CONNEXION_PREVIEW_COUNT)
  const hiddenCount = connexion.documents.length - visibleIds.length

  return (
    <div className="bg-paperliss-light border-l-4 border-paperliss rounded-2xl p-4">
      {connexion.documents.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {visibleIds.map((id, i) => (
            <span key={id} className="inline-flex items-center gap-1">
              <ConnexionDocChip id={id} docsById={docsById} />
              {i < visibleIds.length - 1 && <Link2 size={11} className="text-paperliss shrink-0" />}
            </span>
          ))}
          {hiddenCount > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="text-xs font-semibold text-paperliss hover:underline px-1"
            >
              + {hiddenCount} autre{hiddenCount > 1 ? 's' : ''}
            </button>
          )}
          {expanded && connexion.documents.length > CONNEXION_PREVIEW_COUNT && (
            <button
              onClick={() => setExpanded(false)}
              className="text-xs font-semibold text-paperliss hover:underline px-1"
            >
              Réduire
            </button>
          )}
        </div>
      )}
      <p className="text-sm text-gray-700 leading-snug">{connexion.lien}</p>
    </div>
  )
}

interface Props {
  data: RadarData | null
  loading: boolean
  error: string | null
  documents: Document[]
  onUpgradeClick: () => void
}

export default function RadarPanel({ data, loading, error, documents, onUpgradeClick }: Props) {
  const docsById = useMemo(() => new Map(documents.map(d => [d.id, d])), [documents])

  if (documents.length === 0) return null

  const hasContent = !!data && (
    data.resume_situation ||
    data.actions_semaine.length > 0 ||
    data.argent_qui_rentre.total_estime_eur > 0 ||
    data.argent_en_danger.total_estime_eur > 0
  )

  const locked = !!data?.locked_counts
  const lockedCounts = data?.locked_counts
  const hasLockedContent = !!lockedCounts && (
    lockedCounts.actions_semaine > 0 || lockedCounts.anticipations > 0 || lockedCounts.connexions > 0
  )

  const hasDetails = !!data && (
    data.actions_semaine.length > 0 || data.anticipations.length > 0 || data.connexions.length > 0 || hasLockedContent
  )

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6 mb-8">
      <div className="flex items-center gap-2 mb-4">
        <RadarIcon size={18} className="text-paperliss" />
        <h2 className="font-bold text-gray-900">Radar</h2>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
          <div className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
        </div>
      ) : error ? (
        <p className="text-sm text-danger text-center py-6">
          Le Radar n'a pas pu analyser tes documents ({error}). Réessaie un peu plus tard.
        </p>
      ) : hasContent && data ? (
        <div className="space-y-6">
          {data.resume_situation && (
            <p className="text-sm text-gray-600">{data.resume_situation}</p>
          )}

          {(data.argent_qui_rentre.total_estime_eur > 0 || data.argent_en_danger.total_estime_eur > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ArgentCard label="Argent qui rentre" argent={data.argent_qui_rentre} tone="in" />
              <ArgentCard label="Argent en danger" argent={data.argent_en_danger} tone="out" />
            </div>
          )}

          {hasDetails && (
            !locked ? (
              <div className="space-y-6">
                {data.actions_semaine.length > 0 && <NextActionSection actions={data.actions_semaine} />}

                {data.anticipations.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">À anticiper</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {data.anticipations.map((a, i) => <AnticipationCard key={i} anticipation={a} />)}
                    </div>
                  </div>
                )}

                {data.connexions.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Link2 size={13} />
                      Connexions entre documents
                    </p>
                    <div className="space-y-3">
                      {data.connexions.map((c, i) => <ConnexionCard key={i} connexion={c} docsById={docsById} />)}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="relative">
                <div className="space-y-6 blur-sm pointer-events-none select-none">
                  {(lockedCounts?.actions_semaine ?? 0) > 0 && (
                    <div className="space-y-2">
                      {Array.from({ length: Math.min(lockedCounts!.actions_semaine, 3) }).map((_, i) => (
                        <PlaceholderActionCard key={i} />
                      ))}
                    </div>
                  )}
                  {(lockedCounts?.anticipations ?? 0) > 0 && (
                    <div className="grid sm:grid-cols-2 gap-3">
                      {Array.from({ length: Math.min(lockedCounts!.anticipations, 4) }).map((_, i) => (
                        <PlaceholderAnticipationCard key={i} />
                      ))}
                    </div>
                  )}
                  {(lockedCounts?.connexions ?? 0) > 0 && (
                    <div className="space-y-3">
                      {Array.from({ length: Math.min(lockedCounts!.connexions, 2) }).map((_, i) => (
                        <PlaceholderConnexionCard key={i} />
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={onUpgradeClick}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <span className="bg-paperliss hover:bg-paperliss-dark text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-lg transition-colors">
                    Passe Premium pour voir tes actions, anticipations et connexions
                  </span>
                </button>
              </div>
            )
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-400 text-center py-6">Rien à signaler pour l'instant.</p>
      )}
    </div>
  )
}
