import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Check, CheckCheck, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, FileWarning, PiggyBank, ReceiptText, Tags, Undo2, Upload, X } from 'lucide-react'
import { useStore } from '../store'
import { filtrarMovs, huecos } from '../lib/gastos'
import { analizarAhorro, semanasFaltantes } from '../lib/analytics'
import { addDays, dateToIso, fmtFecha, fmtRango } from '../lib/dates'
import type { Foco } from '../pages/Resumen'
import type { PestanaArchivos } from './Archivos'
import { IconButton } from './ui'

export interface Aviso {
  /** Identifica el aviso para recordar que ya lo atendiste (si la situación cambia, cambia el id y vuelve a salir). */
  id: string
  tono: 'warn' | 'info'
  icon: JSX.Element
  titulo: string
  sub?: string
  accion: () => void
}

/** Lo que conviene revisar o completar: huecos de archivos, depósitos que no cuadran, gastos sin categoría… */
export function useAvisos(onArchivos: (p: PestanaArchivos) => void, onIr: (v: 'cuentas' | 'nomina', foco?: Foco) => void, onAdjuntar: () => void): Aviso[] {
  const { bancoTodo: banco, recibos, filtros } = useStore()
  const base = useMemo(() => filtrarMovs(banco.movs, filtros.desde, filtros.hasta), [banco.movs, filtros.desde, filtros.hasta])
  const faltantes = useMemo(() => semanasFaltantes(recibos).length, [recibos])
  const ahorro = useMemo(() => analizarAhorro(recibos), [recibos])
  const conc = banco.conciliacion?.filas ?? []
  const hoy = dateToIso(new Date())
  const avisos: Aviso[] = []

  for (const c of banco.cuentas) {
    if (c.fechaSaldo < addDays(hoy, -40))
      avisos.push({
        id: `reciente:${c.cuenta}:${c.fechaSaldo}`,
        tono: 'info',
        icon: <Upload size={16} />,
        titulo: `Agrega el estado más reciente de ${c.producto}`,
        sub: `El último que tienes termina el ${fmtFecha(c.fechaSaldo)}.`,
        accion: onAdjuntar
      })
    const hs = huecos(c)
    if (hs.length)
      avisos.push({
        id: `huecos:${c.cuenta}:${hs.map((h) => h.ini).join(',')}`,
        tono: 'warn',
        icon: <FileWarning size={16} />,
        titulo: `Faltan estados de ${c.producto}`,
        sub: hs.map((h) => fmtRango(h.ini, h.fin)).join(' · '),
        accion: () => onArchivos('estados')
      })
    const malos = c.periodos.filter((p) => !p.cuadra).length
    if (malos)
      avisos.push({
        id: `nocuadra:${c.cuenta}:${malos}`,
        tono: 'warn',
        icon: <CircleAlert size={16} />,
        titulo: `${malos} estado${malos === 1 ? '' : 's'} de ${c.producto} no cuadra${malos === 1 ? '' : 'n'}`,
        sub: 'Algún saldo no se leyó bien; revisa el detalle.',
        accion: () => onArchivos('estados')
      })
  }
  if (faltantes)
    avisos.push({
      id: `faltantes:${faltantes}`,
      tono: 'warn',
      icon: <ReceiptText size={16} />,
      titulo: `${faltantes} semana${faltantes === 1 ? '' : 's'} sin recibo de nómina`,
      sub: 'Entre tu primer y tu último recibo.',
      accion: () => onArchivos('recibos')
    })
  const sinRecibo = conc.filter((f) => f.estado === 'sin_recibo').length
  if (sinRecibo)
    avisos.push({
      id: `sinrecibo:${sinRecibo}`,
      tono: 'info',
      icon: <ReceiptText size={16} />,
      titulo: `${sinRecibo} depósito${sinRecibo === 1 ? '' : 's'} de nómina sin su recibo`,
      sub: 'Agrégalos para comprobar que te pagaron completo.',
      accion: () => onArchivos('recibos')
    })
  const dif = conc.filter((f) => f.estado === 'diferencia').length
  if (dif)
    avisos.push({
      id: `diferencia:${dif}`,
      tono: 'warn',
      icon: <CircleAlert size={16} />,
      titulo: `${dif} depósito${dif === 1 ? '' : 's'} no coincide${dif === 1 ? '' : 'n'} con su recibo`,
      accion: () => onArchivos('recibos')
    })
  const sinDep = conc.filter((f) => f.estado === 'sin_deposito').length
  if (sinDep)
    avisos.push({
      id: `sindeposito:${sinDep}`,
      tono: 'warn',
      icon: <CircleAlert size={16} />,
      titulo: `${sinDep} recibo${sinDep === 1 ? '' : 's'} sin depósito en tu banco`,
      accion: () => onArchivos('recibos')
    })
  const recientes = ahorro.filas.slice(-8).filter((f) => f.estado === 'bajo' || f.estado === 'cero')
  if (recientes.length) {
    const u = recientes[recientes.length - 1]
    avisos.push({
      id: `ahorro:${u.recibo.id}`,
      tono: 'warn',
      icon: <PiggyBank size={16} />,
      titulo: `Tu aporte al ahorro ${u.estado === 'cero' ? 'no se descontó' : 'bajó'} en S${u.recibo.semana}`,
      sub: u.motivo,
      accion: () => onIr('nomina', { modal: 'ahorro' })
    })
  }
  const otros = base.filter((m) => m.categoria === 'otros_gastos').length
  if (otros)
    avisos.push({
      id: `sincat:${otros}`,
      tono: 'info',
      icon: <Tags size={16} />,
      titulo: `${otros} gasto${otros === 1 ? '' : 's'} sin categoría`,
      sub: 'Están en «Otros gastos». Clasifícalos y se recuerda para la próxima.',
      accion: () => onIr('cuentas', { cat: 'otros_gastos' })
    })

  return avisos
}


/** Campana con el número de pendientes; al tocarla despliega la lista. Cada aviso se puede marcar como hecho o descartar. */
export function BotonAvisos({ avisos }: { avisos: Aviso[] }): JSX.Element {
  const { avisosVistos, marcarAviso } = useStore()
  const [abierto, setAbierto] = useState(false)
  const [verHechos, setVerHechos] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent): void => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false)
    }
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setAbierto(false)
    }
    window.addEventListener('mousedown', fuera)
    window.addEventListener('keydown', tecla)
    return () => {
      window.removeEventListener('mousedown', fuera)
      window.removeEventListener('keydown', tecla)
    }
  }, [abierto])
  const pendientes = avisos.filter((a) => !avisosVistos[a.id])
  const atendidos = avisos.filter((a) => avisosVistos[a.id])
  const hay = pendientes.some((a) => a.tono === 'warn')
  return (
    <div ref={caja} className="relative">
      <IconButton title={pendientes.length ? `${pendientes.length} cosa${pendientes.length === 1 ? '' : 's'} por revisar` : 'Todo en orden'} onClick={() => setAbierto((x) => !x)}>
        <Bell size={18} />
      </IconButton>
      {pendientes.length > 0 && (
        <span
          className={`pointer-events-none absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none ${hay ? 'bg-warn text-white' : 'bg-accent text-white'}`}
        >
          {pendientes.length}
        </span>
      )}
      {abierto && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1 w-[420px] max-w-[92vw] overflow-hidden rounded-2xl bg-surface shadow-pop ring-1 ring-line">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-ink">Para revisar</div>
              <div className="text-[12.5px] text-muted">{pendientes.length ? `${pendientes.length} pendiente${pendientes.length === 1 ? '' : 's'}` : 'Nada pendiente'}</div>
            </div>
            {pendientes.length > 1 && (
              <button
                onClick={() => pendientes.forEach((a) => void marcarAviso(a.id, 'hecho'))}
                className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-accent transition hover:bg-accent/10"
                title="Marcar todo como hecho"
              >
                <CheckCheck size={15} /> Todo hecho
              </button>
            )}
          </div>
          {pendientes.length ? (
            <ul className="max-h-[52vh] overflow-y-auto py-1">
              {pendientes.map((a) => (
                <li key={a.id} className="group flex items-start transition hover:bg-raised/70">
                  <button
                    role="menuitem"
                    onClick={() => {
                      setAbierto(false)
                      a.accion()
                    }}
                    className="flex min-w-0 flex-1 items-start gap-3 py-2.5 pl-4 pr-1 text-left"
                  >
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${a.tono === 'warn' ? 'bg-warn/15 text-warn' : 'bg-raised text-ink2'}`}>{a.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium text-ink">{a.titulo}</span>
                      {a.sub && <span className="block text-[12.5px] text-muted">{a.sub}</span>}
                    </span>
                  </button>
                  <span className="flex shrink-0 items-center gap-0.5 py-2 pr-2">
                    <button
                      onClick={() => void marcarAviso(a.id, 'hecho')}
                      title="Marcar como hecho"
                      aria-label="Marcar como hecho"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-good/10 hover:text-good"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={() => void marcarAviso(a.id, 'descartado')}
                      title="Descartar: no me lo vuelvas a mostrar"
                      aria-label="Descartar"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-raised hover:text-ink"
                    >
                      <X size={16} />
                    </button>
                    <ChevronRight size={16} className="ml-0.5 text-muted opacity-0 transition group-hover:opacity-100" />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-3 px-4 py-5 text-[13.5px] text-ink2">
              <CheckCircle2 size={18} className="text-good" /> Todo en orden: no tienes nada pendiente.
            </div>
          )}
          {atendidos.length > 0 && (
            <div className="border-t border-line">
              <button
                onClick={() => setVerHechos((x) => !x)}
                aria-expanded={verHechos}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-[12.5px] font-medium text-ink2 transition hover:bg-raised/70"
              >
                <ChevronDown size={15} className={`transition ${verHechos ? 'rotate-180' : ''}`} />
                Hechos y descartados ({atendidos.length})
              </button>
              {verHechos && (
                <ul className="max-h-[200px] overflow-y-auto pb-1">
                  {atendidos.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-4 py-1.5 text-[12.5px] text-muted">
                      {avisosVistos[a.id] === 'hecho' ? <CheckCircle2 size={15} className="shrink-0 text-good" /> : <X size={15} className="shrink-0" />}
                      <span className="min-w-0 flex-1 truncate line-through decoration-muted/50">{a.titulo}</span>
                      <button
                        onClick={() => void marcarAviso(a.id, null)}
                        title="Volver a la lista"
                        className="flex h-7 items-center gap-1 rounded-full px-2 font-medium text-accent transition hover:bg-accent/10"
                      >
                        <Undo2 size={13} /> Restaurar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
