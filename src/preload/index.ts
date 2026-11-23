import { contextBridge, ipcRenderer } from 'electron'

export interface VersionApp {
  version: string
  build: number
  fecha: string
  notas?: string
  modulos?: boolean
}

export interface EstadoActualizacion {
  actual: VersionApp | null
  nueva: VersionApp | null
  origen: string | null
  instalada: boolean
  error?: string
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

const api = {
  listDocs: (): Promise<unknown[]> => ipcRenderer.invoke('db:list'),
  addDoc: (doc: unknown, bytes?: Uint8Array): Promise<boolean> => ipcRenderer.invoke('db:add', doc, bytes),
  deleteRecibo: (uuid: string): Promise<void> => ipcRenderer.invoke('db:deleteRecibo', uuid),
  clearAll: (): Promise<void> => ipcRenderer.invoke('db:clear'),
  dbInfo: (): Promise<DbInfo> => ipcRenderer.invoke('db:info'),
  chooseDataFolder: (): Promise<'abierta' | 'copiada' | null> => ipcRenderer.invoke('db:chooseFolder'),
  openFile: (name: string): Promise<string | null> => ipcRenderer.invoke('file:open', name),
  readFile: (name: string): Promise<Uint8Array> => ipcRenderer.invoke('file:read', name),
  pickFiles: (): Promise<{ name: string; bytes: Uint8Array }[]> => ipcRenderer.invoke('dialog:openFiles'),
  openDataFolder: (): Promise<string> => ipcRenderer.invoke('data:openFolder'),
  exportBackup: (): Promise<boolean> => ipcRenderer.invoke('data:export'),
  importBackup: (): Promise<number | null> => ipcRenderer.invoke('data:importBackup'),
  buscarActualizacion: (): Promise<EstadoActualizacion> => ipcRenderer.invoke('app:buscarActualizacion'),
  aplicarActualizacion: (): Promise<void> => ipcRenderer.invoke('app:aplicarActualizacion'),
  listEstados: (): Promise<unknown[]> => ipcRenderer.invoke('estados:list'),
  addEstado: (estado: unknown, bytes?: Uint8Array): Promise<boolean> => ipcRenderer.invoke('estados:add', estado, bytes),
  deleteEstado: (id: string): Promise<void> => ipcRenderer.invoke('estados:delete', id),
  listReglas: (): Promise<Record<string, string>> => ipcRenderer.invoke('reglas:list'),
  setRegla: (clave: string, categoria: string | null): Promise<void> => ipcRenderer.invoke('reglas:set', clave, categoria),
  ocr: (png: Uint8Array, escala: number): Promise<{ t: string; x0: number; y0: number; x1: number; y1: number; c: number }[]> =>
    ipcRenderer.invoke('ocr:recognize', png, escala)
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
