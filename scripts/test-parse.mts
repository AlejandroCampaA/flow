// Prueba los parsers con los archivos de /samples (o los que se pasen como argumentos).
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { parsePdfItems, type TextItem } from '../src/renderer/src/lib/parsePdf'
import { parseCfdiXml } from '../src/renderer/src/lib/parseXml'
import { construirRecibos } from '../src/renderer/src/lib/normalize'
import type { ParsedDoc } from '../src/renderer/src/lib/types'

async function pdfItems(data: Uint8Array): Promise<TextItem[]> {
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise
  const out: TextItem[] = []
  const page = await doc.getPage(1)
  const tc = await page.getTextContent()
  for (const i of tc.items as { str: string; transform: number[]; width: number }[]) {
    out.push({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width })
  }
  return out
}

const dir = 'samples'
const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(dir).map((f) => join(dir, f))
const docs: ParsedDoc[] = []
for (const f of files) {
  const buf = readFileSync(f)
  const doc = f.toLowerCase().endsWith('.xml')
    ? parseCfdiXml(buf.toString('utf8'), f)
    : parsePdfItems(await pdfItems(new Uint8Array(buf)), f)
  docs.push(doc)
}
for (const r of construirRecibos(docs)) {
  const { docs: _d, percepciones, deducciones, ...rest } = r
  console.log('\n=====', r.fuentes.join('+'), r.tipo, 'S' + r.semana, r.periodoInicio, '→', r.periodoFin)
  console.log(JSON.stringify(rest, null, 1))
  console.table(percepciones.map((p) => ({ tipo: p.tipoSat, concepto: p.concepto, cat: p.categoria, sub: p.sub, ex: p.exento, gr: p.gravado, imp: p.importe })))
  console.table(deducciones.map((d) => ({ tipo: d.tipoSat, concepto: d.concepto, t: d.tipo, imp: d.importe })))
  const doc = r.docs[0].totalesDoc
  console.log('Cuadre: neto calculado', r.totales.neto, '| documento', doc?.neto)
}
