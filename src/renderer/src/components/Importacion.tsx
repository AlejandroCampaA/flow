import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, CircleAlert, Copy, GitMerge, Loader2, X } from 'lucide-react'
import { useStore, type EstadoImport, type ResultadoImport } from '../store'
import type { ArchivoEntrada } from '../lib/importer'
import { Badge, Button } from './ui'
import Modal from './Modal'

export interface ColaImportacion {
  /** Archivos de la tanda actual (incluye los ya leídos). */
  total: number
  hechos: number
  actual: string | null
  mensaje: string
  resultados: ResultadoImport[]
  omitidos: number
  activo: boolean
  visible: boolean
}

const VACIA: ColaImportacion = { total: 0, hechos: 0, actual: null, mensaje: '', resultados: [], omitidos: 0, activo: false, visible: false }

/**
 * Importación en segundo plano: los archivos se leen uno por uno en una cola y cada uno aparece en la
 * app en cuanto termina. Se puede seguir usando la app (y agregar más archivos) mientras tanto.
 */
export function useColaImportacion(): {
  cola: ColaImportacion
  agregar: (files: ArchivoEntrada[], omitidos?: number) => void
  ocultar: () => void
} {
  const { importar } = useStore()
  const importarRef = useRef(importar)
  importarRef.current = importar
  const pendientes = useRef<ArchivoEntrada[]>([])
  const corriendo = useRef(false)
  const [cola, setCola] = useState<ColaImportacion>(VACIA)

  const correr = useCallback(async () => {
    corriendo.current = true
    while (pendientes.current.length) {
      const f = pendientes.current.shift()!
      setCola((s) => ({ ...s, actual: f.name, mensaje: '' }))
      let r: ResultadoImport[]
      try {
        r = await importarRef.current([f], (mensaje) => setCola((s) => ({ ...s, mensaje })))
      } catch (e) {
        r = [{ archivo: f.name, estado: 'error', mensaje: (e as Error).message || 'No se pudo leer.' }]
      }
      setCola((s) => ({ ...s, hechos: s.hechos + 1, resultados: [...s.resultados, ...r] }))
    }
    corriendo.current = false
    setCola((s) => ({ ...s, activo: false, actual: null, mensaje: '' }))
  }, [])

  const agregar = useCallback(
    (files: ArchivoEntrada[], omitidos = 0) => {
      if (!files.length && !omitidos) return
      pendientes.current.push(...files)
      setCola((s) =>
        s.activo
          ? { ...s, total: s.total + files.length, omitidos: s.omitidos + omitidos, visible: true }
          : { ...VACIA, total: files.length, omitidos, activo: files.length > 0, visible: true }
      )
      if (!corriendo.current && files.length) void correr()
    },
    [correr]
  )

  const ocultar = useCallback(() => setCola((s) => ({ ...s, visible: false })), [])
  return { cola, agregar, ocultar }
}

const cuenta = (rs: ResultadoImport[], e: EstadoImport): number => rs.filter((r) => r.estado === e).length

function resumen(rs: ResultadoImport[], omitidos: number): string {
  const partes = [
    cuenta(rs, 'nuevo') && `${cuenta(rs, 'nuevo')} nuevo${cuenta(rs, 'nuevo') === 1 ? '' : 's'}`,
    cuenta(rs, 'fusionado') && `${cuenta(rs, 'fusionado')} combinado${cuenta(rs, 'fusionado') === 1 ? '' : 's'}`,
    cuenta(rs, 'duplicado') && `${cuenta(rs, 'duplicado')} ya existía${cuenta(rs, 'duplicado') === 1 ? '' : 'n'}`,
    cuenta(rs, 'error') && `${cuenta(rs, 'error')} con error`,
    omitidos && `${omitidos} omitido${omitidos === 1 ? '' : 's'}`
  ].filter(Boolean)
  return partes.join(' · ')
}

/** Aviso de progreso abajo a la derecha (snackbar). */
export function AvisoImportacion({ cola, onCerrar, onDetalle }: { cola: ColaImportacion; onCerrar: () => void; onDetalle: () => void }): JSX.Element | null {
  const [plegado, setPlegado] = useState(false)
  const problemas = cola.resultados.some((r) => r.estado === 'error' || r.avisos?.length) || cola.omitidos > 0

  // Si todo salió bien, el aviso se va solo a los pocos segundos.
  useEffect(() => {
    if (cola.activo || !cola.visible || problemas) return
    const t = setTimeout(onCerrar, 9000)
    return () => clearTimeout(t)
  }, [cola.activo, cola.visible, problemas, onCerrar])

  useEffect(() => {
    if (cola.activo) setPlegado(false)
  }, [cola.activo])

  if (!cola.visible) return null
  const pct = cola.total ? (cola.hechos / cola.total) * 100 : 100
  const n = cola.total

  return (
    <div
      role="status"
      aria-live="polite"
      data-estado={cola.activo ? 'importando' : 'listo'}
      className="fixed bottom-5 right-5 z-40 w-[360px] overflow-hidden rounded-2xl bg-surface shadow-pop ring-1 ring-line"
    >
      <div className="flex items-start gap-3 px-4 pb-3 pt-3.5">
        <span className="mt-0.5">
          {cola.activo ? (
            <Loader2 size={18} className="animate-spin text-accent" />
          ) : problemas ? (
            <CircleAlert size={18} className="text-warn" />
          ) : (
            <CheckCircle2 size={18} className="text-good" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-ink">
            {cola.activo
              ? `Importando ${Math.min(cola.hechos + 1, n)} de ${n} archivo${n === 1 ? '' : 's'}`
              : `${n} archivo${n === 1 ? '' : 's'} importado${n === 1 ? '' : 's'}`}
          </div>
          {cola.activo ? (
            !plegado && (
              <>
                <div className="mt-0.5 truncate text-[12.5px] text-ink2" title={cola.actual ?? ''}>
                  {cola.actual}
                </div>
                <div className="truncate text-[12px] text-muted">{cola.mensaje || 'Leyendo…'}</div>
              </>
            )
          ) : (
            <div className="mt-0.5 text-[12.5px] text-ink2">{resumen(cola.resultados, cola.omitidos) || 'Sin archivos válidos'}</div>
          )}
        </div>
        <div className="-mr-1.5 -mt-1 flex">
          {cola.activo && (
            <button onClick={() => setPlegado((p) => !p)} aria-label={plegado ? 'Mostrar detalle' : 'Plegar'} className="rounded-full p-1.5 text-muted hover:bg-raised hover:text-ink">
              {plegado ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
          <button onClick={onCerrar} aria-label="Cerrar aviso" title={cola.activo ? 'Ocultar (la importación sigue)' : 'Cerrar'} className="rounded-full p-1.5 text-muted hover:bg-raised hover:text-ink">
            <X size={16} />
          </button>
        </div>
      </div>
      {!plegado && (cola.resultados.length > 0 || !cola.activo) && (
        <div className="flex items-center justify-between px-4 pb-3">
          <span className="text-[12px] text-muted">{cola.activo ? 'Puedes seguir usando la app.' : ''}</span>
          <Button variant="text" size="sm" onClick={onDetalle}>
            Ver detalle
          </Button>
        </div>
      )}
      {cola.activo && (
        <div className="h-1 bg-raised">
          <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${Math.max(4, pct)}%` }} />
        </div>
      )}
    </div>
  )
}

const ICON: Record<EstadoImport, JSX.Element> = {
  nuevo: <CheckCircle2 size={15} className="text-good" />,
  fusionado: <GitMerge size={15} className="text-accent" />,
  duplicado: <Copy size={15} className="text-muted" />,
  error: <CircleAlert size={15} className="text-bad" />
}
const LABEL: Record<EstadoImport, string> = {
  nuevo: 'Nuevo',
  fusionado: 'Combinado',
  duplicado: 'Ya existía',
  error: 'Error'
}

/** Detalle de cada archivo importado. */
export function ModalImportacion({ open, onClose, cola }: { open: boolean; onClose: () => void; cola: ColaImportacion }): JSX.Element {
  const rs = cola.resultados
  const faltan = cola.total - cola.hechos
  return (
    <Modal
      open={open}
      onClose={onClose}
      alto="min(640px, 85vh)"
      title="Archivos importados"
      subtitle={cola.activo ? `Faltan ${faltan} archivo${faltan === 1 ? '' : 's'} por leer…` : undefined}
      footer={
        <Button variant="filled" onClick={onClose}>
          Listo
        </Button>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {cuenta(rs, 'nuevo') > 0 && <Badge tone="good">{cuenta(rs, 'nuevo')} nuevos</Badge>}
        {cuenta(rs, 'fusionado') > 0 && <Badge tone="accent">{cuenta(rs, 'fusionado')} combinados</Badge>}
        {cuenta(rs, 'duplicado') > 0 && <Badge>{cuenta(rs, 'duplicado')} ya existían</Badge>}
        {cuenta(rs, 'error') > 0 && <Badge tone="bad">{cuenta(rs, 'error')} con error</Badge>}
      </div>
      {cola.omitidos > 0 && <p className="mb-3 text-[13px] text-ink2">{cola.omitidos} archivo(s) omitido(s): sólo se aceptan PDF y XML.</p>}
      <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-raised/60">
        {rs.map((r, i) => (
          <li key={i} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
            <span className="mt-0.5">{ICON[r.estado]}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-ink">{r.archivo}</div>
              <div className="text-[12px] text-muted">{r.mensaje}</div>
              {r.avisos?.map((a, j) => (
                <div key={j} className="text-[12px] text-ink2">
                  <CircleAlert size={11} className="mr-1 inline text-warn" />
                  {a}
                </div>
              ))}
            </div>
            <span className="text-[12px] text-ink2">{LABEL[r.estado]}</span>
          </li>
        ))}
        {cola.activo && cola.actual && (
          <li className="flex items-center gap-3 px-4 py-2.5 text-[13px] text-ink2">
            <Loader2 size={15} className="animate-spin text-accent" />
            <span className="min-w-0 flex-1 truncate">{cola.actual}</span>
            <span className="text-[12px] text-muted">{cola.mensaje || 'Leyendo…'}</span>
          </li>
        )}
      </ul>
    </Modal>
  )
}
