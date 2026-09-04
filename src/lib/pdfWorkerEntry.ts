// Point d'entrée du Worker pdf.js. Un Worker s'exécute dans son propre
// contexte JavaScript, avec son propre objet global `Promise` — le polyfill
// de Promise.withResolvers() posé côté thread principal (dans ocr.ts) ne
// s'applique donc PAS ici. pdf.js lui-même appelle Promise.withResolvers()
// dès le chargement du module (WorkerMessageHandler.initializeFromPort()
// tourne dans un static block de classe, exécuté immédiatement) : sans ce
// second polyfill, ouvrir N'IMPORTE QUEL PDF plante avec "undefined is not
// a function" sur les navigateurs qui ne l'ont pas nativement.
//
// PIÈGE : un `import 'pdfjs-dist/build/pdf.worker.min.mjs'` statique, même
// placé APRÈS le polyfill dans ce fichier, s'exécute en réalité AVANT —
// les imports statiques sont hoistés par le moteur JS/le bundler et
// évalués avant le reste du code du module, quelle que soit leur position
// dans le fichier. Résultat : le polyfill semblait "avant" à la lecture du
// code, mais s'appliquait en fait trop tard, après le crash de pdf.js.
// On utilise donc un import() dynamique, qui lui n'est jamais hoisté et ne
// s'exécute qu'au moment où on l'appelle explicitement — le polyfill est
// alors garanti posé avant que pdf.js ne soit évalué. Le Worker est créé en
// type "module" par pdf.js (cf. pdf.mjs), donc import() y est supporté.
const hasNativePromiseWithResolvers = typeof Promise.withResolvers === 'function'
console.log(`[pdf-worker] Promise.withResolvers natif : ${hasNativePromiseWithResolvers ? 'oui' : 'non — polyfill appliqué'}`)
if (!hasNativePromiseWithResolvers) {
  Promise.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}

// Pas de types fournis par pdfjs-dist pour ce sous-chemin (voir le .d.ts
// d'ambiance dans pdf-worker.d.ts) ; import pour son seul effet de bord
// (l'enregistrement du WorkerMessageHandler), la valeur du module ne nous
// intéresse pas.
await import('pdfjs-dist/build/pdf.worker.min.mjs')
