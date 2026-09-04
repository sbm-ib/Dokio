import { jsPDF } from 'jspdf'

// Convertit une série de photos (une par page) en un seul PDF, une image par
// page, dimensionnée exactement sur les pixels de la photo (unit: 'px') pour
// éviter toute distorsion. On réutilise ainsi tel quel tout le pipeline PDF
// existant (extractFromPDF + fallback OCR dans src/lib/ocr.ts) au lieu de
// dupliquer la logique d'extraction/anonymisation pour un tableau d'images.
//
// On charge chaque image via un <img> classique (onload/onerror), plutôt que
// createImageBitmap ou toute API récente : ce fichier a justement été ajouté
// après plusieurs crashs Safari dus à des API navigateur récentes non
// supportées (voir l'historique de src/lib/ocr.ts) — <img>.onload est
// supporté depuis toujours, aucune raison de reprendre ce risque ici.
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Impossible de charger l'image "${file.name}"`)) }
    img.src = url
  })
}

function jsPdfImageFormat(file: File): string {
  if (file.type === 'image/png') return 'PNG'
  if (file.type === 'image/webp') return 'WEBP'
  return 'JPEG'
}

export async function combineImagesToPdf(files: File[]): Promise<File> {
  if (files.length === 0) throw new Error('Aucune page à assembler')

  let pdf: jsPDF | null = null

  for (const file of files) {
    const img = await loadImage(file)
    const { naturalWidth: width, naturalHeight: height } = img
    const orientation = width > height ? 'l' : 'p'

    if (!pdf) {
      pdf = new jsPDF({ orientation, unit: 'px', format: [width, height], compress: true })
    } else {
      pdf.addPage([width, height], orientation)
    }
    pdf.addImage(img, jsPdfImageFormat(file), 0, 0, width, height)
  }

  const blob = pdf!.output('blob')
  return new File([blob], `document-multi-pages-${Date.now()}.pdf`, { type: 'application/pdf' })
}
