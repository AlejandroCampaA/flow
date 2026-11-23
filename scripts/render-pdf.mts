// Renderiza cada página de un PDF a PNG: tsx scripts/render-pdf.mts <pdf> <outPrefix> [escala]
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas } from '@napi-rs/canvas'
import { readFileSync, writeFileSync } from 'fs'

const [f, out, esc] = process.argv.slice(2)
const scale = Number(esc ?? 2)
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(f)), verbosity: 0 }).promise
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p)
  const vp = page.getViewport({ scale })
  const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport: vp }).promise
  writeFileSync(`${out}-${p}.png`, canvas.toBuffer('image/png'))
}
console.log('ok', doc.numPages)
