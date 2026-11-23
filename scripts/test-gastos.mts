// Clasificación de movimientos + conciliación con recibos.
// Uso: npx tsx scripts/test-gastos.mts <flujo.db> <ocr1.json> [ocr2.json ...]
import initSqlJs from 'sql.js'
import { readFileSync } from 'fs'
import { parseEstadoCuenta, type PaginaOcr } from '../src/renderer/src/lib/estadoCuenta'
import { catLabel, flujoDinero, conciliarNomina, personas, procesarEstados, resumenCategorias, topComercios, totalesMovs, agruparMovs } from '../src/renderer/src/lib/gastos'
import { construirRecibos } from '../src/renderer/src/lib/normalize'
import type { ParsedDoc } from '../src/renderer/src/lib/types'

const [dbPath, ...jsons] = process.argv.slice(2)
const SQL = await initSqlJs()
const db = new SQL.Database(readFileSync(dbPath))
const docs = (db.exec('SELECT datos FROM documentos')[0]?.values ?? []).map((v) => JSON.parse(String(v[0])) as ParsedDoc)
const recibos = construirRecibos(docs)
const estados = jsons.flatMap((j) => parseEstadoCuenta(JSON.parse(readFileSync(j, 'utf8')) as PaginaOcr[], j))
const datos = procesarEstados(estados, {})
console.log('Titular:', datos.titular, '| cuentas:', datos.cuentas.map((c) => `${c.producto} ${c.corto} nómina=${c.recibeNomina}`).join(', '))
for (const m of datos.movs)
  console.log(m.fecha, m.producto.padEnd(13), m.tipo === 'abono' ? '+' : '-', m.monto.toFixed(2).padStart(9), catLabel(m.categoria).padEnd(26), m.comercio, m.parId ? '⇄' : '', m.reciboId ? '[recibo]' : '')
const c = conciliarNomina(recibos, datos)
console.log('\nConciliación (fuera de periodo:', c.fuera, ')')
for (const f of c.filas) console.log(' ', f.fecha, f.estado.padEnd(13), f.recibo ? `S${f.recibo.semana} ${f.recibo.totales.depositado}` : '-', f.mov ? f.mov.monto : '-', f.diferencia ?? '')
console.log('\nTotales', totalesMovs(datos.movs))
console.log('\nGastos por categoría'); for (const r of resumenCategorias(datos.movs, 'gasto')) console.log(' ', catLabel(r.cat).padEnd(26), r.total.toFixed(2).padStart(10), r.n, (r.pct * 100).toFixed(1) + '%', JSON.stringify(r.serie))
console.log('\nIngresos por categoría'); for (const r of resumenCategorias(datos.movs, 'ingreso')) console.log(' ', catLabel(r.cat).padEnd(26), r.total.toFixed(2).padStart(10), r.n)
console.log('\nTop comercios'); for (const r of topComercios(datos.movs).slice(0, 12)) console.log(' ', r.comercio.padEnd(30), r.total.toFixed(2).padStart(10), r.n, catLabel(r.categoria))
console.log('\nPersonas'); for (const p of personas(datos.movs)) console.log(' ', p.persona.padEnd(36), 'env', p.enviado, 'rec', p.recibido)
console.log('\nSemanas'); for (const p of agruparMovs(datos.movs, 'semana', datos, null)) console.log(' ', p.label, p.sub, p.bandaLabel, 'in', p.ingresos, 'out', p.gastos, 'int', p.internos, 'saldos', JSON.stringify(p.saldos), p.saldoTotal)
const f = flujoDinero(datos.movs, datos)
const muestra = (x: ReturnType<typeof flujoDinero>): void => {
  for (const n of x.entradas) console.log('  ', n.name.padEnd(34), '->', x.centro, n.valor)
  for (const n of x.salidas) console.log('  ', x.centro, '->', n.name.padEnd(34), n.valor)
  console.log('   total', x.total)
}
console.log('Flujo')
muestra(f)
const f2 = flujoDinero(datos.movs.filter((m) => m.cuenta === datos.cuentas[1].cuenta), datos)
console.log('Flujo solo', datos.cuentas[1].producto)
muestra(f2)
