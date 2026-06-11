import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Lock, User, Eye, EyeOff, Loader2 } from 'lucide-react'
import DokioLogo from '../components/DokioLogo'
import { useAuth } from '../hooks/useAuth'
import OnboardingModal from '../components/OnboardingModal'
import toast from 'react-hot-toast'

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
        toast.success('Bon retour !')
        navigate('/dashboard')
      } else {
        await signUp(email, password)
        toast.success('Compte créé ! Vérifie ton email pour confirmer.')
        setShowOnboarding(true)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Oups, quelque chose s\'est mal passé.'
      if (msg.includes('Invalid login credentials')) toast.error('Email ou mot de passe incorrect')
      else if (msg.includes('already registered')) toast.error('Cet email est déjà utilisé')
      else if (msg.includes('Password should')) toast.error('Mot de passe trop court (6 caractères minimum)')
      else toast.error('Oups, quelque chose s\'est mal passé. Réessaie !')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      {showOnboarding && <OnboardingModal onClose={() => setShowOnboarding(false)} />}

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 font-bold text-2xl mb-2">
            <DokioLogo size={36} />
            <span className="text-paperliss">Dokio</span>
          </div>
          <p className="text-gray-500">
            {mode === 'login' ? 'Content de te revoir !' : 'Crée ton compte gratuitement'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-8">
          <div className="flex rounded-xl bg-gray-100 p-1 mb-6">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  mode === m ? 'bg-white shadow-sm text-paperliss' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {m === 'login' ? 'Connexion' : 'Inscription'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Prénom" icon={<User size={15} />}>
                  <input
                    type="text"
                    value={prenom}
                    onChange={e => setPrenom(e.target.value)}
                    placeholder="Marie"
                    className="input-field"
                  />
                </Field>
                <Field label="Nom" icon={<User size={15} />}>
                  <input
                    type="text"
                    value={nom}
                    onChange={e => setNom(e.target.value)}
                    placeholder="Dupont"
                    className="input-field"
                  />
                </Field>
              </div>
            )}

            <Field label="Email" icon={<Mail size={15} />}>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="marie@exemple.be"
                className="input-field"
              />
            </Field>

            <Field label="Mot de passe" icon={<Lock size={15} />}>
              <input
                type={showPwd ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </Field>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-paperliss hover:bg-paperliss-dark disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 mt-2 min-h-[48px]"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-400 mt-5">
            {mode === 'login' ? 'Pas encore de compte ? ' : 'Déjà un compte ? '}
            <button
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="text-paperliss font-medium hover:underline"
            >
              {mode === 'login' ? 'Inscription gratuite' : 'Se connecter'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  icon,
  children,
}: {
  label: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{icon}</span>
        <div className="[&_input]:w-full [&_input]:pl-9 [&_input]:py-2.5 [&_input]:pr-4 [&_input]:rounded-xl [&_input]:border [&_input]:border-gray-200 [&_input]:text-sm [&_input]:outline-none [&_input]:focus:ring-2 [&_input]:focus:ring-paperliss [&_input]:focus:border-transparent [&_input]:transition">
          {children}
        </div>
      </div>
    </div>
  )
}
