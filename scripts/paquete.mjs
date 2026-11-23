// Arma el zip para repartir: release/Flujo-<version>-Windows.zip
//   Instalar Flujo.cmd · Desinstalar Flujo.cmd · LEEME.txt · win-unpacked/ (Flujo.exe corre solo, sin instalar)
// Requiere haber corrido antes `npm run dist` (deja win-unpacked y los .cmd en release/).
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const rel = join(raiz, 'release')
const { version } = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'))
for (const f of ['win-unpacked/Flujo.exe', 'Instalar Flujo.cmd', 'Desinstalar Flujo.cmd']) {
  if (!existsSync(join(rel, f))) {
    console.error(`Falta release/${f}. Corre primero: npm run dist`)
    process.exit(1)
  }
}

const leeme = `FLUJO ${version}
==========

1) Extrae TODO el zip (clic derecho > Extraer todo). No lo abras desde dentro del zip.

2) Dos formas de usarlo:
   - Instalar (recomendado): doble clic en "Instalar Flujo.cmd". Copia Flujo a tu usuario,
     crea accesos directos en el escritorio y el menu Inicio, y lo abre.
   - Sin instalar: abre win-unpacked\Flujo.exe directamente.

Tus datos quedan en Documentos\Flujo (no se borran al desinstalar).
Para quitarlo: "Desinstalar Flujo.cmd".

Si Windows muestra "Windows protegio su PC" al abrir un .cmd: Mas informacion > Ejecutar de todas formas.
(Los archivos descargados de internet llevan esa marca; el programa no esta firmado.)
`
writeFileSync(join(rel, 'LEEME.txt'), leeme.replace(/\r?\n/g, '\r\n'))

const zip = join(rel, `Flujo-${version}-Windows.zip`)
rmSync(zip, { force: true })
// tar.exe de Windows (bsdtar) escribe zips estándar; se usa la ruta de System32 para no tomar el tar de Git.
const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\Windows', 'System32', 'tar.exe') : 'tar'
const r = spawnSync(tar, ['-a', '-c', '-f', zip, '-C', rel, 'Instalar Flujo.cmd', 'Desinstalar Flujo.cmd', 'LEEME.txt', 'win-unpacked'], { stdio: 'inherit' })
if (r.status !== 0) process.exit(r.status ?? 1)
console.log(`Listo: ${zip}`)
