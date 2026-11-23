import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, CircleSlash, Clock3, Minus, PiggyBank } from 'lucide-react'
import { ejeRecibo, type AnalisisAhorro, type CicloAhorro, type EstadoAhorro, type FilaAhorro } from '../lib/analytics'
import { addDays, fmtFecha, fmtRango } from '../lib/dates'
import { fmtCompacto, fmtMoney, fmtPct } from '../lib/format'
import { serie } from '../lib/palette'
import { useStore } from '../store'
import { Badge, Button, Card, Desplazable, LeyendaSeries, Metrica, Money, Segmented, Sparkline } from './ui'
import TablaCorta, { type ColTabla } from './TablaCorta'
import Modal from './Modal'
import { BotonesEscala, COL, cambioTxt, Dato, dir, diasDe, PieGrafica, TXT, useEscala, type Dir, type PeriodoT } from './GraficaTiempo'
import { GraficaSerie, type SerieG } from './SerieTiempo'

export const ESTADO_AHORRO: Record<EstadoAhorro, { label: string; tone: 'neutral' | 'good' | 'warn' | 'bad' | 'accent'; icon: JSX.Element }> = {
  normal: { label: 'Normal', tone: 'neutral', icon: <CheckCircle2 size={12} /> },
  alto: { label: 'Subió', tone: 'accent', icon: <ArrowUpRight size={12} /> },
  bajo: { label: 'Bajó', tone: 'warn', icon: <ArrowDownRight size={12} /> },
  cero: { label: 'Sin aporte', tone: 'bad', icon: <CircleSlash size={12} /> },
  liquidacion: { label: 'Liquidación', tone: 'good', icon: <PiggyBank size={12} /> },
  previo: { label: 'Antes del fondo', tone: 'neutral', icon: <Clock3 size={12} /> }
}

/** El fondo de ahorro de un vistazo (tarjeta de la pestaña Nómina). El saldo usa todo el historial. */
export function ResumenAhorro({ a, onDetalle }: { a: AnalisisAhorro; onDetalle: () => void }): JSX.Element {
  const { modo } = useStore()
  const col = serie(5, modo)
  // Saldo del ciclo actual (desde la última liquidación).
  const ini = a.filas.map((f) => f.recibo.tipo).lastIndexOf('liquidacion')
  const ciclo = a.filas.slice(ini + 1)
  const fuente = a.saldoFuente === 'recibo' ? 'según tu último recibo' : a.saldoFuente === 'mixto' ? 'recibo + calculado' : 'calculado'

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <PiggyBank size={17} className="text-muted" /> Fondo de ahorro
        </span>
      }
      subtitle={`Disponible hoy, ${fuente}`}
      className="flex flex-col"
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <Money value={a.saldoActual} size="lg" className="block leading-none text-ink" />
          <div className="mt-1.5 text-[13px] font-medium text-good">
            ▲ +{fmtMoney(a.aporteActualEmpleado + a.aporteActualEmpresa)} <span className="font-normal text-ink2">por semana (tú {fmtMoney(a.aporteActualEmpleado)} + empresa)</span>
          </div>
        </div>
        <div className="w-36 shrink-0">
          <Sparkline valores={ciclo.map((f) => f.saldoCalculado)} color={col} alto={40} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-x-5 border-t border-line pt-3">
        <Metrica label="Próxima liquidación" hint={a.proximaLiquidacion ? `en ~${a.semanasParaLiquidacion} semanas` : 'falta una para estimarla'}>
          <span className="cifra text-[16px] font-semibold">{a.proximaLiquidacion ? fmtFecha(a.proximaLiquidacion, false) : '—'}</span>
        </Metrica>
        <Metrica label="Recibirías" hint="sin intereses">
          {a.proyeccion != null ? <Money value={a.proyeccion} size="sm" className="!text-[16px]" /> : <span className="cifra text-[16px] font-semibold">—</span>}
        </Metrica>
        <Metrica label="Tasa" hint="de salario + séptimo día">
          <span className="cifra text-[16px] font-semibold">{a.tasa != null ? fmtPct(a.tasa) : '—'}</span>
        </Metrica>
      </div>
      <div className="mt-auto flex justify-end pt-3">
        <Button variant="text" size="sm" onClick={onDetalle}>
          Ver aportes y ciclos
        </Button>
      </div>
    </Card>
  )
}

interface PeriodoAhorro extends PeriodoT {
  f: FilaAhorro
}

/** Una columna por recibo ordinario (la liquidación se marca aparte, con una línea). */
function periodosAhorro(filas: FilaAhorro[]): PeriodoAhorro[] {
  return filas
    .filter((f) => f.recibo.tipo === 'ordinaria')
    .map((f) => {
      const r = f.recibo
      const fin = r.periodoFin < addDays(r.periodoInicio, 6) ? addDays(r.periodoInicio, 6) : r.periodoFin
      const e = ejeRecibo(r)
      return { key: r.id, label: e.label, sub: e.sub, banda: e.banda, bandaLabel: e.bandaLabel, detalle: `Semana ${r.semana} · ${fmtRango(r.periodoInicio, r.periodoFin)}`, ini: r.periodoInicio, fin, f }
    })
    .sort((x, y) => x.ini.localeCompare(y.ini))
}

/** El fondo semana por semana como un mercado: aportes o saldo, semanas fuera de lo normal, tabla corta y ciclos. */
export function ModalAhorro({
  open,
  onClose,
  a,
  desde,
  hasta
}: {
  open: boolean
  onClose: () => void
  a: AnalisisAhorro
  desde: string | null
  hasta: string | null
}): JSX.Element {
  const { modo } = useStore()
  const esc = useEscala(['semana'], 'todo')
  const [vista, setVista] = useState<'aportes' | 'saldo'>('aportes')
  const [estilo, setEstilo] = useState<'barras' | 'area'>('barras')
  const [sel, setSel] = useState<string | null>(null)
  const [verCiclos, setVerCiclos] = useState(false)
  const colEmp = serie(5, modo)
  const colCia = serie(6, modo)
  const col = COL[modo]
  const filas = useMemo(() => {
    const enRango = a.filas.filter((f) => (!desde || f.recibo.fecha >= desde) && (!hasta || f.recibo.fecha <= hasta))
    const d = diasDe(esc.rango)
    if (!d || !enRango.length) return enRango
    const ult = enRango[enRango.length - 1].recibo.fechaPago
    const ini = addDays(ult, -d + 1)
    return enRango.filter((f) => f.recibo.fechaPago >= ini)
  }, [a, desde, hasta, esc.rango])
  const ps = useMemo(() => periodosAhorro(filas), [filas])
  const liquidaciones = useMemo(
    () => (ps.length ? filas.filter((f) => f.recibo.tipo === 'liquidacion' && f.recibo.fechaPago >= ps[0].ini && f.recibo.fechaPago <= ps[ps.length - 1].fin) : []),
    [filas, ps]
  )
  const tabla = useMemo(() => [...filas].reverse(), [filas])
  const raras = filas.filter((f) => f.estado === 'bajo' || f.estado === 'cero').length
  const series: SerieG[] =
    vista === 'aportes'
      ? [
          { key: 'empleado', label: 'Tú', color: colEmp },
          { key: 'empresa', label: 'Empresa', color: colCia }
        ]
      : [{ key: 'saldo', label: 'Saldo del fondo', color: colEmp }]
  const valor = (p: PeriodoAhorro, k: string): number => (k === 'saldo' ? p.f.saldoCalculado : k === 'empleado' ? p.f.recibo.ahorro.empleado : p.f.recibo.ahorro.empresa)
  const aportoTu = ps.reduce((s, p) => s + p.f.recibo.ahorro.empleado, 0)
  const aportoCia = ps.reduce((s, p) => s + p.f.recibo.ahorro.empresa, 0)
  const ult = ps[ps.length - 1]
  const prev = ps[ps.length - 2]
  const semUlt = ult ? ult.f.recibo.ahorro.empleado + ult.f.recibo.ahorro.empresa : 0
  const semPrev = prev ? prev.f.recibo.ahorro.empleado + prev.f.recibo.ahorro.empresa : semUlt
  const dUlt: Dir = dir(semPrev, semUlt)
  const IconoUlt = dUlt === 'sube' ? ArrowUpRight : dUlt === 'baja' ? ArrowDownRight : Minus
  const tipo = vista === 'aportes' ? (estilo === 'barras' ? 'barras' : 'apilada') : estilo === 'barras' ? 'barras' : 'area'
  const guion = (n: number): string => (n > 0.005 ? fmtMoney(n) : '—')
  const barraEstado = (f: FilaAhorro): string | undefined =>
    f.estado === 'bajo' || f.estado === 'cero' ? col.baja : f.estado === 'alto' || f.estado === 'liquidacion' ? col.sube : undefined
  const columnas: ColTabla<FilaAhorro>[] = [
    {
      head: 'Semana',
      cell: (f) => (
        <span className="whitespace-nowrap text-ink">
          S{f.recibo.semana} <span className="text-[11.5px] text-muted">{fmtRango(f.recibo.periodoInicio, f.recibo.periodoFin)}</span>
        </span>
      )
    },
    {
      head: 'Estado',
      cell: (f) => (
        <Badge tone={ESTADO_AHORRO[f.estado].tone}>
          {ESTADO_AHORRO[f.estado].icon}
          {ESTADO_AHORRO[f.estado].label}
        </Badge>
      )
    },
    { head: 'Tú', num: true, cell: (f) => guion(f.recibo.ahorro.empleado) },
    { head: 'Empresa', num: true, cell: (f) => guion(f.recibo.ahorro.empresa) },
    { head: 'Saldo', num: true, cell: (f) => <span className="font-medium text-ink">{fmtMoney(f.saldoCalculado)}</span> },
    { head: 'Motivo', cell: (f) => <span className="block max-w-[280px] truncate text-ink2" title={f.motivo}>{f.motivo || '—'}</span> }
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={1120}
      alto="88vh"
      title="Fondo de ahorro"
      subtitle={`${a.saldoDetalle} · ${raras ? `${raras} semana${raras === 1 ? '' : 's'} con aporte menor o sin aporte` : 'aporte constante'}`}
      actions={
        <Segmented
          value={vista}
          onChange={(v) => {
            setVista(v)
            setEstilo(v === 'saldo' ? 'area' : 'barras')
          }}
          options={[
            { value: 'aportes', label: 'Aportes' },
            { value: 'saldo', label: 'Saldo del fondo' }
          ]}
        />
      }
    >
      {/* Cinta de precios y, a la derecha, el estilo de la gráfica */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
          <div>
            <div className="text-[12px] text-muted">{vista === 'aportes' ? 'Aporte por semana (tú + empresa)' : 'Saldo del fondo hoy'}</div>
            <div className="cifra text-[28px] font-semibold leading-8 text-ink">{fmtMoney(vista === 'aportes' ? semUlt : a.saldoActual)}</div>
            {vista === 'aportes' && prev && (
              <div className={`mt-1 flex items-center gap-1 text-[13px] font-medium ${TXT[dUlt]}`}>
                <IconoUlt size={15} />
                {dUlt === 'igual' ? 'Igual que la semana anterior' : `${cambioTxt(semUlt - semPrev)} contra la semana anterior`}
              </div>
            )}
          </div>
          <Dato label="Aportaste tú" valor={fmtCompacto(aportoTu)} />
          <Dato label="Aportó la empresa" valor={fmtCompacto(aportoCia)} />
          <Dato label="Próxima liquidación" valor={a.proximaLiquidacion ? fmtFecha(a.proximaLiquidacion, false) : '—'} sub={a.proximaLiquidacion ? `~${a.semanasParaLiquidacion} sem.` : ''} />
          <Dato label="Semanas raras" valor={String(raras)} color={raras ? 'text-bad' : 'text-good'} />
        </div>
        <Segmented
          value={estilo}
          onChange={setEstilo}
          options={[
            { value: 'barras', label: 'Barras' },
            { value: 'area', label: vista === 'aportes' ? 'Áreas' : 'Área' }
          ]}
        />
      </div>
      <GraficaSerie
        periodos={ps}
        series={series}
        valor={valor}
        esc={esc}
        tipo={tipo}
        alto={250}
        fitKey={`${esc.fit}|${vista}`}
        etiquetaAria="Fondo de ahorro por semana"
        extras={liquidaciones.map((f) => ({ fecha: f.recibo.fechaPago, label: 'Liquidación', color: col.sube }))}
        seleccion={sel}
        onSelect={(p) => setSel((s) => (s === p.key ? null : p.key))}
        tooltipExtra={(p) => (
          <div className="mt-1 text-[11.5px] text-muted">
            {vista === 'aportes' ? `Saldo del fondo ${fmtMoney(p.f.saldoCalculado)} · ` : ''}
            {ESTADO_AHORRO[p.f.estado].label}
            {p.f.esperado != null && p.f.estado !== 'normal' ? ` (esperado ${fmtMoney(p.f.esperado)})` : ''}
          </div>
        )}
      />
      <PieGrafica derecha={<BotonesEscala e={esc} />}>
        <LeyendaSeries series={series} />
        {liquidaciones.length > 0 && (
          <span className="flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden>
              <line x1="0" y1="4" x2="18" y2="4" stroke={col.sube} strokeWidth="1.5" strokeDasharray="3 4" />
            </svg>
            Liquidación
          </span>
        )}
        {vista === 'saldo' && <span className="text-muted">El saldo vuelve a cero en cada liquidación</span>}
      </PieGrafica>

      {/* Tabla corta con scroll, y a un lado los ciclos resumidos */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <TablaCorta
          enModal
          alto="h-[340px]"
          titulo="Tu fondo, semana por semana"
          subtitulo={`${tabla.length} recibos · por qué cambió tu aporte y cómo crece el saldo`}
          filas={tabla}
          columnas={columnas}
          clave={(f) => f.recibo.id}
          seleccion={sel}
          onSelect={setSel}
          barra={barraEstado}
        />
        <CiclosResumen ciclos={a.ciclos} abierto={verCiclos} onAlternar={() => setVerCiclos((x) => !x)} />
      </div>
      {verCiclos && <CiclosTabla ciclos={a.ciclos} />}
    </Modal>
  )
}

const mesAnio = (f: string): string => fmtFecha(f, false)

/** Los ciclos del fondo en corto: uno por tarjeta, el más reciente arriba. El detalle completo se abre aparte. */
function CiclosResumen({ ciclos, abierto, onAlternar }: { ciclos: CicloAhorro[]; abierto: boolean; onAlternar: () => void }): JSX.Element {
  const lista = useMemo(() => [...ciclos].reverse(), [ciclos])
  return (
    <Card
      flush
      fijo
      className="h-[340px] !shadow-none ring-1 ring-line"
      title="Ciclos del fondo"
      subtitle="Cada uno termina en una liquidación"
      actions={
        <Button variant="text" size="sm" onClick={onAlternar}>
          {abierto ? 'Ocultar detalle' : 'Ver todo el detalle'}
        </Button>
      }
    >
      <Desplazable className="border-t border-line">
        {lista.length ? (
          <ul>
            {lista.map((ci, i) => {
              const aportado = ci.aportadoEmpleado + ci.aportadoEmpresa
              const incompleto = ci.liquidacion && aportado > 0 && Math.abs(aportado - ci.devolucion) > 1
              return (
                <li key={i} className="border-b border-line/70 px-5 py-3 last:border-b-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] text-ink2">
                      {mesAnio(ci.inicio)} – {ci.fin ? mesAnio(ci.fin) : 'hoy'}
                    </span>
                    {!ci.liquidacion ? (
                      <Badge tone="accent">En curso</Badge>
                    ) : incompleto ? (
                      <span title={`Faltan recibos del ciclo (${fmtMoney(aportado)} cargado vs ${fmtMoney(ci.devolucion)} devuelto)`}>
                        <Badge tone="warn">
                          <AlertTriangle size={12} /> Incompleto
                        </Badge>
                      </span>
                    ) : (
                      <Badge tone="good">Liquidado</Badge>
                    )}
                  </div>
                  <div className="cifra mt-1 text-[20px] font-semibold leading-6 text-ink">{fmtMoney(ci.liquidacion ? ci.devolucion : aportado)}</div>
                  <div className="text-[12px] text-muted">
                    {ci.liquidacion ? 'devuelto' : 'acumulado'} · {ci.recibos} recibos
                    {ci.liquidacion && ci.interes > 0 ? ` · intereses ${fmtMoney(ci.interes)}` : ''}
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="px-5 py-10 text-center text-[13px] text-muted">Sin datos.</p>
        )}
      </Desplazable>
    </Card>
  )
}

/** Todo el detalle de los ciclos (aportes, devolución, intereses y estado). */
function CiclosTabla({ ciclos }: { ciclos: CicloAhorro[] }): JSX.Element {
  return (
    <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-line">
      <h3 className="px-5 pb-2 pt-4 text-[14px] font-semibold text-ink">Detalle de los ciclos</h3>
      <table className="tabla">
        <thead>
          <tr>
            <th className="!pl-5">Periodo</th>
            <th className="num">Recibos</th>
            <th className="num">Aportaste</th>
            <th className="num">Empresa</th>
            <th className="num">Devolución</th>
            <th className="num">Intereses</th>
            <th className="!pr-5">Estado</th>
          </tr>
        </thead>
        <tbody>
          {[...ciclos].reverse().map((ci, i) => {
            const aportado = ci.aportadoEmpleado + ci.aportadoEmpresa
            const incompleto = ci.liquidacion && aportado > 0 && Math.abs(aportado - ci.devolucion) > 1
            return (
              <tr key={i}>
                <td className="!pl-5 text-ink">
                  {fmtFecha(ci.inicio)} – {ci.fin ? fmtFecha(ci.fin) : 'hoy'}
                </td>
                <td className="num">{ci.recibos}</td>
                <td className="num">{fmtMoney(ci.aportadoEmpleado)}</td>
                <td className="num">{fmtMoney(ci.aportadoEmpresa)}</td>
                <td className="num font-medium text-ink">{ci.liquidacion ? fmtMoney(ci.devolucion) : '—'}</td>
                <td className="num">{ci.liquidacion ? fmtMoney(ci.interes) : '—'}</td>
                <td className="!pr-5">
                  {!ci.liquidacion ? (
                    <Badge tone="accent">En curso</Badge>
                  ) : incompleto ? (
                    <span className="flex items-center gap-1.5 text-[12px] text-ink2">
                      <AlertTriangle size={13} className="text-warn" />
                      Faltan recibos del ciclo ({fmtMoney(aportado)} cargado vs {fmtMoney(ci.devolucion)} devuelto)
                    </span>
                  ) : (
                    <Badge tone="good">Liquidado</Badge>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
