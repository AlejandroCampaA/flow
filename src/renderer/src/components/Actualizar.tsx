import { useCallback, useEffect, useRef, useState } from 'react'
import { CircleCheck, LoaderCircle, RefreshCw, Rocket } from 'lucide-react'
import type { EstadoActualizacion } from '../../../preload'
import { Button } from './ui'
import Modal from './Modal'

const fechaLarga = (iso: string): string => new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

/** Revisa si hay una versión nueva al abrir, al volver a la ventana y cada cinco minutos. */
export function useActualizacion(): {
  estado: EstadoActualizacion | null
  buscando: boolean
  aplicando: boolean
  error: string | null
  buscar: () => Promise<EstadoActualizacion | null>
  aplicar: () => Promise<void>
} {
  const [estado, setEstado] = useState<EstadoActualizacion | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ultima = useRef(0)

  const buscar = useCallback(async (): Promise<EstadoActualizacion | null> => {
    setBuscando(true)
    ultima.current = Date.now()
    try {
      const e = await window.api.buscarActualizacion()
      setEstado(e)
      return e
    } catch {
      return null
    } finally {
      setBuscando(false)
    }
  }, [])

  useEffect(() => {
    void buscar()
    const alVolver = (): void => {
      if (Date.now() - ultima.current > 20_000) void buscar()
    }
    window.addEventListener('focus', alVolver)
    const t = setInterval(() => void buscar(), 5 * 60_000)
    return () => {
      window.removeEventListener('focus', alVolver)
      clearInterval(t)
    }
  }, [buscar])

  const aplicar = useCallback(async (): Promise<void> => {
    setAplicando(true)
    setError(null)
    try {
      await window.api.aplicarActualizacion() // la app se reinicia
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
      setAplicando(false)
    }
  }, [])

  return { estado, buscando, aplicando, error, buscar, aplicar }
}

/** Botón del encabezado: sólo aparece cuando hay una actualización lista. */
export function BotonActualizar(): JSX.Element | null {
  const { estado, aplicando, error, aplicar } = useActualizacion()
  const [abierto, setAbierto] = useState(false)
  const nueva = estado?.instalada ? estado.nueva : null
  if (!nueva) return null
  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        title="Hay una versión nueva de Flujo"
        className="mr-1 flex h-8 items-center gap-1.5 rounded-full bg-accentc px-3 text-[13px] font-medium text-onaccentc transition hover:brightness-95"
      >
        <Rocket size={15} /> Actualizar
      </button>
      <Modal
        open={abierto}
        onClose={() => !aplicando && setAbierto(false)}
        width={460}
        title="Hay una versión nueva de Flujo"
        subtitle={`${estado?.actual ? `Instalada: ${fechaLarga(estado.actual.fecha)}` : 'Tienes una versión anterior'} · Nueva: ${fechaLarga(nueva.fecha)}`}
        footer={
          <>
            <Button variant="text" onClick={() => setAbierto(false)} disabled={aplicando}>
              Ahora no
            </Button>
            <Button variant="filled" onClick={aplicar} disabled={aplicando}>
              {aplicando ? <LoaderCircle size={15} className="animate-spin" /> : <Rocket size={15} />} Actualizar y reiniciar
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] text-ink2">
          Se copia en un momento y Flujo se vuelve a abrir solo; tus datos no se tocan.
        </p>
        {nueva.notas && <p className="mt-3 rounded-2xl bg-raised/70 p-3 text-[13px] text-ink">{nueva.notas}</p>}
        {error && <p className="mt-3 text-[13px] text-bad">{error}</p>}
      </Modal>
    </>
  )
}

/** Bloque para la ventana de datos: versión instalada, buscar a mano y actualizar. */
export function SeccionVersion(): JSX.Element {
  const { estado, buscando, aplicando, error, buscar, aplicar } = useActualizacion()
  const [msg, setMsg] = useState<string | null>(null)
  const actual = estado?.actual
  return (
    <div className="mb-4 rounded-2xl bg-raised/70 p-4 text-[13px]">
      <div className="flex items-center gap-2 font-medium text-ink">
        <Rocket size={14} /> Versión de Flujo
      </div>
      <div className="mt-1 text-ink2">{actual ? `${actual.version} · compilada el ${fechaLarga(actual.fecha)}` : 'Versión de desarrollo'}</div>
      {estado && !estado.instalada && <div className="mt-1 text-[12px] text-muted">Esta copia no está instalada: se actualiza con la app instalada (npm run dist y el instalador).</div>}
      {estado?.instalada && (
        <>
          <div className="mt-1 break-all text-[12px] text-muted">Toma las actualizaciones de {estado.origen ?? '—'}</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              onClick={async () => {
                setMsg(null)
                const e = await buscar()
                setMsg(!e ? 'No se pudo revisar.' : e.error ? e.error : e.nueva ? `Hay una versión nueva (${e.nueva.version}).` : 'Ya tienes la última versión.')
              }}
              disabled={buscando || aplicando}
            >
              {buscando ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} Buscar actualizaciones
            </Button>
            {estado.nueva && (
              <Button variant="filled" onClick={aplicar} disabled={aplicando}>
                {aplicando ? <LoaderCircle size={14} className="animate-spin" /> : <Rocket size={14} />} Actualizar y reiniciar
              </Button>
            )}
            {msg && !estado.nueva && (
              <span className="flex items-center gap-1 text-[12.5px] text-ink2">
                {msg === 'Ya tienes la última versión.' && <CircleCheck size={14} className="text-good" />}
                {msg}
              </span>
            )}
          </div>
          {error && <p className="mt-2 text-[12.5px] text-bad">{error}</p>}
        </>
      )}
    </div>
  )
}
