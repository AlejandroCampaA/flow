import { app, shell } from 'electron'
import { cp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

/**
 * Actualizaciones locales: Flujo vive instalado en una carpeta y se actualiza copiando la carpeta `out` nueva
 * desde el origen (la carpeta `release\actualizacion` del proyecto, que llena `npm run publicar`).
 * La copia se deja en `resources\actualizacion` y `boot.cjs` la pone en su lugar al abrir la app otra vez,
 * cuando todavía no hay nada cargado (así ningún archivo está en uso).
 */

export interface Version {
  version: string
  build: number
  fecha: string
  notas?: string
  /** Si también cambiaron las dependencias (carpeta node_modules). */
  modulos?: boolean
}

export interface EstadoActualizacion {
  actual: Version | null
  nueva: Version | null
  origen: string | null
  /** Sólo la app instalada se puede actualizar (no `npm run dev`). */
  instalada: boolean
  error?: string
}

const leerJson = async <T>(ruta: string): Promise<T | null> => {
  try {
    return JSON.parse((await readFile(ruta, 'utf8')).replace(/^﻿/, '')) as T
  } catch {
    return null
  }
}

export const versionActual = (): Promise<Version | null> => leerJson<Version>(join(app.getAppPath(), 'out', 'build.json'))

/** Carpeta de donde se toman las actualizaciones (la escribe el instalador en resources\origen.json). */
export async function origen(): Promise<string | null> {
  if (process.env.FLUJO_ORIGEN) return process.env.FLUJO_ORIGEN
  const o = await leerJson<{ ruta?: string }>(join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'origen.json'))
  return o?.ruta ?? null
}

export async function buscar(): Promise<EstadoActualizacion> {
  const actual = await versionActual()
  const ruta = await origen()
  const base: EstadoActualizacion = { actual, nueva: null, origen: ruta, instalada: app.isPackaged }
  if (!ruta) return { ...base, error: 'No hay una carpeta de actualizaciones configurada.' }
  const nueva = await leerJson<Version>(join(ruta, 'version.json'))
  if (!nueva) return { ...base, error: `No hay una versión publicada en ${ruta}.` }
  return { ...base, nueva: !actual || nueva.build > actual.build ? nueva : null }
}

/** Copia la actualización junto a la app y reinicia; `boot.cjs` la aplica al arrancar. */
export async function aplicar(): Promise<void> {
  if (!app.isPackaged) throw new Error('Sólo la app instalada se puede actualizar.')
  const e = await buscar()
  if (!e.nueva || !e.origen) throw new Error('No hay ninguna actualización pendiente.')
  const pend = join(process.resourcesPath, 'actualizacion')
  await rm(pend, { recursive: true, force: true })
  await mkdir(pend, { recursive: true })
  await cp(join(e.origen, 'app', 'out'), join(pend, 'out'), { recursive: true })
  if (e.nueva.modulos) await cp(join(e.origen, 'app', 'node_modules'), join(pend, 'node_modules'), { recursive: true })
  await writeFile(join(pend, 'listo.json'), JSON.stringify({ build: e.nueva.build }))
  app.relaunch({ args: [...process.argv.slice(1).filter((a) => a !== '--reiniciado'), '--reiniciado'] })
  app.exit(0)
}

/** Accesos directos en el escritorio y el menú Inicio (se crean al instalar). */
export function crearAccesos(): void {
  const destino = process.execPath
  const opciones = { target: destino, cwd: dirname(destino), icon: join(process.resourcesPath, 'icon.ico'), iconIndex: 0, description: 'Flujo: tu nómina y tus cuentas' }
  const lugares = [join(app.getPath('desktop'), 'Flujo.lnk'), join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Flujo.lnk')]
  for (const l of lugares) shell.writeShortcutLink(l, 'create', opciones)
}
