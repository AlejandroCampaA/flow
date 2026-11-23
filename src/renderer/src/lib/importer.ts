import { pdfjs } from './pdf'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { parsePdfItems, type TextItem } from './parsePdf'
import { parseCfdiXml } from './parseXml'
import { esPaginaFinal, parseEstadoCuenta, pareceEstadoCuenta, type EstadoCuenta, type PaginaOcr, type PalabraOcr } from './estadoCuenta'
import type { ParsedDoc } from './types'

/** Escala de render para el OCR (~290 ppp: la resolución nativa de las imágenes de texto de Santander). */
const ESCALA_OCR = 4
/** Páginas que se leen en paralelo (el proceso principal tiene hasta 4 workers de OCR). */
const EN_PARALELO = 4

export interface ArchivoEntrada {
  name: string
  bytes: Uint8Array
}

export type Lectura = { tipo: 'recibo'; doc: ParsedDoc } | { tipo: 'estado'; estados: EstadoCuenta[]; paginas: number }

export type Progreso = (mensaje: string) => void

function itemsTexto(items: unknown[]): TextItem[] {
  const out: TextItem[] = []
  for (const it of items as { str?: string; transform: number[]; width: number }[]) {
    if (typeof it.str !== 'string') continue
    out.push({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width })
  }
  return out
}

/** Palabras con caja (origen arriba-izquierda) a partir del texto real del PDF, si lo trae. */
async function palabrasDeTexto(page: PDFPageProxy): Promise<PaginaOcr> {
  const vp = page.getViewport({ scale: 1 })
  const tc = await page.getTextContent()
  const words: PalabraOcr[] = []
  for (const it of tc.items as { str?: string; transform: number[]; width: number; height: number }[]) {
    if (!it.str?.trim()) continue
    const h = Math.hypot(it.transform[2], it.transform[3]) || it.height || 8
    const yTop = vp.height - it.transform[5] - h
    const charW = it.width / Math.max(1, it.str.length)
    // Un item puede traer varias palabras: se separan para que las columnas funcionen igual que con OCR.
    let idx = 0
    for (const parte of it.str.split(/(\s+)/)) {
      if (parte.trim()) {
        const x0 = it.transform[4] + idx * charW
        words.push({ t: parte, x0, y0: yTop, x1: x0 + parte.length * charW, y1: yTop + h, c: 100 })
      }
      idx += parte.length
    }
  }
  return { page: page.pageNumber, width: vp.width, height: vp.height, words }
}

/** Renderiza la página, la pasa a blanco y negro puro (quita el gris de las filas) y la manda al OCR. */
async function ocrPagina(page: PDFPageProxy): Promise<PaginaOcr> {
  const vp = page.getViewport({ scale: ESCALA_OCR })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(vp.width)
  canvas.height = Math.ceil(vp.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('No se pudo preparar la imagen para el OCR.')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport: vp }).promise
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 170 ? 0 : 255
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo generar la imagen.'))), 'image/png'))
  const png = new Uint8Array(await blob.arrayBuffer())
  canvas.width = canvas.height = 0
  const words = await window.api.ocr(png, ESCALA_OCR)
  const base = page.getViewport({ scale: 1 })
  return { page: page.pageNumber, width: base.width, height: base.height, words }
}

async function leerEstado(doc: PDFDocumentProxy, nombre: string, conTexto: boolean, progreso?: Progreso): Promise<Lectura> {
  const total = doc.numPages
  const paginas: PaginaOcr[] = []
  let fin = total
  for (let p = 1; p <= fin; p += EN_PARALELO) {
    const lote = Array.from({ length: Math.min(EN_PARALELO, fin - p + 1) }, (_, i) => p + i)
    progreso?.(
      conTexto
        ? 'Leyendo el texto del PDF…'
        : `Leyendo con OCR · página${lote.length > 1 ? `s ${lote[0]}–${lote[lote.length - 1]}` : ` ${lote[0]}`} de ${total}`
    )
    const leidas = await Promise.all(
      lote.map(async (n) => {
        const page = await doc.getPage(n)
        try {
          return conTexto ? await palabrasDeTexto(page) : await ocrPagina(page)
        } finally {
          page.cleanup()
        }
      })
    )
    for (const pg of leidas) {
      if (pg.page === 1 && !pareceEstadoCuenta(pg)) throw new Error('El PDF no parece un recibo de nómina ni un estado de cuenta.')
      paginas.push(pg)
      // Después de los movimientos sólo vienen abreviaturas y avisos legales: no hace falta leerlos.
      if (esPaginaFinal(pg)) fin = Math.min(fin, pg.page)
    }
  }
  progreso?.('Validando saldos…')
  const estados = parseEstadoCuenta(paginas.filter((x) => x.page <= fin), nombre, conTexto ? 'texto' : 'ocr')
  return { tipo: 'estado', estados, paginas: paginas.length }
}

export async function leerArchivo(f: ArchivoEntrada, progreso?: Progreso): Promise<Lectura> {
  const lower = f.name.toLowerCase()
  if (lower.endsWith('.xml')) {
    return { tipo: 'recibo', doc: parseCfdiXml(new TextDecoder('utf-8').decode(f.bytes), f.name) }
  }
  if (!lower.endsWith('.pdf')) throw new Error('Formato no soportado: sólo PDF o XML.')

  const doc = await pdfjs.getDocument({ data: f.bytes.slice(), verbosity: 0, isEvalSupported: false }).promise
  try {
    const page1 = await doc.getPage(1)
    const items = itemsTexto((await page1.getTextContent()).items)
    const texto = items.map((i) => i.s).join(' ')
    // Recibo de nómina (CFDI): trae texto con el folio fiscal / UUID.
    const esRecibo = /[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i.test(texto) && !/ESTADO DE CUENTA/i.test(texto)
    if (esRecibo) return { tipo: 'recibo', doc: parsePdfItems(items, f.name) }
    // Estado de cuenta: con texto (si el banco lo incluye) o como imágenes → OCR.
    const conTexto = /ESTADO DE CUENTA/i.test(texto) && items.length > 40
    return await leerEstado(doc, f.name, conTexto, progreso)
  } finally {
    await doc.destroy()
  }
}
