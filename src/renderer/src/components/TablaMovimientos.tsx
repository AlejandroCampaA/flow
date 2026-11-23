import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftRight, Pencil } from 'lucide-react'
import { catLabel, type MovClasificado, type Naturaleza } from '../lib/gastos'
import { fmtFecha, fromIso } from '../lib/dates'
import { fmtMoney } from '../lib/format'
import { Badge, Buscador, Desplazable, IconoCirculo, Money, Paginacion, Segmented, usePaginacion } from './ui'
import { CatIcon } from './catIcon'
import { useStore } from '../store'

type Tipo = 'todo' | Naturaleza

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function encabezadoDia(f: string): string {
  return `${DIAS[fromIso(f).getDay()]}, ${fmtFecha(f)}`
}

/**
 * Movimientos agrupados por día (patrón de app bancaria), con búsqueda y filtro rápido.
 * Ocupa el alto de su tarjeta: la búsqueda se queda arriba y sólo la lista se desplaza (y va cargando más al bajar).
 */
export default function TablaMovimientos({
  movs,
  onEditar,
  compacto
}: {
  movs: MovClasificado[]
  onEditar: (m: MovClasificado) => void
  /** Para una columna angosta: la búsqueda a todo lo ancho. */
  compacto?: boolean
}): JSX.Element {
  const { banco, recibos } = useStore()
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState<Tipo>('todo')
  const [abierto, setAbierto] = useState<string | null>(null)

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase()
    return movs
      .filter(
        (m) =>
          (tipo === 'todo' || m.naturaleza === tipo) &&
          (!t ||
            m.comercio.toLowerCase().includes(t) ||
            m.descripcion.toLowerCase().includes(t) ||
            m.detalle.some((d) => d.toLowerCase().includes(t)) ||
            catLabel(m.categoria).toLowerCase().includes(t) ||
            m.monto.toFixed(2).includes(t))
      )
      .slice()
      .reverse()
  }, [movs, q, tipo])
  const pag = usePaginacion(filtrados, 25)
  const marco = useRef<HTMLDivElement>(null)
  // Al cambiar el filtro, la lista vuelve arriba (el marco no cambia de tamaño).
  useEffect(() => {
    marco.current?.lastElementChild?.scrollTo({ top: 0 })
  }, [filtrados])

  const entradas = filtrados.filter((m) => m.naturaleza === 'ingreso').reduce((s, m) => s + m.monto, 0)
  const salidas = filtrados.filter((m) => m.naturaleza === 'gasto').reduce((s, m) => s + m.monto, 0)
  const reciboDe = (id?: string): string | null => {
    const r = id ? recibos.find((x) => x.id === id) : undefined
    return r ? (r.tipo === 'liquidacion' ? 'Liq. ahorro' : `S${r.semana}`) : null
  }
  const producto = (c: string): string => banco.cuentas.find((x) => x.cuenta === c)?.producto ?? c

  return (
    <div ref={marco} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 px-5 pb-3">
        <Buscador value={q} onChange={setQ} placeholder="Buscar comercio, persona o importe" ancho={compacto ? 'min-w-[220px] flex-1' : 'w-64'} />
        <Segmented
          value={tipo}
          onChange={setTipo}
          options={[
            { value: 'todo', label: 'Todo' },
            { value: 'gasto', label: 'Salidas' },
            { value: 'ingreso', label: 'Entradas' },
            { value: 'interno', label: 'Traspasos' }
          ]}
        />
        <div className={`text-[12.5px] text-muted ${compacto ? 'w-full' : 'ml-auto'}`}>
          {filtrados.length} movimientos · <span className="text-good">▲ entró {fmtMoney(entradas)}</span> · <span className="text-bad">▼ salió {fmtMoney(salidas)}</span>
        </div>
      </div>
      <Desplazable className="border-t border-line">
        {/* Encabezado de columnas (se queda fijo) */}
        <div className="sticky top-0 z-[2] flex h-[30px] items-center gap-3 bg-surface px-5 text-[11.5px] font-medium uppercase tracking-wide text-muted shadow-[0_1px_0_rgb(var(--line))]">
          <span className="w-9 shrink-0" />
          <span className="min-w-0 flex-1">Movimiento</span>
          <span className="hidden w-[116px] shrink-0 lg:block">Cuenta</span>
          <span className="w-[104px] shrink-0 text-right">Monto</span>
          <span className="hidden w-[100px] shrink-0 text-right md:block">Saldo</span>
        </div>
        <div>
          {pag.visibles.map((m, i) => {
            const nuevoDia = i === 0 || pag.visibles[i - 1].fecha !== m.fecha
            const open = abierto === m.id
            const rec = reciboDe(m.reciboId)
            const entra = m.tipo === 'abono'
            return (
              <Fragment key={m.id}>
                {nuevoDia && <div className="sticky top-[30px] z-[1] bg-raised px-5 py-1.5 text-[12px] font-medium text-ink2">{encabezadoDia(m.fecha)}</div>}
                <div className={`border-b border-line/70 ${open ? 'bg-raised/40' : ''}`}>
                  <div className="flex items-center gap-3 px-5 py-2 transition hover:bg-raised/60">
                    {/* El ícono del tipo de movimiento es el botón para cambiar su categoría */}
                    <button
                      onClick={() => onEditar(m)}
                      aria-label="Cambiar categoría"
                      title={`${catLabel(m.categoria)} · toca para cambiar la categoría`}
                      className="group/ico relative shrink-0 rounded-full outline-none ring-accent transition focus-visible:ring-2"
                    >
                      <IconoCirculo>
                        <CatIcon cat={m.categoria} size={16} />
                      </IconoCirculo>
                      <span className="absolute inset-0 flex items-center justify-center rounded-full bg-accentc text-onaccentc opacity-0 transition group-hover/ico:opacity-100 group-focus-visible/ico:opacity-100">
                        <Pencil size={15} />
                      </span>
                    </button>
                    <button onClick={() => setAbierto(open ? null : m.id)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[14px] text-ink">{m.comercio}</span>
                          {m.parId && <ArrowLeftRight size={12} className="shrink-0 text-muted" aria-label="Traspaso emparejado" />}
                          {rec && <Badge tone="accent">Recibo {rec}</Badge>}
                          {m.verificacion === 'dudoso' && <Badge tone="warn">Revisar</Badge>}
                        </div>
                        <div className="truncate text-[12.5px] text-muted">
                          {catLabel(m.categoria)}
                          {m.regla && ' (tuya)'}
                          <span className="lg:hidden"> · {producto(m.cuenta)}</span>
                        </div>
                      </div>
                      <span className="hidden w-[116px] shrink-0 truncate text-[12.5px] text-ink2 lg:block">{producto(m.cuenta)}</span>
                      <Money value={entra ? m.monto : -m.monto} size="sm" signo className={`w-[104px] shrink-0 text-right ${m.naturaleza === 'interno' ? 'text-muted' : entra ? 'text-good' : 'text-bad'}`} />
                      <span className="cifra hidden w-[100px] shrink-0 text-right text-[12.5px] text-muted md:block">{fmtMoney(m.saldo)}</span>
                    </button>
                  </div>
                  {open && (
                    <div className="grid gap-x-8 gap-y-2 px-5 pb-3 pl-[68px] text-[12.5px] text-ink2 md:grid-cols-2">
                      <div className="space-y-0.5">
                        <div className="text-ink">{m.descripcion}</div>
                        {m.detalle.map((d, j) => (
                          <div key={j}>{d}</div>
                        ))}
                      </div>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted">
                        <dt>Folio</dt>
                        <dd className="text-ink2">{m.folio || '—'}</dd>
                        {m.banco && (
                          <>
                            <dt>Banco</dt>
                            <dd className="text-ink2">{m.banco}</dd>
                          </>
                        )}
                        <dt>Saldo</dt>
                        <dd className="cifra text-ink2">{fmtMoney(m.saldo)}</dd>
                        {m.parId && (
                          <>
                            <dt>Traspaso</dt>
                            <dd className="text-ink2">emparejado con tu otra cuenta</dd>
                          </>
                        )}
                        {m.nota && (
                          <>
                            <dt>Lectura</dt>
                            <dd className="text-ink2">{m.nota}</dd>
                          </>
                        )}
                      </dl>
                    </div>
                  )}
                </div>
              </Fragment>
            )
          })}
          {!filtrados.length && <div className="px-5 py-10 text-center text-[13px] text-muted">Sin movimientos con estos filtros.</div>}
        </div>
        <Paginacion ctl={pag} className="px-4" />
      </Desplazable>
    </div>
  )
}
