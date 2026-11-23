import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { agrupar, totales, type Periodo } from '../lib/analytics'
import { CATEGORIA_LABEL, CATEGORIAS } from '../lib/normalize'
import { colorCategoria, serie } from '../lib/palette'
import { fmtCompacto, fmtHoras, fmtMoney, fmtPct } from '../lib/format'
import { addDays } from '../lib/dates'
import type { Categoria, Recibo } from '../lib/types'
import { useStore } from '../store'
import { Card, LeyendaSeries, Segmented } from './ui'
import TablaCorta, { type ColTabla } from './TablaCorta'
import { GraficaSerie } from './SerieTiempo'
import {
  BotonesEscala,
  COL,
  cambioTxt,
  Dato,
  dir,
  diasDe,
  FLECHA,
  GraficaTiempo,
  PieGrafica,
  signo,
  TXT,
  TXT_DIR,
  useEscala,
  type Ctx,
  type Dir,
  type PeriodoT,
  type Rango
} from './GraficaTiempo'

type Vista = 'deposito' | 'origen' | 'descuentos'
type Estilo = 'area' | 'barras' | 'velas'
type EstiloApilado = 'barras' | 'apilada' | 'pct'

export interface PeriodoSueldo extends PeriodoT {
  dep: number
  liq: number
  bruto: number
  descuentos: number
  p: Periodo
}

const descuentoDe = (p: Periodo): number => p.isr + p.imss + p.dedAhorro + p.dedOtras

/** Semanas (o meses) de nómina con su fecha de inicio y fin, para poder ponerlas en una línea de tiempo. */
export function construir(rs: Recibo[], gran: 'semana' | 'mes'): PeriodoSueldo[] {
  const ords = rs.filter((r) => r.tipo !== 'liquidacion')
  const liqs = rs.filter((r) => r.tipo === 'liquidacion')
  const out: PeriodoSueldo[] = agrupar(ords, gran).map((p) => {
    let ini: string
    let fin: string
    if (gran === 'mes') {
      const [y, m] = p.key.split('-').map(Number)
      ini = `${p.key}-01`
      fin = `${p.key}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
    } else {
      ini = p.recibos.reduce((a, r) => (r.periodoInicio < a ? r.periodoInicio : a), p.recibos[0].periodoInicio)
      fin = p.recibos.reduce((a, r) => (r.periodoFin > a ? r.periodoFin : a), p.recibos[0].periodoFin)
      if (fin < addDays(ini, 6)) fin = addDays(ini, 6)
    }
    return { key: p.key, label: p.label, sub: p.sub, banda: p.banda, bandaLabel: p.bandaLabel, detalle: p.detalle, ini, fin, dep: p.depositado, liq: 0, bruto: p.bruto, descuentos: descuentoDe(p), p }
  })
  // La liquidación del ahorro se suma a la semana (o mes) en que se pagó.
  for (const r of liqs) {
    const q = out.find((x) => r.fechaPago >= x.ini && r.fechaPago <= x.fin) ?? [...out].reverse().find((x) => x.ini <= r.fechaPago) ?? out[0]
    if (q) q.liq += r.totales.depositado
  }
  return out
}

/** Los recibos del último tramo (1M, 3M, 6M, 1A o todo) contando desde el más reciente. */
export function recortarRango(visibles: Recibo[], rango: Rango): Recibo[] {
  const d = diasDe(rango)
  if (!d || !visibles.length) return visibles
  const ult = visibles[visibles.length - 1].fechaPago
  const desde = addDays(ult, -d + 1)
  return visibles.filter((r) => r.fechaPago >= desde)
}

const OPC_VISTA: { value: Vista; label: string }[] = [
  { value: 'deposito', label: 'Depositado' },
  { value: 'origen', label: 'Por concepto' },
  { value: 'descuentos', label: 'Descuentos' }
]
const OPC_ESTILO: { value: Estilo; label: string }[] = [
  { value: 'area', label: 'Área' },
  { value: 'barras', label: 'Barras' },
  { value: 'velas', label: 'Velas' }
]
const OPC_ESTILO_APILADO: { value: EstiloApilado; label: string }[] = [
  { value: 'barras', label: 'Barras' },
  { value: 'apilada', label: 'Áreas' },
  { value: 'pct', label: '% del total' }
]

/** Tu sueldo como un mercado: lo que te depositan, de dónde sale y qué te descuentan, con zoom, rangos y media móvil; y la tabla de abajo. */
export function CardSueldo({ visibles }: { visibles: Recibo[] }): JSX.Element {
  const { modo } = useStore()
  const esc = useEscala(['semana', 'mes'], '1a')
  const [vista, setVista] = useState<Vista>('deposito')
  const [estilo, setEstilo] = useState<Estilo>('area')
  const [apilado, setApilado] = useState<EstiloApilado>('barras')
  const [ocultas, setOcultas] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<string | null>(null)
  const col = COL[modo]
  const gran = esc.gran === 'mes' ? 'mes' : 'semana'

  const rs = useMemo(() => recortarRango(visibles, esc.rango), [visibles, esc.rango])
  const ps = useMemo(() => construir(rs, gran), [rs, gran])
  const t = useMemo(() => totales(rs), [rs])

  const colLiq = serie(5, modo)
  const todasSeries =
    vista === 'descuentos'
      ? [
          { key: 'isr', label: 'ISR', color: serie(1, modo) },
          { key: 'imss', label: 'IMSS', color: serie(2, modo) },
          { key: 'dedOtras', label: 'Otras deducciones', color: serie(4, modo) },
          { key: 'dedAhorro', label: 'Fondo de ahorro', color: serie(5, modo) }
        ]
      : CATEGORIAS.filter((c) => t.porCategoria[c] > 0).map((c) => ({ key: c, label: CATEGORIA_LABEL[c], color: colorCategoria(c, modo) }))
  const series = todasSeries.filter((s) => !ocultas.has(s.key))
  const valorSerie = (q: PeriodoSueldo, key: string): number => (vista === 'descuentos' ? Number(q.p[key as keyof Periodo]) || 0 : q.p.porCategoria[key as Categoria] || 0)
  const esApilado = vista !== 'deposito'
  const unidad = gran === 'mes' ? 'mes' : 'semana'

  // Estadísticas de lo que se ve
  const conDep = ps.filter((q) => q.dep > 0)
  const prom = conDep.length ? conDep.reduce((a, q) => a + q.dep, 0) / conDep.length : 0
  const ultimo = conDep[conDep.length - 1]
  const previo = conDep[conDep.length - 2]
  const mejor = conDep.reduce<PeriodoSueldo | null>((m, q) => (!m || q.dep > m.dep ? q : m), null)
  const peor = conDep.reduce<PeriodoSueldo | null>((m, q) => (!m || q.dep < m.dep ? q : m), null)
  const desc = t.bruto ? t.deducciones / t.bruto : 0
  const dUlt: Dir = ultimo && previo ? dir(previo.dep, ultimo.dep) : 'igual'
  const IconoUlt = dUlt === 'sube' ? ArrowUpRight : dUlt === 'baja' ? ArrowDownRight : Minus

  // Lo mismo para las vistas por concepto y por descuento: el total de las series que están a la vista.
  const totalDe = (q: PeriodoSueldo): number => series.reduce((a, s) => a + valorSerie(q, s.key), 0)
  const porSerie = useMemo(() => todasSeries.map((s) => ({ ...s, total: ps.reduce((a, q) => a + valorSerie(q, s.key), 0) })).sort((a, b) => b.total - a.total), [ps, vista, t]) // eslint-disable-line react-hooks/exhaustive-deps
  const granTotal = porSerie.reduce((a, s) => a + s.total, 0)
  const conDatos = ps.filter((q) => totalDe(q) > 0)
  const ultA = conDatos[conDatos.length - 1]
  const prevA = conDatos[conDatos.length - 2]
  const dA: Dir = ultA && prevA ? dir(totalDe(prevA), totalDe(ultA)) : 'igual'
  const IconoA = dA === 'sube' ? ArrowUpRight : dA === 'baja' ? ArrowDownRight : Minus

  // Variación contra el periodo anterior (para el color)
  const anterior = (i: number): number => (i > 0 ? ps[i - 1].dep : ps[i].dep)
  const media = useMemo(() => ps.map((_, i) => (i < 3 ? null : ps.slice(i - 3, i + 1).reduce((s, q) => s + q.dep, 0) / 4)), [ps])
  const mediaA = useMemo(() => ps.map((_, i) => (i < 3 ? null : ps.slice(i - 3, i + 1).reduce((s, q) => s + totalDe(q), 0) / 4)), [ps, series]) // eslint-disable-line react-hooks/exhaustive-deps

  const titulo = { deposito: `Lo que te depositan por ${unidad}`, origen: `De dónde sale tu sueldo, por ${unidad}`, descuentos: `Lo que te descuentan por ${unidad}` }[vista]
  const sub = {
    deposito: 'Lo que llegó a tu cuenta, con su media móvil de 4',
    origen: 'Tu bruto repartido por concepto: ves qué periodos subieron por tiempo extra, bonos o primas',
    descuentos: 'ISR, IMSS, fondo de ahorro y otras deducciones de cada recibo'
  }[vista]

  const alternar = (k: string): void =>
    setOcultas((o) => {
      const n = new Set(o)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  const elegir = (key: string): void => setSel((s) => (s === key ? null : key))

  // Tabla: un renglón por periodo (el más reciente arriba)
  const idx = useMemo(() => new Map(ps.map((q, i) => [q.key, i])), [ps])
  const filas = useMemo(() => [...ps].reverse(), [ps])
  const cambioFila = (q: PeriodoSueldo): number | null => {
    const i = idx.get(q.key) ?? 0
    return i > 0 ? q.dep - ps[i - 1].dep : null
  }
  const mas = (n: number): string => (n > 0.005 ? fmtMoney(n) : '—')
  const columnas: ColTabla<PeriodoSueldo>[] =
    vista === 'deposito'
      ? [
          { head: 'Periodo', cell: (q) => <span className="font-medium text-ink">{q.detalle}</span> },
          { head: 'Bruto', num: true, cell: (q) => fmtMoney(q.bruto) },
          { head: 'Descuentos', num: true, cell: (q) => <span style={{ color: q.descuentos > 0 ? col.baja : undefined }}>{q.descuentos > 0 ? `−${fmtMoney(q.descuentos)}` : '—'}</span> },
          { head: 'Despensa', num: true, cell: (q) => mas(q.p.despensa) },
          { head: 'Depositado', num: true, cell: (q) => <span className="font-medium text-ink">{fmtMoney(q.dep)}</span> },
          {
            head: 'Cambio',
            num: true,
            cell: (q) => {
              const c = cambioFila(q)
              if (c == null) return <span className="text-muted">—</span>
              const d = dir(q.dep - c, q.dep)
              return (
                <span className="font-medium" style={{ color: col[d] }}>
                  {FLECHA[d]} {cambioTxt(c)}
                </span>
              )
            }
          }
        ]
      : vista === 'descuentos'
        ? [
            { head: 'Periodo', cell: (q) => <span className="font-medium text-ink">{q.detalle}</span> },
            ...todasSeries.map((s) => ({ head: s.label, num: true, cell: (q: PeriodoSueldo) => mas(valorSerie(q, s.key)) })),
            { head: 'Total', num: true, cell: (q: PeriodoSueldo) => <span className="font-medium" style={{ color: col.baja }}>−{fmtMoney(q.descuentos)}</span> },
            { head: 'Del bruto', num: true, cell: (q: PeriodoSueldo) => <span className="text-ink2">{fmtPct(q.bruto ? q.descuentos / q.bruto : 0)}</span> }
          ]
        : [
            { head: 'Periodo', cell: (q) => <span className="font-medium text-ink">{q.detalle}</span> },
            ...todasSeries.map((s) => ({
              head: (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
              ),
              num: true,
              cell: (q: PeriodoSueldo) => mas(valorSerie(q, s.key))
            })),
            { head: 'Bruto', num: true, cell: (q: PeriodoSueldo) => <span className="font-medium text-ink">{fmtMoney(q.bruto)}</span> }
          ]
  const nTxt = `${filas.length} ${filas.length === 1 ? unidad : unidad === 'mes' ? 'meses' : 'semanas'}`

  return (
    <div className="space-y-4">
      <Card title={titulo} subtitle={sub}>
        {/* Cinta de precios */}
        {!esApilado && ultimo && (
          <div className="mb-3 flex flex-wrap items-end gap-x-8 gap-y-2">
            <div>
              <div className="cifra text-[28px] font-semibold leading-8 text-ink">{fmtMoney(ultimo.dep)}</div>
              <div className={`mt-1 flex items-center gap-1 text-[13px] font-medium ${TXT[dUlt]}`}>
                <IconoUlt size={15} />
                {previo ? `${cambioTxt(ultimo.dep - previo.dep)} (${signo(ultimo.dep - previo.dep)}${fmtPct(Math.abs((ultimo.dep - previo.dep) / (previo.dep || 1)))})` : 'último'}
                <span className="ml-1 font-normal text-muted">contra el {unidad} anterior</span>
              </div>
            </div>
            <Dato label={`Promedio por ${unidad}`} valor={fmtCompacto(prom)} />
            {mejor && <Dato label={`Mejor ${unidad}`} valor={fmtCompacto(mejor.dep)} color="text-good" sub={mejor.label} />}
            {peor && <Dato label={`Peor ${unidad}`} valor={fmtCompacto(peor.dep)} color="text-bad" sub={peor.label} />}
            <Dato label="Se va en descuentos" valor={fmtPct(desc)} />
          </div>
        )}
        {esApilado && ultA && (
          <div className="mb-3 flex flex-wrap items-end gap-x-8 gap-y-2">
            <div>
              <div className="text-[12px] text-muted">{vista === 'descuentos' ? (unidad === 'mes' ? 'Descontado el último mes' : 'Descontado la última semana') : unidad === 'mes' ? 'Bruto del último mes' : 'Bruto de la última semana'}</div>
              <div className="cifra text-[28px] font-semibold leading-8 text-ink">{fmtMoney(totalDe(ultA))}</div>
              {prevA && (
                <div className={`mt-1 flex items-center gap-1 text-[13px] font-medium ${vista === 'descuentos' ? (dA === 'sube' ? 'text-bad' : dA === 'baja' ? 'text-good' : 'text-muted') : TXT[dA]}`}>
                  <IconoA size={15} />
                  {cambioTxt(totalDe(ultA) - totalDe(prevA))}
                  <span className="ml-1 font-normal text-muted">contra el {unidad} anterior</span>
                </div>
              )}
            </div>
            {porSerie.slice(0, 4).map((s) => (
              <div key={s.key}>
                <div className="flex items-center gap-1.5 text-[12px] text-muted">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </div>
                <div className="cifra text-[15px] font-medium text-ink">
                  {fmtCompacto(s.total)}
                  <span className="ml-1.5 text-[12px] font-normal text-muted">{fmtPct(granTotal ? s.total / granTotal : 0, 0)}</span>
                </div>
              </div>
            ))}
            {vista === 'descuentos' && <Dato label="Del bruto" valor={fmtPct(desc)} />}
          </div>
        )}

        {/* Variantes a la izquierda; el estilo de la gráfica a la derecha */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <Segmented
            value={vista}
            onChange={(v) => {
              setVista(v)
              setOcultas(new Set())
            }}
            options={OPC_VISTA}
          />
          {esApilado ? <Segmented value={apilado} onChange={setApilado} options={OPC_ESTILO_APILADO} /> : <Segmented value={estilo} onChange={setEstilo} options={OPC_ESTILO} />}
        </div>

        {esApilado ? (
          <GraficaSerie
            periodos={ps}
            series={series}
            valor={valorSerie}
            esc={esc}
            tipo={apilado === 'apilada' ? 'apilada' : 'barras'}
            pct={apilado === 'pct'}
            alto={290}
            fitKey={`${esc.fit}|${vista}|${series.map((s) => s.key).join(',')}`}
            etiquetaAria={vista === 'descuentos' ? 'Descuentos de tu sueldo por periodo' : 'Tu sueldo por concepto y periodo'}
            vacio="Sin recibos en este rango."
            media={apilado === 'pct' ? undefined : mediaA}
            seleccion={sel}
            onSelect={(q) => elegir(q.key)}
            tooltipExtra={(q) => (
              <div className="mt-1.5 text-[11.5px] text-muted">
                {vista === 'descuentos' ? `${fmtPct(q.bruto ? q.descuentos / q.bruto : 0)} de tu bruto (${fmtMoney(q.bruto)})` : `Depositado ${fmtMoney(q.dep)}`}
              </div>
            )}
          />
        ) : (
          <GraficaTiempo
            periodos={ps}
            px={esc.px}
            onPx={esc.setPx}
            onZoom={esc.zoom}
            alto={290}
            fitKey={`${esc.fit}|${vista}`}
            franjas
            hoverPor="periodo"
            etiquetaAria="Tu sueldo en el tiempo"
            vacio="Sin recibos en este rango."
            seleccion={sel}
            onSelect={(i) => ps[i] && elegir(ps[i].key)}
            ultimo={ultimo ? { valor: ultimo.dep, color: col[dUlt] } : undefined}
            dominio={(v) => {
              const vs = ps.slice(v.i0, v.i1 + 1)
              if (!vs.length) return null
              if (estilo === 'barras') return [0, Math.max(1, ...vs.map((q) => q.dep + q.liq))]
              if (estilo === 'velas') {
                const a = vs.flatMap((q, k) => [q.dep, v.i0 + k > 0 ? ps[v.i0 + k - 1].dep : q.dep])
                return [Math.min(...a), Math.max(...a)]
              }
              const a = vs.map((q) => q.dep)
              return a.length ? [Math.min(...a), Math.max(...a)] : null
            }}
            pintar={(c: Ctx) => {
              const ancho = (i: number): number => Math.max(4, Math.min(30, c.geo[i].w * 0.6))
              const lineaProm = prom > 0 && <line x1={0} x2={c.W} y1={c.y(prom)} y2={c.y(prom)} stroke={c.ch.ink2} strokeWidth={1.2} strokeDasharray="2 5" opacity={0.7} />
              const mediaPts = media.map((x, i) => (x == null ? '' : `${c.geo[i].c},${c.y(x)}`)).filter(Boolean).join(' ')
              const lineaMedia = <polyline fill="none" stroke={c.ch.ink2} strokeWidth={1.4} strokeDasharray="4 3" opacity={0.85} points={mediaPts} />
              const marca = (i: number): JSX.Element | null => (c.hoverI === i ? <rect key={`h${i}`} x={c.geo[i].x0} y={0} width={c.geo[i].w} height={c.P} fill={c.ch.ink} opacity={0.06} /> : null)

              if (estilo === 'barras')
                return (
                  <>
                    <line x1={0} x2={c.W} y1={c.y(0)} y2={c.y(0)} stroke={c.ch.axis} />
                    {ps.map((q, i) => {
                      const cl = col[dir(anterior(i), q.dep)]
                      return (
                        <g key={q.key}>
                          {marca(i)}
                          <rect x={c.geo[i].c - ancho(i) / 2} y={c.y(q.dep)} width={ancho(i)} height={Math.max(1.5, c.y(0) - c.y(q.dep))} rx={Math.min(2, ancho(i) / 3)} fill={cl} />
                          {q.liq > 0 && <rect x={c.geo[i].c - ancho(i) / 2} y={c.y(q.dep + q.liq)} width={ancho(i)} height={Math.max(1.5, c.y(q.dep) - c.y(q.dep + q.liq) - 1)} rx={Math.min(2, ancho(i) / 3)} fill={colLiq} />}
                        </g>
                      )
                    })}
                    {lineaProm}
                    {lineaMedia}
                  </>
                )

              if (estilo === 'velas')
                return (
                  <>
                    {ps.map((q, i) => {
                      const o = anterior(i)
                      const cl = col[dir(o, q.dep)]
                      return (
                        <g key={q.key}>
                          {marca(i)}
                          <rect x={c.geo[i].c - ancho(i) / 2} y={c.y(Math.max(o, q.dep))} width={ancho(i)} height={Math.max(2, Math.abs(c.y(o) - c.y(q.dep)))} rx={Math.min(2, ancho(i) / 3)} fill={cl} />
                        </g>
                      )
                    })}
                    {lineaProm}
                    {lineaMedia}
                  </>
                )

              const pts = ps.map((q, i) => `${c.geo[i].c},${c.y(q.dep)}`)
              const cl = col[ps.length > 1 ? dir(ps[0].dep, ps[ps.length - 1].dep) : 'igual']
              return (
                <>
                  <defs>
                    <linearGradient id={`s${c.uid}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={cl} stopOpacity={0.34} />
                      <stop offset="100%" stopColor={cl} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <polygon points={`${c.geo[0].c},${c.P} ${pts.join(' ')} ${c.geo[ps.length - 1].c},${c.P}`} fill={`url(#s${c.uid})`} />
                  <polyline fill="none" stroke={cl} strokeWidth={2.2} strokeLinejoin="round" points={pts.join(' ')} />
                  {lineaProm}
                  {lineaMedia}
                  {ps.map((q, i) => (
                    <circle key={q.key} cx={c.geo[i].c} cy={c.y(q.dep)} r={c.hoverI === i ? 5 : 3} fill={col[dir(anterior(i), q.dep)]} stroke={c.ch.surface} strokeWidth={1.5} />
                  ))}
                  {ps.map((q, i) => q.liq > 0 && <circle key={`l${q.key}`} cx={c.geo[i].c} cy={c.y(q.dep)} r={7} fill="none" stroke={colLiq} strokeWidth={2} />)}
                </>
              )
            }}
            tooltip={({ i }) => {
              const q = ps[i]
              if (!q) return null
              const p = q.p
              const extra = p.horasDobles + p.horasTriples
              const d = dir(anterior(i), q.dep)
              return (
                <>
                  <div className="font-semibold text-ink">{q.detalle}</div>
                  <div className="cifra mt-1 text-[15px] text-ink">{fmtMoney(q.dep)}</div>
                  {i > 0 && (
                    <div className="mt-0.5 font-medium" style={{ color: col[d] }}>
                      {FLECHA[d]} {d === 'igual' ? 'Igual que el periodo anterior' : `${TXT_DIR(d)} ${cambioTxt(q.dep - ps[i - 1].dep)}`}
                    </div>
                  )}
                  <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-ink2">
                    <Fila k="Bruto" v={fmtMoney(q.bruto)} />
                    <Fila k="Descuentos" v={`−${fmtMoney(q.descuentos)}`} />
                    {p.despensa > 0 && <Fila k="Despensa (vales)" v={fmtMoney(p.despensa)} />}
                    {p.importeDobles + p.importeTriples > 0 && <Fila k={`Tiempo extra (${fmtHoras(extra)})`} v={fmtMoney(p.importeDobles + p.importeTriples)} />}
                    {q.liq > 0 && <Fila k="Liquidación del ahorro" v={fmtMoney(q.liq)} />}
                  </dl>
                </>
              )
            }}
          />
        )}

        {/* Pie: la leyenda a la izquierda; rango, intervalo y zoom a la derecha */}
        <PieGrafica derecha={<BotonesEscala e={esc} />}>
          {esApilado ? (
            <>
              <LeyendaSeries series={todasSeries} ocultas={ocultas} onToggle={alternar} />
              {apilado !== 'pct' && (
                <span className="flex items-center gap-1.5">
                  <svg width="18" height="8" aria-hidden>
                    <line x1="0" y1="4" x2="18" y2="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
                  </svg>
                  Media de 4
                </span>
              )}
            </>
          ) : (
            <>
              {(['sube', 'baja', 'igual'] as Dir[]).map((d) => (
                <span key={d} className="flex items-center gap-1.5">
                  <span style={{ color: col[d] }}>{FLECHA[d]}</span>
                  {d === 'sube' ? 'Más que el periodo anterior' : d === 'baja' ? 'Menos' : 'Igual'}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <svg width="18" height="8" aria-hidden>
                  <line x1="0" y1="4" x2="18" y2="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
                </svg>
                Media de 4
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="18" height="8" aria-hidden>
                  <line x1="0" y1="4" x2="18" y2="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 4" />
                </svg>
                Promedio {fmtMoney(prom)}
              </span>
              {ps.some((q) => q.liq > 0) && (
                <span className="flex items-center gap-1.5">
                  <span style={{ color: colLiq }}>◯</span> Liquidación del ahorro
                </span>
              )}
            </>
          )}
        </PieGrafica>
      </Card>

      <TablaCorta
        titulo={`Tus recibos, ${unidad} por ${unidad}`}
        subtitulo={`${nTxt} · ${vista === 'deposito' ? 'cuánto ganaste, cuánto te descontaron y cuánto llegó' : vista === 'descuentos' ? 'cada descuento de tus recibos' : 'cada concepto de tu sueldo'}`}
        filas={filas}
        columnas={columnas}
        clave={(q) => q.key}
        seleccion={sel}
        onSelect={setSel}
        barra={(q) => (vista === 'descuentos' ? col.baja : col[dir(q.dep - (cambioFila(q) ?? 0), q.dep)])}
        alto="h-[390px]"
        vacio="Sin recibos en este rango."
      />
    </div>
  )
}

function Fila({ k, v, color }: { k: string; v: string; color?: string }): JSX.Element {
  return (
    <>
      <dt className="flex items-center gap-1.5 truncate">
        {color && <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />}
        {k}
      </dt>
      <dd className="cifra text-ink">{v}</dd>
    </>
  )
}
