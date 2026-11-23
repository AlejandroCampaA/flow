import { addDays, diffDays, isoWeek } from './dates'
import type { Categoria, Deduccion, ParsedDoc, Percepcion, RawLinea, Recibo, TipoDeduccion, TipoRecibo } from './types'

const norm = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

const r2 = (n: number): number => Math.round(n * 100) / 100

/** Orden fijo = orden de color (slot 1..8) y de apilado en las gráficas. */
export const CATEGORIAS: Categoria[] = [
  'sueldo',
  'tiempo_extra',
  'bonos',
  'despensa',
  'primas',
  'ahorro',
  'prestaciones',
  'otras'
]

export const CATEGORIA_LABEL: Record<Categoria, string> = {
  sueldo: 'Nómina normal',
  tiempo_extra: 'Tiempo extra',
  bonos: 'Bonos',
  despensa: 'Despensa',
  primas: 'Primas y festivos',
  prestaciones: 'Prestaciones',
  ahorro: 'Fondo de ahorro',
  otras: 'Otras percepciones'
}

export const DEDUCCION_LABEL: Record<TipoDeduccion, string> = {
  isr: 'ISR',
  imss: 'IMSS',
  ahorro: 'Fondo de ahorro',
  cafeteria: 'Cafetería',
  infonavit: 'Infonavit',
  prestamo: 'Préstamo',
  otra: 'Otra deducción'
}

function titulo(s: string): string {
  const lower = s.toLowerCase().replace(/\s+/g, ' ').trim()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/** Clasifica una percepción en categoría + nombre legible. */
export function clasificarPercepcion(l: RawLinea): { categoria: Categoria; sub: string } {
  const c = norm(l.concepto)
  const t = l.tipoSat ?? ''
  if (/SUBSIDIO/.test(c)) return { categoria: 'otras', sub: 'Subsidio para el empleo' }
  if (/DEV.*(FONDO|FDO).*AHORRO.*INTER|INTERES.*AHORRO/.test(c)) return { categoria: 'ahorro', sub: 'Intereses del fondo de ahorro' }
  if (/DEV.*(FONDO|FDO).*AHORRO|LIQ.*AHORRO/.test(c)) return { categoria: 'ahorro', sub: 'Devolución del fondo de ahorro' }
  if (/APORT.*AHORRO|AHORRO.*EMPRESA/.test(c) || t === '005') return { categoria: 'ahorro', sub: 'Aportación empresa al ahorro' }
  // Festivo PAGADO = día de descanso obligatorio pagado (parte del sueldo, entra en la base del ahorro).
  // Festivo TRABAJADO = trabajaste ese día y se paga extra (aunque el SAT lo clasifique como 019).
  if (/FESTIVO.*TRABAJ|DESCANSO TRABAJADO|DIA DE DESCANSO TRABAJ/.test(c)) return { categoria: 'primas', sub: 'Festivo trabajado' }
  if (/FESTIVO/.test(c)) return { categoria: 'sueldo', sub: 'Festivo pagado (descanso)' }
  if (/EXTRA.*TRIPLE|TRIPLE/.test(c)) return { categoria: 'tiempo_extra', sub: 'Tiempo extra triple' }
  if (/EXTRA.*DOBLE|DOBLE/.test(c)) return { categoria: 'tiempo_extra', sub: 'Tiempo extra doble' }
  if (/TIEMPO EXTRA|HORAS? EXTRA/.test(c) || t === '019') return { categoria: 'tiempo_extra', sub: 'Tiempo extra' }
  if (/DESPENSA/.test(c) || t === '029') return { categoria: 'despensa', sub: 'Despensa' }
  if (/PRIMA DOMINICAL/.test(c) || t === '020') return { categoria: 'primas', sub: 'Prima dominical' }
  if (/PRIMA VACACIONAL/.test(c) || t === '021') return { categoria: 'primas', sub: 'Prima vacacional' }
  if (/AGUINALDO/.test(c) || t === '002') return { categoria: 'prestaciones', sub: 'Aguinaldo' }
  if (/PTU|UTILIDADES/.test(c) || t === '003') return { categoria: 'prestaciones', sub: 'Reparto de utilidades (PTU)' }
  if (/VACACION/.test(c)) return { categoria: 'prestaciones', sub: 'Vacaciones' }
  if (/^OTRAS? PERCEPCION/.test(c)) return { categoria: 'otras', sub: 'Otras percepciones (sin especificar)' }
  if (/BONO|PREMIO|INCENTIVO|GRATIFICACION|COMPENSACION/.test(c) || ['010', '049', '028'].includes(t))
    return { categoria: 'bonos', sub: titulo(l.concepto) }
  if (/SEPTIMO/.test(c)) return { categoria: 'sueldo', sub: 'Séptimo día' }
  if (/SALARIO|SUELDO/.test(c)) return { categoria: 'sueldo', sub: 'Salario' }
  return { categoria: 'otras', sub: titulo(l.concepto) || 'Percepción sin nombre' }
}

export function clasificarDeduccion(l: RawLinea): TipoDeduccion {
  const c = norm(l.concepto)
  const t = l.tipoSat ?? ''
  if (/AHORRO/.test(c)) return 'ahorro'
  if (/I\.?\s?S\.?\s?R/.test(c) || t === '002') return 'isr'
  if (/IMSS|SEGURO SOCIAL/.test(c) || t === '001') return 'imss'
  if (/INFONAVIT/.test(c) || t === '010') return 'infonavit'
  if (/CAFETERIA|COMEDOR/.test(c)) return 'cafeteria'
  if (/PRESTAMO/.test(c)) return 'prestamo'
  return 'otra'
}

function vacioCategorias(): Record<Categoria, number> {
  return Object.fromEntries(CATEGORIAS.map((c) => [c, 0])) as Record<Categoria, number>
}

/** Construye un recibo a partir de uno o varios documentos con el mismo UUID (PDF y/o XML). */
export function construirRecibo(docs: ParsedDoc[]): Recibo {
  const pdf = docs.find((d) => d.fuente === 'pdf')
  const xml = docs.find((d) => d.fuente === 'xml')
  const base = xml ?? pdf!
  const otro = xml && pdf ? pdf : undefined

  const fechaPago = xml?.fechaPago ?? pdf?.fechaPago ?? base.periodoFin ?? base.importadoEn.slice(0, 10)
  const periodoInicio = base.periodoInicio ?? otro?.periodoInicio ?? fechaPago
  const periodoFin = base.periodoFin ?? otro?.periodoFin ?? fechaPago

  // Otros pagos con importe (p.ej. subsidio) cuentan como ingreso.
  const lineas = [...base.percepciones, ...base.otrosPagos.filter((o) => o.importe !== 0)]
  const percepciones: Percepcion[] = lineas.map((l) => ({ ...l, ...clasificarPercepcion(l) }))
  const deducciones: Deduccion[] = base.deducciones.map((l) => ({ ...l, tipo: clasificarDeduccion(l) }))

  const porCategoria = vacioCategorias()
  for (const p of percepciones) porCategoria[p.categoria] = r2(porCategoria[p.categoria] + p.importe)

  const bruto = r2(percepciones.reduce((s, p) => s + p.importe, 0))
  const totDed = r2(deducciones.reduce((s, d) => s + d.importe, 0))
  const neto = r2(bruto - totDed)
  const despensa = porCategoria.despensa
  const sumDed = (t: TipoDeduccion): number => r2(deducciones.filter((d) => d.tipo === t).reduce((s, d) => s + d.importe, 0))
  const sumSub = (re: RegExp): number => r2(percepciones.filter((p) => re.test(p.sub)).reduce((s, p) => s + p.importe, 0))

  const esLiquidacion =
    percepciones.some((p) => /Devolución del fondo/.test(p.sub)) || (pdf?.semana ?? 0) >= 700
  const tipo: TipoRecibo = esLiquidacion ? 'liquidacion' : xml?.tipoNomina === 'E' ? 'extraordinaria' : 'ordinaria'

  // Horas extra: el PDF trae dobles y triples directas; el XML trae el detalle por tipo.
  const hx = xml?.horasExtra ?? []
  const dobles = pdf?.horas?.dobles ?? hx.filter((h) => h.tipo !== 'triple').reduce((s, h) => s + h.horas, 0)
  const triples = pdf?.horas?.triples ?? hx.filter((h) => h.tipo === 'triple').reduce((s, h) => s + h.horas, 0)

  // Fondo de ahorro: la empresa a veces se registra como percepción y se vuelve a descontar.
  const dedAhorro = sumDed('ahorro')
  const aportEmpresa = sumSub(/Aportación empresa/)
  const empleado = aportEmpresa > 0 && dedAhorro >= aportEmpresa ? r2(dedAhorro - aportEmpresa) : dedAhorro
  const empresa = aportEmpresa > 0 ? aportEmpresa : empleado

  // La semana NO se toma de la fecha de emisión: hay recibos re-timbrados meses después o emitidos
  // en días irregulares. Para nómina ordinaria la fecha de referencia es el viernes posterior al
  // periodo trabajado y la semana es la impresa en el PDF (o la de ese viernes).
  const fecha = tipo === 'ordinaria' && base.periodoFin ? addDays(periodoFin, 5) : fechaPago
  const iso = isoWeek(fecha)
  const semanaPdf = pdf?.semana && pdf.semana >= 1 && pdf.semana <= 53 ? pdf.semana : undefined
  const week = tipo === 'ordinaria' && semanaPdf ? semanaPdf : iso.week
  const year = iso.year

  return {
    id: base.uuid,
    tipo,
    semana: week,
    semanaRecibo: pdf?.semana,
    anio: year,
    fecha,
    fechaPago,
    emisionTardia: tipo === 'ordinaria' && diffDays(fecha, fechaPago) > 7,
    periodoInicio,
    periodoFin,
    diasPagados: xml?.diasPagados ?? pdf?.diasPagados ?? null,
    salarioDiario: pdf?.salarioDiario ?? null,
    horas: {
      normales: pdf?.horas?.normales ?? null,
      dobles: r2(dobles),
      triples: r2(triples),
      importeDobles: sumSub(/Tiempo extra( doble)?$/),
      importeTriples: sumSub(/Tiempo extra triple/)
    },
    percepciones,
    deducciones,
    porCategoria,
    totales: {
      bruto,
      deducciones: totDed,
      neto,
      despensa,
      depositado: r2(neto - despensa),
      isr: sumDed('isr'),
      imss: sumDed('imss'),
      ahorro: dedAhorro,
      otras: r2(totDed - sumDed('isr') - sumDed('imss') - dedAhorro)
    },
    ahorro: {
      empleado,
      empresa,
      empresaEstimada: aportEmpresa === 0 && empleado > 0,
      baseSalario: sumSub(/^(Salario|Séptimo día|Festivo pagado \(descanso\))$/),
      acumulado: pdf?.ahorroAcumulado,
      devolucion: sumSub(/Devolución del fondo/),
      interes: sumSub(/Intereses del fondo/)
    },
    fuentes: docs.map((d) => d.fuente).sort(),
    docs,
    empleado: { ...pdf?.empleado, ...Object.fromEntries(Object.entries(xml?.empleado ?? {}).filter(([, v]) => v)) }
  }
}

export function construirRecibos(docs: ParsedDoc[]): Recibo[] {
  const byId = new Map<string, ParsedDoc[]>()
  for (const d of docs) byId.set(d.uuid, [...(byId.get(d.uuid) ?? []), d])
  return [...byId.values()]
    .map(construirRecibo)
    .sort(
      (a, b) =>
        a.fecha.localeCompare(b.fecha) ||
        // Misma fecha: la liquidación va antes que la nómina ordinaria de ese día.
        (a.tipo === 'liquidacion' ? -1 : 0) - (b.tipo === 'liquidacion' ? -1 : 0) ||
        a.periodoFin.localeCompare(b.periodoFin)
    )
}
