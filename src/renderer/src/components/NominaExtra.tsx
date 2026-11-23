import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Clock3, Minus } from 'lucide-react'
import { totales } from '../lib/analytics'
import { fmtFecha } from '../lib/dates'
import { fmtCompacto, fmtHoras, fmtMoney, fmtPct } from '../lib/format'
import { serie } from '../lib/palette'
import type { Recibo } from '../lib/types'
import { useStore } from '../store'
import { Button, Card, LeyendaSeries, Metrica, Money, Segmented, Sparkline } from './ui'
import TablaCorta, { type ColTabla } from './TablaCorta'
import Modal from './Modal'
import { BotonesEscala, cambioTxt, Dato, dir, PieGrafica, signo, TXT, useEscala, type Dir } from './GraficaTiempo'
import { GraficaSerie } from './SerieTiempo'
import { construir, recortarRango, type PeriodoSueldo } from './NominaGrafica'

const conExtra = (r: Recibo): boolean => r.horas.dobles + r.horas.triples > 0 || r.porCategoria.tiempo_extra > 0

/** Resumen del tiempo extra en el rango (tarjeta de la pestaña Nómina). */
export function ResumenExtra({ visibles, onDetalle }: { visibles: Recibo[]; onDetalle: () => void }): JSX.Element {
  const { modo } = useStore()
  const t = useMemo(() => totales(visibles), [visibles])
  const ordinarios = visibles.filter((r) => r.tipo === 'ordinaria')
  const semanas = ordinarios.filter(conExtra).length
  const horas = t.horasDobles + t.horasTriples
  const dobles = visibles.reduce((s, r) => s + r.horas.importeDobles, 0)
  const triples = visibles.reduce((s, r) => s + r.horas.importeTriples, 0)
  const colD = serie(1, modo)
  const colT = serie(2, modo)

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Clock3 size={17} className="text-muted" /> Tiempo extra
        </span>
      }
      subtitle={ordinarios.length ? `${semanas} de ${ordinarios.length} semanas con horas extra` : undefined}
      className="flex flex-col"
    >
      {horas > 0 || t.importeExtra > 0 ? (
        <>
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="cifra text-[28px] font-semibold leading-none text-ink">{fmtHoras(horas)}</div>
              <div className="mt-1.5 text-[13px] text-ink2">
                te pagaron <Money value={t.importeExtra} size="sm" className="text-ink" /> · {fmtPct(t.bruto ? t.importeExtra / t.bruto : 0, 0)} de tu bruto
              </div>
            </div>
            <div className="w-36 shrink-0">
              <Sparkline valores={ordinarios.slice(-26).map((r) => r.horas.dobles + r.horas.triples)} color={colD} barras alto={40} />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-x-5 border-t border-line pt-3">
            <Metrica label="Dobles" dot={colD} hint={fmtMoney(dobles)}>
              <span className="cifra text-[16px] font-semibold">{fmtHoras(t.horasDobles)}</span>
            </Metrica>
            <Metrica label="Triples" dot={colT} hint={fmtMoney(triples)}>
              <span className="cifra text-[16px] font-semibold">{fmtHoras(t.horasTriples)}</span>
            </Metrica>
            <Metrica label="Por hora" hint="en promedio">
              <span className="cifra text-[16px] font-semibold">{horas ? fmtMoney(t.importeExtra / horas) : '—'}</span>
            </Metrica>
          </div>
        </>
      ) : (
        <p className="text-[13.5px] text-ink2">Sin horas extra en este rango.</p>
      )}
      <div className="mt-auto flex justify-end pt-3">
        <Button variant="text" size="sm" onClick={onDetalle}>
          Ver semana por semana
        </Button>
      </div>
    </Card>
  )
}

/** Tiempo extra semana por semana: gráfica de mercado (horas o pesos) y la tabla corta debajo. */
export function ModalExtra({ open, onClose, visibles }: { open: boolean; onClose: () => void; visibles: Recibo[] }): JSX.Element {
  const { modo } = useStore()
  const esc = useEscala(['semana', 'mes'], '1a')
  const [unidad, setUnidad] = useState<'horas' | 'pesos'>('pesos')
  const [estilo, setEstilo] = useState<'barras' | 'apilada' | 'acum'>('barras')
  const [sel, setSel] = useState<string | null>(null)
  const gran = esc.gran === 'mes' ? 'mes' : 'semana'
  const nombre = gran === 'mes' ? 'mes' : 'semana'
  const rs = useMemo(() => recortarRango(visibles, esc.rango), [visibles, esc.rango])
  const ps = useMemo(() => construir(rs, gran), [rs, gran])
  const festivos = visibles.flatMap((r) => r.percepciones.filter((p) => /Festivo|Prima dominical/.test(p.sub)).map((p) => ({ r, p })))
  const colD = serie(1, modo)
  const colT = serie(2, modo)
  const colAc = serie(5, modo)
  const horas = (q: PeriodoSueldo): number => q.p.horasDobles + q.p.horasTriples
  const pesos = (q: PeriodoSueldo): number => q.p.importeDobles + q.p.importeTriples
  const series =
    unidad === 'horas'
      ? [
          { key: 'horasDobles', label: 'Dobles', color: colD },
          { key: 'horasTriples', label: 'Triples', color: colT }
        ]
      : [
          { key: 'importeDobles', label: 'Dobles', color: colD },
          { key: 'importeTriples', label: 'Triples', color: colT }
        ]
  const totalP = (q: PeriodoSueldo): number => (unidad === 'horas' ? horas(q) : pesos(q))
  const media = useMemo(() => ps.map((_, i) => (i < 3 ? null : ps.slice(i - 3, i + 1).reduce((s, q) => s + totalP(q), 0) / 4)), [ps, unidad]) // eslint-disable-line react-hooks/exhaustive-deps
  const acum = useMemo(() => {
    let a = 0
    return new Map(ps.map((q) => [q.key, (a += totalP(q))]))
  }, [ps, unidad]) // eslint-disable-line react-hooks/exhaustive-deps
  const th = ps.reduce((a, q) => a + horas(q), 0)
  const tp = ps.reduce((a, q) => a + pesos(q), 0)
  const conHoras = ps.filter((q) => horas(q) > 0 || pesos(q) > 0)
  const mejor = ps.reduce<PeriodoSueldo | null>((m, q) => (!m || totalP(q) > totalP(m) ? q : m), null)
  const ult = ps[ps.length - 1]
  const prev = ps[ps.length - 2]
  const dUlt: Dir = ult && prev ? dir(totalP(prev), totalP(ult)) : 'igual'
  const IconoUlt = dUlt === 'sube' ? ArrowUpRight : dUlt === 'baja' ? ArrowDownRight : Minus
  const fmtV = unidad === 'horas' ? fmtHoras : fmtMoney
  const filas = useMemo(() => [...ps].reverse(), [ps])
  const primas = (q: PeriodoSueldo): string =>
    q.p.recibos
      .flatMap((r) => r.percepciones.filter((p) => p.categoria === 'primas').map((p) => `${p.sub} ${fmtMoney(p.importe)}`))
      .join(' · ')
  const guion = (n: number, f: (x: number) => string): string => (n > 0.005 ? f(n) : '—')
  const columnas: ColTabla<PeriodoSueldo>[] = [
    { head: 'Periodo', cell: (q) => <span className={totalP(q) > 0 ? 'font-medium text-ink' : 'text-muted'}>{q.detalle}</span> },
    { head: 'Hrs dobles', num: true, cell: (q) => guion(q.p.horasDobles, fmtHoras) },
    { head: '$ dobles', num: true, cell: (q) => guion(q.p.importeDobles, fmtMoney) },
    { head: 'Hrs triples', num: true, cell: (q) => guion(q.p.horasTriples, fmtHoras) },
    { head: '$ triples', num: true, cell: (q) => guion(q.p.importeTriples, fmtMoney) },
    { head: 'Total extra', num: true, cell: (q) => <span className={q.p.porCategoria.tiempo_extra > 0 ? 'font-medium text-ink' : ''}>{guion(q.p.porCategoria.tiempo_extra, fmtMoney)}</span> },
    { head: 'Primas / festivos', cell: (q) => <span className="text-ink2">{primas(q) || '—'}</span> }
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={1120}
      alto="88vh"
      title="Tiempo extra semana por semana"
      subtitle={`${conHoras.length} de ${ps.length} ${nombre === 'mes' ? 'meses' : 'semanas'} con extra en este rango`}
      actions={
        <Segmented
          value={unidad}
          onChange={setUnidad}
          options={[
            { value: 'pesos', label: 'Pesos' },
            { value: 'horas', label: 'Horas' }
          ]}
        />
      }
    >
      {/* Cinta de precios y, a la derecha, el estilo de la gráfica */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
          <div>
            <div className="text-[12px] text-muted">{unidad === 'horas' ? 'Horas extra en este rango' : 'Te pagaron en este rango'}</div>
            <div className="cifra text-[28px] font-semibold leading-8 text-ink">{unidad === 'horas' ? fmtHoras(th) : fmtMoney(tp)}</div>
            {ult && prev && (
              <div className={`mt-1 flex items-center gap-1 text-[13px] font-medium ${TXT[dUlt]}`}>
                <IconoUlt size={15} />
                {unidad === 'horas' ? `${signo(horas(ult) - horas(prev))}${fmtHoras(Math.abs(horas(ult) - horas(prev)))}` : cambioTxt(pesos(ult) - pesos(prev))}
                <span className="ml-1 font-normal text-muted">contra el {nombre} anterior</span>
              </div>
            )}
          </div>
          <Dato label={unidad === 'horas' ? 'Te pagaron' : 'Horas'} valor={unidad === 'horas' ? fmtCompacto(tp) : fmtHoras(th)} />
          <Dato label={`Promedio por ${nombre}`} valor={unidad === 'horas' ? fmtHoras(ps.length ? th / ps.length : 0) : fmtCompacto(ps.length ? tp / ps.length : 0)} />
          {mejor && totalP(mejor) > 0 && <Dato label={`Mejor ${nombre}`} valor={fmtV(totalP(mejor))} color="text-good" sub={mejor.label} />}
          <Dato label="Por hora" valor={th ? fmtMoney(tp / th) : '—'} />
        </div>
        <Segmented
          value={estilo}
          onChange={setEstilo}
          options={[
            { value: 'barras', label: 'Barras' },
            { value: 'apilada', label: 'Áreas' },
            { value: 'acum', label: 'Acumulado' }
          ]}
        />
      </div>
      <GraficaSerie
        periodos={ps}
        series={estilo === 'acum' ? [{ key: 'acum', label: 'Acumulado', color: colAc }] : series}
        valor={(q, k) => (k === 'acum' ? (acum.get(q.key) ?? 0) : Number(q.p[k as keyof typeof q.p]) || 0)}
        esc={esc}
        tipo={estilo === 'acum' ? 'area' : estilo === 'apilada' ? 'apilada' : 'barras'}
        alto={250}
        fmt={fmtV}
        fmtEje={unidad === 'horas' ? (v) => `${v} h` : undefined}
        fitKey={`${esc.fit}|${unidad}`}
        etiquetaAria="Tiempo extra por periodo"
        media={estilo === 'acum' ? undefined : media}
        seleccion={sel}
        onSelect={(q) => setSel((s) => (s === q.key ? null : q.key))}
        tooltipExtra={(q) => (unidad === 'horas' ? <div className="mt-1 text-[11.5px] text-muted">Te pagaron {fmtMoney(pesos(q))}</div> : <div className="mt-1 text-[11.5px] text-muted">{fmtHoras(horas(q))}</div>)}
      />
      <PieGrafica derecha={<BotonesEscala e={esc} />}>
        <LeyendaSeries series={estilo === 'acum' ? [{ key: 'acum', label: 'Acumulado', color: colAc }] : series} />
        {estilo !== 'acum' && (
          <span className="flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden>
              <line x1="0" y1="4" x2="18" y2="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
            </svg>
            Media de 4
          </span>
        )}
      </PieGrafica>

      <div className="mt-4">
        <TablaCorta
          enModal
          alto="h-[320px]"
          titulo={`Tu tiempo extra, ${nombre} por ${nombre}`}
          subtitulo={`${filas.length} ${nombre === 'mes' ? 'meses' : 'semanas'} · horas, pesos y primas de cada recibo`}
          filas={filas}
          columnas={columnas}
          clave={(q) => q.key}
          seleccion={sel}
          onSelect={setSel}
          barra={(q) => (totalP(q) > 0 ? colD : undefined)}
        />
        {festivos.length > 0 && (
          <p className="pt-2 text-[12.5px] text-muted">
            Prima dominical y festivo trabajado: {festivos.length} pago(s), el último el {fmtFecha(festivos[festivos.length - 1].r.fecha)}.
          </p>
        )}
      </div>
    </Modal>
  )
}
