import { addDays, diffDays, fmtFecha, fmtMes, fmtRango, isoWeek, mondayOfIsoWeek } from './dates'
import { CATEGORIAS } from './normalize'
import type { Categoria, Recibo } from './types'

const r2 = (n: number): number => Math.round(n * 100) / 100
const sum = <T,>(xs: T[], f: (x: T) => number): number => r2(xs.reduce((s, x) => s + f(x), 0))

export interface Filtros {
  desde: string | null
  hasta: string | null
  incluirLiquidaciones: boolean
}

export function filtrar(recibos: Recibo[], f: Filtros): Recibo[] {
  return recibos.filter(
    (r) =>
      (!f.desde || r.fecha >= f.desde) &&
      (!f.hasta || r.fecha <= f.hasta) &&
      (f.incluirLiquidaciones || r.tipo !== 'liquidacion')
  )
}

export type Granularidad = 'semana' | 'mes'

export interface Periodo {
  key: string
  label: string
  detalle: string
  recibos: Recibo[]
  porCategoria: Record<Categoria, number>
  bruto: number
  neto: number
  deducciones: number
  isr: number
  imss: number
  horasDobles: number
  horasTriples: number
  importeDobles: number
  importeTriples: number
  ahorroEmpleado: number
  ahorroEmpresa: number
  /** Neto sin despensa (dinero en cuenta). */
  depositado: number
  despensa: number
  dedAhorro: number
  dedOtras: number
  /** Eje X: etiqueta principal, segunda línea y banda inferior (mes o año). */
  sub: string
  banda: string
  bandaLabel: string
}

export const MES_LARGO_CAP = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

/** Información del eje para un recibo o semana: "S38" / "07–13 sep" / banda "Septiembre 2026". */
export function ejeRecibo(r: Recibo): { label: string; sub: string; banda: string; bandaLabel: string } {
  const banda = r.fecha.slice(0, 7)
  const [y, m] = banda.split('-').map(Number)
  const liq = r.tipo === 'liquidacion'
  return {
    label: liq ? 'Liq. ahorro' : r.tipo === 'extraordinaria' ? 'Extra' : `S${r.semana}`,
    sub: liq || r.tipo === 'extraordinaria' ? fmtFecha(r.fechaPago, false) : fmtRangoCorto(r.periodoInicio, r.periodoFin),
    banda,
    bandaLabel: `${MES_LARGO_CAP[m - 1]} ${y}`
  }
}

export function fmtRangoCorto(a: string, b: string): string {
  const [, ma, da] = a.split('-')
  const [, mb, db] = b.split('-')
  const mes = (m: string): string => fmtMes(`2000-${m}`).split(' ')[0]
  return ma === mb ? `${da}–${db} ${mes(mb)}` : `${da} ${mes(ma)}–${db} ${mes(mb)}`
}

export function agrupar(recibos: Recibo[], g: Granularidad): Periodo[] {
  const map = new Map<string, Recibo[]>()
  for (const r of recibos) {
    // La liquidación de ahorro tiene su propia columna en vista semanal (no se mezcla con la nómina).
    const key =
      g === 'semana'
        ? `${r.anio}-S${String(r.semana).padStart(2, '0')}${r.tipo === 'ordinaria' ? '' : `-${r.tipo}-${r.id.slice(0, 4)}`}`
        : r.fecha.slice(0, 7)
    map.set(key, [...(map.get(key) ?? []), r])
  }
  return [...map.entries()]
    .sort(([, a], [, b]) => a[0].fecha.localeCompare(b[0].fecha) || (a[0].tipo === 'liquidacion' ? -1 : 1))
    .map(([key, rs]) => {
      const porCategoria = Object.fromEntries(
        CATEGORIAS.map((c) => [c, sum(rs, (r) => r.porCategoria[c])])
      ) as Record<Categoria, number>
      const ord = rs.filter((r) => r.tipo !== 'liquidacion')
      const ini = (ord[0] ?? rs[0]).periodoInicio
      const fin = (ord[ord.length - 1] ?? rs[rs.length - 1]).periodoFin
      const eje =
        g === 'semana'
          ? ejeRecibo(rs[0])
          : {
              label: MES_LARGO_CAP[Number(key.slice(5, 7)) - 1].slice(0, 3),
              sub: `${rs.length} recibo${rs.length === 1 ? '' : 's'}`,
              banda: key.slice(0, 4),
              bandaLabel: key.slice(0, 4)
            }
      const r0 = rs[0]
      return {
        key,
        ...eje,
        detalle:
          g === 'semana'
            ? r0.tipo === 'liquidacion'
              ? `Liquidación del fondo de ahorro · ${fmtFecha(r0.fechaPago)}`
              : `Semana ${r0.semana} · ${fmtRango(ini, fin)}`
            : `${fmtMes(key, true)} · ${rs.length} recibo${rs.length === 1 ? '' : 's'}`,
        depositado: sum(rs, (r) => r.totales.depositado),
        despensa: sum(rs, (r) => r.totales.despensa),
        dedAhorro: sum(rs, (r) => r.totales.ahorro),
        dedOtras: sum(rs, (r) => r.totales.otras),
        recibos: rs,
        porCategoria,
        bruto: sum(rs, (r) => r.totales.bruto),
        neto: sum(rs, (r) => r.totales.neto),
        deducciones: sum(rs, (r) => r.totales.deducciones),
        isr: sum(rs, (r) => r.totales.isr),
        imss: sum(rs, (r) => r.totales.imss),
        horasDobles: sum(rs, (r) => r.horas.dobles),
        horasTriples: sum(rs, (r) => r.horas.triples),
        importeDobles: sum(rs, (r) => r.horas.importeDobles),
        importeTriples: sum(rs, (r) => r.horas.importeTriples),
        ahorroEmpleado: sum(rs, (r) => r.ahorro.empleado),
        ahorroEmpresa: sum(rs, (r) => r.ahorro.empresa)
      }
    })
}

export interface Totales {
  recibos: number
  depositado: number
  dedAhorro: number
  dedOtras: number
  bruto: number
  neto: number
  deducciones: number
  isr: number
  imss: number
  despensa: number
  porCategoria: Record<Categoria, number>
  horasDobles: number
  horasTriples: number
  importeExtra: number
  semanasConExtra: number
}

export function totales(rs: Recibo[]): Totales {
  return {
    recibos: rs.length,
    depositado: sum(rs, (r) => r.totales.depositado),
    dedAhorro: sum(rs, (r) => r.totales.ahorro),
    dedOtras: sum(rs, (r) => r.totales.otras),
    bruto: sum(rs, (r) => r.totales.bruto),
    neto: sum(rs, (r) => r.totales.neto),
    deducciones: sum(rs, (r) => r.totales.deducciones),
    isr: sum(rs, (r) => r.totales.isr),
    imss: sum(rs, (r) => r.totales.imss),
    despensa: sum(rs, (r) => r.totales.despensa),
    porCategoria: Object.fromEntries(CATEGORIAS.map((c) => [c, sum(rs, (r) => r.porCategoria[c])])) as Record<
      Categoria,
      number
    >,
    horasDobles: sum(rs, (r) => r.horas.dobles),
    horasTriples: sum(rs, (r) => r.horas.triples),
    importeExtra: sum(rs, (r) => r.porCategoria.tiempo_extra),
    semanasConExtra: rs.filter((r) => r.horas.dobles + r.horas.triples > 0 || r.porCategoria.tiempo_extra > 0).length
  }
}

export interface ConceptoResumen {
  sub: string
  categoria: Categoria
  conceptosOriginales: string[]
  total: number
  veces: number
  /** Recibos ordinarios en los que aparece / recibos ordinarios del rango. */
  frecuencia: number
  promedio: number
  ultimaFecha: string
  recurrente: boolean
  /** Cada recibo donde aparece, en orden cronológico. */
  ocurrencias: { reciboId: string; label: string; sub: string; fecha: string; importe: number }[]
}

/** Resumen por concepto de percepción ("¿de dónde viene cada ingreso?"). */
export function conceptos(rs: Recibo[]): ConceptoResumen[] {
  const ordinarios = rs.filter((r) => r.tipo === 'ordinaria').length || 1
  const map = new Map<string, ConceptoResumen>()
  for (const r of rs) {
    for (const p of r.percepciones) {
      if (p.importe === 0) continue
      const c = map.get(p.sub) ?? {
        sub: p.sub,
        categoria: p.categoria,
        conceptosOriginales: [],
        total: 0,
        veces: 0,
        frecuencia: 0,
        promedio: 0,
        ultimaFecha: r.fecha,
        recurrente: false,
        ocurrencias: []
      }
      const eje = ejeRecibo(r)
      const prev = c.ocurrencias.find((o) => o.reciboId === r.id)
      if (prev) prev.importe = r2(prev.importe + p.importe)
      else c.ocurrencias.push({ reciboId: r.id, label: eje.label, sub: eje.sub, fecha: r.fecha, importe: p.importe })
      c.total = r2(c.total + p.importe)
      c.veces++
      if (!c.conceptosOriginales.includes(p.concepto)) c.conceptosOriginales.push(p.concepto)
      if (r.fecha > c.ultimaFecha) c.ultimaFecha = r.fecha
      map.set(p.sub, c)
    }
  }
  return [...map.values()]
    .map((c) => ({
      ...c,
      promedio: r2(c.total / c.veces),
      frecuencia: Math.min(1, c.veces / ordinarios),
      recurrente: c.veces / ordinarios >= 0.6
    }))
    .sort((a, b) => b.total - a.total)
}

/** Semanas sin recibo ordinario entre el primero y el último cargado. */
export function semanasFaltantes(rs: Recibo[]): { anio: number; semana: number; rango: string }[] {
  const ord = rs.filter((r) => r.tipo === 'ordinaria')
  if (ord.length < 2) return []
  const have = new Set(ord.map((r) => `${r.anio}-${r.semana}`))
  const out: { anio: number; semana: number; rango: string }[] = []
  let lunes = mondayOfIsoWeek(ord[0].anio, ord[0].semana)
  const fin = mondayOfIsoWeek(ord[ord.length - 1].anio, ord[ord.length - 1].semana)
  while (lunes <= fin) {
    const { year, week } = isoWeek(lunes)
    if (!have.has(`${year}-${week}`)) {
      // El periodo trabajado suele ser la semana anterior a la de pago.
      out.push({ anio: year, semana: week, rango: `pago ~${fmtFecha(addDays(lunes, 4))}` })
    }
    lunes = addDays(lunes, 7)
  }
  return out
}

// ---------------------------------------------------------------------------
// Fondo de ahorro
// ---------------------------------------------------------------------------

export type EstadoAhorro = 'normal' | 'bajo' | 'alto' | 'cero' | 'liquidacion' | 'previo'

export interface FilaAhorro {
  recibo: Recibo
  aporte: number
  esperado: number | null
  estado: EstadoAhorro
  motivo: string
  /** Saldo calculado del ciclo (aportes acumulados desde la última liquidación). */
  saldoCalculado: number
}

export interface CicloAhorro {
  inicio: string
  fin: string | null
  recibos: number
  aportadoEmpleado: number
  aportadoEmpresa: number
  liquidacion?: Recibo
  devolucion: number
  interes: number
}

export interface AnalisisAhorro {
  filas: FilaAhorro[]
  ciclos: CicloAhorro[]
  saldoActual: number
  saldoFuente: 'recibo' | 'calculado' | 'mixto'
  saldoDetalle: string
  aporteActualEmpleado: number
  aporteActualEmpresa: number
  aporteTipico: number
  tasa: number | null
  ultimaLiquidacion?: Recibo
  proximaLiquidacion: string | null
  semanasParaLiquidacion: number | null
  proyeccion: number | null
}

function mediana(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const fmt = (n: number): string => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

export function analizarAhorro(todos: Recibo[]): AnalisisAhorro {
  const rs = [...todos].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const ordinarios = rs.filter((r) => r.tipo === 'ordinaria')
  const conAporte = ordinarios.filter((r) => r.ahorro.empleado > 0)
  const tasas = conAporte.filter((r) => r.ahorro.baseSalario > 0).map((r) => r.ahorro.empleado / r.ahorro.baseSalario)
  const tasa = tasas.length ? mediana(tasas) : null
  const ultimos = conAporte.slice(-8)
  const aporteTipico = r2(mediana(ultimos.map((r) => r.ahorro.empleado)))

  const filas: FilaAhorro[] = []
  const ciclos: CicloAhorro[] = []
  let ciclo: CicloAhorro | null = null
  let saldo = 0
  let prev: Recibo | null = null
  const primerAporte = ordinarios.find((r) => r.ahorro.empleado > 0)

  for (const r of rs) {
    if (r.tipo === 'liquidacion') {
      const c: CicloAhorro = ciclo ?? {
        inicio: r.fecha,
        fin: null,
        recibos: 0,
        aportadoEmpleado: 0,
        aportadoEmpresa: 0,
        devolucion: 0,
        interes: 0
      }
      c.fin = r.fecha
      c.liquidacion = r
      c.devolucion = r.ahorro.devolucion
      c.interes = r.ahorro.interes
      ciclos.push(c)
      ciclo = null
      saldo = 0
      filas.push({
        recibo: r,
        aporte: 0,
        esperado: null,
        estado: 'liquidacion',
        motivo: `Se liquidó el fondo: ${fmt(r.ahorro.devolucion)} + ${fmt(r.ahorro.interes)} de intereses. El saldo vuelve a cero.`,
        saldoCalculado: 0
      })
      continue
    }

    ciclo ??= {
      inicio: r.fecha,
      fin: null,
      recibos: 0,
      aportadoEmpleado: 0,
      aportadoEmpresa: 0,
      devolucion: 0,
      interes: 0
    }
    ciclo.recibos++
    ciclo.aportadoEmpleado = r2(ciclo.aportadoEmpleado + r.ahorro.empleado)
    ciclo.aportadoEmpresa = r2(ciclo.aportadoEmpresa + r.ahorro.empresa)
    // Si el PDF trae el acumulado impreso, el saldo se re-ancla a ese valor (corrige semanas faltantes).
    const impreso = r.ahorro.acumulado?.acumulado
    saldo = impreso && impreso > 0 ? impreso : r2(saldo + r.ahorro.empleado + r.ahorro.empresa)

    const aporte = r.ahorro.empleado
    const base = r.ahorro.baseSalario
    const esperado = tasa != null && base > 0 ? r2(base * tasa) : null
    let estado: EstadoAhorro = 'normal'
    let motivo = ''

    if (r.tipo === 'extraordinaria') {
      estado = aporte > 0 ? 'normal' : 'cero'
      motivo = 'Nómina extraordinaria (aguinaldo, PTU, etc.): normalmente no descuenta ahorro.'
    } else if (aporte === 0 && primerAporte && r.fecha < primerAporte.fecha) {
      estado = 'previo'
      motivo = `Aún no estabas inscrito en el fondo de ahorro: tu primer aporte fue en la semana ${primerAporte.semana}.`
    } else if (aporte === 0) {
      estado = 'cero'
      if (base === 0) motivo = 'No hubo salario ni séptimo día en este recibo (incapacidad, permiso o pago especial), así que no hay base para el ahorro.'
      else if (r.diasPagados === 0) motivo = 'El recibo no tiene días pagados.'
      else motivo = `No se descontó ahorro aunque hubo ${fmt(base)} de salario base. Revisa si fue la semana de liquidación o un ajuste de RH.`
    } else if (!prev) {
      motivo = base > 0 ? `Primer aporte registrado: ${((aporte / base) * 100).toFixed(1)}% de ${fmt(base)} (salario + séptimo).` : 'Primer aporte registrado.'
    } else {
      // Se compara contra el recibo ordinario anterior con aporte.
      const pa = prev.ahorro.empleado
      const pb = prev.ahorro.baseSalario
      const razones: string[] = []
      const fueraDeTasa = esperado != null && tasa != null && Math.abs(aporte - esperado) > 1
      if (aporte < pa - 0.5) {
        estado = 'bajo'
        const menosDias = r.diasPagados != null && prev.diasPagados != null && r.diasPagados < prev.diasPagados
        if (base < pb - 1)
          razones.push(
            `el salario base fue menor (${fmt(base)} vs ${fmt(pb)} la semana ${prev.semana})` +
              (menosDias ? '' : ' con los mismos días pagados: probablemente horas descontadas por retardos, permisos o salidas')
          )
        if (menosDias)
          razones.push(`se pagaron ${r.diasPagados} días en vez de ${prev.diasPagados} (faltas, permisos o incapacidad)`)
        if (fueraDeTasa) razones.push(`se aplicó ${((aporte / base) * 100).toFixed(1)}% en lugar de ${(tasa! * 100).toFixed(1)}%`)
        motivo = razones.length
          ? `Bajó ${fmt(pa - aporte)} porque ${razones.join(' y ')}.`
          : `Bajó ${fmt(pa - aporte)} sin causa visible en el recibo.`
      } else if (aporte > pa + 0.5) {
        estado = 'alto'
        if (base > pb + 1) {
          const sd = r.salarioDiario && prev.salarioDiario && r.salarioDiario > prev.salarioDiario
          razones.push(
            sd
              ? `subió tu salario diario (${fmt(prev.salarioDiario!)} → ${fmt(r.salarioDiario!)})`
              : `el salario base subió (${fmt(pb)} → ${fmt(base)})`
          )
        }
        if (fueraDeTasa) razones.push(`se aplicó ${((aporte / base) * 100).toFixed(1)}% en lugar de ${(tasa! * 100).toFixed(1)}%`)
        motivo = razones.length ? `Subió ${fmt(aporte - pa)} porque ${razones.join(' y ')}.` : `Subió ${fmt(aporte - pa)} respecto a la semana ${prev.semana}.`
      } else if (fueraDeTasa) {
        estado = aporte < esperado! ? 'bajo' : 'alto'
        motivo = `Se aplicó ${((aporte / base) * 100).toFixed(1)}% en lugar del ${(tasa! * 100).toFixed(1)}% habitual.`
      } else {
        motivo = `Igual que la semana ${prev.semana}.`
      }
    }
    if (r.tipo === 'ordinaria' && aporte > 0) prev = r

    filas.push({ recibo: r, aporte, esperado: estado === 'previo' ? null : esperado, estado, motivo, saldoCalculado: saldo })
  }
  if (ciclo) ciclos.push(ciclo)

  // Saldo actual: el último "Ahorro acumulado" impreso en un PDF manda; luego se suman los recibos posteriores.
  const ultimaLiquidacion = [...rs].reverse().find((r) => r.tipo === 'liquidacion')
  const desde = ultimaLiquidacion?.fecha ?? ''
  const posteriores = rs.filter((r) => r.tipo !== 'liquidacion' && r.fecha > desde)
  const snap = [...posteriores].reverse().find((r) => r.ahorro.acumulado && r.ahorro.acumulado.acumulado > 0)
  let saldoActual: number
  let saldoFuente: AnalisisAhorro['saldoFuente']
  let saldoDetalle: string
  if (snap) {
    const despues = posteriores.filter((r) => r.fecha > snap.fecha)
    const extra = sum(despues, (r) => r.ahorro.empleado + r.ahorro.empresa)
    saldoActual = r2(snap.ahorro.acumulado!.acumulado + extra)
    saldoFuente = despues.length ? 'mixto' : 'recibo'
    saldoDetalle = despues.length
      ? `${fmt(snap.ahorro.acumulado!.acumulado)} según el recibo de la semana ${snap.semana} + ${fmt(extra)} de ${despues.length} recibo(s) posteriores.`
      : `Según el "Ahorro acumulado" del recibo de la semana ${snap.semana}.`
  } else {
    saldoActual = sum(posteriores, (r) => r.ahorro.empleado + r.ahorro.empresa)
    saldoFuente = 'calculado'
    saldoDetalle = ultimaLiquidacion
      ? `Suma de tus aportes y los de la empresa desde la liquidación del ${fmtFecha(ultimaLiquidacion.fecha)}. Carga un PDF reciente para confirmarlo con el saldo impreso.`
      : 'Suma de tus aportes y los de la empresa en los recibos cargados. Carga un PDF reciente para confirmarlo con el saldo impreso.'
  }

  const ultimoOrd = [...ordinarios].reverse()[0]
  // Liquidaciones semestrales: se estima ~26 semanas después de la última.
  let proximaLiquidacion: string | null = null
  let semanasParaLiquidacion: number | null = null
  let proyeccion: number | null = null
  if (ultimaLiquidacion) {
    const liqs = rs.filter((r) => r.tipo === 'liquidacion')
    const gap =
      liqs.length >= 2
        ? diffDays(liqs[liqs.length - 2].fecha, liqs[liqs.length - 1].fecha)
        : 182
    proximaLiquidacion = addDays(ultimaLiquidacion.fecha, gap)
    const ref = ultimoOrd?.fecha ?? ultimaLiquidacion.fecha
    semanasParaLiquidacion = Math.max(0, Math.round(diffDays(ref, proximaLiquidacion) / 7))
    proyeccion = r2(saldoActual + semanasParaLiquidacion * aporteTipico * 2)
  }

  return {
    filas,
    ciclos,
    saldoActual,
    saldoFuente,
    saldoDetalle,
    aporteActualEmpleado: ultimoOrd?.ahorro.empleado ?? 0,
    aporteActualEmpresa: ultimoOrd?.ahorro.empresa ?? 0,
    aporteTipico,
    tasa,
    ultimaLiquidacion,
    proximaLiquidacion,
    semanasParaLiquidacion,
    proyeccion
  }
}
