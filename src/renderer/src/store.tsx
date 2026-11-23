import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { filtrar, type Filtros } from './lib/analytics'
import { leerArchivo, type ArchivoEntrada, type Progreso } from './lib/importer'
import type { EstadoCuenta } from './lib/estadoCuenta'
import { conciliarNomina, procesarEstados, setCategoriasUsuario, type CatMov, type CatUsuario, type DatosBanco, type Reglas } from './lib/gastos'
import { fmtRango } from './lib/dates'
import { construirRecibos } from './lib/normalize'
import type { Modo } from './lib/palette'
import type { ParsedDoc, Recibo } from './lib/types'
import type { DbInfo } from '../../preload'

export type EstadoImport = 'nuevo' | 'fusionado' | 'duplicado' | 'error'

export interface ResultadoImport {
  archivo: string
  estado: EstadoImport
  mensaje: string
  reciboId?: string
  /** Avisos de la validación de saldos (estados de cuenta). */
  avisos?: string[]
  clase?: 'recibo' | 'estado'
}

export type Tema = 'system' | 'light' | 'dark'

interface Store {
  cargando: boolean
  docs: ParsedDoc[]
  recibos: Recibo[]
  /** Recibos ya filtrados por el filtro global. */
  visibles: Recibo[]
  filtros: Filtros
  setFiltros: (f: Filtros) => void
  importar: (files: ArchivoEntrada[], progreso?: Progreso) => Promise<ResultadoImport[]>
  estados: EstadoCuenta[]
  /** Tus cuentas ya filtradas por el filtro global de cuentas (todas, si no eliges ninguna). */
  banco: DatosBanco
  /** Todas tus cuentas, sin filtro (para listarlas y para lo que no depende de la selección). */
  bancoTodo: DatosBanco
  /** Cuentas elegidas en el filtro global; vacío = todas. */
  cuentasSel: string[]
  setCuentasSel: (c: string[]) => void
  /** Avisos de la campana que ya atendiste: id → 'hecho' | 'descartado'. */
  avisosVistos: Record<string, 'hecho' | 'descartado'>
  marcarAviso: (id: string, estado: 'hecho' | 'descartado' | null) => Promise<void>
  reglas: Reglas
  /** Guarda (o quita, con null) una regla de categoría. */
  setRegla: (clave: string, categoria: CatMov | null) => Promise<void>
  /** Tus categorías (además de las de la app). */
  categorias: CatUsuario[]
  guardarCategoria: (c: CatUsuario) => Promise<void>
  /** Borra la categoría y las reglas que la usaban (esos movimientos vuelven a su categoría automática). */
  borrarCategoria: (id: string) => Promise<void>
  eliminarEstado: (id: string) => Promise<void>
  eliminarRecibo: (id: string) => Promise<void>
  borrarTodo: () => Promise<void>
  exportar: () => Promise<boolean>
  importarRespaldo: () => Promise<number | null>
  cambiarCarpeta: () => Promise<'abierta' | 'copiada' | null>
  dbInfo: DbInfo | null
  /** Vuelve a leer todo desde la base de datos. */
  recargar: () => Promise<void>
  abrirOriginal: (doc: ParsedDoc) => Promise<string | null>
  /** Archivo abierto en el visor interno (PDF o XML guardado en la carpeta de Flujo). */
  visor: { copia: string; titulo: string } | null
  verArchivo: (copia: string, titulo?: string) => void
  cerrarVisor: () => void
  tema: Tema
  setTema: (t: Tema) => void
  modo: Modo
}

const Ctx = createContext<Store | null>(null)

const lsGet = (k: string): string | null => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const lsSet = (k: string, v: string): void => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* sin almacenamiento local: se ignora */
  }
}

function useModo(tema: Tema): Modo {
  const mq = useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), [])
  const [sysDark, setSysDark] = useState(mq.matches)
  useEffect(() => {
    const on = (e: MediaQueryListEvent): void => setSysDark(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [mq])
  const modo: Modo = tema === 'system' ? (sysDark ? 'dark' : 'light') : tema
  useEffect(() => {
    document.documentElement.dataset.theme = modo
  }, [modo])
  return modo
}

export function StoreProvider({ children }: { children: ReactNode }): JSX.Element {
  const [docs, setDocs] = useState<ParsedDoc[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtros, setFiltros] = useState<Filtros>({ desde: null, hasta: null, incluirLiquidaciones: true })
  const [tema, setTemaState] = useState<Tema>(() => (lsGet('tema') as Tema) || 'system')
  const modo = useModo(tema)
  const docsRef = useRef<ParsedDoc[]>([])
  const [dbInfo, setDbInfo] = useState<DbInfo | null>(null)
  const [estados, setEstados] = useState<EstadoCuenta[]>([])
  const estadosRef = useRef<EstadoCuenta[]>([])
  const [reglas, setReglas] = useState<Reglas>({})
  const [categorias, setCategorias] = useState<CatUsuario[]>([])
  const [cuentasSelRaw, setCuentasSel] = useState<string[]>([])
  const [avisosVistos, setAvisosVistos] = useState<Record<string, 'hecho' | 'descartado'>>({})

  useEffect(() => {
    recargar().finally(() => setCargando(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Vuelve a leer todo desde la base SQLite (fuente de verdad). */
  const recargar = useCallback(async () => {
    const [lista, inf, ests, rs] = await Promise.all([window.api.listDocs(), window.api.dbInfo(), window.api.listEstados(), window.api.listReglas()])
    docsRef.current = lista as ParsedDoc[]
    estadosRef.current = ests as EstadoCuenta[]
    setDocs(docsRef.current)
    setEstados(estadosRef.current)
    // En la tabla de reglas también viven tus categorías: `cat:<id>` → JSON.
    const cats: CatUsuario[] = []
    const rg: Reglas = {}
    const vistos: Record<string, 'hecho' | 'descartado'> = {}
    for (const [k, v] of Object.entries(rs)) {
      if (k.startsWith('aviso:')) vistos[k.slice(6)] = v === 'hecho' ? 'hecho' : 'descartado'
      else if (!k.startsWith('cat:')) rg[k] = v as CatMov
      else
        try {
          cats.push(JSON.parse(v) as CatUsuario)
        } catch {
          /* se ignora una categoría ilegible */
        }
    }
    setReglas(rg)
    setAvisosVistos(vistos)
    setCategorias(cats)
    setDbInfo(inf)
  }, [])

  const importar = useCallback(
    async (files: ArchivoEntrada[], progreso?: Progreso): Promise<ResultadoImport[]> => {
      const resultados: ResultadoImport[] = []
      const next = [...docsRef.current]
      const nextEst = [...estadosRef.current]
      let cambios = false
      for (const f of files) {
        try {
          progreso?.('Leyendo…')
          const lectura = await leerArchivo(f, progreso)
          if (lectura.tipo === 'estado') {
            for (const e of lectura.estados) {
              const mismo = nextEst.find((x) => x.id === e.id)
              const desc = `${e.producto} ••${e.cuenta.replace(/\D/g, '').slice(-5, -1)} · ${fmtRango(e.periodoInicio, e.periodoFin)} · ${e.movimientos.length} movimientos`
              if (mismo) {
                resultados.push({ archivo: f.name, estado: 'duplicado', mensaje: `Ya estaba guardado: ${desc}.`, clase: 'estado' })
                continue
              }
              const copia = `estado-${e.cuenta}-${e.periodoInicio}.pdf`
              await window.api.addEstado({ ...e, copia }, f.bytes)
              nextEst.push({ ...e, copia })
              estadosRef.current = nextEst
              cambios = true
              resultados.push({
                archivo: f.name,
                estado: 'nuevo',
                mensaje: `Estado de cuenta ${desc}${e.cuadre.ok ? ' · los saldos cuadran' : ''}.`,
                avisos: e.cuadre.avisos,
                clase: 'estado'
              })
            }
            continue
          }
          const doc = lectura.doc
          const mismo = next.find((d) => d.uuid === doc.uuid && d.fuente === doc.fuente)
          if (mismo) {
            resultados.push({
              archivo: f.name,
              estado: 'duplicado',
              mensaje: `Ya estaba guardado (${mismo.archivo}).`,
              reciboId: doc.uuid
            })
            continue
          }
          const pareja = next.find((d) => d.uuid === doc.uuid)
          const copia = `${doc.uuid}.${doc.fuente}`
          await window.api.addDoc({ ...doc, copia }, f.bytes)
          next.push({ ...doc, copia })
          cambios = true
          resultados.push({
            archivo: f.name,
            estado: pareja ? 'fusionado' : 'nuevo',
            mensaje: pareja
              ? `Se combinó con el ${pareja.fuente.toUpperCase()} del mismo recibo.`
              : describir(doc),
            reciboId: doc.uuid,
            clase: 'recibo'
          })
        } catch (err) {
          resultados.push({ archivo: f.name, estado: 'error', mensaje: (err as Error).message || 'No se pudo leer.' })
        }
      }
      if (cambios) await recargar()
      return resultados
    },
    [recargar]
  )

  const eliminarRecibo = useCallback(
    async (id: string) => {
      await window.api.deleteRecibo(id)
      await recargar()
    },
    [recargar]
  )

  const borrarTodo = useCallback(async () => {
    await window.api.clearAll()
    await recargar()
  }, [recargar])

  const exportar = useCallback(() => window.api.exportBackup(), [])

  const importarRespaldo = useCallback(async () => {
    const n = await window.api.importBackup()
    if (n) await recargar()
    return n
  }, [recargar])

  const cambiarCarpeta = useCallback(async () => {
    const r = await window.api.chooseDataFolder()
    if (r) await recargar()
    return r
  }, [recargar])

  const eliminarEstado = useCallback(
    async (id: string) => {
      await window.api.deleteEstado(id)
      await recargar()
    },
    [recargar]
  )

  const setRegla = useCallback(async (clave: string, categoria: CatMov | null) => {
    await window.api.setRegla(clave, categoria)
    setReglas((r) => {
      const n = { ...r }
      if (categoria) n[clave] = categoria
      else delete n[clave]
      return n
    })
  }, [])

  const marcarAviso = useCallback(async (id: string, estado: 'hecho' | 'descartado' | null) => {
    await window.api.setRegla(`aviso:${id}`, estado)
    setAvisosVistos((a) => {
      const n = { ...a }
      if (estado) n[id] = estado
      else delete n[id]
      return n
    })
  }, [])

  const guardarCategoria = useCallback(async (c: CatUsuario) => {
    await window.api.setRegla(`cat:${c.id}`, JSON.stringify(c))
    setCategorias((cs) => [...cs.filter((x) => x.id !== c.id), c])
  }, [])

  const borrarCategoria = useCallback(
    async (id: string) => {
      for (const [k, v] of Object.entries(reglas)) if (v === id) await window.api.setRegla(k, null)
      await window.api.setRegla(`cat:${id}`, null)
      await recargar()
    },
    [reglas, recargar]
  )

  const [visor, setVisor] = useState<{ copia: string; titulo: string } | null>(null)
  const verArchivo = useCallback((copia: string, titulo?: string) => setVisor({ copia, titulo: titulo || copia }), [])
  const cerrarVisor = useCallback(() => setVisor(null), [])
  const abrirOriginal = useCallback(async (doc: ParsedDoc) => {
    if (!doc.copia) return 'No hay copia guardada de este archivo.'
    setVisor({ copia: doc.copia, titulo: doc.archivo || doc.copia })
    return null
  }, [])

  const setTema = useCallback((t: Tema) => {
    lsSet('tema', t)
    setTemaState(t)
  }, [])

  const recibos = useMemo(() => construirRecibos(docs), [docs])
  const visibles = useMemo(() => filtrar(recibos, filtros), [recibos, filtros])
  const bancoTodo = useMemo(() => {
    setCategoriasUsuario(categorias)
    const d = procesarEstados(estados, reglas)
    return { ...d, conciliacion: conciliarNomina(recibos, d) }
  }, [estados, reglas, recibos, categorias])
  // Filtro global de cuentas: si eliges todas (o ninguna) no se filtra nada.
  const cuentasSel = useMemo(() => {
    const existen = new Set(bancoTodo.cuentas.map((c) => c.cuenta))
    const v = cuentasSelRaw.filter((c) => existen.has(c))
    return v.length === existen.size ? [] : v
  }, [cuentasSelRaw, bancoTodo.cuentas])
  const banco = useMemo(() => {
    if (!cuentasSel.length) return bancoTodo
    const ids = new Set(cuentasSel)
    return { ...bancoTodo, cuentas: bancoTodo.cuentas.filter((c) => ids.has(c.cuenta)), movs: bancoTodo.movs.filter((m) => ids.has(m.cuenta)) }
  }, [bancoTodo, cuentasSel])

  const value: Store = {
    cargando,
    docs,
    recibos,
    visibles,
    filtros,
    setFiltros,
    importar,
    estados,
    banco,
    bancoTodo,
    cuentasSel,
    setCuentasSel,
    avisosVistos,
    marcarAviso,
    reglas,
    setRegla,
    categorias,
    guardarCategoria,
    borrarCategoria,
    eliminarEstado,
    eliminarRecibo,
    borrarTodo,
    exportar,
    importarRespaldo,
    cambiarCarpeta,
    dbInfo,
    recargar,
    abrirOriginal,
    visor,
    verArchivo,
    cerrarVisor,
    tema,
    setTema,
    modo
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function describir(d: ParsedDoc): string {
  const liq = d.percepciones.some((p) => /DEV.*AHORRO/i.test(p.concepto)) || (d.semana ?? 0) >= 700
  if (liq) return `Liquidación del fondo de ahorro (${d.fechaPago ?? d.periodoFin ?? ''}).`
  return `Recibo ${d.periodoInicio ?? ''} → ${d.periodoFin ?? ''}.`
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore fuera de StoreProvider')
  return s
}
