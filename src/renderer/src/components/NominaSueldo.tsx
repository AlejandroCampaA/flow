import { useMemo, useState } from 'react'
import { ListTree } from 'lucide-react'
import { conceptos, totales } from '../lib/analytics'
import { CATEGORIA_LABEL } from '../lib/normalize'
import { colorCategoria, serie } from '../lib/palette'
import { fmtCompacto, fmtMoney, fmtPct } from '../lib/format'
import { fmtFecha } from '../lib/dates'
import type { Recibo } from '../lib/types'
import { useStore } from '../store'
import { Badge, Button, Card, Dot, LeyendaSeries, Money, Segmented } from './ui'
import { BotonesEscala, COL, Dato, PieGrafica, useEscala } from './GraficaTiempo'
import { GraficaSerie } from './SerieTiempo'
import { construir, recortarRango, type PeriodoSueldo } from './NominaGrafica'
import Modal from './Modal'
import TablaConceptos from './TablaConceptos'

type EstiloDestino = 'barras' | 'apilada' | 'pct'

/**
 * A dónde se va tu sueldo, a lo largo del tiempo: cada columna es el bruto de una semana (o mes) repartido entre lo que llega
 * a tu cuenta, la despensa, el fondo de ahorro, el ISR, el IMSS y otras deducciones. Con "% del total" ves cómo cambia el reparto.
 */
export function SueldoDestino({ visibles, onConceptos }: { visibles: Recibo[]; onConceptos: () => void }): JSX.Element {
  const { modo } = useStore()
  const col = COL[modo]
  const esc = useEscala(['semana', 'mes'], '1a')
  const [estilo, setEstilo] = useState<EstiloDestino>('barras')
  const [ocultas, setOcultas] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<string | null>(null)
  const gran = esc.gran === 'mes' ? 'mes' : 'semana'
  const unidad = gran === 'mes' ? 'mes' : 'semana'

  const rs = useMemo(() => recortarRango(visibles, esc.rango), [visibles, esc.rango])
  const ps = useMemo(() => construir(rs, gran), [rs, gran])
  const t = useMemo(() => totales(rs), [rs])

  // De abajo hacia arriba: primero lo que llega a tu cuenta y luego cada descuento.
  const todas = [
    { key: 'dep', label: 'Llega a tu cuenta', color: col.sube },
    { key: 'despensa', label: 'Despensa (vales)', color: serie(3, modo) },
    { key: 'ahorro', label: 'Fondo de ahorro', color: serie(5, modo) },
    { key: 'imss', label: 'IMSS', color: serie(2, modo) },
    { key: 'isr', label: 'ISR', color: serie(1, modo) },
    { key: 'otras', label: 'Otras deducciones', color: serie(4, modo) }
  ]
  const valor = (q: PeriodoSueldo, key: string): number =>
    ({ dep: q.dep, despensa: q.p.despensa, ahorro: q.p.dedAhorro, imss: q.p.imss, isr: q.p.isr, otras: q.p.dedOtras })[key as 'dep'] ?? 0
  const porSerie = todas.map((s) => ({ ...s, total: ps.reduce((a, q) => a + valor(q, s.key), 0) })).filter((s) => s.total > 0.005)
  const activas = porSerie.filter((s) => !ocultas.has(s.key))
  const granTotal = porSerie.reduce((a, s) => a + s.total, 0)
  const dep = porSerie.find((s) => s.key === 'dep')?.total ?? 0
  const media = useMemo(
    () => ps.map((_, i) => (i < 3 ? null : ps.slice(i - 3, i + 1).reduce((a, q) => a + activas.reduce((x, s) => x + valor(q, s.key), 0), 0) / 4)),
    [ps, ocultas, t] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const alternar = (k: string): void =>
    setOcultas((o) => {
      const n = new Set(o)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  return (
    <Card
      title="A dónde se va tu sueldo"
      subtitle={`Cada columna es el bruto de un ${unidad}, repartido entre lo que llega a tu cuenta y lo que se descuenta`}
      actions={
        <Button variant="text" size="sm" onClick={onConceptos}>
          <ListTree size={15} /> Cada concepto
        </Button>
      }
    >
      {/* Cinta de precios: de cada $100, a dónde va */}
      <div className="mb-3 flex flex-wrap items-end gap-x-8 gap-y-2">
        <div>
          <div className="text-[12px] text-muted">De cada $100 que ganas, llegan a tu cuenta</div>
          <div className="cifra text-[28px] font-semibold leading-8 text-ink">${Math.round((dep / (granTotal || 1)) * 100)}</div>
          <div className="mt-1 text-[13px] font-medium" style={{ color: col.sube }}>
            ▲ {fmtMoney(dep)} <span className="font-normal text-muted">de {fmtMoney(granTotal)} en este rango</span>
          </div>
        </div>
        {porSerie
          .filter((s) => s.key !== 'dep')
          .slice(0, 4)
          .map((s) => (
            <div key={s.key}>
              <div className="flex items-center gap-1.5 text-[12px] text-muted">
                <Dot color={s.color} size={8} />
                {s.label}
              </div>
              <div className="cifra text-[15px] font-medium text-ink">
                {fmtCompacto(s.total)}
                <span className="ml-1.5 text-[12px] font-normal text-muted">{fmtPct(granTotal ? s.total / granTotal : 0, 0)}</span>
              </div>
            </div>
          ))}
        <Dato label="Descuentos en total" valor={`−${fmtCompacto(t.deducciones)}`} color="text-bad" sub={fmtPct(t.bruto ? t.deducciones / t.bruto : 0, 0)} />
      </div>
      {/* El reparto de todo el rango en una sola barra */}
      <div className="mb-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Reparto del bruto en el rango">
        {porSerie.map((s) => (
          <span key={s.key} title={`${s.label}: ${fmtMoney(s.total)}`} style={{ width: `${(s.total / (granTotal || 1)) * 100}%`, background: s.color }} />
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
        <Segmented
          value={estilo}
          onChange={setEstilo}
          options={[
            { value: 'barras', label: 'Barras' },
            { value: 'apilada', label: 'Áreas' },
            { value: 'pct', label: '% del total' }
          ]}
        />
      </div>

      <GraficaSerie
        periodos={ps}
        series={activas}
        valor={valor}
        esc={esc}
        tipo={estilo === 'apilada' ? 'apilada' : 'barras'}
        pct={estilo === 'pct'}
        alto={290}
        fitKey={`${esc.fit}|${activas.map((s) => s.key).join(',')}`}
        etiquetaAria="A dónde se va tu sueldo por periodo"
        vacio="Sin recibos en este rango."
        media={estilo === 'pct' ? undefined : media}
        seleccion={sel}
        onSelect={(q) => setSel((s) => (s === q.key ? null : q.key))}
        tooltipExtra={(q) => (
          <div className="mt-1.5 text-[11.5px] text-muted">
            {fmtPct(q.bruto ? q.dep / q.bruto : 0, 0)} de tu bruto llegó a tu cuenta
          </div>
        )}
      />
      <PieGrafica derecha={<BotonesEscala e={esc} />}>
        <LeyendaSeries series={porSerie} ocultas={ocultas} onToggle={alternar} />
        {estilo !== 'pct' && (
          <span className="flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden>
              <line x1="0" y1="4" x2="18" y2="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
            </svg>
            Media de 4
          </span>
        )}
      </PieGrafica>
    </Card>
  )
}

/** Cada concepto de tus recibos: bonos, primas y la tabla completa con historial. */
export function ModalConceptos({ open, onClose, visibles }: { open: boolean; onClose: () => void; visibles: Recibo[] }): JSX.Element {
  const { modo } = useStore()
  const lista = useMemo(() => conceptos(visibles), [visibles])
  const t = useMemo(() => totales(visibles), [visibles])
  const bonos = lista.filter((x) => x.categoria === 'bonos')
  const especiales = lista.filter((x) => ['primas', 'prestaciones', 'otras'].includes(x.categoria))
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={1180}
      alto="88vh"
      title="De dónde viene cada peso"
      subtitle={`${lista.length} conceptos en ${visibles.length} recibos · toca un concepto para ver su historial`}
    >
      <div className="-mx-6">
        <div className="grid grid-cols-1 gap-x-4 xl:grid-cols-2">
          <ListaConceptos
            titulo="Bonos"
            vacio="Sin bonos en este rango."
            items={bonos.map((b) => ({
              k: b.sub,
              nombre: b.sub,
              badge: b.recurrente ? <Badge tone="accent">Cada semana</Badge> : <Badge>Ocasional</Badge>,
              sub: `${b.veces} vez${b.veces === 1 ? '' : 'es'} · promedio ${fmtMoney(b.promedio)} · último ${fmtFecha(b.ultimaFecha, false)}`,
              total: b.total
            }))}
          />
          <ListaConceptos
            titulo="Primas, festivos y otros"
            vacio="Nada especial en este rango."
            items={especiales.map((b) => ({
              k: b.sub,
              nombre: b.sub,
              dot: colorCategoria(b.categoria, modo),
              badge: b.categoria === 'otras' ? <Badge>Sin especificar</Badge> : undefined,
              sub: `${CATEGORIA_LABEL[b.categoria]} · ${b.veces} vez${b.veces === 1 ? '' : 'es'} · último ${fmtFecha(b.ultimaFecha, false)}`,
              total: b.total
            }))}
          />
        </div>
        <h3 className="border-t border-line px-6 pb-2 pt-4 text-[14px] font-semibold text-ink">Todos los conceptos</h3>
        <TablaConceptos lista={lista} recibos={visibles} bruto={t.bruto} />
      </div>
    </Modal>
  )
}

function ListaConceptos({
  titulo,
  vacio,
  items
}: {
  titulo: string
  vacio: string
  items: { k: string; nombre: string; sub: string; total: number; badge?: JSX.Element; dot?: string }[]
}): JSX.Element {
  return (
    <div>
      <h3 className="px-6 pb-2 pt-1 text-[14px] font-semibold text-ink">{titulo}</h3>
      {items.length ? (
        <ul className="pb-2">
          {items.map((b) => (
            <li key={b.k} className="flex items-center justify-between gap-3 border-t border-line/70 px-6 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[14px] text-ink">
                  {b.dot && <Dot color={b.dot} size={8} />}
                  <span className="truncate">{b.nombre}</span>
                  {b.badge}
                </div>
                <div className="text-[12.5px] text-muted">{b.sub}</div>
              </div>
              <Money value={b.total} size="sm" className="text-ink" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-6 pb-4 text-[13px] text-muted">{vacio}</p>
      )}
    </div>
  )
}
