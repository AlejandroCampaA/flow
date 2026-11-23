import * as pdfjs from 'pdfjs-dist'
import * as pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs'

// pdf.js en el hilo principal (sin worker externo): funciona igual empaquetado en el .exe que en desarrollo.
;(globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = pdfWorker

export { pdfjs }
