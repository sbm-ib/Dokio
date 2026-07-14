import jsPDF from 'jspdf'

const MARGIN_LEFT = 25
const MARGIN_RIGHT = 25
const MARGIN_TOP = 25
const MARGIN_BOTTOM = 25
const LINE_HEIGHT = 6

export function downloadLetterPdf(corps: string, filename: string): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const maxWidth = pageWidth - MARGIN_LEFT - MARGIN_RIGHT

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)

  let y = MARGIN_TOP

  for (const paragraph of corps.split('\n')) {
    if (paragraph.trim() === '') {
      y += LINE_HEIGHT
      if (y > pageHeight - MARGIN_BOTTOM) { doc.addPage(); y = MARGIN_TOP }
      continue
    }

    const lines: string[] = doc.splitTextToSize(paragraph, maxWidth)
    for (const line of lines) {
      if (y > pageHeight - MARGIN_BOTTOM) { doc.addPage(); y = MARGIN_TOP }
      doc.text(line, MARGIN_LEFT, y)
      y += LINE_HEIGHT
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
