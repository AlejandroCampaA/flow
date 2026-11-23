import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { catLabel, catNat, serieSaldo, type CatMov, type MovClasificado, type Vela } from '../lib/gastos'
import { fmtRangoCorto } from '../lib/analytics'
import { fmtCompacto, fmtMoney, fmtPct } from '../lib/format'
import { addDays, isoWeek, mondayOfIsoWeek } from '../lib/dates'
import type { Modo } from '../lib/palette'
import { useStore } from '../store'
import { Card, Desplazable, Segmented } from './ui'
import FiltroCuentas from './FiltroCuentas'
import {
  BotonesEscala,
  COL,
  cambioTxt,
  Dato,
  dir,
  FLECHA,
  GraficaTiempo,
  PieGrafica,
  signo,
  TXT,
  TXT_DIR,
  UNIDAD,
  useEscala,
  type Ctx,
  type Dir,
  type Escala,
  type Rango
} from './GraficaTiempo'

export type TipoSaldo = 'linea' | 'velas'
export type TipoFlujo = 'barras' | 'acum'

const OPC_SALDO: { value: TipoSaldo; label: string }[] = [
  { value: 'linea', label: 'Línea' },
  { value: 'velas', label: 'Velas' }
]
const OPC_FLUJO: { value: TipoFlujo; label: string }[] = [
  { value: 'barras', label: 'Entró y salió' },
  { value: 'acum', label: 'Acumulado' }
]

/** "Semana 46 · 09–15 nov" de la semana que contiene la fecha. */
function semanaDe(f: string): string {
  const w = isoWeek(f)
  const ini = mondayOfIsoWeek(w.year, w.week)
  return `Semana ${w.week} · ${fmtRangoCorto(ini, addDays(ini, 6))}`
}

// ---------------------------------------------------------------------------
// Datos y estado

export interface EstadoMercado<Tipo extends string> {
  esc: Escala
  tipo: Tipo
  setTipo: (t: Tipo) => void
  velas: Vela[]
  dias: { fecha: string; saldo: number }[]
}

/** Estado de una gráfica de mercado: sigue el filtro global de fechas y de cuentas. */
export function useMercado<Tipo extends string>(tipoInicial: Tipo, opts: { cat?: CatMov | null; rango?: Rango } = {}): EstadoMercado<Tipo> {
  const { banco, filtros } = useStore()
  const esc = useEscala(['dia', 'semana', 'mes'], opts.rango ?? '6m')
  const [tipo, setTipo] = useState<Tipo>(tipoInicial)
  const cat = opts.cat ?? null
  const rango = esc.rango
  const gran = esc.gran
  const { velas, dias } = useMemo(() => {
    const ult = banco.movs.length ? banco.movs[banco.movs.length - 1].fecha : null
    const fin = filtros.hasta && ult && filtros.hasta < ult ? filtros.hasta : ult
    const d = rango === 'todo' ? null : { '1m': 30, '3m': 91, '6m': 182, '1a': 365 }[rango]
    const desdeRango = d && fin ? addDays(fin, -d + 1) : null
    const desde = desdeRango && (!filtros.desde || desdeRango > filtros.desde) ? desdeRango : filtros.desde
    return serieSaldo(banco, gran, { desde, hasta: filtros.hasta }, null, cat)
  }, [banco, filtros.desde, filtros.hasta, cat, gran, rango])
  return { esc, tipo, setTipo, velas, dias }
}

// ---------------------------------------------------------------------------
// Cifras

interface StatsSaldo {
  cambio: number
  pct: number | null
  cierre: number
  apertura: number
  max: number
  min: number
  mejor: Vela
  peor: Vela
}

function estadisticas(velas: Vela[]): StatsSaldo | null {
  if (!velas.length) return null
  const a = velas[0]
  const z = velas[velas.length - 1]
  const dif = (v: Vela): number => v.c - v.o
  return {
    cambio: z.c - a.o,
    pct: a.o ? (z.c - a.o) / Math.abs(a.o) : null,
    cierre: z.c,
    apertura: a.o,
    max: Math.max(...velas.map((v) => v.h)),
    min: Math.min(...velas.map((v) => v.l)),
    mejor: velas.reduce((m, v) => (dif(v) > dif(m) ? v : m), a),
    peor: velas.reduce((m, v) => (dif(v) < dif(m) ? v : m), a)
  }
}

function TickerSaldo({ s, unidad }: { s: StatsSaldo; unidad: string }): JSX.Element {
  const d = dir(s.apertura, s.cierre)
  const Icon = d === 'sube' ? ArrowUpRight : d === 'baja' ? ArrowDownRight : Minus
  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
      <div>
        <div className="cifra text-[28px] font-semibold leading-8 text-ink">{fmtMoney(s.cierre)}</div>
        <div className={`mt-1 flex items-center gap-1 text-[13px] font-medium ${TXT[d]}`}>
          <Icon size={15} />
          {cambioTxt(s.cambio)}
          {s.pct != null && Math.abs(s.pct) <= 5 && ` (${signo(s.cambio)}${fmtPct(Math.abs(s.pct))})`}
          <span className="ml-1 font-normal text-muted">en este rango</span>
        </div>
      </div>
      <Dato label="Máximo" valor={fmtCompacto(s.max)} />
      <Dato label="Mínimo" valor={fmtCompacto(s.min)} />
      <Dato label={`Mejor ${unidad}`} valor={cambioTxt(s.mejor.c - s.mejor.o)} color="text-good" sub={s.mejor.label} />
      <Dato label={`Peor ${unidad}`} valor={cambioTxt(s.peor.c - s.peor.o)} color="text-bad" sub={s.peor.label} />
    </div>
  )
}

interface StatsFlujo {
  entro: number
  salio: number
  neto: number
  cat: number
  mejor: Vela
  peor: Vela
  maxCat: Vela
}

const netoDe = (v: Vela): number => v.ingresos - v.gastos

function estadisticasFlujo(velas: Vela[]): StatsFlujo | null {
  if (!velas.length) return null
  const entro = velas.reduce((s, v) => s + v.ingresos, 0)
  const salio = velas.reduce((s, v) => s + v.gastos, 0)
  return {
    entro,
    salio,
    neto: entro - salio,
    cat: velas.reduce((s, v) => s + v.cat, 0),
    mejor: velas.reduce((m, v) => (netoDe(v) > netoDe(m) ? v : m), velas[0]),
    peor: velas.reduce((m, v) => (netoDe(v) < netoDe(m) ? v : m), velas[0]),
    maxCat: velas.reduce((m, v) => (v.cat > m.cat ? v : m), velas[0])
  }
}

function TickerFlujo({ s, cat, unidad, n }: { s: StatsFlujo; cat: CatMov | null; unidad: string; n: number }): JSX.Element {
  if (cat) {
    const ing = catNat(cat) === 'ingreso'
    return (
      <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
        <div>
          <div className="text-[12px] text-muted">{catLabel(cat)}</div>
          <div className="cifra text-[28px] font-semibold leading-8 text-ink">{fmtMoney(s.cat)}</div>
          <div className="mt-1 text-[13px] text-muted">en este rango</div>
        </div>
        <Dato label={`Promedio por ${unidad}`} valor={fmtMoney(n ? s.cat / n : 0)} />
        <Dato label={`${ing ? 'Mejor' : 'Mayor'} ${unidad}`} valor={fmtMoney(s.maxCat.cat)} color={ing ? 'text-good' : 'text-bad'} sub={s.maxCat.label} />
      </div>
    )
  }
  const d: Dir = s.neto > 50 ? 'sube' : s.neto < -50 ? 'baja' : 'igual'
  const Icon = d === 'sube' ? ArrowUpRight : d === 'baja' ? ArrowDownRight : Minus
  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
      <div>
        <div className="text-[12px] text-muted">{s.neto >= 0 ? 'Te quedó' : 'Gastaste de más'}</div>
        <div className="cifra text-[28px] font-semibold leading-8 text-ink">{fmtMoney(Math.abs(s.neto))}</div>
        <div className={`mt-1 flex items-center gap-1 text-[13px] font-medium ${TXT[d]}`}>
          <Icon size={15} />
          {s.entro > 0 ? `${fmtPct(Math.abs(s.neto) / s.entro, 0)} de lo que entró` : 'en este rango'}
        </div>
      </div>
      <Dato label="Entró" valor={fmtCompacto(s.entro)} color="text-good" />
      <Dato label="Salió" valor={fmtCompacto(s.salio)} color="text-bad" />
      <Dato label={`Mejor ${unidad}`} valor={cambioTxt(netoDe(s.mejor))} color="text-good" sub={s.mejor.label} />
      <Dato label={`Peor ${unidad}`} valor={cambioTxt(netoDe(s.peor))} color="text-bad" sub={s.peor.label} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tooltips

function TooltipVela({ v, modo, unidad }: { v: Vela; modo: Modo; unidad: string }): JSX.Element {
  const d = dir(v.o, v.c)
  const dif = v.c - v.o
  const dia = unidad === 'día'
  return (
    <>
      <div className="font-semibold text-ink">{v.detalle}</div>
      {dia && <div className="text-[11.5px] text-muted">{semanaDe(v.ini)}</div>}
      <div className="mt-0.5 font-medium" style={{ color: COL[modo][d] }}>
        {FLECHA[d]} {TXT_DIR(d)} {cambioTxt(dif)}
        {v.o ? ` (${signo(dif)}${fmtPct(Math.abs(dif / v.o))})` : ''}
      </div>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-ink2">
        <dt>Apertura</dt>
        <dd className="cifra text-ink">{fmtMoney(v.o)}</dd>
        {!dia && (
          <>
            <dt>Máximo</dt>
            <dd className="cifra text-ink">{fmtMoney(v.h)}</dd>
            <dt>Mínimo</dt>
            <dd className="cifra text-ink">{fmtMoney(v.l)}</dd>
          </>
        )}
        <dt>Cierre</dt>
        <dd className="cifra text-ink">{fmtMoney(v.c)}</dd>
        <dt className="mt-1 border-t border-line pt-1">Entró</dt>
        <dd className="cifra mt-1 border-t border-line pt-1 text-ink">{fmtMoney(v.ingresos)}</dd>
        <dt>Salió</dt>
        <dd className="cifra text-ink">{fmtMoney(v.gastos)}</dd>
      </dl>
      {v.parcial.length > 0 && <div className="mt-1.5 text-[11.5px] text-muted">Sin estado completo de {v.parcial.join(' y ')}</div>}
    </>
  )
}

function TooltipFlujo({ v, movs, cat, modo }: { v: Vela; movs: MovClasificado[]; cat: CatMov | null; modo: Modo }): JSX.Element {
  const top = useMemo(() => {
    const porCat = new Map<CatMov, number>()
    for (const m of movs) if (m.naturaleza === 'gasto' && m.fecha >= v.ini && m.fecha <= v.fin) porCat.set(m.categoria, (porCat.get(m.categoria) ?? 0) + m.monto)
    return [...porCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  }, [movs, v.ini, v.fin])
  const neto = netoDe(v)
  const dn: Dir = neto > 50 ? 'sube' : neto < -50 ? 'baja' : 'igual'
  return (
    <>
      <div className="font-semibold text-ink">{v.detalle}</div>
      {cat ? (
        <div className="cifra mt-1 text-[15px] text-ink">
          {fmtMoney(v.cat)} <span className="text-[12px] font-normal text-muted">{catLabel(cat)}</span>
        </div>
      ) : (
        <>
          <div className="mt-0.5 font-medium" style={{ color: COL[modo][dn] }}>
            {FLECHA[dn]} {neto >= 0 ? 'Te quedó' : 'Gastaste de más'} {fmtMoney(Math.abs(neto))}
          </div>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-ink2">
            <dt>Entró</dt>
            <dd className="cifra text-ink">{fmtMoney(v.ingresos)}</dd>
            <dt>Salió</dt>
            <dd className="cifra text-ink">{fmtMoney(v.gastos)}</dd>
            {top.map(([c, t]) => (
              <Fila key={c} k={catLabel(c)} v={fmtMoney(t)} />
            ))}
          </dl>
        </>
      )}
      {v.parcial.length > 0 && <div className="mt-1.5 text-[11.5px] text-muted">Sin estado completo de {v.parcial.join(' y ')}</div>}
    </>
  )
}

function Fila({ k, v }: { k: string; v: string }): JSX.Element {
  return (
    <>
      <dt className="truncate text-muted">{k}</dt>
      <dd className="cifra text-ink2">{v}</dd>
    </>
  )
}

// ---------------------------------------------------------------------------
// Gráfica del saldo (área, línea, velas, barras)

function GraficaSaldo({
  m,
  alto,
  onSelect,
  seleccion
}: {
  m: EstadoMercado<TipoSaldo>
  alto: number
  onSelect?: (v: Vela) => void
  seleccion?: string | null
}): JSX.Element {
  const { modo, cuentasSel } = useStore()
  const { velas, esc, tipo } = m
  const gran = esc.gran
  const maN = gran === 'dia' ? 7 : 4
  const media = useMemo(() => velas.map((_, i) => (i < maN - 1 ? null : velas.slice(i - maN + 1, i + 1).reduce((s, v) => s + v.c, 0) / maN)), [velas, maN])
  const maxVol = useMemo(() => Math.max(1, ...velas.map((v) => v.ingresos + v.gastos)), [velas])
  const cierre = velas[velas.length - 1]?.c
  const apertura = velas[0]?.o
  const colTotal = COL[modo][cierre != null && apertura != null ? dir(apertura, cierre) : 'igual']
  const col = COL[modo]

  return (
    <GraficaTiempo
      periodos={velas}
      px={esc.px}
      onPx={esc.setPx}
      onZoom={esc.zoom}
      alto={alto}
      fitKey={`${esc.fit}|${cuentasSel.join(',')}`}
      franjas={gran !== 'dia'}
      volumen
      hoverPor="periodo"
      etiquetaAria="Saldo de tus cuentas por periodo"
      vacio="Sin movimientos en este rango."
      ultimo={cierre != null ? { valor: cierre, color: colTotal } : undefined}
      seleccion={seleccion}
      onSelect={(i) => velas[i] && onSelect?.(velas[i])}
      dominio={(v) => {
        const vs = velas.slice(v.i0, v.i1 + 1)
        const vals = tipo === 'linea' ? vs.map((x) => x.c) : vs.flatMap((x) => [x.h, x.l])
        return vals.length ? [Math.min(...vals), Math.max(...vals)] : null
      }}
      pintar={(c: Ctx) => {
        const mediaPts = media.map((x, i) => (x == null ? '' : `${c.geo[i].c},${c.y(x)}`)).filter(Boolean).join(' ')
        return (
          <>
            {tipo === 'linea' && (
              <>
                <polyline fill="none" stroke={colTotal} strokeWidth={2.2} strokeLinejoin="round" points={velas.map((v, i) => `${c.geo[i].c},${c.y(v.c)}`).join(' ')} />
                {velas.map((v, i) => (
                  <circle key={v.key} cx={c.geo[i].c} cy={c.y(v.c)} r={c.hoverI === i ? 5 : 3} fill={col[dir(v.o, v.c)]} stroke={c.ch.surface} strokeWidth={1.5} opacity={v.parcial.length ? 0.55 : 1} />
                ))}
              </>
            )}
            {tipo === 'velas' &&
              velas.map((v, i) => {
                const cl = col[dir(v.o, v.c)]
                const g = c.geo[i]
                const marcada = c.hoverI === i
                const bw = Math.max(3, Math.min(26, g.w * 0.6))
                const top = c.y(Math.max(v.o, v.c))
                const bh = Math.max(2, Math.abs(c.y(v.o) - c.y(v.c)))
                return (
                  <g key={v.key} opacity={v.parcial.length ? 0.55 : 1}>
                    {marcada && <rect x={g.x0} y={0} width={g.w} height={c.P} fill={c.ch.ink} opacity={0.06} />}
                    <line x1={g.c} x2={g.c} y1={c.y(v.h)} y2={c.y(v.l)} stroke={cl} strokeWidth={1.5} />
                    <rect x={g.c - bw / 2} y={top} width={bw} height={bh} rx={Math.min(2, bw / 3)} fill={cl} />
                  </g>
                )
              })}
            <polyline fill="none" stroke={c.ch.ink2} strokeWidth={1.3} strokeDasharray="4 3" opacity={0.75} points={mediaPts} />
          </>
        )
      }}
      pintarVolumen={(c: Ctx) =>
        velas.map((v, i) => {
          const g = c.geo[i]
          const bw = Math.max(3, Math.min(26, g.w * 0.6))
          const vol = Math.max(1.5, ((v.ingresos + v.gastos) / maxVol) * c.VOL)
          return <rect key={v.key} x={g.c - bw / 2} y={c.yBase - vol} width={bw} height={vol} rx={Math.min(2, bw / 3)} fill={col[dir(v.o, v.c)]} opacity={0.5} />
        })
      }
      tooltip={({ i }) => (velas[i] ? <TooltipVela v={velas[i]} modo={modo} unidad={UNIDAD[gran]} /> : null)}
    />
  )
}

// ---------------------------------------------------------------------------
// Gráfica de entradas y salidas

function GraficaFlujo({
  m,
  movs,
  cat,
  alto,
  onSelect,
  seleccion
}: {
  m: EstadoMercado<TipoFlujo>
  movs: MovClasificado[]
  cat: CatMov | null
  alto: number
  onSelect?: (v: Vela) => void
  seleccion?: string | null
}): JSX.Element {
  const { modo, cuentasSel } = useStore()
  const { velas, esc, tipo } = m
  const col = COL[modo]
  const acum = useMemo(() => {
    let s = 0
    return velas.map((v) => (s += netoDe(v)))
  }, [velas])
  const colCat = cat && catNat(cat) === 'ingreso' ? col.sube : col.baja
  const ultAcum = acum[acum.length - 1] ?? 0

  return (
    <GraficaTiempo
      periodos={velas}
      px={esc.px}
      onPx={esc.setPx}
      onZoom={esc.zoom}
      alto={alto}
      fitKey={`${esc.fit}|${cuentasSel.join(',')}|${cat ?? ''}`}
      franjas={esc.gran !== 'dia'}
      hoverPor="periodo"
      etiquetaAria="Entradas y salidas por periodo"
      vacio="Sin movimientos en este rango."
      ultimo={!cat && tipo === 'acum' ? { valor: ultAcum, color: col[ultAcum > 50 ? 'sube' : ultAcum < -50 ? 'baja' : 'igual'] } : undefined}
      seleccion={seleccion}
      onSelect={(i) => velas[i] && onSelect?.(velas[i])}
      dominio={(v) => {
        const vs = velas.slice(v.i0, v.i1 + 1)
        if (cat) return [0, Math.max(0, ...vs.map((x) => x.cat))]
        if (tipo === 'barras') return [-Math.max(0, ...vs.map((x) => x.gastos)), Math.max(0, ...vs.map((x) => x.ingresos))]
        const a = acum.slice(v.i0, v.i1 + 1)
        return [Math.min(0, ...a), Math.max(0, ...a)]
      }}
      pintar={(c: Ctx) => {
        const cero = c.y(0)
        const ancho = (i: number): number => Math.max(3, Math.min(26, c.geo[i].w * 0.6))
        const marca = (i: number): JSX.Element | null => (c.hoverI === i ? <rect key={`h${i}`} x={c.geo[i].x0} y={0} width={c.geo[i].w} height={c.P} fill={c.ch.ink} opacity={0.06} /> : null)
        const lineaCero = <line x1={0} x2={c.W} y1={cero} y2={cero} stroke={c.ch.axis} strokeWidth={1.2} />
        if (cat)
          return (
            <>
              {lineaCero}
              {velas.map((v, i) => (
                <g key={v.key} opacity={v.parcial.length ? 0.55 : 1}>
                  {marca(i)}
                  <rect x={c.geo[i].c - ancho(i) / 2} y={Math.min(cero, c.y(v.cat))} width={ancho(i)} height={Math.max(1.5, Math.abs(cero - c.y(v.cat)))} rx={Math.min(2, ancho(i) / 3)} fill={colCat} />
                </g>
              ))}
            </>
          )
        if (tipo === 'acum') {
          const pts = velas.map((_, i) => `${c.geo[i].c},${c.y(acum[i])}`)
          const cl = col[ultAcum > 50 ? 'sube' : ultAcum < -50 ? 'baja' : 'igual']
          return (
            <>
              <defs>
                <linearGradient id={`a${c.uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={cl} stopOpacity={0.34} />
                  <stop offset="100%" stopColor={cl} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              {lineaCero}
              <polygon points={`${c.geo[0].c},${cero} ${pts.join(' ')} ${c.geo[velas.length - 1].c},${cero}`} fill={`url(#a${c.uid})`} />
              <polyline fill="none" stroke={cl} strokeWidth={2.2} strokeLinejoin="round" points={pts.join(' ')} />
              {velas.map((v, i) => (
                <circle key={v.key} cx={c.geo[i].c} cy={c.y(acum[i])} r={c.hoverI === i ? 5 : 2.6} fill={cl} stroke={c.ch.surface} strokeWidth={1.5} />
              ))}
            </>
          )
        }
        return (
          <>
            {lineaCero}
            {velas.map((v, i) => {
              const w = ancho(i)
              return (
                <g key={v.key} opacity={v.parcial.length ? 0.55 : 1}>
                  {marca(i)}
                  <rect x={c.geo[i].c - w / 2} y={c.y(v.ingresos)} width={w} height={Math.max(v.ingresos > 0 ? 1.5 : 0, cero - c.y(v.ingresos))} rx={Math.min(2, w / 3)} fill={col.sube} />
                  <rect x={c.geo[i].c - w / 2} y={cero} width={w} height={Math.max(v.gastos > 0 ? 1.5 : 0, c.y(-v.gastos) - cero)} rx={Math.min(2, w / 3)} fill={col.baja} />
                </g>
              )
            })}
            <polyline fill="none" stroke={c.ch.ink2} strokeWidth={1.3} strokeDasharray="4 3" opacity={0.8} points={velas.map((v, i) => `${c.geo[i].c},${c.y(netoDe(v))}`).join(' ')} />
            {velas.map((v, i) => (
              <circle key={`n${v.key}`} cx={c.geo[i].c} cy={c.y(netoDe(v))} r={c.hoverI === i ? 4.5 : 2.4} fill={c.ch.ink2} stroke={c.ch.surface} strokeWidth={1.2} />
            ))}
          </>
        )
      }}
      tooltip={({ i }) => (velas[i] ? <TooltipFlujo v={velas[i]} movs={movs} cat={cat} modo={modo} /> : null)}
    />
  )
}


// ---------------------------------------------------------------------------
// Pie: la leyenda a la izquierda y los controles de rango y zoom a la derecha

function LineaMedia({ texto }: { texto: string }): JSX.Element {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="18" height="8" aria-hidden>
        <line x1="0" y1="4" x2="18" y2="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
      </svg>
      {texto}
    </span>
  )
}

function LeyendaSaldo({ m, modo }: { m: EstadoMercado<TipoSaldo>; modo: Modo }): JSX.Element {
  return (
    <PieGrafica derecha={<BotonesEscala e={m.esc} />}>
      {(['sube', 'baja', 'igual'] as Dir[]).map((d) => (
        <span key={d} className="flex items-center gap-1.5">
          <span style={{ color: COL[modo][d] }}>{FLECHA[d]}</span>
          {TXT_DIR(d)}
        </span>
      ))}
      <LineaMedia texto="Media móvil" />
      <span className="text-muted">Abajo: dinero movido</span>
    </PieGrafica>
  )
}

function LeyendaFlujo({ m, cat, modo }: { m: EstadoMercado<TipoFlujo>; cat: CatMov | null; modo: Modo }): JSX.Element {
  const c = COL[modo]
  return (
    <PieGrafica derecha={<BotonesEscala e={m.esc} />}>
      {cat ? (
        <span className="flex items-center gap-1.5">
          <span style={{ color: catNat(cat) === 'ingreso' ? c.sube : c.baja }}>■</span>
          {catLabel(cat)}
        </span>
      ) : m.tipo === 'barras' ? (
        <>
          <span className="flex items-center gap-1.5">
            <span style={{ color: c.sube }}>▲</span> Entró
          </span>
          <span className="flex items-center gap-1.5">
            <span style={{ color: c.baja }}>▼</span> Salió
          </span>
          <LineaMedia texto="Neto" />
        </>
      ) : (
        (['sube', 'baja', 'igual'] as Dir[]).map((d) => (
          <span key={d} className="flex items-center gap-1.5">
            <span style={{ color: c[d] }}>{FLECHA[d]}</span>
            {d === 'sube' ? 'Te quedó' : d === 'baja' ? 'Gastaste de más' : 'Quedó parejo'}
          </span>
        ))
      )}
    </PieGrafica>
  )
}

// ---------------------------------------------------------------------------
// Tarjetas

/** Tu saldo como un mercado: línea o velas. La cuenta, las fechas y el intervalo cambian todo lo que ves. */
export function CardMercado({
  m,
  alto = 270,
  seleccion,
  onSelect
}: {
  m: EstadoMercado<TipoSaldo>
  alto?: number
  /** Periodo marcado (se comparte con la tabla de abajo). */
  seleccion?: string | null
  onSelect?: (key: string | null) => void
}): JSX.Element {
  const { modo } = useStore()
  const s = useMemo(() => estadisticas(m.velas), [m.velas])
  const unidad = UNIDAD[m.esc.gran]
  return (
    <Card
      title="Tu saldo en el tiempo"
      subtitle={`Cada ${m.tipo === 'linea' ? 'punto' : 'vela'} es un ${unidad}: cómo cerró tu saldo`}
      actions={<FiltroCuentas />}
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        {s ? <TickerSaldo s={s} unidad={unidad} /> : <span />}
        <Segmented value={m.tipo} onChange={m.setTipo} options={OPC_SALDO} />
      </div>
      <GraficaSaldo m={m} alto={alto} seleccion={seleccion} onSelect={(v) => onSelect?.(seleccion === v.key ? null : v.key)} />
      <LeyendaSaldo m={m} modo={modo} />
    </Card>
  )
}

export interface SeleccionPeriodo {
  key: string
  detalle: string
  ini: string
  fin: string
}

/** Entradas y salidas como un mercado: barras hacia arriba y hacia abajo, y acumulado. */
export function CardFlujo({
  movs,
  cat,
  seleccion,
  onSeleccion,
  alto = 270
}: {
  /** Movimientos a la vista (para el detalle por categoría en el tooltip). */
  movs: MovClasificado[]
  cat: CatMov | null
  seleccion: SeleccionPeriodo | null
  onSeleccion: (p: SeleccionPeriodo | null) => void
  alto?: number
}): JSX.Element {
  const { modo } = useStore()
  const m = useMercado<TipoFlujo>('barras', { cat, rango: '6m' })
  const s = useMemo(() => estadisticasFlujo(m.velas), [m.velas])
  const unidad = UNIDAD[m.esc.gran]
  const elegir = (v: Vela): void => onSeleccion(seleccion?.key === v.key ? null : { key: v.key, detalle: v.detalle, ini: v.ini, fin: v.fin })
  return (
    <Card title={cat ? `${catLabel(cat)} por ${unidad}` : `Entradas y salidas por ${unidad}`} subtitle="Toca un periodo para ver sólo sus movimientos">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        {s ? <TickerFlujo s={s} cat={cat} unidad={unidad} n={m.velas.length} /> : <span />}
        {!cat && <Segmented value={m.tipo} onChange={m.setTipo} options={OPC_FLUJO} />}
      </div>
      <GraficaFlujo m={m} movs={movs} cat={cat} alto={alto} onSelect={elegir} seleccion={seleccion?.key} />
      <LeyendaFlujo m={m} cat={cat} modo={modo} />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Tabla por periodo (la que antes estaba al ampliar la gráfica)

/** Un renglón por periodo con apertura, máximo, mínimo, cierre y cambio. Sigue el rango y el intervalo de la gráfica. */
export function TablaSaldo({ m, seleccion, onSelect }: { m: EstadoMercado<TipoSaldo>; seleccion: string | null; onSelect: (key: string | null) => void }): JSX.Element {
  const { modo } = useStore()
  const fila = useRef<HTMLTableRowElement | null>(null)
  useEffect(() => {
    fila.current?.scrollIntoView({ block: 'nearest' })
  }, [seleccion])
  const unidad = UNIDAD[m.esc.gran]
  const tabla = useMemo(() => [...m.velas].reverse(), [m.velas])
  const col = COL[modo]
  return (
    <Card
      flush
      fijo
      className="h-[390px]"
      title={`Tu saldo, ${unidad} por ${unidad}`}
      subtitle={`${tabla.length} ${tabla.length === 1 ? unidad : unidad === 'mes' ? 'meses' : unidad === 'día' ? 'días' : 'semanas'} · cómo abrió, cuánto subió y bajó y cómo cerró tu saldo`}
    >
      <Desplazable className="border-t border-line">
        {tabla.length ? (
          <table className="tabla [&_td]:!h-10 [&_th]:sticky [&_th]:top-0 [&_th]:z-[1] [&_th]:bg-surface [&_th]:shadow-[0_1px_0_rgb(var(--line))]">
            <thead>
              <tr>
                <th className="!pl-5">Periodo</th>
                <th className="num">Apertura</th>
                <th className="num">Máximo</th>
                <th className="num">Mínimo</th>
                <th className="num">Cierre</th>
                <th className="num">Cambio</th>
                <th className="num">Entró</th>
                <th className="num !pr-5">Salió</th>
              </tr>
            </thead>
            <tbody>
              {tabla.map((v) => {
                const on = seleccion === v.key
                const d = dir(v.o, v.c)
                const dif = v.c - v.o
                return (
                  <tr key={v.key} ref={on ? fila : undefined} onClick={() => onSelect(on ? null : v.key)} className={`cursor-pointer transition-colors hover:bg-raised/70 ${on ? 'bg-accentc/40' : ''}`}>
                    <td className="!pl-5" style={{ boxShadow: `inset 3px 0 0 ${col[d]}` }}>
                      <span className="font-medium text-ink">{v.detalle}</span>
                      {v.parcial.length > 0 && <span className="ml-2 text-[11.5px] text-muted">estado incompleto</span>}
                    </td>
                    <td className="num cifra">{fmtMoney(v.o)}</td>
                    <td className="num cifra">{fmtMoney(v.h)}</td>
                    <td className="num cifra">{fmtMoney(v.l)}</td>
                    <td className="num cifra font-medium text-ink">{fmtMoney(v.c)}</td>
                    <td className="num cifra font-medium" style={{ color: col[d] }}>
                      {FLECHA[d]} {cambioTxt(dif)}
                      {v.o ? <span className="ml-1.5 text-[11.5px] font-normal opacity-80">{signo(dif)}{fmtPct(Math.abs(dif / v.o))}</span> : null}
                    </td>
                    <td className="num cifra" style={{ color: v.ingresos > 0 ? col.sube : undefined }}>{fmtMoney(v.ingresos)}</td>
                    <td className="num cifra !pr-5" style={{ color: v.gastos > 0 ? col.baja : undefined }}>{fmtMoney(v.gastos)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p className="px-5 py-10 text-center text-[13px] text-muted">Sin movimientos en este rango.</p>
        )}
      </Desplazable>
    </Card>
  )
}
