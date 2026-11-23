// OCR de todas las páginas de un PDF a JSON (palabras con bbox en puntos PDF). tsx scripts/ocr-dump.mts <pdf> <out.json>
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas } from '@napi-rs/canvas'
import { readFileSync, writeFileSync } from 'fs'
import { createWorker, PSM } from 'tesseract.js'
import { dirname, join } from 'path'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const [f, out] = process.argv.slice(2)
const scale = 4
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(f)), verbosity: 0 }).promise
const langPath = join(dirname(require.resolve('@tesseract.js-data/spa/package.json')), '4.0.0_best_int')
const worker = await createWorker('spa', 1, { langPath, gzip: true, cacheMethod: 'none' })
await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: '1' })
const pages = []
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p)
  const vp = page.getViewport({ scale })
  const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport: vp }).promise
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 170 ? 0 : 255
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  const t = Date.now()
  const { data } = await worker.recognize(canvas.toBuffer('image/png'), {}, { blocks: true })
  const words = []
  for (const b of data.blocks ?? []) for (const pa of b.paragraphs) for (const l of pa.lines) for (const w of l.words)
    words.push({ t: w.text, x0: w.bbox.x0 / scale, y0: w.bbox.y0 / scale, x1: w.bbox.x1 / scale, y1: w.bbox.y1 / scale, c: Math.round(w.confidence) })
  pages.push({ page: p, width: vp.width / scale, height: vp.height / scale, words })
  console.error('page', p, Date.now() - t, 'ms', words.length, 'words')
}
await worker.terminate()
writeFileSync(out, JSON.stringify(pages))
