import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  worker: {
    // pdfWorkerEntry.ts pose un polyfill puis charge pdf.js via un import()
    // dynamique (voir le commentaire dans ce fichier) pour garantir l'ordre
    // d'exécution. Le format par défaut des workers Vite ('iife') bundle
    // tout en un seul fichier synchrone et peut re-linéariser cet import()
    // au moment du build ; le format 'es' préserve la vraie sémantique
    // asynchrone d'import() côté navigateur. pdf.js instancie d'ailleurs
    // lui-même ce Worker en `{ type: 'module' }`, donc ce format est requis
    // de toute façon pour que le worker se charge correctement.
    format: 'es',
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        // Purge les anciens caches précédemment précachés à chaque nouvelle
        // version, pour ne jamais laisser traîner des fichiers d'un
        // déploiement précédent.
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
        ],
      },
      manifest: {
        name: 'Dokio',
        short_name: 'Dokio',
        description: "Prends en photo ton courrier. On t'explique tout.",
        theme_color: '#534AB7',
        background_color: '#F8FAFC',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
})
