import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { User, MapPin, Bell, CreditCard, Trash2, Save, Loader2, Star, Globe } from 'lucide-react'
import { useProfile } from '../hooks/useProfile'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'

export default function Profile() {
  const { profile, updateProfile, deleteAllData } = useProfile()
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    const checkout = searchParams.get('checkout')
    if (checkout === 'success') toast.success('Bienvenue dans Premium !')
    if (checkout === 'cancel') toast('Paiement annulé — tu peux réessayer quand tu veux.')
    if (checkout) {
      searchParams.delete('checkout')
      setSearchParams(searchParams, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [form, setForm] = useState({
    prenom: profile?.prenom ?? '',
    nom: profile?.nom ?? '',
    adresse: profile?.adresse ?? '',
    code_postal: profile?.code_postal ?? '',
    ville: profile?.ville ?? '',
    pays: profile?.pays ?? 'belgique',
    notif_email: profile?.notif_email ?? false,
    notif_hebdo: profile?.notif_frequence === 'hebdo',
    heure_rappel: profile?.heure_rappel ?? '09:00',
    date_rappel_exacte: (profile as any)?.date_rappel_exacte ?? '',
  })

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm(f => ({ ...f, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateProfile({
        prenom: form.prenom || null,
        nom: form.nom || null,
        adresse: form.adresse || null,
        code_postal: form.code_postal || null,
        ville: form.ville || null,
        pays: form.pays,
        notif_email: form.notif_email,
        notif_frequence: form.notif_hebdo ? 'hebdo' : 'jamais',
        heure_rappel: form.heure_rappel,
        date_rappel_exacte: form.date_rappel_exacte || null,
      })
      toast.success('Profil mis à jour !')
    } catch (err) {
      console.error('[Profile] save error:', err)
      toast.error('Oups, impossible de sauvegarder. Réessaie !')
    } finally {
      setSaving(false)
    }
  }

  const handleUpgrade = async () => {
    if (!user?.id || !user.email) return
    setCheckoutLoading(true)
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
      console.error('[Profile] checkout error:', err)
      toast.error('Oups, impossible de lancer le paiement. Réessaie !')
      setCheckoutLoading(false)
    }
  }

  const handleManageSubscription = async () => {
    if (!profile?.stripe_customer_id) return
    setPortalLoading(true)
    try {
      const res = await fetch('/api/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: profile.stripe_customer_id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erreur serveur')
      window.location.href = data.url
    } catch (err) {
      console.error('[Profile] portal error:', err)
      toast.error('Oups, impossible d\'ouvrir la gestion d\'abonnement. Réessaie !')
      setPortalLoading(false)
    }
  }

  const handleDeleteAll = async () => {
    if (!confirm('Cette action est irréversible. Supprimer définitivement ton compte et tous tes documents ?')) return
    setDeleting(true)
    try {
      await deleteAllData()
      toast.success('Toutes tes données ont été supprimées.')
    } catch {
      toast.error('Oups, quelque chose s\'est mal passé. Réessaie !')
      setDeleting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mon Profil Admin</h1>
        <p className="text-gray-500 text-sm mt-1">{user?.email}</p>
      </div>

      {/* ── Infos personnelles ── */}
      <Section icon={<User size={18} />} title="Informations personnelles">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Prénom" value={form.prenom} onChange={v => set('prenom', v)} placeholder="Marie" />
          <Input label="Nom" value={form.nom} onChange={v => set('nom', v)} placeholder="Dupont" />
        </div>
        <Input label="Adresse" value={form.adresse} onChange={v => set('adresse', v)} placeholder="Rue de la Loi 16" />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Code postal" value={form.code_postal} onChange={v => set('code_postal', v)} placeholder="1000" />
          <Input label="Ville" value={form.ville} onChange={v => set('ville', v)} placeholder="Bruxelles" />
        </div>
      </Section>

      {/* ── Pays ── */}
      <Section icon={<Globe size={18} />} title="Pays" subtitle="Adapte l'IA à ton administration locale">
        <div className="grid grid-cols-2 gap-3">
          {([['belgique', '🇧🇪 Belgique'], ['france', '🇫🇷 France']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => set('pays', val)}
              className={`py-3 rounded-xl text-sm font-semibold border-2 transition-colors min-h-[48px] ${
                form.pays === val
                  ? 'border-paperliss bg-paperliss-light text-paperliss'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      {/* ── Notifications ── */}
      <Section icon={<Bell size={18} />} title="Notifications">
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-medium text-gray-900">Rappels par email</p>
            <p className="text-xs text-gray-400 mt-0.5">Reçois des alertes avant les deadlines</p>
          </div>
          <button
            onClick={() => set('notif_email', !form.notif_email)}
            className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
              form.notif_email ? 'bg-paperliss' : 'bg-gray-200'
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                form.notif_email ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
        {form.notif_email && (
          <div className="space-y-4">

            {/* Toggle hebdomadaire */}
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-medium text-gray-900">Rappels hebdomadaires</p>
                <p className="text-xs text-gray-400 mt-0.5">Reçois un récap chaque semaine</p>
              </div>
              <button
                onClick={() => set('notif_hebdo', !form.notif_hebdo)}
                className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${form.notif_hebdo ? 'bg-paperliss' : 'bg-gray-200'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.notif_hebdo ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {/* Heure — visible seulement si hebdo activé */}
            {form.notif_hebdo && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Heure du rappel hebdomadaire</label>
                <select
                  value={form.heure_rappel}
                  onChange={e => set('heure_rappel', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-paperliss transition min-h-[44px]"
                >
                  {Array.from({ length: 15 }, (_, i) => i + 7).map(h => {
                    const val = `${String(h).padStart(2, '0')}:00`
                    return <option key={val} value={val}>{val}</option>
                  })}
                </select>
                <div className="bg-paperliss-light rounded-xl px-4 py-3 text-sm text-paperliss font-medium mt-3">
                  ✓ Rappel hebdomadaire chaque semaine à {form.heure_rappel}
                </div>
              </div>
            )}

            {/* Séparateur */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-xs text-gray-400 shrink-0">rappel à une date précise</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            {/* Date + heure exacte */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date et heure du rappel</label>
              <input
                type="datetime-local"
                value={form.date_rappel_exacte}
                onChange={e => set('date_rappel_exacte', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-paperliss transition min-h-[44px]"
              />
            </div>

            {form.date_rappel_exacte && (
              <div className="bg-paperliss-light rounded-xl px-4 py-3 text-sm text-paperliss font-medium">
                ✓ Rappel le {new Date(form.date_rappel_exacte).toLocaleDateString('fr-FR', {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                })} à {new Date(form.date_rappel_exacte).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* ── Bouton sauvegarder ── */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 bg-paperliss hover:bg-paperliss-dark disabled:opacity-60 text-white font-semibold rounded-xl transition-colors min-h-[52px]"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        Enregistrer les modifications
      </button>

      {/* ── Abonnement ── */}
      <Section icon={<CreditCard size={18} />} title="Mon abonnement">
        <div className="flex items-center justify-between p-4 bg-paperliss-light rounded-xl">
          <div className="flex items-center gap-2">
            {profile?.plan === 'premium' && <Star size={16} className="text-warning fill-warning" />}
            <div>
              <p className="font-bold text-gray-900 capitalize">Plan {profile?.plan ?? 'gratuit'}</p>
              {profile?.plan === 'gratuit' && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {profile.analyses_count ?? 0} / 3 analyses utilisées ce mois
                </p>
              )}
              {profile?.plan === 'premium' && (
                <p className="text-xs text-gray-500 mt-0.5">Analyses illimitées · Rappels email actifs</p>
              )}
            </div>
          </div>
          {profile?.plan === 'gratuit' && (
            <button
              onClick={handleUpgrade}
              disabled={checkoutLoading}
              className="bg-paperliss hover:bg-paperliss-dark disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors min-h-[48px] flex items-center gap-2"
            >
              {checkoutLoading && <Loader2 size={14} className="animate-spin" />}
              Passer Premium
            </button>
          )}
          {profile?.plan === 'premium' && profile.stripe_customer_id && (
            <button
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="bg-white border border-gray-200 hover:border-gray-300 disabled:opacity-60 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors min-h-[48px] flex items-center gap-2"
            >
              {portalLoading && <Loader2 size={14} className="animate-spin" />}
              Gérer mon abonnement
            </button>
          )}
        </div>
      </Section>

      {/* ── Zone de danger ── */}
      <div className="border border-danger/20 rounded-2xl p-5">
        <div className="flex items-center gap-2 text-danger font-semibold mb-2">
          <Trash2 size={16} />
          Zone de danger
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Supprime définitivement ton compte et toutes tes données. Cette action est irréversible.
        </p>
        <button
          onClick={handleDeleteAll}
          disabled={deleting}
          className="flex items-center gap-2 bg-danger hover:bg-red-800 disabled:opacity-60 text-white text-sm font-semibold px-5 py-3 rounded-xl transition-colors min-h-[48px]"
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Supprimer mon compte et mes données
        </button>
      </div>
    </div>
  )
}

function Section({
  icon, title, subtitle, children,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-paperliss">{icon}</span>
        <h2 className="font-bold text-gray-900">{title}</h2>
      </div>
      {subtitle && <p className="text-xs text-gray-400 mb-4 ml-6">{subtitle}</p>}
      <div className={`space-y-4 ${subtitle ? '' : 'mt-4'}`}>{children}</div>
    </div>
  )
}

function Input({
  label, value, onChange, placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-paperliss transition min-h-[44px]"
      />
    </div>
  )
}

// silence unused import
void MapPin
