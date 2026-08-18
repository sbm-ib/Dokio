import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// Le script d'enregistrement auto-injecté par défaut ne fait qu'installer le
// service worker, sans jamais recharger la page quand une nouvelle version
// est disponible — un onglet déjà ouvert continue donc à exécuter l'ancien
// JavaScript en mémoire indéfiniment après un déploiement. registerSW (mode
// autoUpdate) recharge automatiquement la page dès qu'une mise à jour prend
// le contrôle.
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
