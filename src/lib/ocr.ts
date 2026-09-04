import { createWorker } from 'tesseract.js'
import * as pdfjsLib from 'pdfjs-dist'
// On passe par notre propre point d'entrée (./pdfWorkerEntry.ts) plutôt que
// par le fichier worker brut de pdfjs-dist : il pose le polyfill
// Promise.withResolvers() DANS le contexte du Worker avant de charger le
// vrai code de pdf.js — voir le commentaire dans ce fichier pour le détail.
// `?worker&url` (et pas `?url`) est indispensable ici : c'est le seul
// suffixe Vite qui empaquette correctement ce fichier comme un vrai worker
// (résolution de son `import` interne incluse) tout en renvoyant une URL —
// `?url` seul traite le fichier comme un asset brut et ignore son contenu.
import pdfjsWorkerUrl from './pdfWorkerEntry.ts?worker&url'

interface PromiseWithResolvers<T> {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

declare global {
  interface PromiseConstructor {
    withResolvers?<T>(): PromiseWithResolvers<T>
  }
}

// pdfjs-dist (à partir de la v4) utilise Promise.withResolvers() en interne,
// dès le chargement d'un PDF. C'est une fonction très récente du JavaScript
// (Safari 17.4+ / Chrome 119+ / Firefox 121+, début 2024) — absente sur pas
// mal de navigateurs encore en circulation (vieux iPhone/iPad non mis à
// jour, navigateurs intégrés aux applis type Instagram/Facebook, etc.).
// Sans elle, pdf.js plante avec "undefined is not a function" dès qu'on
// essaie d'ouvrir un PDF. On la fournit nous-mêmes si le navigateur ne l'a
// pas.
const hasNativePromiseWithResolvers = typeof Promise.withResolvers === 'function'
console.log(`[ocr] Promise.withResolvers natif : ${hasNativePromiseWithResolvers ? 'oui' : 'non — polyfill appliqué'}`)
if (!hasNativePromiseWithResolvers) {
  Promise.withResolvers = function withResolvers<T>(): PromiseWithResolvers<T> {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

// Log visible dès le chargement du module : si tu ne vois jamais cette ligne
// dans la console après un déploiement, c'est que le navigateur exécute
// encore un ancien bundle JS (cache/service worker), pas ce fichier.
console.log(`[ocr] pdf.js chargé — version ${pdfjsLib.version}, worker: ${pdfjsWorkerUrl}`)

// Seuils utilisés pour juger si la couche texte d'un PDF est un vrai texte
// exploitable, ou juste un filigrane parasite. Beaucoup d'applis de scan
// mobile (CamScanner et consorts) collent un filigrane textuel du type
// "Numérisé avec XYZ - www.xyz.com" dans le PDF — ce texte est bien "réel"
// et sélectionnable, mais ne contient aucune information du courrier. Avec
// un seuil de longueur trop bas, ce filigrane suffit à passer le test et on
// envoie alors CE filigrane à l'IA au lieu de basculer sur l'OCR — d'où un
// PDF-photo qui ressort comme "illisible" alors que l'OCR n'a même pas
// tourné. On exige donc à la fois une longueur ET un nombre de mots
// minimum : un filigrane fait rarement plus d'une courte phrase.
const MIN_READABLE_LENGTH = 150
const MIN_READABLE_WORDS = 20

function looksLikeRealText(text: string): boolean {
  if (text.length < MIN_READABLE_LENGTH) return false
  const wordCount = text.split(/\s+/).filter(Boolean).length
  return wordCount >= MIN_READABLE_WORDS
}

// Résolution de rendu utilisée pour convertir une page PDF en image avant
// OCR. scale: 2 ≈ 144 DPI, suffisant pour du texte imprimé net ; en dessous,
// l'OCR devient nettement moins fiable sur du texte de petite taille.
const OCR_RENDER_SCALE = 2

export async function extractText(
  file: File,
  onProgress: (pct: number) => void,
): Promise<string> {
  if (file.type === 'application/pdf') {
    return extractFromPDF(file, onProgress)
  }
  return extractFromImage(file, onProgress)
}

async function extractFromImage(file: File | Blob, onProgress: (pct: number) => void): Promise<string> {
  const worker = await createWorker(['fra', 'eng'], 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        onProgress(Math.round(m.progress * 45))
      } else if (m.status === 'loading language traineddata') {
        onProgress(Math.round(m.progress * 10))
      }
    },
  })
  try {
    const { data } = await worker.recognize(file)
    onProgress(50)
    return data.text
  } finally {
    await worker.terminate()
  }
}

// Isole et logue à part toute erreur "X is not a function", pour repérer
// tout de suite une API manquante plutôt que de fouiller une stack minifiée.
// Chrome/Firefox donnent le nom exact ("x.y is not a function") ; Safari, en
// revanche, dit toujours "undefined is not a function (near '...')" — il
// n'expose JAMAIS le vrai nom, seulement un extrait du code (souvent
// minifié) autour du crash. Dans ce cas on affiche cet extrait et on liste
// les suspects habituels plutôt que de prétendre avoir un nom exact.
//
// Retourne aussi ce diagnostic en texte (au lieu de seulement le logger) :
// on n'a pas toujours accès à la console du navigateur de la personne qui
// rencontre le bug (Safari mobile, PWA installée…), donc on le renvoie pour
// pouvoir l'afficher directement dans le message d'erreur montré à l'écran.
function logIfMissingFunction(err: unknown): string | null {
  const message = err instanceof Error ? err.message : String(err)

  const namedMatch = message.match(/([\w.]+) is not a function/)
  if (namedMatch && namedMatch[1] !== 'undefined') {
    const diag = `Fonction manquante : "${namedMatch[1]}" — probablement une API non supportée par ce navigateur.`
    console.error(`[ocr] ${diag}`)
    return diag
  }

  const safariMatch = message.match(/is not a function \(near '([^']*)'\)/)
  if (safariMatch) {
    const diag = `Erreur "fonction manquante" (format Safari — nom exact non fourni par ce navigateur). ` +
      `Extrait du code au crash : "${safariMatch[1]}". ` +
      'Suspects habituels : Promise.withResolvers, structuredClone, Object.hasOwn, OffscreenCanvas, ImageDecoder.'
    console.error(`[ocr] ${diag}`)
    return diag
  }

  return null
}

async function extractFromPDF(file: File, onProgress: (pct: number) => void): Promise<string> {
  onProgress(5)
  const buffer = await file.arrayBuffer()

  let loadingTask: pdfjsLib.PDFDocumentLoadingTask
  let pdf: pdfjsLib.PDFDocumentProxy
  try {
    loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
    pdf = await loadingTask.promise
  } catch (err) {
    // Si pdf.js échoue à s'initialiser (worker introuvable, PDF corrompu…),
    // on log l'erreur exacte et on arrête là — on ne doit JAMAIS retomber
    // sur un envoi d'octets bruts à l'IA.
    console.error('[ocr] Échec du chargement pdf.js :', err)
    const diag = logIfMissingFunction(err)
    const baseMsg = err instanceof Error ? err.message : String(err)
    const suffix = diag ? ` [${diag}] [polyfill principal: ${hasNativePromiseWithResolvers ? 'non appliqué (natif)' : 'appliqué'}]` : ''
    throw new Error(`Impossible de charger le PDF avec pdf.js : ${baseMsg}${suffix}`, { cause: err })
  }

  console.log(`[ocr] PDF ouvert — ${pdf.numPages} page(s) détectée(s)`)

  try {
    // 1er passage : lecture de la vraie couche texte du PDF, TOUTES les pages.
    const pageTexts: string[] = []
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const content = await page.getTextContent()
      const pageText = content.items
        .map(item => ('str' in item ? item.str : ''))
        .join(' ')
      pageTexts.push(pageText)
      onProgress(5 + Math.round((pageNum / pdf.numPages) * 15)) // 5–20%
    }

    const combined = pageTexts.join('\n\n').replace(/[ \t]+/g, ' ').trim()
    const wordCount = combined.split(/\s+/).filter(Boolean).length
    console.log(
      `[ocr] Couche texte du PDF : ${combined.length} caractère(s), ${wordCount} mot(s)` +
      (combined.length > 0 ? ` — aperçu : "${combined.slice(0, 120)}${combined.length > 120 ? '…' : ''}"` : ''),
    )

    if (looksLikeRealText(combined)) {
      console.log('[ocr] Couche texte jugée exploitable — pas besoin d\'OCR')
      onProgress(50)
      return combined
    }

    // 2e passage (fallback) : PDF scanné, ou couche texte insuffisante
    // (filigrane d'appli de scan, page quasi vide…) — on convertit chaque
    // page en image et on OCR chaque image avec Tesseract.
    console.log('[ocr] Couche texte insuffisante — bascule OCR déclenchée (PDF probablement scanné)')
    return await ocrScannedPdf(pdf, onProgress)
  } catch (err) {
    console.error('[ocr] Échec de l\'extraction PDF :', err)
    const diag = logIfMissingFunction(err)
    if (diag) {
      const baseMsg = err instanceof Error ? err.message : String(err)
      throw new Error(`${baseMsg} [${diag}]`, { cause: err })
    }
    throw err
  } finally {
    await loadingTask.destroy()
  }
}

async function ocrScannedPdf(
  pdf: pdfjsLib.PDFDocumentProxy,
  onProgress: (pct: number) => void,
): Promise<string> {
  console.log(`[ocr] Bascule OCR déclenchée — rendu à l'échelle ${OCR_RENDER_SCALE}, langues fra+eng`)
  const worker = await createWorker(['fra', 'eng'], 1)
  try {
    const pageTexts: string[] = []
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      console.log(`[ocr] Page ${pageNum}/${pdf.numPages} : récupération...`)
      const page = await pdf.getPage(pageNum)

      console.log(`[ocr] Page ${pageNum}/${pdf.numPages} : calcul du viewport (avant getViewport)`)
      const viewport = page.getViewport({ scale: OCR_RENDER_SCALE })
      console.log(`[ocr] Page ${pageNum}/${pdf.numPages} : viewport ${viewport.width}x${viewport.height} (après getViewport)`)

      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      console.log(`[ocr] Page ${pageNum}/${pdf.numPages} : canvas créé ${canvas.width}x${canvas.height}`)

      // Note : on ne fait PAS canvas.getContext('2d') nous-mêmes — page.render()
      // s'en charge en interne (confirmé en lisant le code de pdfjs-dist).
      // L'appeler nous-mêmes avant créerait un conflit (context déjà pris).
      console.log(`[ocr] Page ${pageNum}/${pdf.numPages} : appel page.render() (avant render)`)
      await page.render({ canvas, viewport }).promise
      console.log(`[ocr] Page ${pageNum}/${pdf.numPages} rendue en image ${canvas.width}x${canvas.height} (après render)`)

      // Tesseract accepte directement un <canvas> (pas besoin de repasser
      // par un Blob intermédiaire) — un point de conversion en moins, donc
      // une source d'échec silencieux en moins.
      console.log(`[ocr] Page ${pageNum}/${pdf.numPages} : envoi à Tesseract (avant recognize)`)
      const { data } = await worker.recognize(canvas)
      pageTexts.push(data.text)
      console.log(`[ocr] OCR page ${pageNum}/${pdf.numPages} terminé : ${data.text.trim().length} caractère(s) (après recognize)`)

      onProgress(20 + Math.round((pageNum / pdf.numPages) * 30)) // 20–50%
    }

    onProgress(50)
    const combined = pageTexts.join('\n\n').trim()
    console.log(`[ocr] Texte extrait via OCR (PDF scanné) : ${combined.length} caractère(s) au total`)

    // Si on arrive ici avec 0 caractère, l'OCR a bien tourné (les logs
    // ci-dessus le prouvent) mais n'a rien trouvé d'exploitable — c'est un
    // problème de qualité d'image, pas une panne technique. On ne dit donc
    // jamais "illisible" ici : un vrai échec technique (rendu impossible,
    // worker qui plante…) remonte comme une exception via le catch de
    // extractFromPDF, pas comme ce message.
    return combined.length > 0
      ? combined
      : '[Photo trop peu nette, mal cadrée ou mal éclairée pour être lue automatiquement — réessaie avec une photo bien nette, bien cadrée et sans reflet]'
  } finally {
    await worker.terminate()
  }
}

export function anonymize(text: string): string {
  return text
    // IBAN belge (BE) et français (FR) et international
    .replace(/\b(?:BE|FR|LU|NL|DE)\d{2}[\s]?(?:\d{4}[\s]?){3,7}\d{0,4}\b/gi, '[IBAN]')
    // Numéro registre national belge (11 chiffres : JJ.MM.AA-XXX.YY)
    .replace(/\b\d{2}[.-]\d{2}[.-]\d{2}[.-]\d{3}[.-]\d{2}\b/g, '[NRBE]')
    // Numéro de sécurité sociale français (13 chiffres)
    .replace(/\b[12]\s?\d{2}\s?\d{2}\s?\d{2,3}\s?\d{3}\s?\d{3}\s?\d{2}\b/g, '[SECU]')
    // Numéros de téléphone belges (+32) et français (+33)
    .replace(/(?:(?:\+|00)3[23]|0)\s?[1-9](?:[\s.-]?\d{2}){4}/g, '[TEL]')
    // Noms en majuscules (heuristique)
    .replace(/\b[A-ZÉÈÊÀÙÎ]{2,}(?:\s+[A-ZÉÈÊÀÙÎ]{2,}){1,2}\b/g, (m) =>
      m.length > 8 ? '[NOM]' : m,
    )
}

export async function extractTextFromEml(file: File, onProgress: (pct: number) => void): Promise<string> {
  onProgress(20)
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      onProgress(50)
      const raw = reader.result as string
      // Supprimer les headers email et garder le corps
      const body = raw.replace(/^(?:[\w-]+:.*\n)+\n?/m, '').trim()
      resolve(body.length > 10 ? body : '[Email vide ou non lisible]')
    }
    reader.onerror = () => resolve('[Erreur de lecture de l\'email]')
    reader.readAsText(file, 'utf-8')
  })
}

export async function extractTextFromDocx(file: File, onProgress: (pct: number) => void): Promise<string> {
  onProgress(20)
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      onProgress(50)
      const raw = reader.result as string
      // DOCX = ZIP contenant du XML — extraire le texte brut des balises XML
      const text = raw
        .replace(/<[^>]+>/g, ' ')
        .replace(/[^\x20-\x7E\xC0-\xFF\n\r]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      resolve(text.length > 30 ? text : '[Fichier Word non lisible — essaie avec une image JPG]')
    }
    reader.onerror = () => resolve('[Erreur de lecture du fichier Word]')
    reader.readAsText(file, 'latin1')
  })
}
