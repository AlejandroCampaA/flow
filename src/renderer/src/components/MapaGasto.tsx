import { useEffect, useMemo, useState } from 'react'
import { catLabel, type CatMov, type MovClasificado } from '../lib/gastos'
import { addDays, diffDays, fmtFecha, fromIso } from '../lib/dates'
import { fmtMoney } from '../lib/format'
import { cambioTxt, signo } from './GraficaTiempo'
import { useStore } from '../store'
import { Segmented } from './ui'
import { COL } from './GraficaTiempo'
import type { SeleccionPeriodo } from './Mercado'

const HUECO = 3
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const OPACIDAD = [0.2, 0.38, 0.58, 0.8, 1]

/** 'todos': cada día es lo que te quedó (entró − salió); verde si entró más, rojo si salió más. */
type Nat = 'gasto' | 'ingreso' | 'todos'
const filaDe = (f: string): number => (fromIso(f).getDay() + 6) % 7

/**
 * Calendario de calor: una columna por semana y un renglón por día de la semana.
 * Cuanto más fuerte el color, más dinero salió (o entró) ese día. Toca un día para ver sus movimientos.
 */
export default function MapaGasto({
  movs,
  cat,
  seleccion,
  onSeleccion
}: {
  movs: MovClasificado[]
  cat: CatMov | null
  seleccion: SeleccionPeriodo | null
  onSeleccion: (p: SeleccionPeriodo | null) => void
}): JSX.Element {
  const { modo } = useStore()
  const [nat, setNat] = useState<Nat>('todos')
  const [hover, setHover] = useState<{ f: string; x: number; y: number } | null>(null)
  const [cont, setCont] = useState<HTMLDivElement | null>(null)
  const [cw, setCw] = useState(900)
  const col = COL[modo]
  const color = col[nat === 'gasto' ? 'baja' : 'sube']
  /** Color de un día: en "todos" depende de si te quedó o gastaste de más. */
  const colorDe = (t: number): string => (nat === 'todos' ? (t >= 0 ? col.sube : col.baja) : color)

  const d = useMemo(() => {
    if (!movs.length) return null
    const primero = movs[0].fecha
    const ultimo = movs[movs.length - 1].fecha
    const inicio = addDays(primero, -filaDe(primero))
    const semanas = Math.ceil((diffDays(inicio, ultimo) + 1) / 7)
    const porDia = new Map<string, { t: number; i: number; g: number; n: number; comercios: Map<string, number> }>()
    for (const m of movs) {
      if (m.naturaleza === 'interno' || (nat !== 'todos' && m.naturaleza !== nat) || (cat && m.categoria !== cat)) continue
      const x = porDia.get(m.fecha) ?? { t: 0, i: 0, g: 0, n: 0, comercios: new Map() }
      if (m.naturaleza === 'ingreso') x.i += m.monto
      else x.g += m.monto
      x.t = nat === 'todos' ? x.i - x.g : nat === 'gasto' ? x.g : x.i
      x.n++
      x.comercios.set(m.comercio, (x.comercios.get(m.comercio) ?? 0) + (nat === 'todos' && m.naturaleza === 'gasto' ? -m.monto : m.monto))
      porDia.set(m.fecha, x)
    }
    const positivos = [...porDia.values()].map((x) => Math.abs(x.t)).sort((a, b) => a - b)
    const q = (p: number): number => positivos[Math.floor(p * (positivos.length - 1))] ?? 0
    const cortes = [q(0.25), q(0.5), q(0.75), q(0.92)]
    const nivel = (t: number): number => 1 + cortes.filter((c) => Math.abs(t) > c).length
    // Promedio por día de la semana (contando también los días sin movimientos)
    const suma = Array(7).fill(0) as number[]
    const cuenta = Array(7).fill(0) as number[]
    for (let i = 0; i <= diffDays(primero, ultimo); i++) {
      const f = addDays(primero, i)
      suma[filaDe(f)] += porDia.get(f)?.t ?? 0
      cuenta[filaDe(f)]++
    }
    const prom = suma.map((s, i) => (cuenta[i] ? s / cuenta[i] : 0))
    const total = [...porDia.values()].reduce((a, x) => a + x.t, 0)
    const entro = [...porDia.values()].reduce((a, x) => a + x.i, 0)
    const salio = [...porDia.values()].reduce((a, x) => a + x.g, 0)
    let maxF = ''
    let minF = ''
    for (const [f, x] of porDia) {
      if (!maxF || x.t > (porDia.get(maxF)?.t ?? 0)) maxF = f
      if (!minF || x.t < (porDia.get(minF)?.t ?? 0)) minF = f
    }
    return { primero, ultimo, inicio, semanas, porDia, nivel, prom, maxProm: Math.max(1, ...prom.map(Math.abs)), total, entro, salio, maxF, minF, dias: diffDays(primero, ultimo) + 1 }
  }, [movs, nat, cat])

  // Ancho disponible: los cuadros crecen para llenarlo (con un mínimo; si no caben, se desplaza)
  useEffect(() => {
    if (!cont) return
    const ro = new ResizeObserver(() => setCw(cont.clientWidth))
    ro.observe(cont)
    setCw(cont.clientWidth)
    return () => ro.disconnect()
  }, [cont])
  const semanasN = d?.semanas ?? 1
  const CELDA = Math.max(14, Math.min(30, Math.floor(cw / semanasN) - HUECO))
  const PASO = CELDA + HUECO
  // Lo más reciente queda a la vista
  useEffect(() => {
    if (cont) cont.scrollLeft = cont.scrollWidth
  }, [cont, semanasN, CELDA])

  if (!d) return <p className="py-12 text-center text-[13px] text-muted">Sin movimientos en este rango.</p>

  const meses: { x: number; label: string }[] = []
  for (let w = 0; w < d.semanas; w++) {
    const f = addDays(d.inicio, w * 7)
    const [y, mo] = f.split('-').map(Number)
    const prev = w ? addDays(d.inicio, (w - 1) * 7).slice(0, 7) : ''
    if (f.slice(0, 7) !== prev) meses.push({ x: w * PASO, label: `${MESES[mo - 1]}${mo === 1 ? ` ${y}` : ''}` })
  }
  const verbo = nat === 'gasto' ? 'salió' : 'entró'
  const todos = nat === 'todos'
  const hv = hover ? d.porDia.get(hover.f) : null
  const top = hv ? [...hv.comercios.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3) : []

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
          <div>
            <div className="text-[12px] text-muted">
              {todos ? (d.total >= 0 ? 'Te quedó' : 'Gastaste de más') : nat === 'gasto' ? 'Salió' : 'Entró'}
              {cat ? ` · ${catLabel(cat)}` : ''}
            </div>
            <div className="cifra text-[22px] font-semibold leading-7 text-ink">{fmtMoney(Math.abs(d.total))}</div>
            {todos && (
              <div className="mt-0.5 text-[12.5px] font-medium" style={{ color: colorDe(d.total) }}>
                {d.total >= 0 ? '▲' : '▼'} {cambioTxt(d.total)}
              </div>
            )}
          </div>
          {todos ? (
            <>
              <Dato label="Entró" valor={fmtMoney(d.entro)} color={col.sube} />
              <Dato label="Salió" valor={fmtMoney(d.salio)} color={col.baja} />
              <Dato label="Mejor día" valor={cambioTxt(d.porDia.get(d.maxF)?.t ?? 0)} sub={d.maxF ? fmtFecha(d.maxF, false) : ''} color={col.sube} />
              <Dato label="Peor día" valor={cambioTxt(d.porDia.get(d.minF)?.t ?? 0)} sub={d.minF ? fmtFecha(d.minF, false) : ''} color={col.baja} />
            </>
          ) : (
            <>
              <Dato label="Promedio por día" valor={fmtMoney(d.total / d.dias)} />
              {d.maxF && <Dato label={`Día que más ${verbo}`} valor={fmtMoney(d.porDia.get(d.maxF)!.t)} sub={fmtFecha(d.maxF, false)} />}
            </>
          )}
        </div>
        <Segmented
          value={nat}
          onChange={setNat}
          options={[
            { value: 'gasto', label: 'Salió' },
            { value: 'ingreso', label: 'Entró' },
            { value: 'todos', label: 'Todos' }
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div>
          <div className="flex">
            <div className="shrink-0 pr-2 pt-[22px]" aria-hidden>
              {DIAS.map((x, i) => (
                <div key={x} className="text-right text-[10.5px] text-muted" style={{ height: CELDA, marginBottom: HUECO, visibility: i % 2 === 0 ? 'visible' : 'hidden', lineHeight: `${CELDA}px` }}>
                  {x}
                </div>
              ))}
            </div>
            <div ref={setCont} className="min-w-0 flex-1 overflow-x-auto pb-1">
              <div style={{ width: d.semanas * PASO }}>
                <div className="relative h-[22px]" aria-hidden>
                  {meses.map((m) => (
                    <span key={m.x} className="absolute top-0 text-[11px] text-muted" style={{ left: m.x }}>
                      {m.label}
                    </span>
                  ))}
                </div>
                <div className="grid" style={{ gridTemplateRows: `repeat(7, ${CELDA}px)`, gridAutoFlow: 'column', gridAutoColumns: `${CELDA}px`, gap: HUECO }}>
                  {Array.from({ length: d.semanas * 7 }, (_, i) => {
                    const f = addDays(d.inicio, i)
                    if (f < d.primero || f > d.ultimo) return <span key={i} />
                    const x = d.porDia.get(f)
                    const on = seleccion?.key === f
                    return (
                      <button
                        key={i}
                        aria-label={`${fmtFecha(f)}: ${fmtMoney(x?.t ?? 0)}`}
                        onClick={() => onSeleccion(on ? null : { key: f, detalle: fmtFecha(f), ini: f, fin: f })}
                        onMouseEnter={(e) => setHover({ f, x: e.clientX, y: e.clientY })}
                        onMouseMove={(e) => setHover({ f, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setHover(null)}
                        className={`rounded-[4px] outline-none transition focus-visible:ring-2 focus-visible:ring-accent ${on ? 'ring-2 ring-ink' : 'hover:ring-2 hover:ring-ink/40'} ${x ? '' : 'bg-raised'}`}
                        style={x ? { background: colorDe(x.t), opacity: todos && Math.abs(x.t) < 1 ? 0.2 : OPACIDAD[d.nivel(x.t) - 1] } : undefined}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink2">
            {todos ? (
              <span className="flex items-center gap-1.5">
                Salió más
                {[...OPACIDAD].reverse().map((o) => (
                  <span key={`r${o}`} className="h-3 w-3 rounded-[3px]" style={{ background: col.baja, opacity: o }} />
                ))}
                <span className="h-3 w-3 rounded-[3px] bg-raised" />
                {OPACIDAD.map((o) => (
                  <span key={`v${o}`} className="h-3 w-3 rounded-[3px]" style={{ background: col.sube, opacity: o }} />
                ))}
                Entró más
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                Menos
                <span className="h-3 w-3 rounded-[3px] bg-raised" />
                {OPACIDAD.map((o) => (
                  <span key={o} className="h-3 w-3 rounded-[3px]" style={{ background: color, opacity: o }} />
                ))}
                Más
              </span>
            )}
            <span className="text-muted">Cada cuadro es un día. Toca uno para ver sus movimientos.</span>
          </div>
        </div>

        {/* Qué día de la semana pesa más */}
        <div>
          <div className="mb-2 text-[12.5px] font-medium text-ink2">{todos ? 'Cómo te va cada día de la semana' : 'Promedio por día de la semana'}</div>
          <ul className="space-y-1.5">
            {d.prom.map((p, i) => (
              <li key={DIAS[i]} className="flex items-center gap-2 text-[12.5px]">
                <span className="w-8 text-muted">{DIAS[i]}</span>
                {todos ? (
                  <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-raised" title={cambioTxt(p)}>
                    <span className="absolute inset-y-0 left-1/2 w-px bg-outline" />
                    <span
                      className="absolute inset-y-0 rounded-full"
                      style={{ background: colorDe(p), [p >= 0 ? 'left' : 'right']: '50%', width: `${Math.max(1.5, (Math.abs(p) / d.maxProm) * 50)}%` }}
                    />
                  </span>
                ) : (
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-raised">
                    <span className="block h-full rounded-full" style={{ width: `${Math.max(1.5, (p / d.maxProm) * 100)}%`, background: color, opacity: p === d.maxProm ? 1 : 0.6 }} />
                  </span>
                )}
                <span className="cifra w-[78px] text-right" style={todos ? { color: colorDe(p) } : undefined}>
                  {todos ? cambioTxt(p) : fmtMoney(p)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {hover && (
        <div
          className="pointer-events-none fixed z-[80] w-[220px] rounded-xl bg-surface p-3 text-[12.5px] shadow-pop ring-1 ring-line"
          style={{ left: hover.x > window.innerWidth * 0.65 ? hover.x - 236 : hover.x + 14, top: Math.min(hover.y + 12, window.innerHeight - 190) }}
        >
          <div className="font-semibold text-ink">{`${DIAS[filaDe(hover.f)]} ${fmtFecha(hover.f)}`}</div>
          {hv ? (
            <>
              {todos ? (
                <div className="cifra mt-1 text-[15px] font-medium" style={{ color: colorDe(hv.t) }}>
                  {hv.t >= 0 ? '▲' : '▼'} {cambioTxt(hv.t)}
                </div>
              ) : (
                <div className="cifra mt-1 text-[15px] text-ink">{fmtMoney(hv.t)}</div>
              )}
              <div className="text-[11.5px] text-muted">{hv.n} movimiento{hv.n === 1 ? '' : 's'}</div>
              {todos && (
                <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 text-ink2">
                  <dt>Entró</dt>
                  <dd className="cifra" style={{ color: col.sube }}>{fmtMoney(hv.i)}</dd>
                  <dt>Salió</dt>
                  <dd className="cifra" style={{ color: col.baja }}>{fmtMoney(hv.g)}</dd>
                </dl>
              )}
              <ul className="mt-1.5 space-y-0.5 text-ink2">
                {top.map(([c, t]) => (
                  <li key={c} className="flex justify-between gap-3">
                    <span className="truncate">{c}</span>
                    <span className="cifra">{todos ? `${signo(t)}${fmtMoney(Math.abs(t))}` : fmtMoney(t)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="mt-1 text-muted">Sin movimientos</div>
          )}
        </div>
      )}
    </div>
  )
}

function Dato({ label, valor, sub, color }: { label: string; valor: string; sub?: string; color?: string }): JSX.Element {
  return (
    <div>
      <div className="text-[12px] text-muted">{label}</div>
      <div className="cifra text-[15px] font-medium text-ink" style={color ? { color } : undefined}>
        {valor}
        {sub && <span className="ml-1.5 text-[12px] font-normal text-muted">{sub}</span>}
      </div>
    </div>
  )
}
