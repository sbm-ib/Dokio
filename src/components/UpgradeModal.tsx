import { useState } from 'react'
import { X, Zap, Check, Loader2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'

interface Props {
  onClose: () => void
  remaining?: number
  badgeLabel?: string
  title?: string
  description?: string
}

export default function UpgradeModal({
  onClose,
  remaining = 0,
  badgeLabel = 'Limite atteinte',
  title = 'Passe à Premium',
  description,
}: Props) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)

  const handleUpgrade = async () => {
    if (!user?.id || !user.email) return
    setLoading(true)
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, email: user.email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erreur serveur')
      window.location.href = data.url
    } catch (err) {
      console.error('[UpgradeModal] checkout error:', err)
      toast.error('Oups, impossible de lancer le paiement. Réessaie !')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <div className="flex justify-between items-start mb-5">
          <div>
            <div className="flex items-center gap-1.5 text-warning font-semibold text-sm mb-1">
              <Zap size={15} />
              {badgeLabel}
            </div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-600 mt-1">
              {description ?? (remaining === 0
                ? 'Tu as épuisé tes 5 analyses gratuites ce mois-ci.'
                : `Il te reste ${remaining} analyse(s) ce mois.`)}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        <div className="border-2 border-paperliss rounded-xl p-5 mb-4">
          <div className="flex justify-between items-center mb-4">
            <span className="font-bold text-paperliss text-lg">Premium</span>
            <div className="text-right">
              <span className="text-2xl font-extrabold text-paperliss">6,99 €</span>
              <span className="text-xs text-gray-400">/mois</span>
              <p className="text-xs text-gray-400">ou 59 €/an</p>
            </div>
          </div>
          <ul className="space-y-2 mb-5">
            {[
              'Analyses illimitées',
              'Radar complet (actions, anticipations, connexions)',
              'Rappels par email',
              'Tous les types de fichiers',
            ].map(f => (
              <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                <Check size={13} className="text-success shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full bg-paperliss hover:bg-paperliss-dark disabled:opacity-60 text-white text-center py-3 rounded-xl text-sm font-bold transition-colors min-h-[48px] flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={15} className="animate-spin" />}
            Passer à Premium — 6,99 €/mois
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full text-center text-sm text-gray-500 hover:text-gray-700 py-2"
        >
          Continuer avec le plan gratuit
        </button>
      </div>
    </div>
  )
}
