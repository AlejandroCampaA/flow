import { app } from 'electron'
import { existsSync, promises as fs, readFileSync } from 'fs'
import { basename, join } from 'path'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'

/**
 * Base de datos SQLite (sql.js = SQLite en WebAssembly, sin módulos nativos).
 * Vive en Documentos\Flujo por defecto, NO en AppData, para que limpiar AppData no la borre.
 * (La app antes se llamaba MoneyTwo: al primer arranque se copia la base anterior; la original no se toca.)
 * La base completa se mantiene en memoria y se escribe al disco (de forma atómica) tras cada cambio.
 */

const DB_NAME = 'flujo.db'
/** Nombre de la base en versiones anteriores (MoneyTwo). */
const DB_ANTERIOR = 'moneytwo.db'
const MAX_RESPALDOS = 15
const SCHEMA_VERSION = '2'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  clave TEXT PRIMARY KEY,
  valor TEXT
);
CREATE TABLE IF NOT EXISTS documentos (
  uuid            TEXT NOT NULL,
  fuente          TEXT NOT NULL CHECK (fuente IN ('pdf', 'xml')),
  archivo         TEXT NOT NULL,
  copia           TEXT,
  importado_en    TEXT NOT NULL,
  fecha_pago      TEXT,
  periodo_inicio  TEXT,
  periodo_fin     TEXT,
  semana          INTEGER,
  datos           TEXT NOT NULL,
  PRIMARY KEY (uuid, fuente)
);
CREATE INDEX IF NOT EXISTS idx_documentos_fecha ON documentos (fecha_pago);
-- Estados de cuenta bancarios (uno por cuenta y periodo); 'datos' trae los movimientos ya leídos.
CREATE TABLE IF NOT EXISTS estados (
  id              TEXT PRIMARY KEY,
  cuenta          TEXT NOT NULL,
  periodo_inicio  TEXT NOT NULL,
  periodo_fin     TEXT NOT NULL,
  archivo         TEXT NOT NULL,
  copia           TEXT,
  importado_en    TEXT NOT NULL,
  datos           TEXT NOT NULL
);
-- Tus correcciones de categoría: 'mov:<id>' o 'com:<comercio>' -> categoría.
CREATE TABLE IF NOT EXISTS reglas (
  clave           TEXT PRIMARY KEY,
  categoria       TEXT NOT NULL,
  actualizado_en  TEXT NOT NULL
);
`

export interface DocRow {
  uuid: string
  fuente: string
  archivo: string
  copia?: string
  importadoEn: string
  fechaPago?: string
  periodoInicio?: string
  periodoFin?: string
  semana?: number
  [k: string]: unknown
}

export interface EstadoRow {
  id: string
  cuenta: string
  periodoInicio: string
  periodoFin: string
  archivo: string
  copia?: string
  importadoEn?: string
  [k: string]: unknown
}

export interface Respaldo {
  docs: DocRow[]
  estados: EstadoRow[]
  reglas: { clave: string; categoria: string }[]
}

export interface DbInfo {
  carpeta: string
  archivo: string
  documentos: number
  recibos: number
  estados: number
  tamano: number
  respaldos: number
  ultimoRespaldo: string | null
  porDefecto: boolean
}

let SQL: SqlJsStatic | null = null
let db: Database | null = null
let carpeta = ''

const configPath = (): string => join(app.getPath('userData'), 'config.json')
const carpetaPorDefecto = (): string => join(app.getPath('documents'), 'Flujo')
const carpetaAnterior = (): string => join(app.getPath('documents'), 'MoneyTwo')
export const carpetaDatos = (): string => carpeta
export const carpetaArchivos = (): string => join(carpeta, 'archivos')
const carpetaRespaldos = (): string => join(carpeta, 'respaldos')
const dbPath = (dir = carpeta): string => join(dir, DB_NAME)

async function sql(): Promise<SqlJsStatic> {
  if (!SQL) {
    const wasm = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))
    SQL = await initSqlJs({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer } as Parameters<typeof initSqlJs>[0])
  }
  return SQL
}

function leerConfig(): { carpeta?: string } {
  // La configuración de la versión anterior vivía en AppData\Roaming\MoneyTwo.
  for (const f of [configPath(), join(app.getPath('appData'), 'MoneyTwo', 'config.json')]) {
    try {
      const c = JSON.parse(readFileSync(f, 'utf8')) as { carpeta?: string }
      if (c.carpeta) return c
    } catch {
      /* no existe */
    }
  }
  return {}
}

async function guardarConfig(dir: string): Promise<void> {
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(configPath(), JSON.stringify({ carpeta: dir }, null, 2), 'utf8')
}

async function abrir(dir: string): Promise<void> {
  const S = await sql()
  await fs.mkdir(dir, { recursive: true })
  const path = dbPath(dir)
  // Base con el nombre anterior en la misma carpeta: se copia con el nombre nuevo (la original se queda).
  if (!existsSync(path) && existsSync(join(dir, DB_ANTERIOR))) await fs.copyFile(join(dir, DB_ANTERIOR), path)
  const nueva = existsSync(path) ? new S.Database(readFileSync(path)) : new S.Database()
  nueva.run(SCHEMA)
  nueva.run(`INSERT OR REPLACE INTO meta (clave, valor) VALUES ('schema_version', ?)`, [SCHEMA_VERSION])
  db?.close()
  db = nueva
  carpeta = dir
  if (!existsSync(path)) await persistir()
}

/** Escribe la base al disco: archivo temporal + rename, para no dejarla a medias si algo falla. */
async function persistir(): Promise<void> {
  if (!db) return
  const data = db.export()
  const tmp = dbPath() + '.tmp'
  await fs.writeFile(tmp, data)
  await fs.rename(tmp, dbPath())
}

function d(): Database {
  if (!db) throw new Error('La base de datos no está abierta')
  return db
}

// ---------------------------------------------------------------------------

export async function iniciar(): Promise<void> {
  const cfg = leerConfig()
  // Si la carpeta configurada ya no existe (p.ej. USB desconectada), se usa la de Documentos.
  const dir = cfg.carpeta && existsSync(cfg.carpeta) ? cfg.carpeta : carpetaPorDefecto()
  // Primer arranque tras el cambio de nombre: copiar Documentos\MoneyTwo → Documentos\Flujo (sin borrar nada).
  if (dir === carpetaPorDefecto() && !existsSync(dbPath(dir)) && existsSync(join(carpetaAnterior(), DB_ANTERIOR))) {
    await fs.cp(carpetaAnterior(), dir, { recursive: true, errorOnExist: false, force: false })
    // En la carpeta nueva ya es una copia: se renombra (la de Documentos\MoneyTwo sigue intacta).
    if (existsSync(join(dir, DB_ANTERIOR))) await fs.rename(join(dir, DB_ANTERIOR), dbPath(dir))
  }
  await abrir(dir)
  await migrarDesdeAppData()
  await respaldoDiario()
}

/** Versión anterior guardaba un JSON en AppData: se importa una sola vez. */
async function migrarDesdeAppData(): Promise<void> {
  const legacy = join(app.getPath('userData'), 'moneytwo-data.json')
  if (!existsSync(legacy)) return
  try {
    const data = JSON.parse(await fs.readFile(legacy, 'utf8')) as { docs?: DocRow[] }
    const docs = Array.isArray(data.docs) ? data.docs : []
    const legacyFiles = join(app.getPath('userData'), 'archivos')
    await fs.mkdir(carpetaArchivos(), { recursive: true })
    for (const doc of docs) {
      if (doc.copia && existsSync(join(legacyFiles, doc.copia))) {
        await fs.copyFile(join(legacyFiles, doc.copia), join(carpetaArchivos(), basename(doc.copia))).catch(() => undefined)
      }
    }
    insertar(docs)
    await persistir()
    await fs.rename(legacy, legacy + '.migrado')
  } catch (err) {
    console.error('No se pudo migrar el JSON anterior:', err)
  }
}

async function respaldoDiario(): Promise<void> {
  const n = contar()
  if (n.documentos + n.estados === 0) return
  const dir = carpetaRespaldos()
  await fs.mkdir(dir, { recursive: true })
  const hoy = new Date().toISOString().slice(0, 10)
  const destino = join(dir, `flujo-${hoy}.db`)
  if (!existsSync(destino)) await fs.copyFile(dbPath(), destino)
  const viejos = (await fs.readdir(dir)).filter((f) => /^flujo-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse()
  for (const f of viejos.slice(MAX_RESPALDOS)) await fs.rm(join(dir, f), { force: true })
}

function insertar(docs: DocRow[]): number {
  const db = d()
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO documentos
      (uuid, fuente, archivo, copia, importado_en, fecha_pago, periodo_inicio, periodo_fin, semana, datos)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  let n = 0
  db.run('BEGIN')
  try {
    for (const doc of docs) {
      if (!doc?.uuid || (doc.fuente !== 'pdf' && doc.fuente !== 'xml')) continue
      stmt.run([
        doc.uuid,
        doc.fuente,
        doc.archivo ?? '',
        doc.copia ?? null,
        doc.importadoEn ?? new Date().toISOString(),
        doc.fechaPago ?? null,
        doc.periodoInicio ?? null,
        doc.periodoFin ?? null,
        doc.semana ?? null,
        JSON.stringify(doc)
      ])
      n += db.getRowsModified()
    }
    db.run('COMMIT')
  } catch (err) {
    db.run('ROLLBACK')
    throw err
  } finally {
    stmt.free()
  }
  return n
}

function insertarEstados(estados: EstadoRow[]): number {
  const db = d()
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO estados (id, cuenta, periodo_inicio, periodo_fin, archivo, copia, importado_en, datos)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  let n = 0
  db.run('BEGIN')
  try {
    for (const e of estados) {
      if (!e?.id || !e.cuenta || !e.periodoInicio) continue
      const importadoEn = e.importadoEn ?? new Date().toISOString()
      stmt.run([e.id, e.cuenta, e.periodoInicio, e.periodoFin ?? '', e.archivo ?? '', e.copia ?? null, importadoEn, JSON.stringify({ ...e, importadoEn })])
      n += db.getRowsModified()
    }
    db.run('COMMIT')
  } catch (err) {
    db.run('ROLLBACK')
    throw err
  } finally {
    stmt.free()
  }
  return n
}

function insertarReglas(reglas: { clave: string; categoria: string }[], reemplazar: boolean): number {
  let n = 0
  for (const r of reglas) {
    if (!r?.clave || !r.categoria) continue
    d().run(`INSERT OR ${reemplazar ? 'REPLACE' : 'IGNORE'} INTO reglas (clave, categoria, actualizado_en) VALUES (?, ?, ?)`, [
      r.clave,
      r.categoria,
      new Date().toISOString()
    ])
    n += d().getRowsModified()
  }
  return n
}

function contar(): { documentos: number; recibos: number; estados: number } {
  const r = d().exec('SELECT COUNT(*), COUNT(DISTINCT uuid) FROM documentos')[0]?.values[0] ?? [0, 0]
  const e = d().exec('SELECT COUNT(*) FROM estados')[0]?.values[0] ?? [0]
  return { documentos: Number(r[0]), recibos: Number(r[1]), estados: Number(e[0]) }
}

// --- API usada por el IPC ----------------------------------------------------

export function listarDocs(): unknown[] {
  const res = d().exec('SELECT datos FROM documentos ORDER BY fecha_pago, uuid, fuente')[0]
  return res ? res.values.map((v) => JSON.parse(String(v[0]))) : []
}

export async function agregarDoc(doc: DocRow, bytes?: Uint8Array): Promise<boolean> {
  if (bytes && doc.copia) {
    await fs.mkdir(carpetaArchivos(), { recursive: true })
    await fs.writeFile(join(carpetaArchivos(), basename(doc.copia)), Buffer.from(bytes))
  }
  const n = insertar([doc])
  if (n) {
    await persistir()
    await respaldoDiario()
  }
  return n > 0
}

/** Importa un respaldo: agrega sólo lo que no existe (no pisa tus datos actuales). */
export async function importarRespaldo(r: Respaldo): Promise<number> {
  const n = insertar(r.docs) + insertarEstados(r.estados)
  const reglas = insertarReglas(r.reglas, false)
  if (n || reglas) await persistir()
  return n
}

// --- Estados de cuenta y reglas -------------------------------------------------

export function listarEstados(): unknown[] {
  const res = d().exec('SELECT datos FROM estados ORDER BY periodo_inicio, cuenta')[0]
  return res ? res.values.map((v) => JSON.parse(String(v[0]))) : []
}

export async function agregarEstado(e: EstadoRow, bytes?: Uint8Array): Promise<boolean> {
  if (bytes && e.copia) {
    await fs.mkdir(carpetaArchivos(), { recursive: true })
    await fs.writeFile(join(carpetaArchivos(), basename(e.copia)), Buffer.from(bytes))
  }
  const n = insertarEstados([e])
  if (n) {
    await persistir()
    await respaldoDiario()
  }
  return n > 0
}

export async function eliminarEstado(id: string): Promise<void> {
  const copia = d().exec('SELECT copia FROM estados WHERE id = ?', [id])[0]?.values[0]?.[0]
  d().run('DELETE FROM estados WHERE id = ?', [id])
  await persistir()
  // El PDF se borra sólo si ningún otro estado (otra cuenta del mismo PDF) lo usa.
  if (copia) {
    const otros = d().exec('SELECT COUNT(*) FROM estados WHERE copia = ?', [String(copia)])[0]?.values[0]?.[0]
    if (!Number(otros)) await fs.rm(join(carpetaArchivos(), basename(String(copia))), { force: true })
  }
}

export function listarReglas(): Record<string, string> {
  const res = d().exec('SELECT clave, categoria FROM reglas')[0]
  return Object.fromEntries((res?.values ?? []).map((v) => [String(v[0]), String(v[1])]))
}

export async function ponerRegla(clave: string, categoria: string | null): Promise<void> {
  if (categoria) insertarReglas([{ clave, categoria }], true)
  else d().run('DELETE FROM reglas WHERE clave = ?', [clave])
  await persistir()
}

export async function eliminarRecibo(uuid: string): Promise<void> {
  const res = d().exec('SELECT copia FROM documentos WHERE uuid = ?', [uuid])[0]
  d().run('DELETE FROM documentos WHERE uuid = ?', [uuid])
  await persistir()
  for (const v of res?.values ?? []) {
    if (v[0]) await fs.rm(join(carpetaArchivos(), basename(String(v[0]))), { force: true })
  }
}

export async function borrarTodo(): Promise<void> {
  // Antes de vaciar se deja un respaldo, por si acaso.
  await fs.mkdir(carpetaRespaldos(), { recursive: true })
  await fs.copyFile(dbPath(), join(carpetaRespaldos(), `flujo-antes-de-borrar-${Date.now()}.db`))
  d().run('DELETE FROM documentos')
  d().run('DELETE FROM estados')
  d().run('DELETE FROM reglas')
  await persistir()
  await fs.rm(carpetaArchivos(), { recursive: true, force: true })
}

export async function info(): Promise<DbInfo> {
  const { documentos, recibos, estados } = contar()
  const respaldos = existsSync(carpetaRespaldos())
    ? (await fs.readdir(carpetaRespaldos())).filter((f) => f.endsWith('.db')).sort()
    : []
  const st = await fs.stat(dbPath()).catch(() => null)
  return {
    carpeta,
    archivo: dbPath(),
    documentos,
    recibos,
    estados,
    tamano: st?.size ?? 0,
    respaldos: respaldos.length,
    ultimoRespaldo: respaldos.length ? respaldos[respaldos.length - 1] : null,
    porDefecto: carpeta === carpetaPorDefecto()
  }
}

/**
 * Cambia la carpeta de datos. Si la carpeta destino ya tiene un flujo.db (o moneytwo.db) se abre ese
 * (útil tras reinstalar o en otra PC); si no, se copian ahí la base y los archivos actuales.
 * La carpeta anterior no se borra.
 */
export async function cambiarCarpeta(dir: string): Promise<'abierta' | 'copiada'> {
  if (dir === carpeta) return 'abierta'
  let resultado: 'abierta' | 'copiada' = 'abierta'
  if (!existsSync(dbPath(dir)) && !existsSync(join(dir, DB_ANTERIOR))) {
    await fs.mkdir(dir, { recursive: true })
    await fs.copyFile(dbPath(), dbPath(dir))
    if (existsSync(carpetaArchivos())) await fs.cp(carpetaArchivos(), join(dir, 'archivos'), { recursive: true })
    resultado = 'copiada'
  }
  await abrir(dir)
  await guardarConfig(dir)
  return resultado
}

/** Copia exacta de la base a la ruta indicada. */
export async function exportarDb(destino: string): Promise<void> {
  await persistir()
  await fs.copyFile(dbPath(), destino)
}

/** Lee recibos, estados de cuenta y reglas de otro archivo .db (o .json de la versión anterior). */
export async function leerRespaldo(path: string): Promise<Respaldo> {
  if (path.toLowerCase().endsWith('.json')) {
    const data = JSON.parse(await fs.readFile(path, 'utf8')) as { docs?: DocRow[] }
    return { docs: Array.isArray(data.docs) ? data.docs : [], estados: [], reglas: [] }
  }
  const S = await sql()
  const otra = new S.Database(readFileSync(path))
  const tabla = (q: string): unknown[][] => {
    try {
      return otra.exec(q)[0]?.values ?? []
    } catch {
      return [] // respaldo de una versión sin esa tabla
    }
  }
  try {
    return {
      docs: tabla('SELECT datos FROM documentos').map((v) => JSON.parse(String(v[0]))),
      estados: tabla('SELECT datos FROM estados').map((v) => JSON.parse(String(v[0]))),
      reglas: tabla('SELECT clave, categoria FROM reglas').map((v) => ({ clave: String(v[0]), categoria: String(v[1]) }))
    }
  } finally {
    otra.close()
  }
}
