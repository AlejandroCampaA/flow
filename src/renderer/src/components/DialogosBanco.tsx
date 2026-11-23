import { useMemo, useState } from 'react'
import { CircleAlert, CircleCheck, FileText, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { catLabel, catsDe, describirCobertura, huecos, type CatMov, type MovClasificado } from '../lib/gastos'
import { fmtFecha, fmtRango } from '../lib/dates'
import { fmtMoney } from '../lib/format'
import { Badge, Button, Chip } from './ui'
import Modal from './Modal'
import { CatIcon } from './catIcon'
import { FormCategoria, esGenerica } from './Categorias'

/** Cambiar la categoría de un movimiento (sólo ese, o todos los del mismo comercio/persona). */
export function ModalCategoria({ mov, onClose }: { mov: MovClasificado | null; onClose: () => void }): JSX.Element {
  const { banco, reglas, setRegla } = useStore()
  const [alcance, setAlcance] = useState<'comercio' | 'movimiento'>('comercio')
  const [guardando, setGuardando] = useState(false)
  const [nueva, setNueva] = useState(false)

  const iguales = useMemo(() => (mov ? banco.movs.filter((m) => m.claveComercio === mov.claveComercio && m.tipo === mov.tipo).length : 0), [banco.movs, mov])

  if (!mov) return <Modal open={false} onClose={onClose} title="">{null}</Modal>

  const generica = esGenerica(mov.claveComercio)
  const alc = generica ? 'movimiento' : alcance
  const opciones: CatMov[] = [...catsDe(mov.tipo === 'cargo' ? 'gasto' : 'ingreso'), 'interno']
  const tieneRegla = !!reglas[`mov:${mov.id}`] || !!reglas[`com:${mov.claveComercio}`]

  async function elegir(cat: CatMov): Promise<void> {
    if (!mov) return
    setGuardando(true)
    try {
      if (alc === 'comercio') {
        await setRegla(`mov:${mov.id}`, null)
        await setRegla(`com:${mov.claveComercio}`, cat === mov.sugerida ? null : cat)
      } else await setRegla(`mov:${mov.id}`, cat === mov.sugerida && !reglas[`com:${mov.claveComercio}`] ? null : cat)
      onClose()
    } finally {
      setGuardando(false)
    }
  }

  async function restablecer(): Promise<void> {
    if (!mov) return
    await setRegla(`mov:${mov.id}`, null)
    if (alc === 'comercio') await setRegla(`com:${mov.claveComercio}`, null)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={620}
      alto="min(640px, 85vh)"
      title="Cambiar categoría"
      subtitle={`${mov.comercio} · ${fmtFecha(mov.fecha)} · ${mov.tipo === 'cargo' ? '−' : '+'}${fmtMoney(mov.monto)}`}
      footer={
        <>
          {tieneRegla && (
            <Button variant="ghost" onClick={restablecer}>
              <RotateCcw size={14} /> Volver a la automática ({catLabel(mov.sugerida)})
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
        </>
      }
    >
      <p className="mb-4 rounded-xl bg-raised px-3 py-2 text-[12.5px] text-ink2">
        {mov.descripcion}
        {mov.detalle.length > 0 && <span className="text-muted"> · {mov.detalle.slice(0, 2).join(' · ')}</span>}
      </p>

      {!generica && (
        <div className="mb-4 flex flex-wrap gap-2 text-[13px]">
          {(['comercio', 'movimiento'] as const).map((a) => (
            <label
              key={a}
              className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 ${alcance === a ? 'border-accent/60 bg-accent/10 text-ink' : 'border-line text-ink2'}`}
            >
              <input type="radio" className="accent-[rgb(var(--accent))]" checked={alcance === a} onChange={() => setAlcance(a)} />
              {a === 'comercio' ? `Todos los de «${mov.comercio}» (${iguales}) y los que vengan` : 'Sólo este movimiento'}
            </label>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {opciones.map((c) => {
          const actual = c === mov.categoria
          return (
            <button
              key={c}
              disabled={guardando}
              onClick={() => elegir(c)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] transition ${
                actual ? 'border-accent bg-accent/10 font-medium text-ink' : 'border-line text-ink2 hover:border-accent/50 hover:text-ink'
              }`}
            >
              <CatIcon cat={c} className={actual ? 'text-accent' : 'text-muted'} />
              <span className="min-w-0 flex-1 truncate">{catLabel(c)}</span>
              {c === mov.sugerida && <span className="text-[10px] text-muted">auto</span>}
            </button>
          )
        })}
        {!nueva && (
          <button
            onClick={() => setNueva(true)}
            className="flex items-center gap-2 rounded-xl border border-dashed border-outline px-3 py-2.5 text-left text-[13px] text-accent transition hover:bg-accent/10"
          >
            <Plus size={15} /> Nueva categoría
          </button>
        )}
      </div>
      {nueva && (
        <div className="mt-3">
          <FormCategoria nat={mov.tipo === 'cargo' ? 'gasto' : 'ingreso'} onCancelar={() => setNueva(false)} onListo={(c) => elegir(c.id)} />
        </div>
      )}
      {mov.categoria === 'deposito_efectivo' || mov.categoria === 'efectivo' ? (
        <p className="mt-3 text-[12px] text-muted">
          Si el efectivo salió de una de tus cuentas y lo depositaste en la otra, márcalo como «Entre tus cuentas» para que no cuente como ingreso ni como gasto.
        </p>
      ) : null}
    </Modal>
  )
}

/** Estados de cuenta cargados: cobertura por cuenta, validación de saldos y borrado. */
export function ListaEstados(): JSX.Element {
  const { estados, bancoTodo: banco, eliminarEstado, verArchivo } = useStore()
  const [borrar, setBorrar] = useState<string | null>(null)
  const [cuenta, setCuenta] = useState<string | null>(null)
  const orden = estados.filter((e) => !cuenta || e.cuenta === cuenta).sort((a, b) => b.periodoInicio.localeCompare(a.periodoInicio))
  const cuentas = banco.cuentas.filter((c) => !cuenta || c.cuenta === cuenta)

  if (!estados.length)
    return <p className="py-10 text-center text-[13.5px] text-muted">Aún no hay estados de cuenta. Agrega los PDF mensuales de tus cuentas.</p>

  return (
    <>
      {banco.cuentas.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por cuenta">
          <Chip selected={!cuenta} onClick={() => setCuenta(null)}>
            Todas
          </Chip>
          {banco.cuentas.map((c) => (
            <Chip key={c.cuenta} selected={cuenta === c.cuenta} onClick={() => setCuenta(cuenta === c.cuenta ? null : c.cuenta)}>
              {c.producto} <span className="ml-1 text-[12px] opacity-70">{estados.filter((e) => e.cuenta === c.cuenta).length}</span>
            </Chip>
          ))}
        </div>
      )}
      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        {cuentas.map((c) => {
          const hs = huecos(c)
          return (
            <div key={c.cuenta} className="rounded-2xl bg-raised/70 p-4 text-[13px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-ink">
                  {c.producto} <span className="text-muted">{c.corto}</span>
                </span>
                {c.recibeNomina && <Badge tone="accent">Recibe la nómina</Badge>}
              </div>
              <div className="mt-1 text-ink2">Cubierto: {describirCobertura(c)}</div>
              <div className="mt-1 text-[12px] text-muted">
                Saldo al {fmtFecha(c.fechaSaldo)}: <b className="text-ink">{fmtMoney(c.saldoFinal)}</b>
              </div>
              {hs.length > 0 && (
                <div className="mt-1 text-[12px] text-ink2">
                  <CircleAlert size={12} className="mr-1 inline text-warn" />
                  Falta: {hs.map((h) => fmtRango(h.ini, h.fin)).join(', ')}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-raised/40">
        {orden.map((e) => (
          <li key={e.id} className="px-4 py-3 text-[13px]">
            <div className="flex items-center gap-3">
              <FileText size={16} className="shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink">
                  {e.producto} ••{e.cuenta.replace(/\D/g, '').slice(-5, -1)} · {fmtRango(e.periodoInicio, e.periodoFin)}
                </div>
                <div className="text-[12px] text-muted">
                  {e.movimientos.length} movimientos · saldo {fmtMoney(e.saldoInicial)} → {fmtMoney(e.saldoFinal)} · {e.lectura === 'ocr' ? 'leído con OCR' : 'texto del PDF'}
                </div>
                {e.cuadre.avisos.map((a, i) => (
                  <div key={i} className="mt-0.5 text-[12px] text-ink2">
                    <CircleAlert size={12} className="mr-1 inline text-warn" />
                    {a}
                  </div>
                ))}
              </div>
              {e.cuadre.ok ? (
                <Badge tone="good">
                  <CircleCheck size={11} /> Cuadra
                </Badge>
              ) : (
                <Badge tone="warn">Revisar</Badge>
              )}
              {e.copia && (
                <Button variant="outlined" size="sm" onClick={() => verArchivo(e.copia!, e.archivo)} title="Ver el PDF original">
                  <FileText size={14} /> Ver PDF
                </Button>
              )}
              {borrar === e.id ? (
                <span className="flex items-center gap-1">
                  <Button variant="danger" size="sm" onClick={() => eliminarEstado(e.id).then(() => setBorrar(null))}>
                    Borrar
                  </Button>
                  <Button variant="text" size="sm" onClick={() => setBorrar(null)}>
                    No
                  </Button>
                </span>
              ) : (
                <Button variant="danger" size="sm" onClick={() => setBorrar(e.id)} title="Borrar este estado">
                  <Trash2 size={14} />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-muted">
        «Cuadra» = cada movimiento leído coincide con la cadena de saldos y con los totales impresos del estado. Los estados de Santander vienen como imagen y se leen con
        OCR en tu computadora (sin internet).
      </p>
    </>
  )
}
