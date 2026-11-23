// Diagnóstico: lee una base flujo.db y revisa semanas duplicadas/faltantes y el ahorro.
// Uso: npx tsx scripts/check-db.mts <ruta a flujo.db>
import initSqlJs from 'sql.js'
import { readFileSync } from 'fs'
import { construirRecibos } from '../src/renderer/src/lib/normalize'
import { agrupar, analizarAhorro, semanasFaltantes } from '../src/renderer/src/lib/analytics'
import type { ParsedDoc } from '../src/renderer/src/lib/types'

const SQL = await initSqlJs()
const db = new SQL.Database(readFileSync(process.argv[2]))
const docs = (db.exec('SELECT datos FROM documentos')[0]?.values ?? []).map((v) => JSON.parse(String(v[0])) as ParsedDoc)
const rs = construirRecibos(docs)
for (const r of rs)
  console.log(r.tipo.padEnd(11), `S${r.semana}`.padEnd(4), r.anio, 'fecha', r.fecha, 'emision', r.fechaPago, r.emisionTardia ? 'TARDÍA' : '', '| dep', r.totales.depositado, '| desp', r.totales.despensa, '| ahorro tú', r.ahorro.empleado, 'acum', r.ahorro.acumulado?.acumulado ?? '-')
const seen = new Map<string, number>()
for (const r of rs.filter((r) => r.tipo === 'ordinaria')) seen.set(`${r.anio}-${r.semana}`, (seen.get(`${r.anio}-${r.semana}`) ?? 0) + 1)
console.log('\nSemanas duplicadas:', [...seen].filter(([, n]) => n > 1))
console.log('Semanas faltantes:', semanasFaltantes(rs).map((f) => `S${f.semana}`))
console.log('Columnas semanales:', agrupar(rs, 'semana').length, 'de', rs.length, 'recibos')
const a = analizarAhorro(rs)
console.log('\nAhorro: saldo', a.saldoActual, a.saldoFuente, '|', a.saldoDetalle)
console.log('Ciclos:', a.ciclos.map((c) => `${c.inicio}→${c.fin ?? 'hoy'} recibos=${c.recibos} tú=${c.aportadoEmpleado} cía=${c.aportadoEmpresa} dev=${c.devolucion}`))
console.log('Anomalías:'); for (const f of a.filas.filter((f) => f.estado !== 'normal')) console.log(' ', `S${f.recibo.semana}`, f.estado, f.aporte, '-', f.motivo)
