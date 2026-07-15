import { useNavigate } from 'react-router-dom'
import { ScanLine, Brain, Bell, Shield, Check, ArrowRight, Star } from 'lucide-react'
import DokioLogo from '../components/DokioLogo'

const STEPS = [
  {
    icon: ScanLine,
    step: '01',
    title: 'Scanner',
    desc: 'Prenez en photo ou glissez votre courrier. JPG, PNG ou PDF acceptés.',
    color: 'bg-paperliss-light text-paperliss',
  },
  {
    icon: Brain,
    step: '02',
    title: 'Comprendre',
    desc: "Notre IA l'explique en langage simple, comme un ami qui s'y connaît.",
    color: 'bg-success-light text-success',
  },
  {
    icon: Bell,
    step: '03',
    title: 'Agir',
    desc: "On vous dit quoi faire et quand. Plus jamais de deadline ratée.",
    color: 'bg-warning-light text-warning',
  },
]

const BENEFITS = [
  'Explication en langage simple et direct',
  'Classification automatique par catégorie',
  'Détection des deadlines importantes',
  'Alertes avant que ça soit trop tard',
  'Données chiffrées et sécurisées',
  'Accessible depuis votre téléphone',
]

const PLANS = [
  {
    name: 'Gratuit',
    price: '0',
    priceNote: null,
    features: [
      '5 analyses IA par mois',
      'Radar en aperçu (montants visibles)',
      'Stockage des documents',
      'Classification automatique',
    ],
    cta: 'Commencer gratuitement',
    highlight: false,
    action: 'register',
  },
  {
    name: 'Premium',
    price: '6,99',
    priceNote: 'ou 59 €/an (-30%)',
    badge: '⭐ Recommandé',
    features: [
      'Analyses illimitées',
      'Radar complet (actions, anticipations, connexions)',
      'Rappels par email',
      'Tous les formats de fichiers',
    ],
    cta: 'Passer à Premium',
    highlight: true,
    action: 'stripe-premium',
  },
]

export default function LandingPage() {
  const navigate = useNavigate()

  const handlePlan = (action: string) => {
    // L'achat Premium nécessite un compte (client_reference_id du checkout Stripe) —
    // on inscrit d'abord, l'achat réel se fait depuis /profil une fois connecté.
    if (action === 'register' || action === 'stripe-premium') navigate('/auth')
  }

  return (
    <div className="min-h-screen">
      {/* ── Hero ── */}
      <section className="bg-white pt-16 pb-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 text-paperliss text-lg md:text-xl font-semibold mb-8">
            <Shield size={20} className="shrink-0" />
            Vos papiers administratifs, enfin sous contrôle.
          </div>

          <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 mb-6 leading-[1.1] tracking-tight">
            Plus jamais perdu face
            <br />
            <span className="text-paperliss">à un courrier.</span>
          </h1>

          <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto leading-relaxed">
            Dokio lit vos documents administratifs et vous dit exactement quoi faire.
          </p>

          <button
            onClick={() => navigate('/auth')}
            className="inline-flex items-center gap-2 bg-paperliss hover:bg-paperliss-dark text-white font-bold px-8 py-4 rounded-xl text-lg transition-colors shadow-lg shadow-paperliss/20"
          >
            Essayer gratuitement
            <ArrowRight size={20} />
          </button>
          <p className="text-sm text-gray-400 mt-3">Sans carte bancaire · 5 analyses offertes</p>
        </div>
      </section>

      {/* ── Comment ça marche ── */}
      <section className="py-20 px-4 bg-gray-bg">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-3">
            Comment ça marche ?
          </h2>
          <p className="text-center text-gray-500 mb-12">En 3 étapes, vos démarches administratives deviennent simples.</p>

          <div className="grid md:grid-cols-3 gap-6">
            {STEPS.map((s) => (
              <div key={s.step} className="bg-white rounded-2xl p-6 shadow-sm text-center">
                <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl ${s.color} mb-4`}>
                  <s.icon size={26} />
                </div>
                <div className="text-xs font-bold text-gray-300 tracking-widest mb-2">ÉTAPE {s.step}</div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{s.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bénéfices ── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Tout ce dont vous avez besoin
          </h2>
          <div className="grid md:grid-cols-2 gap-3">
            {BENEFITS.map((b) => (
              <div key={b} className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 hover:border-paperliss/30 transition-colors">
                <div className="w-5 h-5 rounded-full bg-success-light flex items-center justify-center shrink-0">
                  <Check size={11} className="text-success" />
                </div>
                <span className="text-gray-700 text-sm font-medium">{b}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Plans ── */}
      <section className="py-20 px-4 bg-gray-bg">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-3">
            Tarifs simples et transparents
          </h2>
          <p className="text-center text-gray-500 mb-12">Commencez gratuitement, évoluez quand vous en avez besoin.</p>

          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl p-6 relative ${
                  plan.highlight
                    ? 'bg-paperliss text-white shadow-xl shadow-paperliss/25 ring-2 ring-paperliss'
                    : 'bg-white shadow-sm'
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-warning text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                    <Star size={10} className="fill-white" />
                    {plan.badge}
                  </div>
                )}

                <div className={`text-lg font-bold mb-1 ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                  {plan.name}
                </div>
                <div className="mb-5">
                  <span className={`text-4xl font-extrabold ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                    {plan.price} €
                  </span>
                  <span className={`text-sm ml-1 ${plan.highlight ? 'text-blue-200' : 'text-gray-400'}`}>
                    /mois
                  </span>
                  {plan.priceNote && (
                    <p className={`text-xs mt-1 ${plan.highlight ? 'text-blue-200' : 'text-gray-400'}`}>
                      {plan.priceNote}
                    </p>
                  )}
                </div>

                <ul className="space-y-2 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className={`flex items-center gap-2 text-sm ${plan.highlight ? 'text-blue-100' : 'text-gray-600'}`}>
                      <Check size={13} className={plan.highlight ? 'text-blue-200 shrink-0' : 'text-success shrink-0'} />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handlePlan(plan.action)}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    plan.highlight
                      ? 'bg-white text-paperliss hover:bg-blue-50'
                      : 'bg-paperliss text-white hover:bg-paperliss-dark'
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-white border-t border-gray-100 py-8 px-4">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 font-bold text-lg">
            <DokioLogo size={28} />
            <span className="text-paperliss">Dokio</span>
          </div>
          <p className="text-sm text-gray-400">© 2026 Dokio — Tous droits réservés</p>
          <div className="flex gap-5 text-sm text-gray-400">
            <a href="#" className="hover:text-gray-600 transition-colors">Confidentialité</a>
            <a href="#" className="hover:text-gray-600 transition-colors">CGU</a>
            <a href="#" className="hover:text-gray-600 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
