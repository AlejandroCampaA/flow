import { useMemo, useState } from 'react'
import { Check, Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import {
  CATS_GASTO,
  CATS_INGRESO,
  catLabel,
  catsDe,
  idCategoria,
  personas,
  topComercios,
  type CatMov,
  type CatUsuario,
  type MovClasificado
} from '../lib/gastos'
import { fmtFecha } from '../lib/dates'
import { fmtMoney } from '../lib/format'
import { Badge, Buscador, Button, IconoCirculo, Money, Paginacion, Segmented, usePaginacion } from './ui'
import Modal from './Modal'
import { CatIcon, ICONOS_LIBRES } from './catIcon'

/** Claves genéricas: no son un comercio, así que la categoría se aplica movimiento por movimiento. */
export const GENERICAS = new Set(['INTERNO', 'INTERNO-EXT', 'EFECTIVO', 'NOMINA', 'DEPOSITO-EFECTIVO', 'ENLACE-RECIBIDA', 'ENLACE-ENVIADA', 'SPEI-ENVIADA', 'TARJETA'])
export const esGenerica = (clave: string): boolean => GENERICAS.has(clave) || clave.startsWith('SPEI:')

/** Crear o editar una categoría tuya: nombre, tipo e icono. */
export function FormCategoria({
  nat,
  editar,
  onListo,
  onCancelar
}: {
  /** Si viene, el tipo queda fijo (p.ej. al crearla desde un gasto). */
  nat?: 'gasto' | 'ingreso'
  editar?: CatUsuario
  onListo: (c: CatUsuario) => void
  onCancelar: () => void
}): JSX.Element {
  const { guardarCategoria } = useStore()
  const [label, setLabel] = useState(editar?.label ?? '')
  const [tipo, setTipo] = useState<'gasto' | 'ingreso'>(editar?.nat ?? nat ?? 'gasto')
  const [icono, setIcono] = useState(editar?.icono ?? 'tag')
  const nombre = label.trim()
  const repetida = !editar && [...catsDe('gasto'), ...catsDe('ingreso')].some((c) => catLabel(c).toLowerCase() === nombre.toLowerCase())

  async function guardar(): Promise<void> {
    if (!nombre || repetida) return
    const c: CatUsuario = { id: editar?.id ?? idCategoria(nombre), label: nombre, nat: tipo, icono }
    await guardarCategoria(c)
    onListo(c)
  }

  return (
    <div className="rounded-2xl bg-raised/70 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && guardar()}
          placeholder="Nombre (p.ej. Mascotas, Gimnasio, Viajes)"
          maxLength={40}
          className="campo min-w-[220px] flex-1"
          aria-label="Nombre de la categoría"
        />
        {!nat && !editar && (
          <Segmented
            value={tipo}
            onChange={setTipo}
            options={[
              { value: 'gasto', label: 'Gasto' },
              { value: 'ingreso', label: 'Ingreso' }
            ]}
          />
        )}
      </div>
      {repetida && <p className="mt-1.5 text-[12px] text-bad">Ya existe una categoría con ese nombre.</p>}
      <div className="mt-3 text-[12px] text-muted">Icono</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {Object.entries(ICONOS_LIBRES).map(([k, I]) => (
          <button
            key={k}
            onClick={() => setIcono(k)}
            aria-label={`Icono ${k}`}
            aria-pressed={icono === k}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition ${icono === k ? 'bg-accent text-surface' : 'bg-surface text-ink2 hover:text-ink'}`}
          >
            <I size={16} />
          </button>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="text" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button variant="filled" onClick={guardar} disabled={!nombre || repetida}>
          <Check size={15} /> {editar ? 'Guardar' : 'Crear categoría'}
        </Button>
      </div>
    </div>
  )
}

interface GrupoSinCat {
  clave: string
  comercio: string
  movs: MovClasificado[]
  total: number
  ultima: string
  tipo: 'cargo' | 'abono'
}

/** Clasificar lo que quedó en "Otros" y administrar tus categorías. */
export function ModalCategorias({
  pestana,
  onPestana,
  onClose
}: {
  pestana: 'clasificar' | 'tuyas' | null
  onPestana: (p: 'clasificar' | 'tuyas') => void
  onClose: () => void
}): JSX.Element {
  const { banco, categorias } = useStore()
  const sinCat = banco.movs.filter((m) => (m.categoria === 'otros_gastos' || m.categoria === 'otros_ingresos') && !m.regla)
  return (
    <Modal
      open={pestana != null}
      onClose={onClose}
      width={860}
      alto="80vh"
      title="Categorías"
      subtitle="Cuando la app no reconoce un comercio lo deja en «Otros». Aquí lo clasificas, y se recuerda para los que vengan."
      actions={
        <Segmented
          value={pestana ?? 'clasificar'}
          onChange={onPestana}
          options={[
            { value: 'clasificar', label: `Sin clasificar (${sinCat.length})` },
            { value: 'tuyas', label: `Categorías (${CATS_GASTO.length + CATS_INGRESO.length + categorias.length})` }
          ]}
        />
      }
      footer={
        <Button variant="filled" onClick={onClose}>
          Listo
        </Button>
      }
    >
      {pestana === 'tuyas' ? <ListaCategorias /> : <Clasificar movs={sinCat} />}
    </Modal>
  )
}

function Clasificar({ movs }: { movs: MovClasificado[] }): JSX.Element {
  const { setRegla } = useStore()
  const [nueva, setNueva] = useState<GrupoSinCat | null>(null)
  const grupos = useMemo(() => {
    const m = new Map<string, GrupoSinCat>()
    for (const x of movs) {
      // Los genéricos (SPEI sin nombre, depósitos…) van uno por uno.
      const k = esGenerica(x.claveComercio) ? `mov:${x.id}` : `com:${x.claveComercio}`
      const g = m.get(k) ?? { clave: k, comercio: x.comercio, movs: [], total: 0, ultima: x.fecha, tipo: x.tipo }
      g.movs.push(x)
      g.total += x.monto
      if (x.fecha > g.ultima) g.ultima = x.fecha
      m.set(k, g)
    }
    return [...m.values()].sort((a, b) => b.total - a.total)
  }, [movs])
  const pag = usePaginacion(grupos, 10)

  const asignar = (g: GrupoSinCat, cat: CatMov): Promise<void> => setRegla(g.clave, cat)

  if (!grupos.length)
    return (
      <div className="flex flex-col items-center py-14 text-center">
        <IconoCirculo activo>
          <Check size={18} />
        </IconoCirculo>
        <p className="mt-3 text-[15px] font-semibold text-ink">Todo está clasificado</p>
        <p className="mt-1 text-[13px] text-ink2">Si un movimiento quedó en otra categoría equivocada, ábrelo en Movimientos y cámbialo.</p>
      </div>
    )

  return (
    <div>
      {nueva && (
        <div className="mb-3">
          <p className="mb-2 text-[13px] text-ink2">
            Nueva categoría para <b className="text-ink">{nueva.comercio}</b>:
          </p>
          <FormCategoria
            nat={nueva.tipo === 'cargo' ? 'gasto' : 'ingreso'}
            onCancelar={() => setNueva(null)}
            onListo={async (c) => {
              await asignar(nueva, c.id)
              setNueva(null)
            }}
          />
        </div>
      )}
      <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-raised/40">
        {pag.visibles.map((g) => {
          const opciones = catsDe(g.tipo === 'cargo' ? 'gasto' : 'ingreso')
          return (
            <li key={g.clave} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] text-ink">{g.comercio}</div>
                <div className="truncate text-[12px] text-muted">
                  {g.movs.length} movimiento{g.movs.length === 1 ? '' : 's'} · último {fmtFecha(g.ultima, false)}
                  {g.movs[0].detalle[0] ? ` · ${g.movs[0].detalle[0]}` : ''}
                </div>
              </div>
              <Money value={g.tipo === 'cargo' ? -g.total : g.total} signo size="sm" className="w-28 text-right text-ink" />
              <select
                aria-label={`Categoría de ${g.comercio}`}
                className="campo h-9 w-56"
                value=""
                onChange={(e) => {
                  if (e.target.value === '__nueva') setNueva(g)
                  else if (e.target.value) void asignar(g, e.target.value as CatMov)
                }}
              >
                <option value="">Elegir categoría…</option>
                {opciones
                  .filter((c) => c !== 'otros_gastos' && c !== 'otros_ingresos')
                  .map((c) => (
                    <option key={c} value={c}>
                      {catLabel(c)}
                    </option>
                  ))}
                <option value="interno">Entre tus cuentas</option>
                <option value="__nueva">+ Nueva categoría…</option>
              </select>
            </li>
          )
        })}
      </ul>
      <Paginacion ctl={pag} opciones={[10, 25]} />
      <p className="mt-2 text-[12px] text-muted">
        Al elegir, se aplica a todos los movimientos de ese comercio (los de ahora y los que vengan). Para cambiar sólo uno, ábrelo en Movimientos.
      </p>
    </div>
  )
}

function ListaCategorias(): JSX.Element {
  const { banco, categorias, borrarCategoria } = useStore()
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<CatUsuario | null>(null)
  const [borrar, setBorrar] = useState<string | null>(null)
  const usos = useMemo(() => {
    const m = new Map<string, number>()
    for (const x of banco.movs) m.set(x.categoria, (m.get(x.categoria) ?? 0) + 1)
    return m
  }, [banco.movs])

  const Fila = ({ c, tuya }: { c: CatMov; tuya?: CatUsuario }): JSX.Element => (
    <li className="flex items-center gap-3 px-4 py-2">
      <IconoCirculo>
        <CatIcon cat={c} size={16} />
      </IconoCirculo>
      <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{catLabel(c)}</span>
      <span className="text-[12px] text-muted">{usos.get(c) ?? 0} mov.</span>
      {tuya &&
        (borrar === tuya.id ? (
          <span className="flex items-center gap-1">
            <span className="text-[12px] text-ink2">¿Borrar? Sus movimientos vuelven a la automática.</span>
            <Button variant="danger" size="sm" onClick={() => borrarCategoria(tuya.id).then(() => setBorrar(null))}>
              Borrar
            </Button>
            <Button variant="text" size="sm" onClick={() => setBorrar(null)}>
              No
            </Button>
          </span>
        ) : (
          <span className="flex">
            <Button variant="text" size="sm" onClick={() => setEditando(tuya)} title="Editar">
              <Pencil size={14} />
            </Button>
            <Button variant="danger" size="sm" onClick={() => setBorrar(tuya.id)} title="Borrar">
              <Trash2 size={14} />
            </Button>
          </span>
        ))}
    </li>
  )

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-ink">Tus categorías</h3>
          {!creando && !editando && (
            <Button variant="tonal" size="sm" onClick={() => setCreando(true)}>
              <Plus size={15} /> Nueva categoría
            </Button>
          )}
        </div>
        {(creando || editando) && (
          <div className="mb-3">
            <FormCategoria
              key={editando?.id ?? 'nueva'}
              editar={editando ?? undefined}
              onCancelar={() => {
                setCreando(false)
                setEditando(null)
              }}
              onListo={() => {
                setCreando(false)
                setEditando(null)
              }}
            />
          </div>
        )}
        {categorias.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-raised/40">
            {[...categorias]
              .sort((a, b) => a.label.localeCompare(b.label))
              .map((c) => (
                <Fila key={c.id} c={c.id} tuya={c} />
              ))}
          </ul>
        ) : (
          !creando && (
            <p className="flex items-center gap-2 rounded-2xl bg-raised/40 px-4 py-3 text-[13px] text-ink2">
              <Tags size={15} className="text-muted" /> Aún no creas categorías. Crea las que te falten (Mascotas, Gimnasio, Escuela…) y úsalas al clasificar.
            </p>
          )
        )}
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        {(
          [
            ['Gastos (de la app)', CATS_GASTO],
            ['Ingresos (de la app)', CATS_INGRESO]
          ] as const
        ).map(([t, cs]) => (
          <div key={t}>
            <h3 className="mb-2 text-[14px] font-semibold text-ink">{t}</h3>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-raised/40">
              {cs.map((c) => (
                <Fila key={c} c={c} />
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  )
}

/** Todos los comercios (o los de una categoría), con búsqueda. */
export function ModalComercios({ open, onClose, movs, titulo }: { open: boolean; onClose: () => void; movs: MovClasificado[]; titulo: string }): JSX.Element {
  const [q, setQ] = useState('')
  const nat = movs.length && movs.every((m) => m.naturaleza === 'ingreso') ? 'ingreso' : 'gasto'
  const lista = useMemo(() => topComercios(movs, nat).filter((c) => !q || c.comercio.toLowerCase().includes(q.toLowerCase())), [movs, q, nat])
  const total = lista.reduce((s, c) => s + c.total, 0)
  const pag = usePaginacion(lista, 15)
  return (
    <Modal open={open} onClose={onClose} width={720} alto="80vh" title={titulo} subtitle={`${lista.length} comercios y personas · ${fmtMoney(total)}`}>
      <div className="mb-3">
        <Buscador value={q} onChange={setQ} placeholder="Buscar comercio" ancho="w-full" />
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-raised/40">
        {pag.visibles.map((c, i) => (
          <li key={c.clave} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-6 text-right text-[12px] tabular-nums text-muted">{i + 1}</span>
            <IconoCirculo>
              <CatIcon cat={c.categoria} size={16} />
            </IconoCirculo>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] text-ink">{c.comercio}</div>
              <div className="text-[12px] text-muted">
                {catLabel(c.categoria)} · {c.n} pago{c.n === 1 ? '' : 's'} · último {fmtFecha(c.ultima, false)}
              </div>
            </div>
            <div className="text-right">
              <Money value={c.total} size="sm" className="text-ink" />
              <div className="text-[11.5px] text-muted">{total ? Math.round((c.total / total) * 100) : 0}%</div>
            </div>
          </li>
        ))}
      </ul>
      <Paginacion ctl={pag} opciones={[15, 30, 60]} />
    </Modal>
  )
}

/** Con quién intercambias dinero (transferencias a y de personas). */
export function ModalPersonas({ open, onClose, movs }: { open: boolean; onClose: () => void; movs: MovClasificado[] }): JSX.Element {
  const gente = useMemo(() => personas(movs), [movs])
  const pag = usePaginacion(gente, 15)
  return (
    <Modal open={open} onClose={onClose} width={760} alto="80vh" title="Personas" subtitle="Con quién intercambias dinero por transferencia en lo que estás viendo.">
      {gente.length ? (
        <>
          <table className="tabla">
            <thead>
              <tr>
                <th>Persona</th>
                <th className="num">Le enviaste</th>
                <th className="num">Te envió</th>
                <th className="num">Neto</th>
              </tr>
            </thead>
            <tbody>
              {pag.visibles.map((p) => {
                const neto = p.recibido - p.enviado
                return (
                  <tr key={p.clave}>
                    <td>
                      <div className="text-ink">{p.persona}</div>
                      <div className="text-[12px] text-muted">
                        {p.nEnv + p.nRec} transferencia{p.nEnv + p.nRec === 1 ? '' : 's'} · última {fmtFecha(p.ultima, false)}
                      </div>
                    </td>
                    <td className="num">{p.enviado ? fmtMoney(p.enviado) : '—'}</td>
                    <td className="num">{p.recibido ? fmtMoney(p.recibido) : '—'}</td>
                    <td className={`num font-medium ${neto >= 0 ? 'text-good' : 'text-ink'}`}>
                      {neto >= 0 ? '+' : '−'}
                      {fmtMoney(Math.abs(neto))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Paginacion ctl={pag} opciones={[15, 30]} />
        </>
      ) : (
        <p className="py-10 text-center text-[13px] text-muted">Sin transferencias con personas.</p>
      )}
      <div className="mt-2">
        <Badge>Las transferencias entre tus propias cuentas no aparecen aquí.</Badge>
      </div>
    </Modal>
  )
}
