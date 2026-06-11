import { createWorker } from 'tesseract.js'

export async function extractText(
  file: File,
  onProgress: (pct: number) => void,
): Promise<string> {
  if (file.type === 'application/pdf') {
    return extractFromPDF(file, onProgress)
  }
  return extractFromImage(file, onProgress)
}

async function extractFromImage(file: File, onProgress: (pct: number) => void): Promise<string> {
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
  onProgress(10)
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      onProgress(50)
      const raw = reader.result as string
      // Garder uniquement les caractères lisibles
      const readable = raw
        .replace(/[^\x20-\x7E\xC0-\xFF\n\r]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      resolve(readable.length > 30 ? readable : '[Contenu PDF non lisible — convertis en image JPG pour une meilleure analyse]')
    }
    reader.onerror = () => resolve('[Erreur de lecture du PDF]')
    reader.readAsText(file, 'latin1')
  })
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
