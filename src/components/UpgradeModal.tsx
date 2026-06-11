import { X, Zap, Check } from 'lucide-react'

const STRIPE_PREMIUM = 'https://buy.stripe.com/REMPLACE_PAR_TON_LIEN_PREMIUM'

interface Props {
  onClose: () => void
  remaining?: number
}

export default function UpgradeModal({ onClose, remaining = 0 }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <div className="flex justify-between items-start mb-5">
          <div>
            <div className="flex items-center gap-1.5 text-warning font-semibold text-sm mb-1">
              <Zap size={15} />
              Limite atteinte
            </div>
            <h2 className="text-lg font-bold text-gray-900">Passe à Premium</h2>
            <p className="text-sm text-gray-600 mt-1">
              {remaining === 0
                ? 'Tu as épuisé tes 3 analyses gratuites ce mois-ci.'
                : `Il te reste ${remaining} analyse(s) ce mois.`}
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
              <span className="text-2xl font-extrabold text-paperliss">4,99 €</span>
              <span className="text-xs text-gray-400">/mois</span>
            </div>
          </div>
          <ul className="space-y-2 mb-5">
            {[
              'Analyses illimitées',
              'Tous les types de fichiers',
              'Rappels par email',
              'Alertes deadlines avancées',
            ].map(f => (
              <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                <Check size={13} className="text-success shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          <a
            href={STRIPE_PREMIUM}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-paperliss hover:bg-paperliss-dark text-white text-center py-3 rounded-xl text-sm font-bold transition-colors min-h-[48px] flex items-center justify-center"
          >
            Passer à Premium — 4,99 €/mois
          </a>
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
