import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  Briefcase,
  Clock3,
  Landmark,
  PiggyBank,
  ShoppingBag,
  Upload
} from 'lucide-react'
import { useStore } from '../store'
import {
  catLabel,
  agruparMovs,
  cambioPorCategoria,
  cambioSaldo,
  filtrarMovs,
  resumenCategorias,
  saldosAlCorte,
  topComercios,
  totalesMovs,
  type CatMov,
  type PeriodoMov
} from '../lib/gastos'
import { analizarAhorro, totales } from '../lib/analytics'
import { ACENTO, serie } from '../lib/palette'
import { fmtHoras, fmtMoney, fmtPct } from '../lib/format'
import { fmtFecha } from '../lib/dates'
import type { PestanaArchivos } from '../components/Archivos'
import { CardMercado, TablaSaldo, useMercado, type TipoSaldo } from '../components/Mercado'
import { CardSueldo } from '../components/NominaGrafica'
import { Button, Card, Desplazable, Empty, IconoCirculo, KpiTile, Money, Segmented, Sparkline, Tendencia } from '../components/ui'
import { CatIcon } from '../components/catIcon'
import type { Recibo } from '../lib/types'

export interface Foco {
  cat?: CatMov
  /** Cuenta ya filtrada en Cuentas. */
  cuenta?: string
  /** Ventana de detalle a abrir en Nómina. */
  modal?: 'extra' | 'ahorro' | 'conceptos'
  /** id de un elemento al que desplazarse al llegar. */
  ancla?: string
}

const prom = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/** Cambio de las últimas 4 contra las 4 anteriores (null si no hay 8). */
function cambio4(xs: number[]): number | null {
  if (xs.length < 8) return null
  const a = prom(xs.slice(-4))
  const b = prom(xs.slice(-8, -4))
  return b ? a / b - 1 : null
}

/**
 * Resumen: todo lo importante en una pantalla. Cada tarjeta lleva a su detalle en Cuentas o Nómina.
 */
export default function Resumen({
  onAdjuntar,
  onArchivos,
  onIr
}: {
  onAdjuntar: () => void
  onArchivos: (p: PestanaArchivos) => void
  onIr: (v: 'cuentas' | 'nomina', foco?: Foco) => void
}): JSX.Element {
  const { banco, estados, recibos, visibles, filtros, modo } = useStore()
  // La gráfica del saldo y su tabla comparten rango, intervalo y periodo marcado.
  const mercado = useMercado<TipoSaldo>('linea')
  const [periodoSel, setPeriodoSel] = useState<string | null>(null)

  const colIn = serie(0, modo)
  const colOut = serie(1, modo)
  const colExtra = serie(3, modo)
  const colAhorro = serie(5, modo)

  // --- Banco ---------------------------------------------------------------
  const base = useMemo(() => filtrarMovs(banco.movs, filtros.desde, filtros.hasta), [banco.movs, filtros.desde, filtros.hasta])
  const semanal = useMemo(() => agruparMovs(base, 'semana', banco, null, filtros), [base, banco, filtros])
  const t = useMemo(() => totalesMovs(base), [base])
  const cambio = useMemo(() => cambioSaldo(base, banco), [base, banco])
  const saldo = saldosAlCorte(banco, filtros.hasta)

  // --- Nómina --------------------------------------------------------------
  const tn = useMemo(() => totales(visibles), [visibles])
  const ahorro = useMemo(() => analizarAhorro(recibos), [recibos])

  const hayBanco = estados.length > 0
  const hayNomina = recibos.length > 0

  if (!hayBanco && !hayNomina) {
    return (
      <Empty title="Bienvenido a Flujo" icon={<Upload size={26} />}>
        <p>
          Agrega tus recibos de nómina (PDF o XML) y tus estados de cuenta de Santander (PDF), o arrástralos a la ventana. Aquí verás de un vistazo tu saldo, tus
          gastos, tu sueldo, el tiempo extra y tu fondo de ahorro.
        </p>
        <div className="mt-5">
          <Button variant="filled" onClick={onAdjuntar}>
            <Upload size={15} /> Agregar archivos
          </Button>
        </div>
      </Empty>
    )
  }

  const ordinarios = visibles.filter((r) => r.tipo === 'ordinaria')
  const depositos = ordinarios.map((r) => r.totales.depositado)
  const horas = tn.horasDobles + tn.horasTriples
  const semanasExtra = ordinarios.filter((r) => r.horas.dobles + r.horas.triples > 0 || r.porCategoria.tiempo_extra > 0).length
  const cicloIni = ahorro.filas.map((f) => f.recibo.tipo).lastIndexOf('liquidacion')
  const delta = cambio.final - cambio.inicial
  // Semanas con todas las cuentas cubiertas (para comparar sin engañar); si hay pocas, todas.
  const sinHuecos = semanal.filter((p) => !p.parcial.length)
  const completas = sinHuecos.length >= 4 ? sinHuecos : semanal
  const porSemana = t.gastos / Math.max(1, t.dias / 7)

  return (
    <div className="space-y-4">
      {/* Indicadores: cada uno lleva a su detalle */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {hayBanco ? (
          <>
            <KpiTile
              icon={<Landmark size={16} />}
              color={ACENTO[modo]}
              label={filtros.hasta ? `Saldo al ${fmtFecha(saldo.corte, false)}` : 'Saldo en tus cuentas'}
              onClick={() => onIr('cuentas')}
              title="Ver tus cuentas"
              sub={
                cambio.cuentas.length > 0 && (
                  <>
                    {delta >= 0 ? 'Subió' : 'Bajó'} {fmtMoney(Math.abs(delta))} en este rango
                  </>
                )
              }
              pie={<Sparkline valores={semanal.map((p) => p.saldoTotal).filter((v): v is number => v != null)} color={ACENTO[modo]} />}
            >
              <Money value={saldo.total} size="lg" />
            </KpiTile>
            <KpiTile
              icon={<ShoppingBag size={16} />}
              color={colOut}
              label="Lo que gastaste"
              onClick={() => onIr('cuentas')}
              title="Ver en qué se fue"
              sub={
                <>
                  {fmtMoney(porSemana)} por semana
                  <Tendencia cambio={cambio4(completas.map((p) => p.gastos))} bueno="baja" titulo="Últimas 4 semanas contra las 4 anteriores" />
                </>
              }
              pie={<Sparkline valores={completas.slice(-26).map((p) => p.gastos)} color={colOut} barras />}
            >
              <Money value={t.gastos} size="lg" />
            </KpiTile>
          </>
        ) : (
          <TileFalta
            className="sm:col-span-2"
            icon={<Landmark size={16} />}
            titulo="Agrega tus estados de cuenta"
            texto="Para ver tu saldo, en qué gastas y si tu nómina llegó completa."
            onClick={onAdjuntar}
          />
        )}

        {hayNomina ? (
          <>
            <KpiTile
              icon={<Briefcase size={16} />}
              color={colIn}
              label="Tu sueldo por semana"
              onClick={() => onIr('nomina')}
              title="Ver tu nómina"
              sub={
                depositos.length > 0 && (
                  <>
                    últimas 4: {fmtMoney(prom(depositos.slice(-4)))}
                    <Tendencia cambio={cambio4(depositos)} titulo="Últimas 4 semanas contra las 4 anteriores" />
                  </>
                )
              }
              pie={<Sparkline valores={depositos.slice(-26)} color={colIn} barras />}
            >
              <Money value={prom(depositos)} size="lg" />
            </KpiTile>
            <KpiTile
              icon={<Clock3 size={16} />}
              color={colExtra}
              label="Tiempo extra"
              onClick={() => onIr('nomina', { modal: 'extra' })}
              title="Ver tu tiempo extra"
              sub={
                <>
                  {fmtMoney(tn.importeExtra)} · {semanasExtra}/{ordinarios.length} sem.
                  <Tendencia cambio={cambio4(ordinarios.map((r) => r.horas.dobles + r.horas.triples))} titulo="Horas de las últimas 4 semanas contra las 4 anteriores" />
                </>
              }
              pie={<Sparkline valores={ordinarios.slice(-26).map((r) => r.horas.dobles + r.horas.triples)} color={colExtra} barras />}
            >
              <span className="cifra text-[28px] font-semibold">{fmtHoras(horas)}</span>
            </KpiTile>
            <KpiTile
              icon={<PiggyBank size={16} />}
              color={colAhorro}
              label="Fondo de ahorro"
              onClick={() => onIr('nomina', { modal: 'ahorro' })}
              title="Ver tu fondo de ahorro"
              sub={
                ahorro.proximaLiquidacion ? (
                  <>Liquidación ~{fmtFecha(ahorro.proximaLiquidacion, false)}</>
                ) : (
                  <>+{fmtMoney(ahorro.aporteActualEmpleado + ahorro.aporteActualEmpresa)} por semana</>
                )
              }
              pie={<Sparkline valores={ahorro.filas.slice(cicloIni + 1).map((f) => f.saldoCalculado)} color={colAhorro} />}
            >
              <Money value={ahorro.saldoActual} size="lg" />
            </KpiTile>
          </>
        ) : (
          <TileFalta
            className="sm:col-span-2 xl:col-span-3"
            icon={<Briefcase size={16} />}
            titulo="Agrega tus recibos de nómina"
            texto="Para ver tu sueldo, tiempo extra, descuentos y tu fondo de ahorro."
            onClick={onAdjuntar}
          />
        )}
      </div>

      {/* Tu saldo en el tiempo, con su tabla por periodo */}
      {hayBanco ? (
        <>
          <CardMercado m={mercado} seleccion={periodoSel} onSelect={setPeriodoSel} />
          <TablaSaldo m={mercado} seleccion={periodoSel} onSelect={setPeriodoSel} />
        </>
      ) : (
        <CardSueldo visibles={visibles} />
      )}

      {/* En qué se fue y qué cambió */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">{hayBanco ? <EnQueSeFue base={base} onIr={onIr} /> : <RepartoSueldo tn={tn} onClick={() => onIr('nomina')} />}</div>
        <div className="min-w-0 xl:h-[470px] [&>section]:h-full">
          <QueCambio semanal={semanal} ordinarios={ordinarios} hayBanco={hayBanco} onIr={onIr} />
        </div>
      </div>
    </div>
  )
}

/** Tarjeta que ocupa el lugar de los indicadores que faltan (sin estados o sin recibos). */
function TileFalta({ icon, titulo, texto, onClick, className = '' }: { icon: ReactNode; titulo: string; texto: string; onClick: () => void; className?: string }): JSX.Element {
  return (
    <div className={`flex items-center gap-4 rounded-2xl border border-dashed border-outline bg-surface/60 p-4 ${className}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accentc text-onaccentc">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-ink">{titulo}</div>
        <div className="text-[12.5px] text-ink2">{texto}</div>
      </div>
      <Button variant="tonal" size="sm" onClick={onClick}>
        <Upload size={14} /> Agregar
      </Button>
    </div>
  )
}

/** Reparto del bruto en una lista corta (cuando no hay estados de cuenta). */
function RepartoSueldo({ tn, onClick }: { tn: ReturnType<typeof totales>; onClick: () => void }): JSX.Element {
  const filas = [
    { label: 'Llegó a tu cuenta', v: tn.depositado },
    { label: 'Impuestos (ISR + IMSS)', v: tn.isr + tn.imss },
    { label: 'Fondo de ahorro', v: tn.dedAhorro },
    { label: 'Despensa (vales)', v: tn.despensa },
    { label: 'Otras deducciones', v: tn.dedOtras }
  ].filter((f) => f.v > 0)
  return (
    <Card title="A dónde se va tu sueldo" subtitle={`De ${fmtMoney(tn.bruto)} brutos en este rango`}>
      <ul>
        {filas.map((f) => (
          <li key={f.label} className="flex items-center justify-between border-b border-line/70 py-2 text-[13.5px] last:border-0">
            <span className="text-ink2">{f.label}</span>
            <span className="flex items-baseline gap-3">
              <span className="text-[12px] tabular-nums text-muted">{fmtPct(f.v / (tn.bruto || 1), 0)}</span>
              <Money value={f.v} size="sm" className="text-ink" />
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex justify-end">
        <Button variant="text" size="sm" onClick={onClick}>
          Ver nómina <ArrowRight size={15} />
        </Button>
      </div>
    </Card>
  )
}

/** En qué se fue tu dinero: categorías o comercios, en una sola tarjeta con el estilo de tabla. */
function EnQueSeFue({ base, onIr }: { base: ReturnType<typeof filtrarMovs>; onIr: (v: 'cuentas' | 'nomina', foco?: Foco) => void }): JSX.Element {
  const { modo } = useStore()
  const [vista, setVista] = useState<'cat' | 'com'>('cat')
  const colOut = serie(1, modo)
  const cats = useMemo(() => resumenCategorias(base, 'gasto'), [base])
  const top = useMemo(() => topComercios(base, 'gasto'), [base])
  const cambios = useMemo(() => cambioPorCategoria(base, 'gasto'), [base])
  const total = cats.reduce((s, c) => s + c.total, 0)
  const filas =
    vista === 'cat'
      ? cats.map((c) => ({
          key: String(c.cat),
          cat: c.cat,
          nombre: catLabel(c.cat),
          sub: `${c.n} mov.`,
          total: c.total,
          pct: c.pct,
          cambio: cambios.get(c.cat) ?? null
        }))
      : top.map((c) => ({
          key: c.clave,
          cat: c.categoria,
          nombre: c.comercio,
          sub: `${c.n} pago${c.n === 1 ? '' : 's'} · ${catLabel(c.categoria)}`,
          total: c.total,
          pct: total ? c.total / total : 0,
          cambio: null as number | null
        }))
  return (
    <Card
      flush
      fijo
      className="h-[470px]"
      title="En qué se fue"
      subtitle={`${fmtMoney(total)} · ${vista === 'cat' ? `${cats.length} categorías` : `${top.length} comercios y personas`}`}
      actions={
        <Segmented
          value={vista}
          onChange={setVista}
          options={[
            { value: 'cat', label: 'Categorías' },
            { value: 'com', label: 'Comercios' }
          ]}
        />
      }
    >
      <Desplazable className="border-t border-line">
        <div className="sticky top-0 z-[1] flex h-[30px] items-center gap-3 bg-surface px-5 text-[11.5px] font-medium uppercase tracking-wide text-muted shadow-[0_1px_0_rgb(var(--line))]">
          <span className="w-9 shrink-0" />
          <span className="min-w-0 flex-1">{vista === 'cat' ? 'Categoría' : 'Comercio o persona'}</span>
          <span className="hidden w-[140px] shrink-0 sm:block">Del gasto</span>
          {vista === 'cat' && <span className="hidden w-[84px] shrink-0 text-right md:block" title="Últimas 4 semanas contra las 4 anteriores">Cambio</span>}
          <span className="w-[100px] shrink-0 text-right">Monto</span>
        </div>
        {filas.length ? (
          <ul>
            {filas.map((f) => (
              <li key={f.key} className="border-b border-line/60">
                <button onClick={() => onIr('cuentas', { cat: f.cat })} className="flex w-full items-center gap-3 px-5 py-2 text-left transition hover:bg-raised/70">
                  <IconoCirculo>
                    <CatIcon cat={f.cat} size={16} />
                  </IconoCirculo>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] text-ink">{f.nombre}</div>
                    <div className="truncate text-[12px] text-muted">{f.sub}</div>
                  </div>
                  <div className="hidden w-[140px] shrink-0 items-center gap-2 sm:flex">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(1.5, f.pct * 100)}%`, background: colOut }} />
                    </div>
                    <span className="w-9 text-right text-[11.5px] tabular-nums text-muted">{fmtPct(f.pct, 0)}</span>
                  </div>
                  {vista === 'cat' && (
                    <span className="hidden w-[84px] shrink-0 justify-end md:flex">
                      {f.cambio != null ? <Tendencia cambio={f.cambio} bueno="baja" titulo="Últimas 4 semanas contra las 4 anteriores" /> : <span className="text-[12px] text-muted">—</span>}
                    </span>
                  )}
                  <Money value={f.total} size="sm" className="w-[100px] shrink-0 text-right text-ink" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-[13px] text-muted">Sin gastos en este rango.</p>
        )}
      </Desplazable>
      <div className="flex shrink-0 justify-end border-t border-line px-3 py-2">
        <Button variant="text" size="sm" onClick={() => onIr('cuentas', { ancla: 'movimientos' })}>
          Ver los movimientos <ArrowRight size={15} />
        </Button>
      </div>
    </Card>
  )
}

interface Cambio {
  key: string
  icon: JSX.Element
  label: string
  antes: number
  ahora: number
  fmt: (v: number) => string
  bueno: 'sube' | 'baja'
  ir: () => void
}

/** Qué cambió: últimas 4 semanas contra las 4 anteriores, en gastos, ingresos, sueldo y tiempo extra. */
function QueCambio({
  semanal,
  ordinarios,
  hayBanco,
  onIr
}: {
  semanal: PeriodoMov[]
  ordinarios: Recibo[]
  hayBanco: boolean
  onIr: (v: 'cuentas' | 'nomina', foco?: Foco) => void
}): JSX.Element {
  const cambios: Cambio[] = []
  // Semanas con todas las cuentas cubiertas (si no, una semana sin estado parecería "gastaste menos").
  const completas = semanal.filter((p) => !p.parcial.length)
  const ult = completas.slice(-4)
  const prev = completas.slice(-8, -4)
  const porSem = (ps: PeriodoMov[], f: (p: PeriodoMov) => number): number => (ps.length ? ps.reduce((a, p) => a + f(p), 0) / ps.length : 0)
  if (hayBanco && prev.length === 4) {
    cambios.push({
      key: 'gastos',
      icon: <ShoppingBag size={15} />,
      label: 'Gastos',
      antes: porSem(prev, (p) => p.gastos),
      ahora: porSem(ult, (p) => p.gastos),
      fmt: fmtMoney,
      bueno: 'baja',
      ir: () => onIr('cuentas')
    })
    cambios.push({
      key: 'ingresos',
      icon: <Landmark size={15} />,
      label: 'Lo que entró',
      antes: porSem(prev, (p) => p.ingresos),
      ahora: porSem(ult, (p) => p.ingresos),
      fmt: fmtMoney,
      bueno: 'sube',
      ir: () => onIr('cuentas')
    })
    // Las categorías que más se movieron (en pesos).
    const porCat = (ps: PeriodoMov[]): Map<CatMov, number> => {
      const m = new Map<CatMov, number>()
      for (const p of ps) for (const x of p.movs) if (x.naturaleza === 'gasto') m.set(x.categoria, (m.get(x.categoria) ?? 0) + x.monto / ps.length)
      return m
    }
    const a = porCat(prev)
    const b = porCat(ult)
    const movidas = [...new Set([...a.keys(), ...b.keys()])]
      .map((c) => ({ c, antes: a.get(c) ?? 0, ahora: b.get(c) ?? 0 }))
      .filter((x) => Math.abs(x.ahora - x.antes) >= 100)
      .sort((x, y) => Math.abs(y.ahora - y.antes) - Math.abs(x.ahora - x.antes))
      .slice(0, 3)
    for (const x of movidas)
      cambios.push({
        key: `cat:${x.c}`,
        icon: <CatIcon cat={x.c} size={15} />,
        label: catLabel(x.c),
        antes: x.antes,
        ahora: x.ahora,
        fmt: fmtMoney,
        bueno: 'baja',
        ir: () => onIr('cuentas', { cat: x.c })
      })
  }
  if (ordinarios.length >= 8) {
    const u = ordinarios.slice(-4)
    const p = ordinarios.slice(-8, -4)
    const prom = (rs: Recibo[], f: (r: Recibo) => number): number => rs.reduce((s, r) => s + f(r), 0) / rs.length
    cambios.push({
      key: 'sueldo',
      icon: <Briefcase size={15} />,
      label: 'Tu sueldo',
      antes: prom(p, (r) => r.totales.depositado),
      ahora: prom(u, (r) => r.totales.depositado),
      fmt: fmtMoney,
      bueno: 'sube',
      ir: () => onIr('nomina')
    })
    cambios.push({
      key: 'extra',
      icon: <Clock3 size={15} />,
      label: 'Horas extra',
      antes: prom(p, (r) => r.horas.dobles + r.horas.triples),
      ahora: prom(u, (r) => r.horas.dobles + r.horas.triples),
      fmt: fmtHoras,
      bueno: 'sube',
      ir: () => onIr('nomina', { modal: 'extra' })
    })
  }

  return (
    <Card flush title="Qué cambió" subtitle="Por semana: últimas 4 contra las 4 anteriores" className="flex flex-col">
      {cambios.length ? (
        <ul className="pb-2">
          {cambios.map((x) => {
            const pct = x.antes ? x.ahora / x.antes - 1 : null
            return (
              <li key={x.key}>
                <button onClick={x.ir} className="group flex w-full items-center gap-3 px-5 py-2 text-left transition hover:bg-raised/70">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-raised text-ink2">{x.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-ink">{x.label}</span>
                    <span className="block truncate text-[12px] text-muted">
                      antes {x.fmt(x.antes)} → ahora <span className="text-ink2">{x.fmt(x.ahora)}</span>
                    </span>
                  </span>
                  {pct == null ? <span className="text-[12px] text-muted">nuevo</span> : <Tendencia cambio={pct} bueno={x.bueno} />}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="px-5 pb-5 text-[13px] text-ink2">Cuando tengas al menos 8 semanas de estados de cuenta o recibos, aquí verás qué subió y qué bajó.</p>
      )}
    </Card>
  )
}
