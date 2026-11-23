import { useLayoutEffect, useRef, useState } from 'react'
import type { Flujo, NodoFlujo } from '../lib/gastos'
import { fmtMoney, fmtPct } from '../lib/format'
import { CHROME } from '../lib/palette'
import { useStore } from '../store'

const NODO_W = 12
const CENTRO_W = 150
const CENTRO_H = 260
const SLOT_MIN = 32
const GAP = 8
const HEAD = 30

interface Pos {
  n: NodoFlujo
  /** Bloque dibujado. */
  y: number
  h: number
  /** Banda en el bloque central. */
  cy: number
  ch: number
  /** Centro vertical de la etiqueta. */
  ly: number
}

/**
 * Cómo se movió el dinero, en tres columnas fijas: de dónde entró → tus cuentas → en qué salió.
 * Cada banda es proporcional al importe. Pasa el cursor para ver el detalle; toca una categoría para filtrar.
 */
export default function FlujoDiagrama({
  flujo,
  colores,
  seleccion,
  onNodo
}: {
  flujo: Flujo
  colores: { entrada: string; salida: string; neutro: string; centro: string }
  seleccion?: string | null
  onNodo?: (n: NodoFlujo) => void
}): JSX.Element {
  const { modo } = useStore()
  const c = CHROME[modo]
  const wrap = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(900)
  const [hover, setHover] = useState<{ lado: 'e' | 's'; key: string; x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    if (!wrap.current) return
    const ro = new ResizeObserver((e) => setW(e[0].contentRect.width))
    ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [])

  if (!flujo.total) return <div ref={wrap} className="py-10 text-center text-[13px] text-muted">Sin movimientos en este alcance.</div>

  const W = Math.max(680, w)
  const LW = Math.min(300, Math.max(170, W * 0.25))
  const xL = LW
  const xR = W - LW - NODO_W
  const xC = W / 2 - CENTRO_W / 2
  const k = CENTRO_H / flujo.total
  const maxChars = Math.floor((LW - 20) / 7)

  const columna = (ns: NodoFlujo[]): { pos: Pos[]; alto: number } => {
    let cy = 0
    let y = 0
    const pos = ns.map((n) => {
      const ch = n.valor * k
      const h = Math.max(2, ch)
      const slot = Math.max(h, SLOT_MIN)
      const p = { n, y: y + (slot - h) / 2, h, cy, ch, ly: y + slot / 2 }
      y += slot + GAP
      cy += ch
      return p
    })
    return { pos, alto: y - GAP }
  }
  const izq = columna(flujo.entradas)
  const der = columna(flujo.salidas)
  const cuerpo = Math.max(CENTRO_H, izq.alto, der.alto)
  const H = HEAD + cuerpo + 12
  const top = (alto: number): number => HEAD + (cuerpo - alto) / 2
  const tL = top(izq.alto)
  const tR = top(der.alto)
  const tC = top(CENTRO_H)

  const color = (n: NodoFlujo, lado: 'e' | 's'): string => (n.tipo !== 'cat' ? colores.neutro : lado === 'e' ? colores.entrada : colores.salida)
  const banda = (x0: number, y0: number, x1: number, y1: number, h0: number, h1: number): string => {
    const xm = (x0 + x1) / 2
    return `M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1} L${x1},${y1 + h1} C${xm},${y1 + h1} ${xm},${y0 + h0} ${x0},${y0 + h0} Z`
  }
  const activo = (lado: 'e' | 's', key: string): boolean => hover?.lado === lado && hover.key === key
  const opacidad = (lado: 'e' | 's', key: string): number => (hover ? (activo(lado, key) ? 0.55 : 0.1) : 0.28)
  const recorta = (s: string): string => (s.length > maxChars ? s.slice(0, maxChars - 1) + '…' : s)

  const eventos = (lado: 'e' | 's', n: NodoFlujo) => ({
    onMouseMove: (e: React.MouseEvent) => {
      const r = wrap.current!.getBoundingClientRect()
      setHover({ lado, key: n.key, x: e.clientX - r.left + wrap.current!.scrollLeft, y: e.clientY - r.top })
    },
    onMouseLeave: () => setHover(null),
    onClick: n.cat && onNodo ? () => onNodo(n) : undefined,
    style: { cursor: n.cat && onNodo ? 'pointer' : 'default' }
  })

  const etiqueta = (p: Pos, lado: 'e' | 's', base: number): JSX.Element => {
    const sel = seleccion != null && p.n.cat === seleccion
    const x = lado === 'e' ? xL - 10 : xR + NODO_W + 10
    const anchor = lado === 'e' ? 'end' : 'start'
    const y = base + p.ly
    return (
      <g {...eventos(lado, p.n)}>
        {/* zona de clic más grande que el texto */}
        <rect x={lado === 'e' ? 0 : xR} y={base + p.ly - SLOT_MIN / 2} width={LW + NODO_W} height={SLOT_MIN} fill="transparent" />
        <text x={x} y={y - 2} textAnchor={anchor} fontSize={12.5} fill={p.n.tipo === 'cat' ? c.ink : c.ink2} fontWeight={sel ? 700 : 500} textDecoration={sel ? 'underline' : undefined}>
          {recorta(p.n.name)}
        </text>
        <text x={x} y={y + 13} textAnchor={anchor} fontSize={11.5} fill={c.muted}>
          {fmtMoney(p.n.valor)} · {fmtPct(p.n.valor / flujo.total, 0)}
        </text>
      </g>
    )
  }

  const tip = hover ? (hover.lado === 'e' ? flujo.entradas : flujo.salidas).find((n) => n.key === hover.key) : null

  return (
    <div ref={wrap} className="relative w-full overflow-x-auto">
      <svg width={W} height={H} role="img" aria-label={`Diagrama: entró ${fmtMoney(flujo.total)} y salió lo mismo, por categoría`}>
        {/* Encabezados de columna */}
        <text x={xL + NODO_W} y={16} textAnchor="end" fontSize={12} fontWeight={600} fill={c.ink2}>
          DE DÓNDE ENTRÓ
        </text>
        <text x={xR} y={16} fontSize={12} fontWeight={600} fill={c.ink2}>
          EN QUÉ SALIÓ
        </text>

        {/* Bandas */}
        {izq.pos.map((p) => (
          <path
            key={'be' + p.n.key}
            d={banda(xL + NODO_W, tL + p.y, xC, tC + p.cy, p.h, p.ch)}
            fill={color(p.n, 'e')}
            opacity={opacidad('e', p.n.key)}
            {...eventos('e', p.n)}
          />
        ))}
        {der.pos.map((p) => (
          <path
            key={'bs' + p.n.key}
            d={banda(xC + CENTRO_W, tC + p.cy, xR, tR + p.y, p.ch, p.h)}
            fill={color(p.n, 's')}
            opacity={opacidad('s', p.n.key)}
            {...eventos('s', p.n)}
          />
        ))}

        {/* Bloques laterales */}
        {izq.pos.map((p) => (
          <rect key={'ne' + p.n.key} x={xL} y={tL + p.y} width={NODO_W} height={p.h} rx={3} fill={color(p.n, 'e')} {...eventos('e', p.n)} />
        ))}
        {der.pos.map((p) => (
          <rect key={'ns' + p.n.key} x={xR} y={tR + p.y} width={NODO_W} height={p.h} rx={3} fill={color(p.n, 's')} {...eventos('s', p.n)} />
        ))}
        {izq.pos.map((p) => (
          <g key={'le' + p.n.key}>{etiqueta(p, 'e', tL)}</g>
        ))}
        {der.pos.map((p) => (
          <g key={'ls' + p.n.key}>{etiqueta(p, 's', tR)}</g>
        ))}

        {/* Centro: tus cuentas */}
        <rect x={xC} y={tC} width={CENTRO_W} height={CENTRO_H} rx={14} fill={colores.centro} opacity={0.16} />
        <rect x={xC} y={tC} width={CENTRO_W} height={CENTRO_H} rx={14} fill="none" stroke={colores.centro} strokeOpacity={0.5} />
        <text x={W / 2} y={tC + CENTRO_H / 2 - 14} textAnchor="middle" fontSize={14} fontWeight={600} fill={c.ink}>
          {flujo.centro}
        </text>
        <text x={W / 2} y={tC + CENTRO_H / 2 + 6} textAnchor="middle" fontSize={13} fill={c.ink2}>
          {fmtMoney(flujo.total)}
        </text>
        <text x={W / 2} y={tC + CENTRO_H / 2 + 24} textAnchor="middle" fontSize={11} fill={c.muted}>
          {flujo.cuentas.length > 1 ? `${flujo.cuentas.length} cuentas` : 'pasaron por aquí'}
        </text>
      </svg>

      {tip && hover && (
        <div
          className="pointer-events-none absolute z-20 w-64 rounded-xl bg-surface px-3.5 py-2.5 text-[12.5px] shadow-pop ring-1 ring-line"
          style={{ left: Math.min(hover.x + 14, W - 270), top: hover.y + 14 }}
        >
          <div className="font-semibold text-ink">{hover.lado === 'e' ? `${tip.name} → ${flujo.centro}` : `${flujo.centro} → ${tip.name}`}</div>
          <div className="mt-1 flex justify-between text-ink2">
            <span>{fmtMoney(tip.valor)}</span>
            <span>
              {fmtPct(tip.valor / flujo.total, 1)} de lo que {hover.lado === 'e' ? 'entró' : 'salió'}
            </span>
          </div>
          {tip.n > 0 && <div className="text-muted">{tip.n} movimiento{tip.n === 1 ? '' : 's'}</div>}
          {tip.nota && <div className="mt-1 text-muted">{tip.nota}</div>}
          {tip.cat && onNodo && <div className="mt-1 text-accent">Toca para ver sólo esta categoría</div>}
        </div>
      )}
    </div>
  )
}
