// Prueba el parser de estados de cuenta con un JSON de OCR (generado con scripts/ocr-dump.mts).
// Uso: npx tsx scripts/test-estado.mts <ocr.json> [--movs]
import { readFileSync } from 'fs'
import { parseEstadoCuenta, type PaginaOcr } from '../src/renderer/src/lib/estadoCuenta'

const paginas = JSON.parse(readFileSync(process.argv[2], 'utf8')) as PaginaOcr[]
for (const e of parseEstadoCuenta(paginas, process.argv[2])) {
  const { movimientos, ...rest } = e
  console.log(JSON.stringify(rest, null, 1))
  if (process.argv.includes('--movs'))
    for (const m of movimientos)
      console.log(
        m.fecha, m.folio.padEnd(7), m.tipo === 'abono' ? '+' : '-', m.monto.toFixed(2).padStart(10), m.saldo.toFixed(2).padStart(10),
        m.verificacion === 'ok' ? '  ' : m.verificacion.slice(0, 4).toUpperCase(), m.descripcion, m.detalle.length ? '| ' + m.detalle.join(' / ') : '', m.nota ? `  <<${m.nota}>>` : ''
      )
}
