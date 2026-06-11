import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FolderOpen, ScanLine, User,
  LogOut, Sun, Moon,
} from 'lucide-react'
import DokioLogo from './DokioLogo'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const NAV_LINKS = [
  { to: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { to: '/documents', label: 'Mes Documents', icon: FolderOpen },
  { to: '/scanner', label: 'Scanner', icon: ScanLine },
  { to: '/profil', label: 'Mon Profil', icon: User },
]

export default function Navbar() {
  const { user, signOut } = useAuth()
  const { dark, toggle: toggleDark } = useDarkMode()
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    toast.success('À bientôt !')
    navigate('/')
    setOpen(false)
  }

  const DarkToggle = ({ size = 16 }: { size?: number }) => (
    <button
      onClick={toggleDark}
      className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
      title={dark ? 'Passer en mode clair' : 'Passer en mode sombre'}
    >
      {dark ? <Sun size={size} /> : <Moon size={size} />}
    </button>
  )

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link
          to={user ? '/dashboard' : '/'}
          className="flex items-center gap-2 font-bold text-xl shrink-0"
        >
          <DokioLogo size={32} />
          <span className="text-paperliss">Dokio</span>
        </Link>

        {user ? (
          <>
            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-0.5">
              {NAV_LINKS.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                    location.pathname === to
                      ? 'bg-paperliss-light text-paperliss'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  )}
                >
                  <Icon size={15} />
                  {label}
                </Link>
              ))}
              <DarkToggle />
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              >
                <LogOut size={15} />
                Déconnexion
              </button>
            </div>

            {/* Mobile : dark toggle + hamburger animé */}
            <div className="md:hidden flex items-center gap-1">
              <DarkToggle size={18} />
              <button
                onClick={() => setOpen(!open)}
                className="p-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors flex flex-col justify-center items-center gap-[5px] w-10 h-10"
                aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
              >
                <span className={`block h-[2px] w-5 bg-current rounded-full transition-all duration-300 origin-center ${open ? 'rotate-45 translate-y-[7px]' : ''}`} />
                <span className={`block h-[2px] w-5 bg-current rounded-full transition-all duration-300 ${open ? 'opacity-0 scale-x-0' : ''}`} />
                <span className={`block h-[2px] w-5 bg-current rounded-full transition-all duration-300 origin-center ${open ? '-rotate-45 -translate-y-[7px]' : ''}`} />
              </button>
            </div>
          </>
        ) : (
          /* Non connecté */
          <div className="flex items-center gap-2">
            <DarkToggle />
            <Link
              to="/auth"
              className="bg-paperliss hover:bg-paperliss-dark text-white px-5 py-2 rounded-xl text-sm font-semibold transition-colors"
            >
              Connexion
            </Link>
          </div>
        )}
      </div>

      {/* Mobile menu — slide-down animé */}
      {user && (
        <div className={`md:hidden border-gray-100 bg-white px-4 overflow-hidden transition-all duration-300 ease-in-out ${
          open ? 'max-h-96 border-t py-3 opacity-100 translate-y-0' : 'max-h-0 py-0 opacity-0 -translate-y-2'
        }`}>
          <div className="space-y-1">
            {NAV_LINKS.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={clsx(
                  'flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                  location.pathname === to
                    ? 'bg-paperliss-light text-paperliss'
                    : 'text-gray-600 hover:bg-gray-100',
                )}
              >
                <Icon size={16} />
                {label}
              </Link>
            ))}
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-danger hover:bg-danger-light w-full transition-colors"
            >
              <LogOut size={16} />
              Déconnexion
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
