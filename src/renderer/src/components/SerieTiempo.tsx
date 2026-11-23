import { useMemo, type ReactNode } from 'react'
import { fmtCompacto, fmtMoney, fmtPct } from '../lib/format'
import { useStore } from '../store'
import { COL, GraficaTiempo, type Ctx, type Escala, type PeriodoT } from './GraficaTiempo'

export interface SerieG {
  key: string
  label: string
  color: string
}

export type TipoSerie = 'barras' | 'area' | 'apilada'

/**
 * Gráfica de tiempo para series de nómina (tiempo extra, ahorro, descuentos…) con el mismo motor que el saldo:
 * zoom con Ctrl + rueda, arrastre, cruz del cursor, etiqueta del último valor y escala vertical automática.
 *
 * - `barras`: columnas apiladas (con el total arriba cuando caben).
 * - `apilada`: áreas apiladas, una capa por serie.
 * - `area`: una línea con relleno por serie, sin apilar.
 * Con `pct` las columnas o capas se reparten el 100% de cada periodo (para ver la composición, no el monto).
 */
export function GraficaSerie<T extends PeriodoT>({
  periodos,
  series,
  valor,
  esc,
  tipo = 'barras',
  pct = false,
  alto = 240,
  fmt = fmtMoney,
  fmtEje,
  fitKey,
  etiquetaAria,
  media,
  extras,
  marcas,
  tooltipExtra,
  seleccion,
  onSelect,
  vacio = 'Sin datos en este rango.'
}: {
  periodos: T[]
  series: SerieG[]
  valor: (p: T, key: string) => number
  esc: Escala
  tipo?: TipoSerie
  /** Cada periodo reparte el 100% entre las series (sólo barras y áreas apiladas). */
  pct?: boolean
  alto?: number
  /** Formato de los valores en el tooltip. */
  fmt?: (v: number) => string
  /** Formato del eje vertical. */
  fmtEje?: (v: number) => string
  fitKey: string
  etiquetaAria: string
  /** Media móvil del total de cada periodo (null donde aún no hay). */
  media?: (number | null)[]
  /** Líneas verticales (fecha) con una etiqueta, p. ej. una liquidación. */
  extras?: { fecha: string; label: string; color: string }[]
  /** Marcas sobre los datos (fechas y color de un aro). */
  marcas?: { fecha: string; color: string }[]
  tooltipExtra?: (p: T) => ReactNode
  /** Periodo marcado (se comparte con la tabla de abajo). */
  seleccion?: string | null
  onSelect?: (p: T) => void
  vacio?: string
}): JSX.Element {
  const { modo } = useStore()
  const col = COL[modo]
  const apilado = tipo !== 'area'
  const enPct = pct && apilado
  const total = (p: T): number => series.reduce((a, s) => a + Math.max(0, valor(p, s.key)), 0)
  const alto1 = (p: T): number => (apilado ? total(p) : Math.max(0, ...series.map((s) => valor(p, s.key))))
  const ult = periodos.length ? periodos[periodos.length - 1] : null
  const ant = periodos.length > 1 ? periodos[periodos.length - 2] : null
  const valUlt = ult ? (apilado ? total(ult) : valor(ult, series[0].key)) : 0
  const valAnt = ant ? (apilado ? total(ant) : valor(ant, series[0].key)) : valUlt
  const colUlt = col[valUlt > valAnt ? 'sube' : valUlt < valAnt ? 'baja' : 'igual']
  const maximo = useMemo(() => Math.max(1, ...periodos.map(alto1)), [periodos, series, tipo]) // eslint-disable-line react-hooks/exhaustive-deps
  // Fracción (o monto) que ocupa una serie dentro de su periodo.
  const parte = (p: T, key: string): number => {
    const v = Math.max(0, valor(p, key))
    if (!enPct) return v
    const t = total(p)
    return t > 0 ? v / t : 0
  }
  const ejePct = (v: number): string => `${Math.round(v * 100)}%`

  return (
    <GraficaTiempo
      periodos={periodos}
      px={esc.px}
      onPx={esc.setPx}
      onZoom={esc.zoom}
      alto={alto}
      fitKey={`${fitKey}|${tipo}|${pct}`}
      franjas
      hoverPor="periodo"
      etiquetaAria={etiquetaAria}
      vacio={vacio}
      fmtEje={enPct ? ejePct : fmtEje}
      seleccion={seleccion}
      onSelect={(i) => periodos[i] && onSelect?.(periodos[i])}
      ultimo={ult && !enPct ? { valor: valUlt, color: colUlt } : undefined}
      dominio={(v) => {
        if (enPct) return [0, 1]
        const vs = periodos.slice(v.i0, v.i1 + 1)
        if (!vs.length) return null
        const m = Math.max(0, ...vs.map(alto1))
        return [0, (m > 0 ? m : maximo) * (tipo === 'barras' ? 1.12 : 1.06)]
      }}
      pintar={(c: Ctx) => {
        const ancho = (i: number): number => Math.max(4, Math.min(34, c.geo[i].w * 0.62))
        const marca = (i: number): JSX.Element | null => (c.hoverI === i ? <rect key={`h${i}`} x={c.geo[i].x0} y={0} width={c.geo[i].w} height={c.P} fill={c.ch.ink} opacity={0.06} /> : null)
        const mediaPts = (media ?? []).map((x, i) => (x == null || !c.geo[i] ? '' : `${c.geo[i].c},${c.y(x)}`)).filter(Boolean).join(' ')
        const lineasX = (extras ?? []).map((e) => {
          const x = c.xFecha(e.fecha)
          if (x < 0 || x > c.W) return null
          return (
            <g key={`x${e.fecha}`}>
              <line x1={x} x2={x} y1={0} y2={c.P} stroke={e.color} strokeDasharray="3 4" opacity={0.8} />
              <text x={x + 4} y={11} fontSize={10.5} fontWeight={600} fill={e.color}>
                {e.label}
              </text>
            </g>
          )
        })
        const lineaMedia = mediaPts && !enPct ? <polyline fill="none" stroke={c.ch.ink2} strokeWidth={1.4} strokeDasharray="4 3" opacity={0.85} points={mediaPts} /> : null

        if (tipo === 'barras')
          return (
            <>
              <line x1={0} x2={c.W} y1={c.y(0)} y2={c.y(0)} stroke={c.ch.axis} />
              {periodos.map((p, i) => {
                let acc = 0
                const visibles = series.filter((s) => parte(p, s.key) > 0)
                const ultima = visibles[visibles.length - 1]?.key
                const t = total(p)
                return (
                  <g key={p.key}>
                    {marca(i)}
                    {series.map((s) => {
                      const v = parte(p, s.key)
                      if (v <= 0) return null
                      const y0 = c.y(acc)
                      acc += v
                      const y1 = c.y(acc)
                      const r = s.key === ultima ? Math.min(3, ancho(i) / 3) : 0
                      return <rect key={s.key} x={c.geo[i].c - ancho(i) / 2} y={y1} width={ancho(i)} height={Math.max(1.5, y0 - y1 - 1)} rx={r} fill={s.color} />
                    })}
                    {!enPct && t > 0 && c.geo[i].w >= 46 && (
                      <text x={c.geo[i].c} y={c.y(t) - 5} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={c.ch.ink2}>
                        {fmtCompacto(t)}
                      </text>
                    )}
                  </g>
                )
              })}
              {lineaMedia}
              {lineasX}
            </>
          )

        if (tipo === 'apilada') {
          // Cada capa va de lo acumulado hasta la serie anterior hasta lo acumulado con ella.
          const acum = periodos.map((p) => {
            let a = 0
            return series.map((s) => (a += parte(p, s.key)))
          })
          const x = (i: number): number => c.geo[i].c
          return (
            <>
              <line x1={0} x2={c.W} y1={c.y(0)} y2={c.y(0)} stroke={c.ch.axis} />
              {periodos.length === 1
                ? periodos.map((p, i) => (
                    <g key={p.key}>
                      {series.map((s, k) => {
                        const y1 = c.y(acum[i][k])
                        const y0 = c.y(k ? acum[i][k - 1] : 0)
                        return <rect key={s.key} x={c.geo[i].x0 + c.geo[i].w * 0.2} width={c.geo[i].w * 0.6} y={y1} height={Math.max(0, y0 - y1)} fill={s.color} />
                      })}
                    </g>
                  ))
                : series.map((s, k) => {
                    const arriba = periodos.map((_, i) => `${x(i)},${c.y(acum[i][k])}`)
                    const abajo = periodos.map((_, i) => `${x(i)},${c.y(k ? acum[i][k - 1] : 0)}`).reverse()
                    return (
                      <g key={s.key}>
                        <polygon points={[...arriba, ...abajo].join(' ')} fill={s.color} opacity={0.88} stroke={c.ch.surface} strokeWidth={1} strokeLinejoin="round" />
                      </g>
                    )
                  })}
              {c.hoverI != null && c.geo[c.hoverI] && <line x1={x(c.hoverI)} x2={x(c.hoverI)} y1={0} y2={c.P} stroke={c.ch.ink} strokeWidth={1} opacity={0.35} />}
              {lineaMedia}
              {lineasX}
            </>
          )
        }

        return (
          <>
            <defs>
              {series.map((s, k) => (
                <linearGradient key={s.key} id={`z${k}${c.uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.34} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            {series.map((s, k) => {
              const pts = periodos.map((p, i) => `${c.geo[i].c},${c.y(valor(p, s.key))}`)
              return (
                <g key={s.key}>
                  <polygon points={`${c.geo[0].c},${c.P} ${pts.join(' ')} ${c.geo[periodos.length - 1].c},${c.P}`} fill={`url(#z${k}${c.uid})`} />
                  <polyline fill="none" stroke={s.color} strokeWidth={2.2} strokeLinejoin="round" points={pts.join(' ')} />
                  {c.px >= 4 && periodos.map((p, i) => <circle key={p.key} cx={c.geo[i].c} cy={c.y(valor(p, s.key))} r={c.hoverI === i ? 5 : 2.6} fill={s.color} stroke={c.ch.surface} strokeWidth={1.4} />)}
                </g>
              )
            })}
            {lineaMedia}
            {(marcas ?? []).map((m) => {
              const i = periodos.findIndex((p) => p.ini <= m.fecha && p.fin >= m.fecha)
              return i < 0 ? null : <circle key={`m${m.fecha}`} cx={c.geo[i].c} cy={c.y(valor(periodos[i], series[0].key))} r={7} fill="none" stroke={m.color} strokeWidth={2} />
            })}
            {lineasX}
          </>
        )
      }}
      tooltip={({ i }) => {
        const p = periodos[i]
        if (!p) return null
        const t = total(p)
        return (
          <>
            <div className="font-semibold text-ink">{p.detalle}</div>
            <dl className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-ink2">
              {[...series]
                .reverse()
                .filter((s) => !apilado || valor(p, s.key) > 0)
                .map((s) => (
                  <Par key={s.key} k={s.label} v={apilado && t > 0 && series.length > 1 ? `${fmt(valor(p, s.key))} · ${fmtPct(valor(p, s.key) / t, 0)}` : fmt(valor(p, s.key))} color={s.color} />
                ))}
              {apilado && series.length > 1 && (
                <>
                  <dt className="mt-1 border-t border-line pt-1 font-semibold text-ink">Total</dt>
                  <dd className="cifra mt-1 border-t border-line pt-1 font-semibold text-ink">{fmt(t)}</dd>
                </>
              )}
            </dl>
            {tooltipExtra?.(p)}
          </>
        )
      }}
    />
  )
}

function Par({ k, v, color }: { k: string; v: string; color?: string }): JSX.Element {
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
