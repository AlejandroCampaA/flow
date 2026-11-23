import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { readFile } from 'fs/promises'
import { basename, join } from 'path'
import * as db from './db'
import * as ocr from './ocr'
import * as updater from './updater'

// Solo se permiten nombres simples dentro de la carpeta de archivos.
function safeName(name: string): string {
  const clean = basename(name).replace(/[^A-Za-z0-9._-]/g, '_')
  if (!clean || clean.startsWith('.')) throw new Error('Nombre de archivo inválido')
  return clean
}

function registerIpc(): void {
  ipcMain.handle('db:list', () => db.listarDocs())
  ipcMain.handle('db:add', (_e, doc: db.DocRow, bytes?: Uint8Array) =>
    db.agregarDoc({ ...doc, copia: doc.copia ? safeName(doc.copia) : undefined }, bytes)
  )
  ipcMain.handle('db:deleteRecibo', (_e, uuid: string) => db.eliminarRecibo(uuid))
  ipcMain.handle('db:clear', () => db.borrarTodo())
  ipcMain.handle('db:info', () => db.info())

  // Estados de cuenta bancarios
  ipcMain.handle('estados:list', () => db.listarEstados())
  ipcMain.handle('estados:add', (_e, estado: db.EstadoRow, bytes?: Uint8Array) =>
    db.agregarEstado({ ...estado, copia: estado.copia ? safeName(estado.copia) : undefined }, bytes)
  )
  ipcMain.handle('estados:delete', (_e, id: string) => db.eliminarEstado(id))
  ipcMain.handle('reglas:list', () => db.listarReglas())
  ipcMain.handle('reglas:set', (_e, clave: string, categoria: string | null) => db.ponerRegla(String(clave), categoria ? String(categoria) : null))
  ipcMain.handle('ocr:recognize', (_e, png: Uint8Array, escala: number) => ocr.reconocer(png, Number(escala) || 1))

  ipcMain.handle('db:chooseFolder', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Carpeta para la base de datos de Flujo',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: db.carpetaDatos()
    })
    if (res.canceled || !res.filePaths[0]) return null
    return db.cambiarCarpeta(res.filePaths[0])
  })

  // Copia guardada de un archivo, para verla dentro de la app.
  ipcMain.handle('file:read', async (_e, name: string) => new Uint8Array(await readFile(join(db.carpetaArchivos(), safeName(name)))))

  // Abrir con la app predeterminada de Windows.
  ipcMain.handle('file:open', async (_e, name: string) => {
    const err = await shell.openPath(join(db.carpetaArchivos(), safeName(name)))
    return err || null
  })

  ipcMain.handle('dialog:openFiles', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Selecciona recibos de nómina o estados de cuenta',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Recibos y estados de cuenta (PDF, XML)', extensions: ['pdf', 'xml'] }]
    })
    if (res.canceled) return []
    return Promise.all(res.filePaths.map(async (p) => ({ name: basename(p), bytes: new Uint8Array(await readFile(p)) })))
  })

  // Actualizaciones de la app (desde la carpeta que publica `npm run publicar`)
  ipcMain.handle('app:buscarActualizacion', () => updater.buscar())
  ipcMain.handle('app:aplicarActualizacion', () => updater.aplicar())

  ipcMain.handle('data:openFolder', () => shell.openPath(db.carpetaDatos()))

  ipcMain.handle('data:export', async () => {
    const stamp = new Date().toISOString().slice(0, 10)
    const res = await dialog.showSaveDialog({
      title: 'Exportar respaldo',
      defaultPath: `flujo-respaldo-${stamp}.db`,
      filters: [{ name: 'Base de datos SQLite', extensions: ['db'] }]
    })
    if (res.canceled || !res.filePath) return false
    await db.exportarDb(res.filePath)
    return true
  })

  ipcMain.handle('data:importBackup', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Importar respaldo',
      properties: ['openFile'],
      defaultPath: join(db.carpetaDatos(), 'respaldos'),
      filters: [{ name: 'Respaldo de Flujo (.db, .json)', extensions: ['db', 'json'] }]
    })
    if (res.canceled || !res.filePaths[0]) return null
    return db.importarRespaldo(await db.leerRespaldo(res.filePaths[0]))
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f3f5f6',
    title: 'Flujo',
    // El .exe se deja sin modificar (para que Smart App Control lo permita), así que el icono se pone aquí.
    icon: app.isPackaged ? join(process.resourcesPath, 'icon.ico') : join(__dirname, '../../build/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // La lectura OCR sigue a velocidad normal aunque cambies de ventana mientras importa.
      backgroundThrottling: false
    }
  })
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  // Evita que soltar un archivo fuera de la zona de carga navegue la ventana.
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Flujo se abre una sola vez: si ya hay una ventana, se trae al frente y la segunda copia se cierra.
 * Tras una actualización el reinicio (con --reiniciado) espera a que la copia anterior termine de salir.
 */
async function tomarUnica(): Promise<boolean> {
  if (process.argv.includes('--crear-accesos')) return true
  const intentos = process.argv.includes('--reiniciado') ? 40 : 1
  for (let i = 0; i < intentos; i++) {
    if (app.requestSingleInstanceLock()) return true
    await dormir(250)
  }
  return false
}

app.on('second-instance', () => {
  const w = BrowserWindow.getAllWindows()[0]
  if (!w) return
  if (w.isMinimized()) w.restore()
  w.show()
  w.focus()
})

app.whenReady().then(async () => {
  if (!(await tomarUnica())) {
    app.quit()
    return
  }
  // El instalador abre la app una vez así para crear los accesos directos.
  if (process.argv.includes('--crear-accesos')) {
    try {
      updater.crearAccesos()
    } finally {
      app.quit()
    }
    return
  }
  try {
    await db.iniciar()
  } catch (err) {
    dialog.showErrorBox('Flujo', `No se pudo abrir la base de datos:
${(err as Error).message}`)
    app.quit()
    return
  }
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  void ocr.cerrar()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
