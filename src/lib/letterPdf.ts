import jsPDF from 'jspdf'

const MARGIN = 25
const HEADER_LINE_HEIGHT = 5
const BODY_LINE_HEIGHT = 6.5
const FONT_SIZE = 11

export interface LetterPdfInput {
  expediteurNom: string
  expediteurAdresse: string
  expediteurEmail: string
  destinataire: string
  objet: string
  corps: string
  lieu: string
}

/**
 * Le "corps" renvoyé par l'IA inclut déjà l'en-tête (expéditeur, destinataire,
 * date, objet) en texte libre — puisqu'on construit maintenant ces blocs
 * nous-mêmes séparément, on ne garde du corps que ce qui suit la formule
 * d'appel ("Madame, Monsieur,"), qui démarre systématiquement le vrai texte
 * de la lettre. Si elle n'est pas trouvée (cas rare), on garde tout le
 * texte tel quel plutôt que de perdre du contenu.
 */
function extractBody(corps: string): string {
  const match = corps.match(/madame,?\s*monsieur,?/i)
  if (!match || match.index === undefined) return corps.trim()
  return corps.slice(match.index).trim()
}

function addParagraphs(doc: jsPDF, text: string, x: number, startY: number, maxWidth: number, pageHeight: number): number {
  let y = startY
  for (const paragraph of text.split('\n')) {
    if (paragraph.trim() === '') {
      y += BODY_LINE_HEIGHT
      if (y > pageHeight - MARGIN) { doc.addPage(); y = MARGIN }
      continue
    }
    const lines: string[] = doc.splitTextToSize(paragraph, maxWidth)
    for (const line of lines) {
      if (y > pageHeight - MARGIN) { doc.addPage(); y = MARGIN }
      doc.text(line, x, y)
      y += BODY_LINE_HEIGHT
    }
  }
  return y
}

export function downloadLetterPdf(input: LetterPdfInput, filename: string): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const maxWidth = pageWidth - MARGIN * 2
  const rightX = pageWidth - MARGIN

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT_SIZE)

  // ── Expéditeur (haut gauche) ──
  let y = MARGIN
  for (const line of [input.expediteurNom, input.expediteurAdresse, input.expediteurEmail]) {
    if (!line) continue
    doc.text(line, MARGIN, y)
    y += HEADER_LINE_HEIGHT
  }

  // ── Destinataire (haut droite, légèrement plus bas) ──
  let yRight = MARGIN + HEADER_LINE_HEIGHT * 4
  for (const line of input.destinataire.split('\n')) {
    if (!line.trim()) continue
    doc.text(line, rightX, yRight, { align: 'right' })
    yRight += HEADER_LINE_HEIGHT
  }

  // ── Lieu et date (haut droite, sous le destinataire) ──
  yRight += HEADER_LINE_HEIGHT
  doc.text(input.lieu, rightX, yRight, { align: 'right' })

  // ── Objet (en gras) ──
  let bodyY = Math.max(y, yRight) + HEADER_LINE_HEIGHT * 2.5
  doc.setFont('helvetica', 'bold')
  doc.text(`Objet : ${input.objet}`, MARGIN, bodyY)
  doc.setFont('helvetica', 'normal')
  bodyY += BODY_LINE_HEIGHT * 2

  // ── Corps (à partir de la formule d'appel) ──
  addParagraphs(doc, extractBody(input.corps), MARGIN, bodyY, maxWidth, pageHeight)

  // ── Numérotation des pages ──
  const totalPages = doc.getNumberOfPages()
  if (totalPages > 1) {
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      doc.setFontSize(9)
      doc.text(`Page ${i} / ${totalPages}`, pageWidth / 2, pageHeight - 12, { align: 'center' })
      doc.setFontSize(FONT_SIZE)
    }
  }

  doc.save(filename)
}

export function buildLetterFilename(label: string): string {
  const slug = label
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'courrier'
  const date = new Date().toISOString().slice(0, 10)
  return `courrier-${slug}-${date}.pdf`
}
