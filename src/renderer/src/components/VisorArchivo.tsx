import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, FileText, LoaderCircle, Maximize2, Minus, Plus, X } from 'lucide-react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { pdfjs } from '../lib/pdf'
import { useStore } from '../store'
import { Button, IconButton } from './ui'

type Zoom = 'ancho' | number
const PASOS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]
const MARGEN = 48

/**
 * Visor de archivos dentro de la app: los PDF se dibujan con pdf.js (página por página, conforme
 * aparecen al desplazarte) y los XML se muestran como texto. Así nada se abre en el navegador.
 */
export default function VisorArchivo(): JSX.Element | null {
  const { visor, cerrarVisor } = useStore()
  if (!visor) return null
  return <Visor key={visor.copia} copia={visor.copia} titulo={visor.titulo} onClose={cerrarVisor} />
}

function Visor({ copia, titulo, onClose }: { copia: string; titulo: string; onClose: () => void }): JSX.Element {
  const esXml = copia.toLowerCase().endsWith('.xml')
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [xml, setXml] = useState<string | null>(null)
  const [tamanos, setTamanos] = useState<{ w: number; h: number }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState<Zoom>('ancho')
  const [anchoMarco, setAnchoMarco] = useState(900)
  const [actual, setActual] = useState(1)
  const marco = useRef<HTMLDivElement>(null)

  // Cargar el archivo
  useEffect(() => {
    let vivo = true
    let doc: PDFDocumentProxy | null = null
    ;(async () => {
      try {
        const bytes = await window.api.readFile(copia)
        if (esXml) {
          if (vivo) setXml(formatearXml(new TextDecoder('utf-8').decode(bytes)))
          return
        }
        doc = await pdfjs.getDocument({ data: bytes, verbosity: 0, isEvalSupported: false }).promise
        const ts: { w: number; h: number }[] = []
        for (let i = 1; i <= doc.numPages; i++) {
          const vp = (await doc.getPage(i)).getViewport({ scale: 1 })
          ts.push({ w: vp.width, h: vp.height })
        }
        if (!vivo) return
        setTamanos(ts)
        setPdf(doc)
      } catch (e) {
        if (vivo) setError(`No se pudo abrir el archivo: ${(e as Error).message}`)
      }
    })()
    return () => {
      vivo = false
      void doc?.destroy()
    }
  }, [copia, esXml])

  // Ancho disponible (para "ajustar al ancho")
  useEffect(() => {
    const el = marco.current
    if (!el) return
    const ro = new ResizeObserver(() => setAnchoMarco(el.clientWidth))
    ro.observe(el)
    setAnchoMarco(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const anchoPagina = tamanos.length ? Math.max(...tamanos.map((t) => t.w)) : 612
  const escala = zoom === 'ancho' ? Math.max(0.3, (anchoMarco - MARGEN) / anchoPagina) : zoom
  const cambiarZoom = useCallback(
    (dir: 1 | -1) => {
      const i = PASOS.findIndex((p) => p >= escala - 0.001)
      const base = i < 0 ? PASOS.length - 1 : i
      const sig = dir > 0 ? PASOS.find((p) => p > escala + 0.001) ?? PASOS[PASOS.length - 1] : [...PASOS].reverse().find((p) => p < escala - 0.001) ?? PASOS[0]
      setZoom(sig ?? PASOS[base])
    },
    [escala]
  )

  // Teclado: Esc cierra (sin cerrar el diálogo de abajo), Ctrl + / − hace zoom
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      } else if (e.ctrlKey && (e.key === '+' || e.key === '=')) {
        e.preventDefault()
        cambiarZoom(1)
      } else if (e.ctrlKey && e.key === '-') {
        e.preventDefault()
        cambiarZoom(-1)
      } else if (e.ctrlKey && e.key === '0') {
        e.preventDefault()
        setZoom('ancho')
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, cambiarZoom])

  // Página actual: la que ocupa el centro del marco
  const alDesplazar = (): void => {
    const el = marco.current
    if (!el || !tamanos.length) return
    const centro = el.scrollTop + el.clientHeight / 2
    let y = 16
    for (let i = 0; i < tamanos.length; i++) {
      y += tamanos[i].h * escala + 16
      if (centro < y) return setActual(i + 1)
    }
    setActual(tamanos.length)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-full max-h-[96vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-[28px] bg-surface shadow-pop"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-raised text-ink2">
            <FileText size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold text-ink" title={titulo}>
              {titulo}
            </h2>
            <p className="text-[12px] text-muted">
              {esXml ? 'XML del CFDI' : pdf ? `Página ${actual} de ${pdf.numPages}` : error ? 'Error' : 'Abriendo…'}
            </p>
          </div>
          {!esXml && (
            <div className="flex items-center gap-0.5 rounded-full bg-raised px-1 py-0.5">
              <IconButton title="Alejar (Ctrl −)" onClick={() => cambiarZoom(-1)}>
                <Minus size={17} />
              </IconButton>
              <button
                onClick={() => setZoom(zoom === 'ancho' ? 1 : 'ancho')}
                title={zoom === 'ancho' ? 'Tamaño real' : 'Ajustar al ancho (Ctrl 0)'}
                className="w-14 rounded-full py-1 text-center text-[12.5px] tabular-nums text-ink hover:bg-surface"
              >
                {Math.round(escala * 100)}%
              </button>
              <IconButton title="Acercar (Ctrl +)" onClick={() => cambiarZoom(1)}>
                <Plus size={17} />
              </IconButton>
              <IconButton title="Ajustar al ancho (Ctrl 0)" onClick={() => setZoom('ancho')}>
                <Maximize2 size={15} className={zoom === 'ancho' ? 'text-accent' : ''} />
              </IconButton>
            </div>
          )}
          <Button variant="text" size="sm" onClick={() => window.api.openFile(copia)} title="Abrir con la app predeterminada de Windows">
            <ExternalLink size={14} /> Abrir afuera
          </Button>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-full p-2 text-ink2 hover:bg-raised">
            <X size={20} />
          </button>
        </header>

        <div ref={marco} onScroll={alDesplazar} className="min-h-0 flex-1 overflow-auto overscroll-contain bg-page">
          {error ? (
            <p className="px-6 py-16 text-center text-[13.5px] text-ink2">{error}</p>
          ) : esXml ? (
            xml == null ? (
              <Cargando />
            ) : (
              <pre className="whitespace-pre-wrap break-all px-6 py-5 font-mono text-[12px] leading-5 text-ink">{xml}</pre>
            )
          ) : !pdf ? (
            <Cargando />
          ) : (
            <div className="flex min-w-fit flex-col items-center gap-4 px-6 py-4">
              {tamanos.map((t, i) => (
                <Pagina key={i} pdf={pdf} num={i + 1} ancho={t.w * escala} alto={t.h * escala} escala={escala} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Cargando(): JSX.Element {
  return (
    <div className="flex items-center justify-center gap-2 py-20 text-[13px] text-muted">
      <LoaderCircle size={16} className="animate-spin" /> Abriendo…
    </div>
  )
}

/** Una página: sólo se dibuja cuando está cerca de verse (y se vuelve a dibujar al cambiar el zoom). */
function Pagina({ pdf, num, ancho, alto, escala }: { pdf: PDFDocumentProxy; num: number; ancho: number; alto: number; escala: number }): JSX.Element {
  const caja = useRef<HTMLDivElement>(null)
  const lienzo = useRef<HTMLCanvasElement>(null)
  const [cerca, setCerca] = useState(num <= 2)
  const [lista, setLista] = useState(false)

  useEffect(() => {
    const el = caja.current
    if (!el) return
    const io = new IntersectionObserver((es) => es[0]?.isIntersecting && setCerca(true), { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!cerca) return
    let tarea: RenderTask | null = null
    let vivo = true
    // Se espera un momento para no redibujar en cada paso mientras cambias el zoom.
    const t = setTimeout(async () => {
      const c = lienzo.current
      if (!c) return
      const page = await pdf.getPage(num)
      if (!vivo) return
      const dpr = window.devicePixelRatio || 1
      const vp = page.getViewport({ scale: escala })
      const off = document.createElement('canvas')
      off.width = Math.floor(vp.width * dpr)
      off.height = Math.floor(vp.height * dpr)
      const ctx = off.getContext('2d')
      if (!ctx) return
      tarea = page.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined })
      try {
        await tarea.promise
      } catch {
        return
      }
      if (!vivo) return
      // Se copia de golpe: mientras se dibuja la nueva, se sigue viendo la anterior (sin parpadeo).
      c.width = off.width
      c.height = off.height
      c.getContext('2d')?.drawImage(off, 0, 0)
      setLista(true)
    }, lista ? 120 : 0)
    return () => {
      vivo = false
      clearTimeout(t)
      tarea?.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cerca, escala, pdf, num])

  return (
    <div ref={caja} className="relative shrink-0 bg-white shadow-card" style={{ width: ancho, height: alto }} aria-label={`Página ${num}`}>
      <canvas ref={lienzo} className="block h-full w-full" />
      {!lista && (
        <div className="absolute inset-0 flex items-center justify-center text-[12px] text-neutral-400">
          <LoaderCircle size={16} className="animate-spin" />
        </div>
      )}
    </div>
  )
}

/** Sangra un XML de una sola línea para que se pueda leer. */
function formatearXml(s: string): string {
  if (/\n\s*</.test(s.slice(0, 2000))) return s
  let nivel = 0
  return s
    .replace(/>\s*</g, '>\n<')
    .split('\n')
    .map((l) => {
      if (/^<\//.test(l)) nivel = Math.max(0, nivel - 1)
      const linea = '  '.repeat(nivel) + l
      if (/^<[^!?/][^>]*[^/]>$/.test(l) && !/<\/[^>]+>$/.test(l)) nivel++
      return linea
    })
    .join('\n')
}
