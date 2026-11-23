import { Fragment, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from 'lucide-react'
import type { ConceptoResumen } from '../lib/analytics'
import { CATEGORIA_LABEL, CATEGORIAS } from '../lib/normalize'
import { colorCategoria, tintaSobre } from '../lib/palette'
import { fmtMoney, fmtPct } from '../lib/format'
import { fmtFecha } from '../lib/dates'
import type { Categoria, Recibo } from '../lib/types'
import { useStore } from '../store'
import { Badge, Buscador, Button, Chip, Dot, Paginacion, usePaginacion } from './ui'

type Orden = 'sub' | 'categoria' | 'veces' | 'promedio' | 'total'

/**
 * "¿De dónde viene cada peso?": barra de composición clicable + tabla filtrable, ordenable y
 * con detalle por semana de cada concepto.
 */
export default function TablaConceptos({
  lista,
  recibos,
  bruto
}: {
  lista: ConceptoResumen[]
  recibos: Recibo[]
  bruto: number
}): JSX.Element {
  const { modo } = useStore()
  const [cats, setCats] = useState<Set<Categoria>>(new Set())
  const [q, setQ] = useState('')
  const [orden, setOrden] = useState<{ col: Orden; asc: boolean }>({ col: 'total', asc: false })
  const [abierto, setAbierto] = useState<string | null>(null)

  const porCat = useMemo(() => {
    const m = new Map<Categoria, number>()
    for (const c of lista) m.set(c.categoria, (m.get(c.categoria) ?? 0) + c.total)
    return CATEGORIAS.filter((c) => (m.get(c) ?? 0) > 0).map((c) => ({ categoria: c, valor: m.get(c)! }))
  }, [lista])
  const total = porCat.reduce((s, p) => s + p.valor, 0)

  const toggle = (c: Categoria): void =>
    setCats((s) => {
      const n = new Set(s)
      if (n.has(c)) n.delete(c)
      else n.add(c)
      return n
    })

  const filas = useMemo(() => {
    const s = q.trim().toLowerCase()
    const f = lista.filter(
      (c) =>
        (!cats.size || cats.has(c.categoria)) &&
        (!s || c.sub.toLowerCase().includes(s) || c.conceptosOriginales.some((o) => o.toLowerCase().includes(s)))
    )
    const dir = orden.asc ? 1 : -1
    return [...f].sort((a, b) => {
      const va = orden.col === 'categoria' ? CATEGORIAS.indexOf(a.categoria) : orden.col === 'sub' ? a.sub : a[orden.col]
      const vb = orden.col === 'categoria' ? CATEGORIAS.indexOf(b.categoria) : orden.col === 'sub' ? b.sub : b[orden.col]
      return (typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)) * dir
    })
  }, [lista, cats, q, orden])
  const totalFiltrado = filas.reduce((s, c) => s + c.total, 0)
  const maxTotal = Math.max(1, ...filas.map((c) => c.total))
  const ordinarios = recibos.filter((r) => r.tipo === 'ordinaria').length

  const pag = usePaginacion(filas, 10)

  const Th = ({ col, children, right }: { col: Orden; children: string; right?: boolean }): JSX.Element => (
    <th className={right ? 'num' : ''}>
      <button
        onClick={() => setOrden((o) => ({ col, asc: o.col === col ? !o.asc : col === 'sub' || col === 'categoria' }))}
        className={`inline-flex items-center gap-1 hover:text-ink ${orden.col === col ? 'text-ink' : ''}`}
      >
        {children}
        {orden.col === col && (orden.asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  )

  return (
    <div>
      <div className="px-5">
        {/* Barra de composición: clic en un segmento para filtrar */}
        <div className="flex h-9 w-full gap-[3px]" role="group" aria-label="Composición de percepciones">
          {porCat.map((p) => {
            const pct = p.valor / (total || 1)
            const activo = !cats.size || cats.has(p.categoria)
            return (
              <button
                key={p.categoria}
                onClick={() => toggle(p.categoria)}
                title={`${CATEGORIA_LABEL[p.categoria]}: ${fmtMoney(p.valor)} (${fmtPct(pct)})`}
                className="flex h-full items-center overflow-hidden px-2 text-[11.5px] font-medium transition-opacity first:rounded-l-xl last:rounded-r-xl"
                style={{
                  width: `${pct * 100}%`,
                  background: colorCategoria(p.categoria, modo),
                  color: tintaSobre(p.categoria, modo),
                  opacity: activo ? 1 : 0.25
                }}
              >
                {pct >= 0.07 ? fmtPct(pct, 0) : ''}
              </button>
            )
          })}
        </div>

        {/* Filtros */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {porCat.map((p) => (
            <Chip key={p.categoria} selected={cats.has(p.categoria)} onClick={() => toggle(p.categoria)} icon={cats.has(p.categoria) ? undefined : <Dot color={colorCategoria(p.categoria, modo)} size={8} />}>
              {CATEGORIA_LABEL[p.categoria]}
            </Chip>
          ))}
          {cats.size > 0 && (
            <Button variant="text" size="sm" onClick={() => setCats(new Set())}>
              Quitar filtros
            </Button>
          )}
          <div className="ml-auto">
            <Buscador value={q} onChange={setQ} placeholder="Buscar concepto" ancho="w-56" />
          </div>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th className="w-8 !pl-5" />
              <Th col="sub">Concepto</Th>
              <Th col="categoria">Categoría</Th>
              <Th col="veces">Frecuencia</Th>
              <Th col="promedio" right>Promedio</Th>
              <Th col="total" right>Total</Th>
              <th className="w-[170px] !pr-5">% del bruto</th>
            </tr>
          </thead>
          <tbody>
            {pag.visibles.map((x) => {
              const open = abierto === x.sub
              const color = colorCategoria(x.categoria, modo)
              return (
                <Fragment key={x.sub}>
                  <tr onClick={() => setAbierto(open ? null : x.sub)} className={`fila-clic ${open ? 'bg-raised/60' : ''}`}>
                    <td className="!pl-5 text-muted">{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                    <td className="py-2 text-ink">
                      <div className="flex items-center gap-2">
                        <Dot color={color} size={8} />
                        {x.sub}
                        {x.categoria === 'bonos' && (x.recurrente ? <Badge tone="accent">Cada semana</Badge> : <Badge>Ocasional</Badge>)}
                      </div>
                      {x.conceptosOriginales.some((o) => o.toLowerCase() !== x.sub.toLowerCase()) && (
                        <div className="pl-4 text-[11.5px] text-muted">en recibo: {x.conceptosOriginales.join(', ')}</div>
                      )}
                    </td>
                    <td>{CATEGORIA_LABEL[x.categoria]}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-raised">
                          <div className="h-full rounded-full bg-outline" style={{ width: `${x.frecuencia * 100}%` }} />
                        </div>
                        <span className="text-[12px]">
                          {x.veces}
                          {ordinarios > 0 && <span className="text-muted">/{ordinarios}</span>}
                        </span>
                      </div>
                    </td>
                    <td className="num">{fmtMoney(x.promedio)}</td>
                    <td className="num font-semibold text-ink">{fmtMoney(x.total)}</td>
                    <td className="!pr-5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
                          <div className="h-full rounded-full" style={{ width: `${(x.total / maxTotal) * 100}%`, background: color }} />
                        </div>
                        <span className="w-12 text-right text-[12px]">{fmtPct(bruto ? x.total / bruto : 0)}</span>
                      </div>
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={7} className="!h-auto bg-raised/40 !px-5 py-4">
                        <DetalleConcepto c={x} recibos={recibos} color={color} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {!filas.length && (
              <tr>
                <td colSpan={7} className="text-center text-muted">
                  Ningún concepto coincide con el filtro.
                </td>
              </tr>
            )}
          </tbody>
          {filas.length > 0 && (
            <tfoot>
              <tr className="border-t border-line">
                <td />
                <td colSpan={4} className="px-3 py-3 text-[12.5px] text-muted">
                  {filas.length} concepto{filas.length === 1 ? '' : 's'}
                  {(cats.size > 0 || q) && ' (filtrado)'}
                </td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-ink">{fmtMoney(totalFiltrado)}</td>
                <td className="px-3 py-3 pr-5 text-right text-[12px] text-ink2">{fmtPct(bruto ? totalFiltrado / bruto : 0)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <Paginacion ctl={pag} opciones={[10, 25, 50]} className="px-4" />
    </div>
  )
}

/** Tira de mini-barras por recibo + lista de pagos del concepto. */
function DetalleConcepto({ c, recibos, color }: { c: ConceptoResumen; recibos: Recibo[]; color: string }): JSX.Element {
  const [todas, setTodas] = useState(false)
  const porRecibo = new Map(c.ocurrencias.map((o) => [o.reciboId, o.importe]))
  const max = Math.max(1, ...c.ocurrencias.map((o) => o.importe))
  const ultimas = [...c.ocurrencias].reverse()
  const visibles = todas ? ultimas : ultimas.slice(0, 8)
  const max1 = c.ocurrencias.reduce((a, b) => (b.importe > a.importe ? b : a), c.ocurrencias[0])
  const min1 = c.ocurrencias.reduce((a, b) => (b.importe < a.importe ? b : a), c.ocurrencias[0])

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
      <div>
        <div className="mb-2 text-[12px] text-muted">
          Aparece en {c.ocurrencias.length} de {recibos.length} recibos del rango
        </div>
        <div className="flex h-16 items-end gap-[2px]">
          {recibos.map((r) => {
            const v = porRecibo.get(r.id) ?? 0
            return (
              <div
                key={r.id}
                title={`S${r.semana} · ${fmtFecha(r.fecha)}: ${fmtMoney(v)}`}
                className="min-w-[3px] flex-1 rounded-t-sm"
                style={{ height: v ? `${Math.max(6, (v / max) * 100)}%` : 2, background: v ? color : 'rgb(var(--line))' }}
              />
            )
          })}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-muted">
          <span>{recibos[0] && fmtFecha(recibos[0].fecha)}</span>
          <span>{recibos.length > 0 && fmtFecha(recibos[recibos.length - 1].fecha)}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
          <div className="rounded-xl bg-surface px-3 py-2">
            <div className="text-muted">Mayor</div>
            <div className="font-medium text-ink">{fmtMoney(max1?.importe ?? 0)}</div>
            <div className="text-muted">{max1?.label}</div>
          </div>
          <div className="rounded-xl bg-surface px-3 py-2">
            <div className="text-muted">Menor</div>
            <div className="font-medium text-ink">{fmtMoney(min1?.importe ?? 0)}</div>
            <div className="text-muted">{min1?.label}</div>
          </div>
          <div className="rounded-xl bg-surface px-3 py-2">
            <div className="text-muted">Último</div>
            <div className="font-medium text-ink">{fmtMoney(ultimas[0]?.importe ?? 0)}</div>
            <div className="text-muted">{ultimas[0] && fmtFecha(ultimas[0].fecha)}</div>
          </div>
        </div>
      </div>
      <div>
        <div className="mb-2 text-[12px] text-muted">Pagos más recientes</div>
        <ul className="divide-y divide-line text-[13px]">
          {visibles.map((o) => (
            <li key={o.reciboId} className="flex justify-between py-1.5">
              <span className="text-ink2">
                <span className="font-medium text-ink">{o.label}</span> · {o.sub}
              </span>
              <span className="tabular-nums text-ink">{fmtMoney(o.importe)}</span>
            </li>
          ))}
        </ul>
        {ultimas.length > 8 && (
          <button onClick={() => setTodas((t) => !t)} className="mt-1 text-[12px] text-accent hover:underline">
            {todas ? 'Ver menos' : `Ver las ${ultimas.length}`}
          </button>
        )}
      </div>
    </div>
  )
}
