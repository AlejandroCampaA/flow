// Arranque de Flujo. Si hay una actualización lista (la deja la propia app en resources\actualizacion),
// se pone en su lugar ANTES de cargar la app, cuando ningún archivo está en uso. Después carga la app normal.
// Este archivo casi nunca cambia: si algún día cambia, hay que volver a correr el instalador.
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

function esperar(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

// Mover una carpeta; el antivirus a veces la retiene un instante, así que se reintenta.
function mover(de, a) {
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(de, a)
      return
    } catch (e) {
      if (i >= 8) throw e
      esperar(150)
    }
  }
}

function quitar(ruta) {
  try {
    fs.rmSync(ruta, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 })
  } catch {
    /* si queda algo, se limpia en el próximo arranque */
  }
}

function aplicarActualizacion() {
  const pend = path.join(process.resourcesPath, 'actualizacion')
  if (!fs.existsSync(path.join(pend, 'listo.json'))) return
  const raiz = __dirname
  for (const carpeta of ['out', 'node_modules']) {
    const nueva = path.join(pend, carpeta)
    if (!fs.existsSync(nueva)) continue
    const vieja = path.join(raiz, carpeta)
    const resguardo = path.join(raiz, carpeta + '.old')
    quitar(resguardo)
    try {
      if (fs.existsSync(vieja)) mover(vieja, resguardo)
      mover(nueva, vieja)
    } catch (e) {
      // Si algo falló a medias, se regresa lo anterior para que la app siga abriendo.
      try {
        if (!fs.existsSync(vieja) && fs.existsSync(resguardo)) mover(resguardo, vieja)
      } catch {
        /* nada más que hacer */
      }
      quitar(pend)
      return
    }
    quitar(resguardo)
  }
  quitar(pend)
}

if (app.isPackaged) {
  try {
    aplicarActualizacion()
  } catch {
    /* se abre con lo que haya */
  }
}
require('./out/main/index.js')
