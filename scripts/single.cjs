// Prueba la instancia única: se lanza dos veces con la misma carpeta de datos temporal.
const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const base = path.resolve(process.argv[2])
fs.mkdirSync(path.join(base, 'documents', 'Flujo'), { recursive: true })
app.setPath('userData', path.join(base, 'userdata'))
app.setPath('documents', path.join(base, 'documents'))
require(path.resolve('out/main/index.js'))
