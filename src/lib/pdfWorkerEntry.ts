// Point d'entrée du Worker pdf.js. Un Worker s'exécute dans son propre
// contexte JavaScript, avec son propre objet global `Promise` — le polyfill
// de Promise.withResolvers() posé côté thread principal (dans ocr.ts) ne
// s'applique donc PAS ici. Le décodeur d'image WASM interne de pdf.js
// (utilisé uniquement quand une page contient une image/photo à décoder,
// jamais pour du texte pur) appelle Promise.withResolvers() dans CE
// contexte : sans ce second polyfill, ouvrir un PDF-photo plante avec
// "undefined is not a function" sur les navigateurs qui ne l'ont pas
// nativement, alors qu'un PDF-texte fonctionne (il ne décode aucune image).
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

import 'pdfjs-dist/build/pdf.worker.min.mjs'
