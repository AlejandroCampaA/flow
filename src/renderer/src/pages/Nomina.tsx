import { useMemo, useState } from 'react'
import { Briefcase, CircleCheck, Percent, ReceiptText, Upload, Wallet } from 'lucide-react'
import { analizarAhorro, totales } from '../lib/analytics'
import { serie } from '../lib/palette'
import { fmtMoney, fmtPct } from '../lib/format'
import { fmtFecha } from '../lib/dates'
import { useStore } from '../store'
import { Button, Empty, KpiTile, Money, Sparkline, Tendencia } from '../components/ui'
import type { PestanaArchivos } from '../components/Archivos'
import { ModalExtra, ResumenExtra } from '../components/NominaExtra'
import { ModalAhorro, ResumenAhorro } from '../components/NominaAhorro'
import { ModalConceptos, SueldoDestino } from '../components/NominaSueldo'
import { CardSueldo } from '../components/NominaGrafica'

type ModalNomina = 'extra' | 'ahorro' | 'conceptos' | null

const suma = (rs: { totales: { depositado: number } }[]): number => rs.reduce((a, r) => a + r.totales.depositado, 0)

export default function Nomina({
  onAdjuntar,
  onArchivos,
  modalInicial = null
}: {
  onAdjuntar: () => void
  onArchivos: (p: PestanaArchivos) => void
  /** Abrir directo el detalle de tiempo extra o ahorro (desde el Resumen). */
  modalInicial?: ModalNomina
}): JSX.Element {
  const { visibles, recibos, modo, banco, filtros } = useStore()
  const [modal, setModal] = useState<ModalNomina>(modalInicial)

  const t = useMemo(() => totales(visibles), [visibles])
  const ahorro = useMemo(() => analizarAhorro(recibos), [recibos])

  if (!recibos.length) {
    return (
      <Empty title="Agrega tus recibos de nómina" icon={<Briefcase size={26} />}>
        <p>Sube tus PDF o XML de nómina (o arrástralos a la ventana). Cada recibo se lee solo y se guarda; después sólo agregas los nuevos.</p>
        <div className="mt-5">
          <Button variant="filled" onClick={onAdjuntar}>
            <Upload size={15} /> Agregar recibos
          </Button>
        </div>
      </Empty>
    )
  }
  if (!visibles.length) return <Empty title="No hay recibos en este rango">Elige otro rango de fechas arriba.</Empty>

  const ordinarios = visibles.filter((r) => r.tipo === 'ordinaria')
  const promDep = ordinarios.length ? suma(ordinarios) / ordinarios.length : 0
  const ultimo = ordinarios[ordinarios.length - 1]
  const conc = banco.conciliacion?.filas ?? []
  const verificados = conc.filter((f) => f.estado === 'coincide' && f.recibo && visibles.includes(f.recibo)).length

  // Tendencia: últimas 4 semanas ordinarias contra las 4 anteriores.
  const ult4 = ordinarios.slice(-4)
  const prev4 = ordinarios.slice(-8, -4)
  const promUlt = ult4.length ? suma(ult4) / ult4.length : 0
  const promPrev = prev4.length === 4 ? suma(prev4) / 4 : 0
  const cambio = promPrev ? promUlt / promPrev - 1 : null

  const acumulado = ordinarios.reduce<number[]>((a, r) => [...a, (a[a.length - 1] ?? 0) + r.totales.depositado], [])
  const colDep = serie(0, modo)

  return (
    <div className="space-y-4">
      {/* Indicadores (mismo estilo que el Resumen) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          icon={<Wallet size={16} />}
          color={colDep}
          label="Depositado en tu cuenta"
          sub={
            <>
              {visibles.length} recibo{visibles.length === 1 ? '' : 's'}
              {verificados > 0 && (
                <span className="inline-flex items-center gap-1 text-good">
                  <CircleCheck size={13} /> {verificados} verificado{verificados === 1 ? '' : 's'}
                </span>
              )}
            </>
          }
          pie={<Sparkline valores={acumulado.slice(-40)} color={colDep} />}
        >
          <Money value={t.depositado} size="lg" />
        </KpiTile>
        <KpiTile
          icon={<Briefcase size={16} />}
          color={serie(2, modo)}
          label="Tu sueldo por semana"
          sub={
            ult4.length > 0 && (
              <>
                últimas {ult4.length}: {fmtMoney(promUlt)}
                <Tendencia cambio={cambio} titulo="Contra las 4 semanas anteriores" />
              </>
            )
          }
          pie={<Sparkline valores={ordinarios.slice(-26).map((r) => r.totales.depositado)} color={serie(2, modo)} barras />}
        >
          <Money value={promDep} size="lg" />
        </KpiTile>
        <KpiTile
          icon={<Percent size={16} />}
          color={serie(1, modo)}
          label="Bruto, antes de descuentos"
          sub={<>{fmtPct(t.bruto ? t.deducciones / t.bruto : 0)} se va en descuentos</>}
          pie={<Sparkline valores={ordinarios.slice(-26).map((r) => r.totales.bruto)} color={serie(1, modo)} barras />}
        >
          <Money value={t.bruto} size="lg" />
        </KpiTile>
        {ultimo && (
          <KpiTile
            icon={<ReceiptText size={16} />}
            color={serie(4, modo)}
            label={`Último recibo · S${ultimo.semana}`}
            onClick={() => onArchivos('recibos')}
            title="Ver tus recibos"
            sub={<>{fmtFecha(ultimo.fechaPago)} · Ver recibos</>}
          >
            <Money value={ultimo.totales.depositado} size="lg" />
          </KpiTile>
        )}
      </div>

      {/* Tu sueldo en el tiempo (mismo estilo que el saldo del Resumen) */}
      <CardSueldo visibles={visibles} />

      {/* A dónde se va tu sueldo, en el tiempo */}
      <SueldoDestino visibles={visibles} onConceptos={() => setModal('conceptos')} />

      {/* Tiempo extra y fondo de ahorro: lo esencial aquí, el detalle en su ventana */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div id="nomina-extra" className="scroll-mt-4 [&>section]:h-full">
          <ResumenExtra visibles={visibles} onDetalle={() => setModal('extra')} />
        </div>
        <div id="nomina-ahorro" className="scroll-mt-4 [&>section]:h-full">
          <ResumenAhorro a={ahorro} onDetalle={() => setModal('ahorro')} />
        </div>
      </div>

      <ModalConceptos open={modal === 'conceptos'} onClose={() => setModal(null)} visibles={visibles} />
      <ModalExtra open={modal === 'extra'} onClose={() => setModal(null)} visibles={visibles} />
      <ModalAhorro open={modal === 'ahorro'} onClose={() => setModal(null)} a={ahorro} desde={filtros.desde} hasta={filtros.hasta} />
    </div>
  )
}
