import { cpus } from 'os'
import { dirname, join } from 'path'
import { createScheduler, createWorker, PSM, type Scheduler } from 'tesseract.js'

/**
 * OCR local con Tesseract (WebAssembly, sin internet). Se usa para los estados de cuenta de Santander,
 * cuyas palabras vienen dibujadas como imágenes. Hasta 4 workers en paralelo (medido: 4 páginas en ~6 s
 * contra ~40 s con uno solo); se liberan tras 90 s sin uso.
 */

export interface PalabraOcr {
  t: string
  x0: number
  y0: number
  x1: number
  y1: number
  c: number
}

const WORKERS = Math.max(1, Math.min(4, cpus().length - 2))
const INACTIVIDAD_MS = 90_000

let scheduler: Scheduler | null = null
let iniciando: Promise<Scheduler> | null = null
let timer: NodeJS.Timeout | null = null

function langPath(): string {
  // Modelo en español "best_int": el más preciso para números y nombres.
  return join(dirname(require.resolve('@tesseract.js-data/spa/package.json')), '4.0.0_best_int')
}

async function obtener(): Promise<Scheduler> {
  if (scheduler) return scheduler
  if (!iniciando) {
    iniciando = (async () => {
      const s = createScheduler()
      const workers = await Promise.all(
        Array.from({ length: WORKERS }, async () => {
          const w = await createWorker('spa', 1, { langPath: langPath(), gzip: true, cacheMethod: 'none' })
          await w.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: '1' })
          return w
        })
      )
      for (const w of workers) s.addWorker(w)
      scheduler = s
      return s
    })().finally(() => {
      iniciando = null
    })
  }
  return iniciando
}

function programarCierre(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    const s = scheduler
    scheduler = null
    s?.terminate().catch(() => undefined)
  }, INACTIVIDAD_MS)
}

/** Reconoce una imagen PNG; devuelve las palabras con su caja dividida entre `escala` (→ puntos PDF). */
export async function reconocer(png: Uint8Array, escala: number): Promise<PalabraOcr[]> {
  if (timer) clearTimeout(timer)
  try {
    const s = await obtener()
    const { data } = await s.addJob('recognize', Buffer.from(png), {}, { blocks: true, text: false })
    const out: PalabraOcr[] = []
    for (const b of data.blocks ?? [])
      for (const p of b.paragraphs)
        for (const l of p.lines)
          for (const w of l.words)
            out.push({
              t: w.text,
              x0: w.bbox.x0 / escala,
              y0: w.bbox.y0 / escala,
              x1: w.bbox.x1 / escala,
              y1: w.bbox.y1 / escala,
              c: Math.round(w.confidence)
            })
    return out
  } finally {
    programarCierre()
  }
}

export async function cerrar(): Promise<void> {
  if (timer) clearTimeout(timer)
  await scheduler?.terminate().catch(() => undefined)
  scheduler = null
}
