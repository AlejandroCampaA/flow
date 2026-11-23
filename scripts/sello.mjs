// Marca la compilación: escribe out/build.json con la versión y la hora. Es lo que la app compara
// para saber si hay algo nuevo. Se corre justo después de compilar (npm run publicar / npm run dist).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
if (!existsSync(join(raiz, 'out', 'main', 'index.js'))) {
  console.error('No hay compilación en out/. Corre primero: npx electron-vite build')
  process.exit(1)
}
const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'))
const notasIdx = process.argv.indexOf('--notas')
const info = {
  version: pkg.version,
  build: Math.floor(Date.now() / 1000),
  fecha: new Date().toISOString(),
  ...(notasIdx > 0 && process.argv[notasIdx + 1] ? { notas: process.argv[notasIdx + 1] } : {})
}
writeFileSync(join(raiz, 'out', 'build.json'), JSON.stringify(info, null, 2))
console.log(`Compilación ${info.version} · ${info.fecha}`)
