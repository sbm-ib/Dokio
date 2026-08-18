import { createWorker } from 'tesseract.js'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

// Log visible dès le chargement du module : si tu ne vois jamais cette ligne
// dans la console après un déploiement, c'est que le navigateur exécute
// encore un ancien bundle JS (cache/service worker), pas ce fichier.
console.log(`[ocr] pdf.js chargé — version ${pdfjsLib.version}, worker: ${pdfjsWorkerUrl}`)

// En dessous de ce nombre de caractères utiles, on considère que le PDF n'a
// pas de couche texte exploitable (cas d'un PDF scanné = juste une image) et
// on bascule sur l'OCR page par page.
const MIN_READABLE_LENGTH = 30

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
    throw new Error(`Impossible de charger le PDF avec pdf.js : ${err instanceof Error ? err.message : String(err)}`, { cause: err })
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
    console.log(`[ocr] Texte extrait via la couche texte du PDF : ${combined.length} caractère(s)`)

    if (combined.length >= MIN_READABLE_LENGTH) {
      onProgress(50)
      return combined
    }

    // 2e passage (fallback) : PDF scanné sans couche texte — on convertit
    // chaque page en image et on OCR chaque image avec Tesseract.
    console.log('[ocr] Couche texte quasi vide — bascule sur OCR (PDF probablement scanné)')
    return await ocrScannedPdf(pdf, onProgress)
  } catch (err) {
    console.error('[ocr] Échec de l\'extraction PDF :', err)
    throw err
  } finally {
    await loadingTask.destroy()
  }
}

async function ocrScannedPdf(
  pdf: pdfjsLib.PDFDocumentProxy,
  onProgress: (pct: number) => void,
): Promise<string> {
  const worker = await createWorker(['fra', 'eng'], 1)
  try {
    const pageTexts: string[] = []
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)

      await page.render({ canvas, viewport }).promise

      const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
      if (blob) {
        const { data } = await worker.recognize(blob)
        pageTexts.push(data.text)
      }
      console.log(`[ocr] OCR page ${pageNum}/${pdf.numPages} terminé`)

      onProgress(20 + Math.round((pageNum / pdf.numPages) * 30)) // 20–50%
    }

    onProgress(50)
    const combined = pageTexts.join('\n\n').trim()
    console.log(`[ocr] Texte extrait via OCR (PDF scanné) : ${combined.length} caractère(s)`)
    return combined.length > 0
      ? combined
      : '[Contenu du PDF non lisible, même après OCR — essaie avec une photo nette de chaque page]'
  } finally {
    await worker.terminate()
  }
}

export function anonymize(text: string): string {
  return text
    // IBAN belge (BE) et français (FR) et international
    .replace(/\b(?:BE|FR|LU|NL|DE)\d{2}[\s]?(?:\d{4}[\s]?){3,7}\d{0,4}\b/gi, '[IBAN]')
    // Numéro registre national belge (11 chiffres : JJ.MM.AA-XXX.YY)
    .replace(/\b\d{2}[.\-]\d{2}[.\-]\d{2}[.\-]\d{3}[.\-]\d{2}\b/g, '[NRBE]')
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
