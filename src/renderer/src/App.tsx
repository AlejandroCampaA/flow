import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Briefcase, CalendarRange, FileUp, FolderOpen, Landmark, LayoutDashboard, Monitor, Moon, Plus, Sun } from 'lucide-react'
import { useStore, type Tema } from './store'
import { addDays, dateToIso, fmtFecha } from './lib/dates'
import Resumen, { type Foco } from './pages/Resumen'
import Nomina from './pages/Nomina'
import Cuentas from './pages/Cuentas'
import { ModalDatos } from './components/Dialogos'
import { ModalArchivos, type PestanaArchivos } from './components/Archivos'
import { AvisoImportacion, ModalImportacion, useColaImportacion } from './components/Importacion'
import { Button, Chip, IconButton } from './components/ui'
import VisorArchivo from './components/VisorArchivo'
import { BotonAvisos, useAvisos } from './components/Avisos'
import FiltroCuentas from './components/FiltroCuentas'
import { BotonActualizar } from './components/Actualizar'

export type Vista = 'resumen' | 'cuentas' | 'nomina'

const TABS: { id: Vista; label: string; icon: JSX.Element; title: string }[] = [
  { id: 'resumen', label: 'Resumen', icon: <LayoutDashboard size={17} />, title: 'Todo de un vistazo' },
  { id: 'cuentas', label: 'Cuentas', icon: <Landmark size={17} />, title: 'Saldos, gastos y movimientos de tus cuentas' },
  { id: 'nomina', label: 'Nómina', icon: <Briefcase size={17} />, title: 'Sueldo, descuentos, tiempo extra y fondo de ahorro' }
]

export default function App(): JSX.Element {
  const { cargando, recibos, estados } = useStore()
  const [vista, setVista] = useState<Vista>('resumen')
  // A dónde llevar al cambiar de pestaña desde el Resumen (categoría filtrada o sección).
  const [foco, setFoco] = useState<(Foco & { n: number }) | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const [datosOpen, setDatosOpen] = useState(false)
  const [archivos, setArchivos] = useState<PestanaArchivos | null>(null)
  const [detalleImport, setDetalleImport] = useState(false)
  const { cola, agregar, ocultar } = useColaImportacion()
  const [arrastrando, setArrastrando] = useState(false)
  const contador = useRef(0)

  const actual = vista

  const cambiarVista = useCallback((v: Vista) => {
    setFoco(null)
    setVista(v)
  }, [])
  const ir = useCallback((v: 'cuentas' | 'nomina', f?: Foco) => {
    setFoco({ ...f, n: Date.now() })
    setVista(v)
  }, [])

  // Al cambiar de pestaña: arriba, o a la sección pedida.
  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    if (!foco?.ancla) {
      el.scrollTop = 0
      return
    }
    const t = setTimeout(() => document.getElementById(foco.ancla!)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
    return () => clearTimeout(t)
  }, [vista, foco])

  const adjuntar = useCallback(async () => agregar(await window.api.pickFiles()), [agregar])
  const avisos = useAvisos(setArchivos, ir, adjuntar)

  // Arrastrar y soltar archivos en cualquier parte de la ventana.
  useEffect(() => {
    const tieneArchivos = (e: DragEvent): boolean => !!e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent): void => {
      if (!tieneArchivos(e)) return
      e.preventDefault()
      contador.current++
      setArrastrando(true)
    }
    const over = (e: DragEvent): void => e.preventDefault()
    const leave = (e: DragEvent): void => {
      if (!tieneArchivos(e)) return
      contador.current = Math.max(0, contador.current - 1)
      if (!contador.current) setArrastrando(false)
    }
    const drop = async (e: DragEvent): Promise<void> => {
      e.preventDefault()
      contador.current = 0
      setArrastrando(false)
      const todos = [...(e.dataTransfer?.files ?? [])]
      const validos = todos.filter((f) => /\.(pdf|xml)$/i.test(f.name))
      const files = await Promise.all(validos.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })))
      agregar(files, todos.length - validos.length)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [agregar])

  return (
    <div className="flex h-screen flex-col bg-page text-ink">
      <header className="z-30 shrink-0 bg-page">
        {/* Una sola barra: las secciones y las acciones (sin título ni logo) */}
        <div className="mx-auto flex h-14 max-w-[1480px] items-stretch gap-6 px-6">
          <nav className="flex items-stretch gap-1" role="tablist">
            {TABS.map((t) => {
              const on = actual === t.id
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={on}
                  title={t.title}
                  onClick={() => cambiarVista(t.id)}
                  className={`relative flex items-center gap-2 px-3.5 text-[14px] font-medium transition ${on ? 'text-accent' : 'text-ink2 hover:text-ink'}`}
                >
                  {t.icon}
                  {t.label}
                  {on && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-accent" />}
                </button>
              )
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <BotonActualizar />
            <BotonAvisos avisos={avisos} />
            <TemaBoton />
            <span className="mx-1.5 h-6 w-px bg-line" aria-hidden />
            <Button variant="outlined" onClick={() => setArchivos(actual === 'cuentas' ? 'estados' : 'recibos')} title="Recibos de nómina y estados de cuenta">
              <FolderOpen size={16} /> Archivos
            </Button>
            <Button variant="filled" onClick={adjuntar}>
              <Plus size={17} /> Agregar archivos
            </Button>
          </div>
        </div>
        <div className="border-b border-line" />
      </header>

      <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1480px] px-6 pb-24 pt-4">
          {!cargando && (recibos.length > 0 || estados.length > 0) && <BarraFiltros vista={actual} />}
          {cargando ? (
            <p className="text-muted">Cargando…</p>
          ) : (
            <>
              {actual === 'resumen' && <Resumen onAdjuntar={adjuntar} onArchivos={setArchivos} onIr={ir} />}
              {actual === 'cuentas' && <Cuentas key={foco?.n ?? 0} onAdjuntar={adjuntar} onArchivos={setArchivos} catInicial={foco?.cat ?? null} cuentaInicial={foco?.cuenta ?? null} />}
              {actual === 'nomina' && <Nomina key={foco?.n ?? 0} onAdjuntar={adjuntar} onArchivos={setArchivos} modalInicial={foco?.modal ?? null} />}
            </>
          )}
        </div>
      </main>

      {arrastrando && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-page/85">
          <div className="flex flex-col items-center rounded-[28px] border-2 border-dashed border-accent bg-surface px-16 py-12 shadow-pop">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accentc text-onaccentc">
              <FileUp size={26} />
            </div>
            <p className="mt-4 text-[18px] font-semibold text-ink">Suelta tus archivos</p>
            <p className="mt-1 text-[13.5px] text-ink2">Recibos de nómina (PDF o XML) o estados de cuenta (PDF). Se leen en segundo plano.</p>
          </div>
        </div>
      )}

      <AvisoImportacion cola={cola} onCerrar={ocultar} onDetalle={() => setDetalleImport(true)} />
      <ModalImportacion open={detalleImport} onClose={() => setDetalleImport(false)} cola={cola} />
      <ModalArchivos pestana={archivos} onPestana={setArchivos} onClose={() => setArchivos(null)} onAdjuntar={adjuntar} onDatos={() => {
          setArchivos(null)
          setDatosOpen(true)
        }} />
      <ModalDatos open={datosOpen} onClose={() => setDatosOpen(false)} />
      <VisorArchivo />
    </div>
  )
}

type Preset = 'todo' | '3m' | '6m' | '12m' | `y${number}` | 'custom'

function BarraFiltros({ vista }: { vista: Vista }): JSX.Element {
  const { recibos, visibles, filtros, setFiltros, banco, bancoTodo, cuentasSel, setCuentasSel } = useStore()
  const anios = useMemo(
    () => [...new Set([...recibos.map((r) => Number(r.fecha.slice(0, 4))), ...bancoTodo.movs.map((m) => Number(m.fecha.slice(0, 4)))])].sort(),
    [recibos, bancoTodo.movs]
  )
  const movs = useMemo(
    () => banco.movs.filter((m) => (!filtros.desde || m.fecha >= filtros.desde) && (!filtros.hasta || m.fecha <= filtros.hasta)),
    [banco.movs, filtros.desde, filtros.hasta]
  )
  const [preset, setPreset] = useState<Preset>('todo')

  function aplicar(p: Preset): void {
    setPreset(p)
    const hoy = dateToIso(new Date())
    if (p === 'todo') setFiltros({ ...filtros, desde: null, hasta: null })
    else if (p === '3m') setFiltros({ ...filtros, desde: addDays(hoy, -91), hasta: null })
    else if (p === '6m') setFiltros({ ...filtros, desde: addDays(hoy, -182), hasta: null })
    else if (p === '12m') setFiltros({ ...filtros, desde: addDays(hoy, -365), hasta: null })
    else if (p.startsWith('y')) {
      const y = p.slice(1)
      setFiltros({ ...filtros, desde: `${y}-01-01`, hasta: `${y}-12-31` })
    }
  }

  const presets: { p: Preset; label: string }[] = [
    { p: 'todo', label: 'Todo' },
    { p: '3m', label: '3 meses' },
    { p: '6m', label: '6 meses' },
    { p: '12m', label: '12 meses' },
    ...anios.map((y) => ({ p: `y${y}` as Preset, label: String(y) }))
  ]
  const txtMovs = movs.length
    ? `${movs.length} movimientos · ${fmtFecha(movs[0].fecha)} – ${fmtFecha(movs[movs.length - 1].fecha)}`
    : 'Sin movimientos en este rango'
  const txtRecibos = visibles.length
    ? `${visibles.length} recibos · ${fmtFecha(visibles[0].periodoInicio)} – ${fmtFecha(visibles[visibles.length - 1].periodoFin)}`
    : 'Sin recibos en este rango'
  const contexto =
    vista === 'cuentas'
      ? txtMovs
      : vista === 'nomina'
        ? txtRecibos
        : [banco.movs.length ? `${movs.length} movimientos` : '', recibos.length ? `${visibles.length} recibos` : ''].filter(Boolean).join(' · ')

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {presets.map((x) => (
        <Chip key={x.p} selected={preset === x.p} onClick={() => aplicar(x.p)}>
          {x.label}
        </Chip>
      ))}
      <Chip selected={preset === 'custom'} onClick={() => setPreset('custom')} icon={<CalendarRange size={14} />}>
        Fechas
      </Chip>
      {preset === 'custom' && (
        <span className="flex items-center gap-1.5">
          <input type="date" className="campo h-8" value={filtros.desde ?? ''} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value || null })} aria-label="Desde" />
          <span className="text-muted">–</span>
          <input type="date" className="campo h-8" value={filtros.hasta ?? ''} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value || null })} aria-label="Hasta" />
        </span>
      )}
      {vista === 'cuentas' && <FiltroCuentas alinear="left" />}
      {vista === 'resumen' && cuentasSel.length > 0 && (
        <Chip selected onRemove={() => setCuentasSel([])} icon={<Landmark size={14} />} title="Cuentas que estás viendo (cambian todos los indicadores y gráficas)">
          {cuentasSel.length === 1 ? (bancoTodo.cuentas.find((c) => c.cuenta === cuentasSel[0])?.producto ?? '1 cuenta') : `${cuentasSel.length} cuentas`}
        </Chip>
      )}
      {vista === 'nomina' && (
        <Chip selected={filtros.incluirLiquidaciones} onClick={() => setFiltros({ ...filtros, incluirLiquidaciones: !filtros.incluirLiquidaciones })}>
          Liquidaciones de ahorro
        </Chip>
      )}
      <div className="ml-auto text-[13px] text-muted">{contexto}</div>
    </div>
  )
}

/** Un solo botón que alterna Sistema → Claro → Oscuro. */
function TemaBoton(): JSX.Element {
  const { tema, setTema } = useStore()
  const sig: Record<Tema, Tema> = { system: 'light', light: 'dark', dark: 'system' }
  const info: Record<Tema, { icon: JSX.Element; label: string }> = {
    system: { icon: <Monitor size={18} />, label: 'Tema: como el sistema' },
    light: { icon: <Sun size={18} />, label: 'Tema: claro' },
    dark: { icon: <Moon size={18} />, label: 'Tema: oscuro' }
  }
  return (
    <IconButton title={`${info[tema].label} (clic para cambiar)`} onClick={() => setTema(sig[tema])}>
      {info[tema].icon}
    </IconButton>
  )
}
