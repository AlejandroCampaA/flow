import { useEffect, useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, ChevronDown, CircleAlert, CreditCard, Landmark, PiggyBank, Store, Tags, TrendingDown, TrendingUp, Upload, Users } from 'lucide-react'
import { useStore } from '../store'
import {
  agruparMovs,
  cambioSaldo,
  catLabel,
  catNat,
  cubre,
  filtrarMovs,
  flujoDinero,
  resumenCategorias,
  cambioPorCategoria,
  saldosAlCorte,
  topComercios,
  totalesMovs,
  type CatMov,
  type MovClasificado,
  type Naturaleza
} from '../lib/gastos'
import { ACENTO, serie } from '../lib/palette'
import { fmtMoney, fmtPct } from '../lib/format'
import { fmtFecha } from '../lib/dates'
import type { PestanaArchivos } from '../components/Archivos'
import { Button, Card, Chip, Desplazable, Empty, IconoCirculo, KpiTile, LeyendaSeries, Metrica, Money, Segmented, Sparkline, Tendencia } from '../components/ui'
import { COL } from '../components/GraficaTiempo'
import { CardFlujo, type SeleccionPeriodo } from '../components/Mercado'
import MapaGasto from '../components/MapaGasto'
import TablaMovimientos from '../components/TablaMovimientos'
import FlujoDiagrama from '../components/FlujoDiagrama'
import { ModalCategoria } from '../components/DialogosBanco'
import { ModalCategorias, ModalComercios, ModalPersonas } from '../components/Categorias'
import { CatIcon } from '../components/catIcon'

const SLOTS_CUENTA = [2, 6, 4, 3]

const prom = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
/** Cambio de las últimas 4 semanas contra las 4 anteriores (null si no hay 8). */
function cambio4(xs: number[]): number | null {
  if (xs.length < 8) return null
  const b = prom(xs.slice(-8, -4))
  return b ? prom(xs.slice(-4)) / b - 1 : null
}

export default function Cuentas({
  onAdjuntar,
  onArchivos,
  catInicial = null,
  cuentaInicial = null
}: {
  onAdjuntar: () => void
  onArchivos: (p: PestanaArchivos) => void
  /** Categoría ya filtrada al llegar desde el Resumen. */
  catInicial?: CatMov | null
  cuentaInicial?: string | null
}): JSX.Element {
  const { banco, bancoTodo, estados, filtros, modo, cuentasSel, setCuentasSel } = useStore()
  const [vistaD, setVistaD] = useState<'mapa' | 'flujo'>('mapa')
  const [cat, setCat] = useState<CatMov | null>(catInicial)
  const [periodoSel, setPeriodoSel] = useState<SeleccionPeriodo | null>(null)
  // Las cuentas que ves son un filtro global (cambia también el Resumen); aquí sólo se llega con una ya elegida.
  useEffect(() => {
    if (cuentaInicial) setCuentasSel([cuentaInicial])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const cuentaSel = cuentasSel.length === 1 ? cuentasSel[0] : null
  const [editando, setEditando] = useState<MovClasificado | null>(null)
  const [vistaCat, setVistaCat] = useState<Naturaleza>(catInicial && catNat(catInicial) === 'ingreso' ? 'ingreso' : 'gasto')
  const [modalCom, setModalCom] = useState<{ titulo: string; movs: MovClasificado[] } | null>(null)
  const [personasOpen, setPersonasOpen] = useState(false)
  const [catsTab, setCatsTab] = useState<'clasificar' | 'tuyas' | null>(null)

  /** Las tarjetas de categorías y movimientos están arriba: al filtrar desde la gráfica se sube a verlas. */
  const arriba = (): void => document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })

  const colIn = COL[modo].sube
  const colOut = COL[modo].baja
  const colNeutro = modo === 'dark' ? '#8d969c' : '#8a949b'
  const colCentro = modo === 'dark' ? '#80d5c8' : '#00695c'
  const colorCuenta = (cuenta?: string): string => serie(SLOTS_CUENTA[Math.max(0, bancoTodo.cuentas.findIndex((c) => c.cuenta === cuenta)) % 4], modo)

  // Alcance: rango global → cuenta elegida → periodo elegido en la gráfica
  const base = useMemo(() => filtrarMovs(banco.movs, filtros.desde, filtros.hasta), [banco.movs, filtros.desde, filtros.hasta])
  const porCuenta = base // ya viene filtrado por el filtro global de cuentas
  const semanal = useMemo(() => agruparMovs(porCuenta, 'semana', banco, null, filtros), [porCuenta, banco, filtros])
  const movs = useMemo(
    () => (periodoSel ? porCuenta.filter((m) => m.fecha >= periodoSel.ini && m.fecha <= periodoSel.fin) : porCuenta),
    [porCuenta, periodoSel]
  )
  const movsCat = useMemo(() => (cat ? movs.filter((m) => m.categoria === cat) : movs), [movs, cat])
  const t = useMemo(() => totalesMovs(movs), [movs])
  const flujo = useMemo(() => flujoDinero(movs, banco), [movs, banco])
  const cambio = useMemo(() => cambioSaldo(movs, banco), [movs, banco])
  const cats = useMemo(() => resumenCategorias(movs, vistaCat), [movs, vistaCat])
  const cambiosCat = useMemo(() => cambioPorCategoria(movs, vistaCat), [movs, vistaCat])
  const comerciosCat = useMemo(() => (cat ? topComercios(movsCat, catNat(cat) === 'ingreso' ? 'ingreso' : 'gasto') : []), [movsCat, cat])
  const sinCat = useMemo(() => banco.movs.filter((m) => (m.categoria === 'otros_gastos' || m.categoria === 'otros_ingresos') && !m.regla).length, [banco.movs])

  if (!estados.length) {
    return (
      <Empty title="Agrega tus estados de cuenta" icon={<Landmark size={26} />}>
        <p>
          Sube los PDF mensuales de tus cuentas de Santander. Se leen en tu computadora, se verifica cada saldo y cada movimiento queda clasificado. Los traspasos
          entre tus cuentas no cuentan como gasto y los depósitos de nómina se cruzan con tus recibos.
        </p>
        <div className="mt-5">
          <Button variant="filled" onClick={onAdjuntar}>
            <Upload size={15} /> Agregar estados de cuenta
          </Button>
        </div>
      </Empty>
    )
  }

  // Saldos al cierre del rango
  const { corte, total: saldoTotal } = saldosAlCorte(banco, filtros.hasta)
  const { saldos } = saldosAlCorte(bancoTodo, filtros.hasta)
  const desde = base[0]?.fecha
  const hasta = base[base.length - 1]?.fecha
  const incompletas = desde && hasta ? banco.cuentas.filter((c) => !cubre(c, desde, hasta)) : []

  const maxIO = Math.max(t.ingresos, t.gastos, 1)
  const delta = cambio.final - cambio.inicial
  const cuentaNombre = cuentasSel.length ? banco.cuentas.map((c) => c.producto).join(' y ') : null
  const alcance = [periodoSel?.detalle ?? 'Todo el rango', cuentaNombre].filter(Boolean).join(' · ')
  // Entró / salió de lo que estás viendo (con la categoría, si hay una)
  const tv = totalesMovs(movsCat)
  const neto = tv.ingresos - tv.gastos
  const semIn = semanal.map((p) => p.ingresos)
  const semOut = semanal.map((p) => p.gastos)
  const acumNeto = semanal.reduce<number[]>((a, p) => [...a, (a[a.length - 1] ?? 0) + p.ingresos - p.gastos], [])
  const totalCats = cats.reduce((s, c) => s + c.total, 0)

  return (
    <div className="space-y-4">
      {/* Lo que filtraste en esta pantalla (las cuentas se eligen arriba, junto a las fechas) */}
      {(cat || periodoSel) && (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {periodoSel && (
          <Chip selected onRemove={() => setPeriodoSel(null)}>
            {periodoSel.detalle}
          </Chip>
        )}
        {cat && (
          <Chip selected onRemove={() => setCat(null)} icon={<CatIcon cat={cat} size={14} />}>
            {catLabel(cat)}
          </Chip>
        )}
        <Button
          variant="text"
          size="sm"
          onClick={() => {
            setCat(null)
            setPeriodoSel(null)
          }}
        >
          Quitar todo
        </Button>
      </div>
      )}

      {/* Indicadores de lo que estás viendo (cambian con las cuentas, la categoría y el periodo) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          icon={<Landmark size={16} />}
          color={ACENTO[modo]}
          label={cuentaSel ? 'Saldo de la cuenta' : filtros.hasta ? `Saldo al ${fmtFecha(corte, false)}` : 'Saldo en tus cuentas'}
          sub={
            cambio.inicial > 0 && (
              <>
                {delta >= 0 ? 'Subió' : 'Bajó'} {fmtMoney(Math.abs(delta))}
                {Math.abs(delta / cambio.inicial) <= 5 && <Tendencia cambio={delta / cambio.inicial} titulo="Cambio en lo que estás viendo" />}
              </>
            )
          }
          pie={<Sparkline valores={semanal.map((p) => p.saldoTotal).filter((v): v is number => v != null)} color={ACENTO[modo]} />}
        >
          <Money value={saldoTotal} size="lg" />
        </KpiTile>
        <KpiTile
          icon={<TrendingUp size={16} />}
          color={colIn}
          label={cat && catNat(cat) === 'ingreso' ? `Entró · ${catLabel(cat)}` : 'Entró'}
          sub={
            <>
              {movsCat.filter((m) => m.naturaleza === 'ingreso').length} movimientos
              <Tendencia cambio={cambio4(semIn)} titulo="Últimas 4 semanas contra las 4 anteriores" />
            </>
          }
          pie={<Sparkline valores={semIn.slice(-26)} color={colIn} barras />}
        >
          <Money value={tv.ingresos} size="lg" />
        </KpiTile>
        <KpiTile
          icon={<TrendingDown size={16} />}
          color={colOut}
          label={cat && catNat(cat) === 'gasto' ? `Salió · ${catLabel(cat)}` : 'Salió'}
          sub={
            <>
              {fmtMoney(tv.gastos / Math.max(1, tv.dias / 7))} por semana
              <Tendencia cambio={cambio4(semOut)} bueno="baja" titulo="Últimas 4 semanas contra las 4 anteriores" />
            </>
          }
          pie={<Sparkline valores={semOut.slice(-26)} color={colOut} barras />}
        >
          <Money value={tv.gastos} size="lg" />
        </KpiTile>
        <KpiTile
          icon={<PiggyBank size={16} />}
          color={neto >= 0 ? colIn : colOut}
          label={neto >= 0 ? 'Te quedó' : 'Gastaste de más'}
          sub={tv.ingresos > 0 ? <>{fmtPct(Math.abs(neto) / tv.ingresos, 0)} de lo que entró</> : undefined}
          pie={<Sparkline valores={acumNeto.slice(-40)} color={neto >= 0 ? colIn : colOut} />}
        >
          <Money value={Math.abs(neto)} size="lg" className={neto >= 0 ? 'text-good' : 'text-bad'} />
        </KpiTile>
      </div>

      {/* Las dos tarjetas tienen el mismo alto fijo (cabe en la ventana): sólo se desplaza su lista, nunca cambian de tamaño. */}
      <div className="grid grid-cols-1 gap-4 xl:h-[max(460px,calc(100vh-322px))] xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* En qué se fue: categorías y, al tocar una, sus comercios */}
        <Card
          fijo
          className="h-[600px] xl:h-full"
          flush
          title={vistaCat === 'gasto' ? 'En qué se fue' : 'De dónde entró'}
          subtitle={`${fmtMoney(totalCats)} · toca una categoría para ver dónde y filtrar`}
          actions={
            <Segmented
              value={vistaCat}
              onChange={(v) => {
                setVistaCat(v)
                setCat(null)
              }}
              options={[
                { value: 'gasto', label: 'Salidas' },
                { value: 'ingreso', label: 'Entradas' }
              ]}
            />
          }
        >
          {sinCat > 0 && (
            <button
              onClick={() => setCatsTab('clasificar')}
              className="mx-5 mb-2 flex w-[calc(100%-40px)] shrink-0 items-center gap-3 rounded-xl bg-warn/10 px-3 py-2 text-left text-[13px] text-ink transition hover:bg-warn/15"
            >
              <Tags size={16} className="shrink-0 text-warn" />
              <span className="flex-1">
                {sinCat} movimiento{sinCat === 1 ? '' : 's'} sin categoría
              </span>
              <span className="font-medium text-accent">Clasificar</span>
            </button>
          )}
          <Desplazable className="border-t border-line">
          <div className="sticky top-0 z-[2] flex h-[30px] items-center gap-3 bg-surface px-5 text-[11.5px] font-medium uppercase tracking-wide text-muted shadow-[0_1px_0_rgb(var(--line))]">
            <span className="w-9 shrink-0" />
            <span className="min-w-0 flex-1">Categoría</span>
            <span className="w-[74px] shrink-0 text-right" title="Últimas 4 semanas contra las 4 anteriores">Cambio</span>
            <span className="w-[92px] shrink-0 text-right">Monto</span>
            <span className="w-4 shrink-0" />
          </div>
          {cats.length ? (
            <ul className="pb-1">
              {cats.map((c) => {
                const sel = cat === c.cat
                return (
                  <li key={c.cat} className={sel ? 'bg-accentc/40' : ''}>
                    <button
                      onClick={() => setCat(sel ? null : c.cat)}
                      aria-pressed={sel}
                      aria-expanded={sel}
                      className={`flex w-full items-center gap-3 px-5 py-2 text-left transition ${sel ? '' : 'hover:bg-raised/70'}`}
                    >
                      <IconoCirculo activo={sel}>
                        <CatIcon cat={c.cat} size={16} />
                      </IconoCirculo>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] text-ink">{catLabel(c.cat)}</div>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
                            <div className="h-full rounded-full" style={{ width: `${Math.max(1.5, c.pct * 100)}%`, background: vistaCat === 'gasto' ? colOut : colIn }} />
                          </div>
                          <span className="w-[88px] text-right text-[11.5px] tabular-nums text-muted">
                            {fmtPct(c.pct, 0)} · {c.n} mov.
                          </span>
                        </div>
                      </div>
                      <span className="flex w-[74px] shrink-0 justify-end">
                        {cambiosCat.get(c.cat) != null ? <Tendencia cambio={cambiosCat.get(c.cat)!} bueno={vistaCat === 'gasto' ? 'baja' : 'sube'} titulo="Últimas 4 semanas contra las 4 anteriores" /> : <span className="text-[12px] text-muted">—</span>}
                      </span>
                      <Money value={c.total} size="sm" className="w-[92px] shrink-0 text-right text-ink" />
                      <ChevronDown size={16} className={`shrink-0 text-muted transition ${sel ? 'rotate-180' : ''}`} />
                    </button>
                    {sel && (
                      <div className="pb-2 pl-[68px] pr-5">
                        <ul>
                          {comerciosCat.slice(0, 5).map((x) => (
                            <li key={x.clave} className="flex items-center justify-between gap-3 border-t border-line/70 py-1.5 text-[13px]">
                              <span className="min-w-0 truncate text-ink2">
                                {x.comercio} <span className="text-[11.5px] text-muted">· {x.n}</span>
                              </span>
                              <span className="cifra text-ink">{fmtMoney(x.total)}</span>
                            </li>
                          ))}
                        </ul>
                        {comerciosCat.length > 5 && (
                          <Button variant="text" size="sm" onClick={() => setModalCom({ titulo: catLabel(c.cat), movs: movsCat })}>
                            Ver los {comerciosCat.length}
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="px-5 pb-5 text-[13px] text-muted">Sin movimientos.</p>
          )}
          </Desplazable>
          <div className="flex shrink-0 flex-wrap items-center gap-1 border-t border-line px-3 py-2">
            <span className="px-2 text-[12px] text-muted">
              {cats.length} categoría{cats.length === 1 ? '' : 's'}
            </span>
            <span className="ml-auto flex flex-wrap gap-1">
              <Button
                variant="text"
                size="sm"
                onClick={() => setModalCom({ titulo: vistaCat === 'gasto' ? 'Dónde más gastas' : 'De quién recibes', movs: movs.filter((m) => m.naturaleza === vistaCat) })}
              >
                <Store size={15} /> Comercios
              </Button>
              <Button variant="text" size="sm" onClick={() => setPersonasOpen(true)}>
                <Users size={15} /> Personas
              </Button>
              <Button variant="text" size="sm" onClick={() => setCatsTab('tuyas')}>
                <Tags size={15} /> Categorías
              </Button>
            </span>
          </div>
        </Card>

        {/* Movimientos (lo que hay detrás de lo que filtraste) */}
        <Card
          fijo
          className="h-[640px] xl:h-full"
          flush
          title="Movimientos"
          subtitle={[alcance, cat ? catLabel(cat) : null].filter(Boolean).join(' · ') + ' · toca uno para ver el detalle o cambiar su categoría'}
        >
          <div id="movimientos" className="shrink-0 scroll-mt-24" />
          <TablaMovimientos movs={movsCat} onEditar={setEditando} compacto />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(340px,400px)_1fr]">
        {/* Cuentas */}
        <Card flush>
          <div className="flex items-start justify-between px-5 pt-5">
            <div>
              <div className="text-[13px] text-muted">{filtros.hasta ? `Saldo al ${fmtFecha(corte)}` : 'Saldo en tus cuentas'}</div>
              <Money value={saldoTotal} size="xl" className="mt-2 block text-ink" />
            </div>
          </div>
          <ul className="mt-4 border-t border-line">
            {saldos.map(({ c, s }, i) => {
              const sel = cuentaSel === c.cuenta
              return (
                <li key={c.cuenta}>
                  <button
                    onClick={() => setCuentasSel(sel ? [] : [c.cuenta])}
                    aria-pressed={sel}
                    className={`flex w-full items-center gap-3 px-5 py-3 text-left transition ${sel ? 'bg-accentc/60' : 'hover:bg-raised/70'} ${i ? 'border-t border-line/70' : ''}`}
                  >
                    <IconoCirculo color={colorCuenta(c.cuenta)}>{c.recibeNomina ? <Landmark size={16} /> : <CreditCard size={16} />}</IconoCirculo>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium text-ink">{c.producto}</div>
                      <div className="text-[12.5px] text-muted">
                        {c.corto} · {c.recibeNomina ? 'recibe tu nómina' : 'gastos diarios'}
                      </div>
                    </div>
                    <div className="text-right">
                      {s == null ? <span className="text-[13px] text-muted">sin estado</span> : <Money value={s} size="sm" className="text-ink" />}
                      <div className="text-[11.5px] text-muted">al {fmtFecha(c.fechaSaldo, false)}</div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
          {incompletas.length > 0 && (
            <div className="flex gap-2 border-t border-line px-5 py-3 text-[12.5px] text-ink2">
              <CircleAlert size={15} className="mt-0.5 shrink-0 text-warn" />
              <span>Falta parte del estado de {incompletas.map((c) => c.producto).join(' y ')} en este rango; lo que no está cargado no se cuenta.</span>
            </div>
          )}
        </Card>

        {/* Cómo cambió el saldo: se lee como un estado de cuenta */}
        <Card title="Cómo cambió tu saldo" subtitle={alcance}>
          <div className="text-[13.5px]">
            <FilaSaldo
              label="Saldo al inicio"
              sub={cambio.cuentas.map((x) => `${x.producto} ${fmtMoney(x.inicial)} (${fmtFecha(x.desde, false)})`).join(' · ')}
              valor={<Money value={cambio.inicial} size="sm" className="text-ink" />}
            />
            <FilaSaldo
              label="Entró"
              dot={colIn}
              sub={`Nómina ${fmtMoney(t.nomina)} y otros ingresos`}
              barra={{ pct: t.ingresos / maxIO, color: colIn }}
              valor={<Money value={t.ingresos} size="sm" signo className="text-good" />}
            />
            <FilaSaldo
              label="Salió"
              dot={colOut}
              sub={`Gastos, retiros y pagos · ${fmtMoney(t.gastos / Math.max(1, t.dias / 7))} por semana`}
              barra={{ pct: t.gastos / maxIO, color: colOut }}
              valor={<Money value={-t.gastos} size="sm" signo className="text-bad" />}
            />
            {cambio.traspasos !== 0 && (
              <FilaSaldo
                label={cuentaSel ? 'Traspasos con tu otra cuenta' : 'Traspasos sin el otro lado'}
                sub={
                  cuentaSel
                    ? 'Dinero que mandaste o recibiste de tus otras cuentas (no es gasto ni ingreso).'
                    : 'La otra cuenta no tiene estado cargado en esas fechas, así que no se ve a dónde llegó.'
                }
                valor={<Money value={cambio.traspasos} size="sm" signo className="text-ink2" />}
              />
            )}
            {cambio.sinEstado !== 0 && (
              <FilaSaldo
                label="Meses sin estado cargado"
                sub="Movimientos que no se ven porque falta ese estado de cuenta."
                valor={<Money value={cambio.sinEstado} size="sm" signo className="text-ink2" />}
              />
            )}
            <div className="mt-1 flex items-center gap-4 border-t border-line pt-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-ink">Saldo al final</div>
                <div className="truncate text-[12px] text-muted">
                  {cambio.cuentas.map((x) => `${x.producto} ${fmtMoney(x.final)} (${fmtFecha(x.hasta, false)})`).join(' · ')}
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-medium ${delta >= 0 ? 'bg-good/10 text-good' : 'bg-raised text-ink2'}`}
              >
                {delta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {delta >= 0 ? 'Subió' : 'Bajó'} {fmtMoney(Math.abs(delta))}
              </span>
              <Money value={cambio.final} size="md" className="w-40 text-right text-ink" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-x-6 border-t border-line pt-3">
            <Metrica label="Efectivo retirado">
              <Money value={t.efectivo} size="sm" />
            </Metrica>
            <Metrica label="Movido entre tus cuentas" hint="no cuenta como gasto">
              <Money value={t.internos} size="sm" className="text-ink2" />
            </Metrica>
            <Metrica
              label={t.ingresos >= t.gastos ? 'Ahorraste' : 'Gastaste de más'}
              hint={t.ingresos > 0 ? `${fmtPct(Math.abs(t.ingresos - t.gastos) / t.ingresos, 0)} de lo que entró` : undefined}
            >
              <Money value={Math.abs(t.ingresos - t.gastos)} size="sm" className={t.ingresos >= t.gastos ? 'text-good' : 'text-ink'} />
            </Metrica>
          </div>
        </Card>
      </div>

      {/* Entradas y salidas en el tiempo (mismo estilo que el saldo del Resumen) */}
      <CardFlujo
        movs={porCuenta}
        cat={cat}
        seleccion={periodoSel}
        onSeleccion={(p) => {
          setPeriodoSel(p)
          if (p) arriba()
        }}
      />

      {/* Cómo se repartió: calendario de calor o diagrama de flujo */}
      <Card
        title={vistaD === 'flujo' ? 'Cómo se movió tu dinero' : 'Tus días, uno por uno'}
        subtitle={
          vistaD === 'flujo'
            ? 'Se lee de izquierda a derecha: lo que entró pasa por tus cuentas y sale en lo que gastaste. El grosor de cada banda es el dinero.'
            : 'Un cuadro por día: cuanto más fuerte el color, más dinero se movió. Así ves qué días y qué semanas pesan más.'
        }
        actions={
          <Segmented
            value={vistaD}
            onChange={setVistaD}
            options={[
              { value: 'mapa', label: 'Calendario' },
              { value: 'flujo', label: 'Diagrama' }
            ]}
          />
        }
      >
        {vistaD === 'flujo' ? (
          <>
            <FlujoDiagrama
              flujo={flujo}
              colores={{ entrada: colIn, salida: colOut, neutro: colNeutro, centro: colCentro }}
              seleccion={cat}
              onNodo={(n) => {
                if (!n.cat) return
                setCat((x) => (x === n.cat ? null : n.cat!))
                arriba()
              }}
            />
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line pt-3 text-[12px] text-muted">
              <LeyendaSeries
                series={[
                  { key: 'in', label: 'Ingresos', color: colIn },
                  { key: 'out', label: 'Gastos', color: colOut },
                  { key: 'n', label: 'Traspasos y saldo', color: colNeutro }
                ]}
              />
              <span>Los traspasos entre tus cuentas se cancelan entre sí; sólo aparecen los que no se ven del otro lado. Pasa el cursor sobre una banda para ver el detalle.</span>
            </div>
          </>
        ) : (
          <MapaGasto
            movs={porCuenta}
            cat={cat}
            seleccion={periodoSel}
            onSeleccion={(p) => {
              setPeriodoSel(p)
              if (p) arriba()
            }}
          />
        )}
      </Card>

      <ModalCategoria key={editando?.id ?? 'none'} mov={editando} onClose={() => setEditando(null)} />
      <ModalComercios open={!!modalCom} onClose={() => setModalCom(null)} movs={modalCom?.movs ?? []} titulo={modalCom?.titulo ?? ''} />
      <ModalPersonas open={personasOpen} onClose={() => setPersonasOpen(false)} movs={movs} />
      <ModalCategorias pestana={catsTab} onPestana={setCatsTab} onClose={() => setCatsTab(null)} />
    </div>
  )
}

/** Renglón del resumen de saldo: concepto (y detalle) a la izquierda, importe a la derecha. */
function FilaSaldo({ label, sub, valor, dot, barra }: { label: string; sub?: string; valor: JSX.Element; dot?: string; barra?: { pct: number; color: string } }): JSX.Element {
  return (
    <div className="flex items-center gap-4 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-ink">
          {dot && <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />}
          {label}
        </div>
        {sub && (
          <div className="truncate text-[12px] text-muted" title={sub}>
            {sub}
          </div>
        )}
      </div>
      {barra && (
        <div className="hidden h-2.5 w-[28%] overflow-hidden rounded-full bg-raised md:block">
          <div className="h-full rounded-full" style={{ width: `${Math.max(1.5, barra.pct * 100)}%`, background: barra.color }} />
        </div>
      )}
      <span className="w-40 text-right">{valor}</span>
    </div>
  )
}
