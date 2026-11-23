import { Fragment, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, CircleCheck, Database, FileText, Plus, Trash2 } from 'lucide-react'
import { semanasFaltantes } from '../lib/analytics'
import { fmtFecha, fmtRango } from '../lib/dates'
import { fmtHoras, fmtMoney } from '../lib/format'
import { CATEGORIA_LABEL, DEDUCCION_LABEL } from '../lib/normalize'
import { colorCategoria } from '../lib/palette'
import type { Recibo } from '../lib/types'
import { useStore } from '../store'
import { Badge, Buscador, Button, Dot, Paginacion, Segmented, usePaginacion } from './ui'
import Modal from './Modal'
import { ListaEstados } from './DialogosBanco'

export type PestanaArchivos = 'recibos' | 'estados'

/** Todos tus archivos en un lugar: recibos de nómina y estados de cuenta. */
export function ModalArchivos({
  pestana,
  onPestana,
  onClose,
  onAdjuntar,
  onDatos
}: {
  pestana: PestanaArchivos | null
  onPestana: (p: PestanaArchivos) => void
  onClose: () => void
  onAdjuntar: () => void
  /** Abre la ventana de la base de datos, los respaldos y las actualizaciones. */
  onDatos: () => void
}): JSX.Element {
  const { recibos, estados } = useStore()
  return (
    <Modal
      open={pestana != null}
      onClose={onClose}
      width={1200}
      alto="88vh"
      title="Tus archivos"
      subtitle={`${recibos.length} recibo${recibos.length === 1 ? '' : 's'} de nómina · ${estados.length} estado${estados.length === 1 ? '' : 's'} de cuenta`}
      actions={
        <Segmented
          value={pestana ?? 'recibos'}
          onChange={onPestana}
          options={[
            { value: 'recibos', label: `Recibos de nómina (${recibos.length})` },
            { value: 'estados', label: `Estados de cuenta (${estados.length})` }
          ]}
        />
      }
      footer={
        <>
          <Button variant="text" onClick={onDatos} title="Base de datos, respaldos y actualizaciones de Flujo">
            <Database size={15} /> Base de datos y respaldos
          </Button>
          <Button variant="tonal" onClick={onAdjuntar}>
            <Plus size={16} /> Agregar archivos
          </Button>
        </>
      }
    >
      {pestana === 'estados' ? <ListaEstados /> : <ListaRecibos />}
    </Modal>
  )
}

function ListaRecibos(): JSX.Element {
  const { recibos, banco } = useStore()
  const [abierto, setAbierto] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [verFaltantes, setVerFaltantes] = useState(false)
  const faltantes = useMemo(() => semanasFaltantes(recibos), [recibos])
  const conc = banco.conciliacion
  const porRecibo = useMemo(() => new Map((conc?.filas ?? []).filter((f) => f.recibo).map((f) => [f.recibo!.id, f])), [conc])
  const sinRecibo = (conc?.filas ?? []).filter((f) => f.estado === 'sin_recibo')

  const lista = useMemo(() => {
    const s = q.trim().toLowerCase()
    const base = [...recibos].reverse()
    if (!s) return base
    return base.filter(
      (r) =>
        `s${r.semana}`.includes(s) ||
        String(r.semana) === s ||
        r.percepciones.some((p) => p.concepto.toLowerCase().includes(s) || p.sub.toLowerCase().includes(s)) ||
        r.fecha.includes(s) ||
        r.fechaPago.includes(s)
    )
  }, [recibos, q])
  const pag = usePaginacion(lista, 25)

  if (!recibos.length)
    return <p className="py-10 text-center text-[13.5px] text-muted">Aún no hay recibos. Agrega tus PDF o XML de nómina.</p>

  return (
    <div className="space-y-3">
      <Modal
        open={verFaltantes}
        onClose={() => setVerFaltantes(false)}
        alto={faltantes.length > 12 ? '70vh' : undefined}
        title={`${faltantes.length} semana${faltantes.length === 1 ? '' : 's'} sin recibo`}
        subtitle="Entre tu primer y tu último recibo."
        footer={<Button variant="text" onClick={() => setVerFaltantes(false)}>Cerrar</Button>}
      >
        <ul className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-3">
          {faltantes.map((f) => (
            <li key={`${f.anio}-${f.semana}`} className="rounded-xl bg-raised px-3 py-2">
              <div className="font-medium text-ink">S{f.semana} {f.anio}</div>
              <div className="text-[12px] text-muted">{f.rango}</div>
            </li>
          ))}
        </ul>
      </Modal>

      {sinRecibo.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl bg-warn/10 px-4 py-3 text-[13px] text-ink">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
          <div>
            Tu estado de cuenta tiene {sinRecibo.length} depósito{sinRecibo.length === 1 ? '' : 's'} de nómina sin recibo cargado:{' '}
            {sinRecibo.map((f) => `${fmtFecha(f.fecha, false)} (${fmtMoney(f.mov!.monto)})`).join(', ')}.
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Buscador value={q} onChange={setQ} placeholder="Semana o concepto" ancho="w-60" />
        {faltantes.length > 0 && (
          <Button variant="outlined" size="sm" onClick={() => setVerFaltantes(true)}>
            <AlertTriangle size={14} className="text-warn" /> {faltantes.length} semana{faltantes.length === 1 ? '' : 's'} sin recibo
          </Button>
        )}
        <span className="ml-auto text-[12.5px] text-muted">
          {lista.length === recibos.length ? `${recibos.length} recibos` : `${lista.length} de ${recibos.length}`} · toca uno para ver el desglose
        </span>
      </div>

      <div className="-mx-6 overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th className="w-8 !pl-6" />
              <th>Semana</th>
              <th>Periodo</th>
              <th>Pago</th>
              <th className="num">Hrs extra</th>
              <th className="num">Bruto</th>
              <th className="num">Deducciones</th>
              <th className="num">Despensa</th>
              <th className="num">Depositado</th>
              <th>En banco</th>
              <th className="!pr-6">Archivo</th>
            </tr>
          </thead>
          <tbody>
            {pag.visibles.map((r) => {
              const open = abierto === r.id
              const extra = r.horas.dobles + r.horas.triples
              const c = porRecibo.get(r.id)
              return (
                <Fragment key={r.id}>
                  <tr onClick={() => setAbierto(open ? null : r.id)} className={`fila-clic ${open ? 'bg-raised/60' : ''}`}>
                    <td className="!pl-6 text-muted">{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                    <td className="font-medium text-ink">
                      {r.tipo === 'liquidacion' ? 'Liq. ahorro' : r.tipo === 'extraordinaria' ? 'Extra' : <>S{r.semana} <span className="font-normal text-muted">{r.anio}</span></>}
                    </td>
                    <td>{fmtRango(r.periodoInicio, r.periodoFin)}</td>
                    <td>
                      {fmtFecha(r.fechaPago)}
                      {r.emisionTardia && (
                        <span className="ml-1.5" title={`Timbrado el ${fmtFecha(r.fechaPago)}, después de su periodo. Se cuenta en la semana ${r.semana}.`}>
                          <Badge tone="warn">re-expedido</Badge>
                        </span>
                      )}
                    </td>
                    <td className="num">{extra ? fmtHoras(extra) : '—'}</td>
                    <td className="num text-ink">{fmtMoney(r.totales.bruto)}</td>
                    <td className="num">{fmtMoney(r.totales.deducciones)}</td>
                    <td className="num">{r.totales.despensa ? fmtMoney(r.totales.despensa) : '—'}</td>
                    <td className="num font-semibold text-ink">{fmtMoney(r.totales.depositado)}</td>
                    <td>
                      {c?.estado === 'coincide' ? (
                        <span className="inline-flex items-center gap-1 text-[12.5px] text-good" title={`Depositado el ${fmtFecha(c.fecha)} en ${c.mov?.producto}`}>
                          <CircleCheck size={14} /> {fmtFecha(c.fecha, false)}
                        </span>
                      ) : c?.estado === 'diferencia' ? (
                        <Badge tone="warn">Dif. {fmtMoney(c.diferencia ?? 0)}</Badge>
                      ) : c?.estado === 'sin_deposito' ? (
                        <Badge tone="warn">No aparece</Badge>
                      ) : (
                        <span className="text-muted" title="No hay estado de cuenta de esa fecha">—</span>
                      )}
                    </td>
                    <td className="!pr-6">
                      <div className="flex gap-1">
                        {r.fuentes.map((f) => (
                          <Badge key={f}>{f.toUpperCase()}</Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={11} className="!h-auto bg-raised/40 p-0">
                        <DetalleRecibo r={r} onClose={() => setAbierto(null)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <Paginacion ctl={pag} className="-mx-2" />
    </div>
  )
}

function DetalleRecibo({ r, onClose }: { r: Recibo; onClose: () => void }): JSX.Element {
  const { modo, eliminarRecibo, abrirOriginal } = useStore()
  const [confirmar, setConfirmar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const acum = r.ahorro.acumulado

  return (
    <div className="grid grid-cols-1 gap-6 px-6 py-5 lg:grid-cols-2">
      <div>
        <h3 className="mb-2 text-[13px] font-semibold text-ink">Percepciones</h3>
        <table className="w-full text-[13px]">
          <tbody>
            {r.percepciones.map((p, i) => (
              <tr key={i} className="border-b border-line">
                <td className="py-1.5">
                  <div className="flex items-center gap-2 text-ink">
                    <Dot color={colorCategoria(p.categoria, modo)} size={8} />
                    {p.concepto}
                  </div>
                  <div className="pl-4 text-[11px] text-muted">
                    {CATEGORIA_LABEL[p.categoria]}
                    {(p.exento > 0 || p.gravado > 0) && ` · exento ${fmtMoney(p.exento)} · gravado ${fmtMoney(p.gravado)}`}
                  </div>
                </td>
                <td className="py-1.5 text-right text-ink">{fmtMoney(p.importe)}</td>
              </tr>
            ))}
            <tr>
              <td className="py-2 font-semibold text-ink">Total percepciones</td>
              <td className="py-2 text-right font-semibold text-ink">{fmtMoney(r.totales.bruto)}</td>
            </tr>
          </tbody>
        </table>

        {(r.horas.dobles > 0 || r.horas.triples > 0 || r.horas.normales != null) && (
          <div className="mt-4 grid grid-cols-3 gap-3 text-[13px]">
            <Mini label="Horas normales" value={r.horas.normales != null ? fmtHoras(r.horas.normales) : '—'} />
            <Mini label="Extra dobles" value={`${fmtHoras(r.horas.dobles)} · ${fmtMoney(r.horas.importeDobles)}`} />
            <Mini label="Extra triples" value={`${fmtHoras(r.horas.triples)} · ${fmtMoney(r.horas.importeTriples)}`} />
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-[13px] font-semibold text-ink">Deducciones</h3>
        <table className="w-full text-[13px]">
          <tbody>
            {r.deducciones.length === 0 && (
              <tr>
                <td className="py-1.5 text-muted">Sin deducciones</td>
              </tr>
            )}
            {r.deducciones.map((d, i) => (
              <tr key={i} className="border-b border-line">
                <td className="py-1.5 text-ink">
                  {d.concepto}
                  <span className="ml-2 text-[11px] text-muted">{DEDUCCION_LABEL[d.tipo]}</span>
                </td>
                <td className="py-1.5 text-right text-ink">{fmtMoney(d.importe)}</td>
              </tr>
            ))}
            <tr>
              <td className="py-2 font-semibold text-ink">Total deducciones</td>
              <td className="py-2 text-right font-semibold text-ink">{fmtMoney(r.totales.deducciones)}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-4 grid grid-cols-3 gap-3 text-[13px]">
          <Mini label="Neto depositado" value={fmtMoney(r.totales.depositado)} strong />
          <Mini label="Despensa (vales)" value={fmtMoney(r.totales.despensa)} />
          <Mini label="Total recibido" value={fmtMoney(r.totales.neto)} />
        </div>

        {(acum || r.ahorro.empleado > 0 || r.tipo === 'liquidacion') && (
          <div className="mt-4 rounded-xl bg-surface p-3 text-[13px]">
            <div className="mb-2 font-semibold text-ink">Fondo de ahorro</div>
            {r.tipo === 'liquidacion' ? (
              <div className="text-ink2">
                Devolución {fmtMoney(r.ahorro.devolucion)} + intereses {fmtMoney(r.ahorro.interes)} ={' '}
                <span className="font-semibold text-ink">{fmtMoney(r.ahorro.devolucion + r.ahorro.interes)}</span>
              </div>
            ) : (
              <div className="text-ink2">
                Aporte tuyo {fmtMoney(r.ahorro.empleado)} · empresa {fmtMoney(r.ahorro.empresa)}
                {r.ahorro.empresaEstimada && <span className="text-muted"> (la empresa iguala tu aporte; no viene desglosado)</span>}
              </div>
            )}
            {acum && r.tipo !== 'liquidacion' && (
              <div className="mt-1 text-ink2">
                Acumulado en recibo: tuyo {fmtMoney(acum.empleado)} · empresa {fmtMoney(acum.empresa)} ·{' '}
                <span className="font-semibold text-ink">total {fmtMoney(acum.acumulado)}</span>
                {acum.prestamo > 0 && ` · préstamo ${fmtMoney(acum.prestamo)} · saldo ${fmtMoney(acum.saldo)}`}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {r.docs.map((d) => (
            <Button
              key={d.fuente}
              variant="outlined"
              size="sm"
              onClick={async () => setError(await abrirOriginal(d))}
              title={d.archivo}
            >
              <FileText size={14} /> Ver {d.fuente.toUpperCase()}
            </Button>
          ))}
          <Button variant="danger" size="sm" onClick={() => setConfirmar(true)}>
            <Trash2 size={14} /> Eliminar
          </Button>
        </div>
        <Modal
          open={confirmar}
          onClose={() => setConfirmar(false)}
          title="¿Eliminar este recibo?"
          subtitle={`Semana ${r.semana} · ${fmtRango(r.periodoInicio, r.periodoFin)}`}
          footer={
            <>
              <Button variant="text" onClick={() => setConfirmar(false)}>Cancelar</Button>
              <Button variant="filled" onClick={async () => { setConfirmar(false); await eliminarRecibo(r.id); onClose() }}>
                Sí, eliminar
              </Button>
            </>
          }
        >
          <p className="text-[13px] text-ink2">
            Se quitará de la base de datos junto con su copia del archivo original. Puedes volver a adjuntarlo cuando quieras.
          </p>
        </Modal>
        {error && <p className="mt-2 text-[12px] text-bad">{error}</p>}
        <p className="mt-3 text-[11px] text-muted">Folio fiscal {r.id}</p>
      </div>
    </div>
  )
}

function Mini({ label, value, strong }: { label: string; value: string; strong?: boolean }): JSX.Element {
  return (
    <div className="rounded-xl bg-surface px-3 py-2">
      <div className="text-[11.5px] text-muted">{label}</div>
      <div className={`mt-0.5 tabular-nums ${strong ? 'font-semibold text-ink' : 'text-ink'}`}>{value}</div>
    </div>
  )
}
