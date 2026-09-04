// pdfjs-dist ne fournit pas de types pour ce sous-chemin (le fichier worker
// minifié) ; on l'importe uniquement pour son effet de bord dans
// pdfWorkerEntry.ts, sa valeur ne nous intéresse pas.
declare module 'pdfjs-dist/build/pdf.worker.min.mjs'
