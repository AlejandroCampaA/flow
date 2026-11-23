import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ZoomIn, ZoomOut } from 'lucide-react'
import type { GranVela } from '../lib/gastos'
import { addDays, diffDays } from '../lib/dates'
import { fmtMoney } from '../lib/format'
import { CHROME, type Modo } from '../lib/palette'
import { useStore } from '../store'
import { IconButton, Segmented } from './ui'

// ---------------------------------------------------------------------------
// Colores y formato compartidos por las gráficas "de mercado"

export type Dir = 'sube' | 'baja' | 'igual'

/** Verde sube, rojo baja, gris se mantiene (además de color, cada uno lleva su flecha en leyenda y tooltip). */
export const COL: Record<Modo, Record<Dir, string>> = {
  light: { sube: '#1b7f4b', baja: '#c62f2f', igual: '#7a858c' },
  dark: { sube: '#5fd08c', baja: '#ff8a80', igual: '#98a2a8' }
}
export const FLECHA: Record<Dir, string> = { sube: '▲', baja: '▼', igual: '■' }
export const TXT: Record<Dir, string> = { sube: 'text-good', baja: 'text-bad', igual: 'text-muted' }
export const TXT_DIR = (d: Dir): string => (d === 'sube' ? 'Subió' : d === 'baja' ? 'Bajó' : 'Se mantuvo')

/** Cambio menor al 0.5% (o $50) cuenta como "se mantuvo". */
export function dir(o: number, c: number): Dir {
  const d = c - o
  const umbral = Math.max(50, Math.abs(o) * 0.005)
  return d > umbral ? 'sube' : d < -umbral ? 'baja' : 'igual'
}

export function ticks(min: number, max: number, cuantos = 4): number[] {
  const span = max - min || 1
  const raw = span / cuantos
  const exp = Math.pow(10, Math.floor(Math.log10(raw)))
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * exp).find((s) => s >= raw) ?? 10 * exp
  const out: number[] = []
  for (let v = Math.ceil(min / paso) * paso; v <= max + 1e-9; v += paso) out.push(Math.round(v * 100) / 100)
  return out
}

export const eje = (v: number): string => {
  const n = Math.abs(v)
  const t = n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 ? 1 : 0)}K` : `$${Math.round(n)}`
  return v < 0 ? `−${t}` : t
}
export const signo = (n: number): string => (n > 0 ? '+' : n < 0 ? '−' : '')
export const cambioTxt = (n: number): string => `${signo(n)}${fmtMoney(Math.abs(n))}`

// ---------------------------------------------------------------------------
// Escala de tiempo: rango, intervalo (día/semana/mes) y zoom

export type Rango = '1m' | '3m' | '6m' | '1a' | 'todo'
export const RANGOS: { value: Rango; label: string; dias: number | null }[] = [
  { value: '1m', label: '1M', dias: 30 },
  { value: '3m', label: '3M', dias: 91 },
  { value: '6m', label: '6M', dias: 182 },
  { value: '1a', label: '1A', dias: 365 },
  { value: 'todo', label: 'Todo', dias: null }
]
export const diasDe = (r: Rango): number | null => RANGOS.find((x) => x.value === r)?.dias ?? null

export type GranSel = 'auto' | GranVela
export const UNIDAD: Record<GranVela, string> = { dia: 'día', semana: 'semana', mes: 'mes' }

export const PX_MIN = 0.3
export const PX_MAX = 64
/** Ancho cómodo (px por día) de cada intervalo: al elegirlo a mano, el zoom se acomoda dentro de esta franja. */
const BANDA_PX: Record<GranVela, [number, number]> = { dia: [9, PX_MAX], semana: [2.6, 22], mes: [PX_MIN, 5] }
const limitar = (p: number, [a, b]: [number, number] = [PX_MIN, PX_MAX]): number => Math.min(b, Math.max(a, p))

/** Intervalo que corresponde a un zoom (si el zoom es amplio: meses; medio: semanas; cercano: días). */
export function granDe(px: number, permitidas: GranVela[]): GranVela {
  const g: GranVela = px >= 9 ? 'dia' : px >= 2.6 ? 'semana' : 'mes'
  return permitidas.includes(g) ? g : g === 'dia' ? 'semana' : 'mes'
}

export interface Escala {
  px: number
  setPx: (p: number) => void
  zoom: (factor: number) => void
  rango: Rango
  setRango: (r: Rango) => void
  granSel: GranSel
  setGranSel: (g: GranSel) => void
  gran: GranVela
  permitidas: GranVela[]
  /** Cambia cuando hay que volver a ajustar el rango al ancho de la gráfica. */
  fit: string
}

export function useEscala(permitidas: GranVela[], rangoInicial: Rango): Escala {
  const [px, setPxRaw] = useState(6)
  const [rango, setRangoRaw] = useState<Rango>(rangoInicial)
  const [granSel, setGranSelRaw] = useState<GranSel>('auto')
  const [n, setN] = useState(0)
  const gran = granSel === 'auto' ? granDe(px, permitidas) : granSel
  return {
    px,
    setPx: (p) => setPxRaw(limitar(p)),
    zoom: (f) => setPxRaw((p) => limitar(p * f, granSel === 'auto' ? [PX_MIN, PX_MAX] : BANDA_PX[granSel])),
    rango,
    setRango: (r) => {
      setRangoRaw(r)
      setN((x) => x + 1)
    },
    granSel,
    setGranSel: (g) => {
      setGranSelRaw(g)
      if (g !== 'auto') setPxRaw((p) => limitar(p, BANDA_PX[g]))
    },
    gran,
    permitidas,
    fit: `${n}|${rango}`
  }
}

const OPC_RANGO = RANGOS.map((r) => ({ value: r.value, label: r.label }))
const OPC_GRAN: { value: GranSel; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'dia', label: 'Días' },
  { value: 'semana', label: 'Semanas' },
  { value: 'mes', label: 'Meses' }
]

/** Rango visible, intervalo y zoom: la misma botonera en todas las gráficas. */
export function BotonesEscala({ e }: { e: Escala }): JSX.Element {
  return (
    <>
      <Segmented value={e.rango} onChange={e.setRango} options={OPC_RANGO} />
      {e.permitidas.length > 1 && <Segmented value={e.granSel} onChange={e.setGranSel} options={OPC_GRAN.filter((o) => o.value === 'auto' || e.permitidas.includes(o.value))} />}
      <span className="flex items-center rounded-full bg-raised px-0.5">
        <IconButton title="Alejar (Ctrl + rueda hacia abajo)" onClick={() => e.zoom(1 / 1.4)}>
          <ZoomOut size={17} />
        </IconButton>
        <IconButton title="Acercar (Ctrl + rueda hacia arriba)" onClick={() => e.zoom(1.4)}>
          <ZoomIn size={17} />
        </IconButton>
      </span>
    </>
  )
}

/** Pie de una gráfica: la leyenda a la izquierda y, a la derecha, los controles de rango y zoom. */
export function PieGrafica({ children, derecha }: { children?: ReactNode; derecha?: ReactNode }): JSX.Element {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-line pt-3 text-[12px] text-ink2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1">{children}</div>
      {derecha && <div className="flex flex-wrap items-center gap-2">{derecha}</div>}
    </div>
  )
}

export function Dato({ label, valor, color = 'text-ink', sub }: { label: string; valor: string; color?: string; sub?: string }): JSX.Element {
  return (
    <div>
      <div className="text-[12px] text-muted">{label}</div>
      <div className={`cifra text-[15px] font-medium ${color}`}>
        {valor}
        {sub && <span className="ml-1.5 text-[12px] font-normal text-muted">{sub}</span>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Motor de la gráfica

export interface PeriodoT {
  key: string
  label: string
  sub: string
  banda: string
  bandaLabel: string
  detalle: string
  ini: string
  fin: string
}

/** Lo que se ve ahora mismo (para ajustar la escala vertical a eso). */
export interface Ventana {
  i0: number
  i1: number
  f0: string
  f1: string
}

export interface Ctx {
  geo: { x0: number; w: number; c: number }[]
  /** x del inicio de un día. */
  xFecha: (f: string) => number
  px: number
  y: (v: number) => number
  P: number
  yBase: number
  VOL: number
  W: number
  hoverI: number | null
  hoverFecha: string | null
  seleccion: string | null
  col: Record<Dir, string>
  ch: (typeof CHROME)[Modo]
  modo: Modo
  uid: string
}

interface Hover {
  i: number
  fecha: string
  x: number
  y: number
  py: number
}

export interface PropsGrafica<T extends PeriodoT> {
  periodos: T[]
  px: number
  onPx: (p: number) => void
  onZoom: (factor: number) => void
  alto: number
  /** Cambia cuando hay que ajustar el zoom para que todo el rango quepa y mostrar lo más reciente. */
  fitKey: string
  franjas: boolean
  volumen?: boolean
  hoverPor: 'periodo' | 'dia'
  /** Mínimo y máximo de lo visible (la escala vertical se ajusta sola al acercar). */
  dominio: (v: Ventana) => [number, number] | null
  pintar: (c: Ctx) => ReactNode
  pintarVolumen?: (c: Ctx) => ReactNode
  tooltip: (h: { i: number; fecha: string }) => ReactNode
  ultimo?: { valor: number; color: string }
  onSelect?: (i: number) => void
  seleccion?: string | null
  etiquetaAria: string
  vacio?: string
  /** Formato de los números del eje vertical (por omisión, pesos abreviados). */
  fmtEje?: (v: number) => string
}

/**
 * Gráfica de tiempo con zoom (Ctrl + rueda), arrastre, cruz del cursor, etiqueta de precio y escala vertical automática.
 * No dibuja los datos: eso lo hace quien la usa (`pintar`), con la escala que ésta le da.
 */
export function GraficaTiempo<T extends PeriodoT>(props: PropsGrafica<T>): JSX.Element {
  const { periodos, px, onPx, onZoom, alto, fitKey, franjas, volumen = false, hoverPor, dominio, pintar, pintarVolumen, tooltip, ultimo, onSelect, seleccion = null, etiquetaAria, vacio, fmtEje: fmtY = eje } = props
  const { modo } = useStore()
  const ch = CHROME[modo]
  const col = COL[modo]
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const cont = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(700)
  const [sl, setSl] = useState(0)
  const [hover, setHover] = useState<Hover | null>(null)
  const anchor = useRef<{ dia: number; mx: number } | null>(null)
  const alFinal = useRef<number | null>(null)
  const geomRender = useRef({ left: 0, base: '', px: 1 })
  const geomPrev = useRef({ left: 0, base: '', px: 1 })
  const arrastre = useRef<{ x: number; sl: number } | null>(null)
  const huboArrastre = useRef(false)
  const raf = useRef(0)
  const zoomRef = useRef(onZoom)
  zoomRef.current = onZoom

  const hay = periodos.length > 0
  const AXIS = 64
  const XH = 58
  const VOL = volumen ? Math.round(alto * 0.2) : 0
  const GAP = volumen ? 12 : 0
  const P = alto - VOL - GAP
  const base = hay ? periodos[0].ini : ''
  const fin = hay ? periodos[periodos.length - 1].fin : ''
  const X = (f: string): number => diffDays(base, f) * px
  const contenido = hay ? X(addDays(fin, 1)) + 10 : 0
  const W = Math.max(ancho, contenido)
  const left = W - contenido // si cabe todo, lo más reciente queda a la derecha
  geomRender.current = { left, base, px }

  useLayoutEffect(() => {
    const el = cont.current
    if (!el) return
    const ro = new ResizeObserver(() => setAncho(el.clientWidth))
    ro.observe(el)
    setAncho(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // Ctrl + rueda (o pellizco del trackpad): acerca o aleja alrededor del cursor.
  useEffect(() => {
    const el = cont.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const g = geomRender.current
      const mx = e.clientX - el.getBoundingClientRect().left
      anchor.current = { dia: (el.scrollLeft + mx - g.left) / g.px, mx }
      zoomRef.current(e.deltaY < 0 ? 1.2 : 1 / 1.2)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Al cambiar el rango, la cuenta o el tipo: que todo el rango quepa y se vea lo más reciente.
  useLayoutEffect(() => {
    const el = cont.current
    if (!el || !hay) return
    const dias = diffDays(periodos[0].ini, periodos[periodos.length - 1].fin) + 1
    const t = Math.min(PX_MAX, Math.max(PX_MIN, (el.clientWidth - 16) / dias))
    alFinal.current = t
    onPx(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, hay])

  // Al hacer zoom se conserva lo que está bajo el cursor (o el centro, con los botones).
  useLayoutEffect(() => {
    const el = cont.current
    if (!el || !hay || alFinal.current != null) return
    const prev = geomPrev.current
    if (!prev.base || (prev.px === px && prev.base === base)) return
    const a = anchor.current ?? { dia: (el.scrollLeft + ancho / 2 - prev.left) / prev.px, mx: ancho / 2 }
    anchor.current = null
    const entero = Math.floor(a.dia)
    const dia = diffDays(base, addDays(prev.base, entero)) + (a.dia - entero)
    el.scrollLeft = left + dia * px - a.mx
    setSl(el.scrollLeft)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [px, base])

  useLayoutEffect(() => {
    const el = cont.current
    if (el && hay && alFinal.current != null && Math.abs(px - alFinal.current) < 1e-6) {
      alFinal.current = null
      el.scrollLeft = el.scrollWidth
      setSl(el.scrollLeft)
    }
    geomPrev.current = geomRender.current
  })

  const geo = periodos.map((v) => {
    const x0 = left + X(v.ini)
    const x1 = left + X(addDays(v.fin, 1))
    return { x0, w: x1 - x0, c: (x0 + x1) / 2 }
  })
  const xFecha = (f: string): number => left + diffDays(base, f) * px

  // Lo que se ve ahora (para la escala vertical)
  let i0 = 0
  let i1 = Math.max(0, periodos.length - 1)
  let f0 = base
  let f1 = fin
  if (hay) {
    f0 = addDays(base, Math.max(0, Math.floor((sl - left) / px)))
    f1 = addDays(base, Math.max(0, Math.ceil((sl + ancho - left) / px)))
    i0 = periodos.findIndex((q) => q.fin >= f0)
    if (i0 < 0) i0 = periodos.length - 1
    i1 = -1
    for (let k = periodos.length - 1; k >= 0; k--)
      if (periodos[k].ini <= f1) {
        i1 = k
        break
      }
    if (i1 < i0) i1 = i0
  }
  const dom = hay ? dominio({ i0, i1, f0, f1 }) : null
  const vmin = dom ? dom[0] : 0
  const vmax = dom ? dom[1] : 1
  const pad = (vmax - vmin) * 0.1 || Math.abs(vmax) * 0.05 || 1
  const lo = vmin - pad
  const hi = vmax + pad
  const y = (v: number): number => ((hi - v) / (hi - lo)) * P
  const marcas = ticks(lo, hi)
  const yBase = P + GAP + VOL

  const bandas: { key: string; label: string; x0: number; x1: number }[] = []
  periodos.forEach((v, i) => {
    const u = bandas[bandas.length - 1]
    if (u && u.key === v.banda) u.x1 = geo[i].x0 + geo[i].w
    else bandas.push({ key: v.banda, label: v.bandaLabel, x0: geo[i].x0, x1: geo[i].x0 + geo[i].w })
  })
  // Etiquetas del eje sin encimarse
  const etiquetas: { i: number; x: number; mostrarSub: boolean }[] = []
  let ultimoX = -1e9
  geo.forEach((g, i) => {
    if (g.c - ultimoX >= 34) {
      etiquetas.push({ i, x: g.c, mostrarSub: g.w >= 56 })
      ultimoX = g.c
    }
  })

  const alMover = (e: React.MouseEvent<SVGRectElement>): void => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - r.left
    if (arrastre.current && e.buttons === 1) {
      const dx = e.clientX - arrastre.current.x
      if (Math.abs(dx) > 3) huboArrastre.current = true
      if (cont.current) cont.current.scrollLeft = arrastre.current.sl - dx
      setHover(null)
      return
    }
    const off = Math.floor((x - left) / px)
    if (off < 0 || off > diffDays(base, fin)) return setHover(null)
    const fecha = addDays(base, off)
    let i = -1
    if (hoverPor === 'periodo') {
      i = geo.findIndex((g) => x < g.x0 + g.w)
      if (i < 0) i = geo.length - 1
      if (geo[0] && x < geo[0].x0) i = -1
    } else i = periodos.findIndex((q) => q.ini <= fecha && q.fin >= fecha)
    setHover(i < 0 ? null : { i, fecha, x: e.clientX, y: e.clientY, py: e.clientY - r.top })
  }

  if (!hay) return <p className="py-16 text-center text-[13px] text-muted">{vacio ?? 'Sin datos en este rango.'}</p>

  // Al cambiar de zoom el índice de antes puede no existir: se ignora.
  const h = hover && hover.i < periodos.length && hover.fecha >= base && hover.fecha <= fin ? hover : null
  const xHover = h ? (hoverPor === 'periodo' ? geo[h.i].c : xFecha(h.fecha) + px / 2) : 0
  const precioHover = h && h.py >= 0 && h.py <= P ? hi - (h.py / P) * (hi - lo) : null
  const ctx: Ctx = { geo, xFecha, px, y, P, yBase, VOL, W, hoverI: h?.i ?? null, hoverFecha: h?.fecha ?? null, seleccion, col, ch, modo, uid }
  const yUlt = ultimo ? Math.min(P - 10, Math.max(10, y(ultimo.valor))) : 0
  const contenidoTip = h ? tooltip({ i: h.i, fecha: h.fecha }) : null

  return (
    <div className="flex select-none" style={{ height: alto + XH + 12 }}>
      {/* Eje de precios (fijo) */}
      <svg width={AXIS} height={alto + XH + 12} className="shrink-0" aria-hidden>
        {marcas.map((m) => (
          <text key={m} x={AXIS - 8} y={y(m) + 4} textAnchor="end" fontSize={11} fill={ch.muted}>
            {fmtY(m)}
          </text>
        ))}
        {ultimo && (
          <g>
            <rect x={2} y={yUlt - 10} width={AXIS - 6} height={20} rx={5} fill={ultimo.color} />
            <text x={AXIS / 2 - 1} y={yUlt + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill={modo === 'dark' ? '#0b1f15' : '#ffffff'}>
              {fmtY(ultimo.valor)}
            </text>
          </g>
        )}
        {precioHover != null && h && (
          <g>
            <rect x={2} y={h.py - 10} width={AXIS - 6} height={20} rx={5} fill={ch.ink2} />
            <text x={AXIS / 2 - 1} y={h.py + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill={ch.surface}>
              {fmtY(precioHover)}
            </text>
          </g>
        )}
      </svg>

      <div
        ref={cont}
        className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
        onScroll={(e) => {
          const el = e.currentTarget
          cancelAnimationFrame(raf.current)
          raf.current = requestAnimationFrame(() => setSl(el.scrollLeft))
        }}
      >
        <svg width={W} height={alto + XH} role="img" aria-label={etiquetaAria} onMouseLeave={() => setHover(null)}>
          <defs>
            <clipPath id={`c${uid}`}>
              <rect x={0} y={-4} width={W} height={P + 8} />
            </clipPath>
          </defs>
          {/* Franjas alternas: cada una es una semana o un mes */}
          {franjas && geo.map((g, i) => (i % 2 ? <rect key={periodos[i].key} x={g.x0} y={0} width={g.w} height={yBase} fill={ch.ink} opacity={0.035} /> : null))}
          {marcas.map((m) => (
            <line key={m} x1={0} x2={W} y1={y(m)} y2={y(m)} stroke={ch.grid} />
          ))}
          {seleccion && geo.map((g, i) => (periodos[i].key === seleccion ? <rect key={`s${periodos[i].key}`} x={g.x0} y={0} width={g.w} height={yBase} fill={ch.ink} opacity={0.08} /> : null))}

          <g clipPath={`url(#c${uid})`}>
            {pintar(ctx)}
            {ultimo && <line x1={0} x2={W} y1={y(ultimo.valor)} y2={y(ultimo.valor)} stroke={ultimo.color} strokeDasharray="3 4" opacity={0.7} />}
          </g>
          {pintarVolumen && <g>{pintarVolumen(ctx)}</g>}

          {/* Cruz del cursor */}
          {h && <line x1={xHover} x2={xHover} y1={0} y2={alto} stroke={ch.axis} strokeDasharray="2 3" />}
          {precioHover != null && h && <line x1={0} x2={W} y1={h.py} y2={h.py} stroke={ch.axis} strokeDasharray="2 3" />}
          <line x1={0} x2={W} y1={yBase} y2={yBase} stroke={ch.axis} />

          {/* Eje de abajo: periodo, su rango y el mes o año */}
          {etiquetas.map((e) => (
            <g key={periodos[e.i].key}>
              <text x={e.x} y={yBase + 15} textAnchor="middle" fontSize={11} fontWeight={600} fill={ch.ink2}>
                {periodos[e.i].label}
              </text>
              {e.mostrarSub && (
                <text x={e.x} y={yBase + 28} textAnchor="middle" fontSize={10.5} fill={ch.muted}>
                  {periodos[e.i].sub}
                </text>
              )}
            </g>
          ))}
          {bandas.map((b) => (
            <g key={b.key}>
              <line x1={b.x0 + 2} x2={b.x1 - 2} y1={yBase + 35} y2={yBase + 35} stroke={ch.axis} />
              <text x={(b.x0 + b.x1) / 2} y={yBase + 49} textAnchor="middle" fontSize={11} fill={ch.muted}>
                {b.x1 - b.x0 < 110 ? b.label.split(' ')[0].slice(0, 3) : b.label}
              </text>
            </g>
          ))}

          <rect
            x={0}
            y={0}
            width={W}
            height={alto}
            fill="transparent"
            onMouseDown={(e) => {
              huboArrastre.current = false
              arrastre.current = { x: e.clientX, sl: cont.current?.scrollLeft ?? 0 }
            }}
            onMouseUp={() => (arrastre.current = null)}
            onMouseMove={alMover}
            onClick={() => h && !huboArrastre.current && onSelect?.(h.i)}
            style={{ cursor: arrastre.current ? 'grabbing' : 'crosshair' }}
          />
        </svg>
      </div>

      {h && contenidoTip && (
        <div
          className="pointer-events-none fixed z-[80] w-[240px] rounded-xl bg-surface p-3 text-[12.5px] shadow-pop ring-1 ring-line"
          style={{ left: h.x > window.innerWidth * 0.6 ? h.x - 256 : h.x + 16, top: Math.min(h.y + 12, window.innerHeight - 290) }}
        >
          {contenidoTip}
        </div>
      )}
    </div>
  )
}
