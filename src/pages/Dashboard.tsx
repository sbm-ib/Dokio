import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, AlertTriangle, Calendar, Plus, ChevronRight, Clock, FolderOpen, Star } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useDocuments } from '../hooks/useDocuments'
import { useRadar } from '../hooks/useRadar'
import UpgradeModal from '../components/UpgradeModal'
import RadarPanel from '../components/RadarPanel'
import {
  CATEGORIE_LABELS, CATEGORIE_COLORS, STATUT_COLORS, STATUT_LABELS,
  getDaysUntil, deadlineColor, deadlineBg, formatDate, formatDateShort, getDocLabel,
} from '../lib/utils'

export default function Dashboard() {
  const { profile } = useAuth()
  const { documents, loading, thisMonthDeadlines, urgentCount, upcomingDeadlines, recentDocuments } = useDocuments()
  const { data: radarData, loading: radarLoading, error: radarError } = useRadar(documents.length)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const navigate = useNavigate()

  const prenom = profile?.prenom ?? 'toi'
  const isPremium = profile?.plan === 'premium'

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          Bonjour {prenom} 👋
          {isPremium && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-warning bg-warning-light px-2 py-1 rounded-full">
              <Star size={12} className="fill-warning" />
              Premium
            </span>
          )}
        </h1>
        <p className="text-gray-500 mt-1">Voici un aperçu de ta situation administrative.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          icon={<FolderOpen size={20} className="text-paperliss" />}
          bg="bg-paperliss-light"
          label="Documents total"
          value={loading ? '—' : documents.length}
        />
        <StatCard
          icon={<Calendar size={20} className="text-warning" />}
          bg="bg-warning-light"
          label="Échéances ce mois"
          value={loading ? '—' : thisMonthDeadlines}
        />
        <StatCard
          icon={<AlertTriangle size={20} className="text-danger" />}
          bg="bg-danger-light"
          label="Documents urgents"
          value={loading ? '—' : urgentCount}
          alert={urgentCount > 0}
        />
      </div>

      {/* Radar */}
      <RadarPanel
        data={radarData}
        loading={radarLoading}
        error={radarError}
        documents={documents}
        onUpgradeClick={() => setShowUpgrade(true)}
      />

      {showUpgrade && (
        <UpgradeModal
          onClose={() => setShowUpgrade(false)}
          badgeLabel="Radar"
          title="Débloque toutes tes actions"
          description="Le plan gratuit montre les montants, mais les actions, anticipations et connexions entre documents sont réservées à Premium."
        />
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Documents récents */}
        <div className="lg:col-span-2 min-w-0">
          <div className="bg-white rounded-2xl shadow-sm p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Documents récents</h2>
              <button
                onClick={() => navigate('/documents')}
                className="text-sm text-paperliss hover:underline flex items-center gap-1 shrink-0"
              >
                Voir tout <ChevronRight size={14} />
              </button>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : recentDocuments.length === 0 ? (
              <EmptyState onScan={() => navigate('/scanner')} />
            ) : (
              <div className="space-y-2">
                {recentDocuments.map(doc => (
                  <div
                    key={doc.id}
                    className="document-item flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => navigate('/documents')}
                  >
                    <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <FileText size={16} className="text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p className="text-sm font-medium text-gray-900 truncate">{getDocLabel(doc)}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {CATEGORIE_LABELS[doc.categorie]} · {formatDateShort(doc.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {doc.urgence && (
                        <span className="text-xs bg-danger-light text-danger px-1.5 py-0.5 rounded-full font-medium">
                          Urgent
                        </span>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUT_COLORS[doc.statut]}`}>
                        {STATUT_LABELS[doc.statut]}
                      </span>
                      <span className={`hidden sm:inline text-xs px-1.5 py-0.5 rounded-full font-medium ${CATEGORIE_COLORS[doc.categorie]}`}>
                        {CATEGORIE_LABELS[doc.categorie]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Prochaines deadlines */}
        <div className="min-w-0">
          <div className="bg-white rounded-2xl shadow-sm p-4 overflow-hidden">
            <h2 className="font-bold text-gray-900 mb-4">Prochaines échéances</h2>

            {loading ? (
              <div className="space-y-3">
                {[1, 2].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
              </div>
            ) : upcomingDeadlines.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Aucune échéance à venir</p>
            ) : (
              <div className="space-y-3">
                {upcomingDeadlines.map(doc => {
                  const days = getDaysUntil(doc.date_limite!)
                  // Les fonds bg-danger-light/warning-light/success-light restent clairs
                  // même en mode sombre (pas de variante dark définie) — le texte doit
                  // donc rester foncé dans les deux thèmes pour cette carte-là.
                  // Au-delà de 30 jours, deadlineBg() retombe sur bg-gray-50, qui lui
                  // suit bien le thème sombre — donc pas de couleur figée dans ce cas.
                  const isTinted = days <= 30
                  return (
                    <div key={doc.id} className={`rounded-xl border p-3 overflow-hidden ${deadlineBg(days)}`}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className={`text-sm font-semibold leading-snug truncate min-w-0 ${isTinted ? 'text-slate-900' : 'text-gray-900'}`}>
                          {getDocLabel(doc)}
                        </p>
                        <span className={`text-xs font-bold shrink-0 ${deadlineColor(days)}`}>
                          {days === 0 ? "Auj." : days < 0 ? 'Passée' : `J-${days}`}
                        </span>
                      </div>
                      <div className={`flex items-center gap-1 text-xs ${isTinted ? 'text-slate-500' : 'text-gray-500'}`}>
                        <Clock size={11} />
                        {formatDate(doc.date_limite!)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FAB scanner */}
      <button
        onClick={() => navigate('/scanner')}
        className="fixed bottom-6 right-6 bg-paperliss hover:bg-paperliss-dark text-white w-14 h-14 rounded-full shadow-xl shadow-paperliss/30 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        title="Scanner un document"
      >
        <Plus size={26} />
      </button>
    </div>
  )
}

function StatCard({
  icon, bg, label, value, alert = false,
}: {
  icon: React.ReactNode
  bg: string
  label: string
  value: number | string
  alert?: boolean
}) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm p-5 flex items-center gap-4 ${alert && Number(value) > 0 ? 'ring-2 ring-danger/30' : ''}`}>
      <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500 truncate">{label}</p>
      </div>
    </div>
  )
}

function EmptyState({ onScan }: { onScan: () => void }) {
  return (
    <div className="text-center py-10">
      <div className="w-14 h-14 bg-paperliss-light rounded-2xl flex items-center justify-center mx-auto mb-3">
        <FileText size={24} className="text-paperliss" />
      </div>
      <p className="text-gray-500 text-sm mb-4">Aucun document pour l'instant</p>
      <button
        onClick={onScan}
        className="bg-paperliss hover:bg-paperliss-dark text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
      >
        Scanner mon premier document
      </button>
    </div>
  )
}
