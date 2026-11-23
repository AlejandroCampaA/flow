// Publica la compilación actual como actualización: copia out/ a release/actualizacion/app/out y escribe
// release/actualizacion/version.json (al final, para que la app nunca vea una copia a medias).
// La app instalada la detecta sola y muestra el botón "Actualizar".
//   npm run publicar                 -> sólo la actualización (rápido)
//   node scripts/publicar.mjs --instalador   -> además deja los instaladores junto a win-unpacked (lo hace `npm run dist`)
//   notas-version.txt (en la raíz)   -> qué cambió; se muestra al actualizar (o --notas "texto")
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const rel = join(raiz, 'release')
const dest = join(rel, 'actualizacion')
const buildPath = join(raiz, 'out', 'build.json')
if (!existsSync(buildPath)) {
  console.error('Falta out/build.json. Usa: npm run publicar')
  process.exit(1)
}
const info = JSON.parse(readFileSync(buildPath, 'utf8'))
const arg = (n) => {
  const i = process.argv.indexOf(n)
  return i > 0 ? process.argv[i + 1] : undefined
}
// Qué cambió: del archivo notas-version.txt (si existe) o de --notas (en Windows npm estropea las comillas: mejor el archivo)
const archivoNotas = join(raiz, 'notas-version.txt')
const notas = (existsSync(archivoNotas) ? readFileSync(archivoNotas, 'utf8').trim() : '') || arg('--notas') || info.notas

// 1) la carpeta out nueva (se arma aparte y se cambia de golpe)
mkdirSync(join(dest, 'app'), { recursive: true })
const tmp = join(dest, 'app', 'out.tmp')
rmSync(tmp, { recursive: true, force: true })
cpSync(join(raiz, 'out'), tmp, { recursive: true })
rmSync(join(dest, 'app', 'out'), { recursive: true, force: true })
renameSync(tmp, join(dest, 'app', 'out'))

// 2) si cambiaron las dependencias, también se manda node_modules (flag --modulos)
const conModulos = process.argv.includes('--modulos')
if (conModulos) {
  const fuente = join(rel, 'win-unpacked', 'resources', 'app', 'node_modules')
  if (!existsSync(fuente)) {
    console.error('Para --modulos hace falta haber corrido antes: npm run dist')
    process.exit(1)
  }
  rmSync(join(dest, 'app', 'node_modules'), { recursive: true, force: true })
  cpSync(fuente, join(dest, 'app', 'node_modules'), { recursive: true })
}

// 3) lo último: el aviso
writeFileSync(join(dest, 'version.json'), JSON.stringify({ version: info.version, build: info.build, fecha: info.fecha, ...(notas ? { notas } : {}), ...(conModulos ? { modulos: true } : {}) }, null, 2))
console.log(`Actualización publicada: ${info.version} (${info.fecha}) -> ${dest}`)

// 4) instaladores (sólo con `npm run dist`)
if (process.argv.includes('--instalador')) {
  const instalar = String.raw`@echo off
setlocal
chcp 65001 >nul
title Instalar Flujo
set "ELECTRON_RUN_AS_NODE="
set "ORIGEN=%~dp0win-unpacked"
set "DESTINO=%LOCALAPPDATA%\Programs\Flujo"
if not exist "%ORIGEN%\Flujo.exe" (
  echo No encuentro la carpeta win-unpacked junto a este archivo.
  echo Si descargaste el zip, extraelo completo antes de abrir este archivo.
  pause
  exit /b 1
)
:cerrar
tasklist /FI "IMAGENAME eq Flujo.exe" 2>nul | find /I "Flujo.exe" >nul
if not errorlevel 1 (
  echo Flujo esta abierto. Cierralo y presiona una tecla para continuar...
  pause >nul
  goto cerrar
)
echo Instalando Flujo en %DESTINO% ...
robocopy "%ORIGEN%" "%DESTINO%" /MIR /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (
  echo No se pudo copiar la aplicacion.
  pause
  exit /b 1
)
rem De donde la app toma sus actualizaciones (npm run publicar). Si no hay carpeta actualizacion (zip descargado), se omite.
set "ACT=%~dp0actualizacion"
if not exist "%ACT%\version.json" goto sinorigen
set "ACT=%ACT:\=\\%"
> "%DESTINO%\resources\origen.json" echo {"ruta":"%ACT%"}
:sinorigen
"%DESTINO%\Flujo.exe" --crear-accesos
echo.
echo Listo. Flujo quedo instalado y tiene acceso directo en el escritorio y en el menu Inicio.
echo Tus datos siguen en Documentos\Flujo.
start "" "%DESTINO%\Flujo.exe"
timeout /t 3 >nul
`
  const desinstalar = String.raw`@echo off
setlocal
chcp 65001 >nul
title Desinstalar Flujo
set "DESTINO=%LOCALAPPDATA%\Programs\Flujo"
:cerrar
tasklist /FI "IMAGENAME eq Flujo.exe" 2>nul | find /I "Flujo.exe" >nul
if not errorlevel 1 (
  echo Flujo esta abierto. Cierralo y presiona una tecla para continuar...
  pause >nul
  goto cerrar
)
rmdir /S /Q "%DESTINO%"
del "%USERPROFILE%\Desktop\Flujo.lnk" >nul 2>&1
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Flujo.lnk" >nul 2>&1
echo Flujo se desinstalo. Tus datos (Documentos\Flujo) no se tocaron.
pause
`
  writeFileSync(join(rel, 'Instalar Flujo.cmd'), instalar.replace(/\r?\n/g, '\r\n'))
  writeFileSync(join(rel, 'Desinstalar Flujo.cmd'), desinstalar.replace(/\r?\n/g, '\r\n'))
  console.log('Instaladores: release\\Instalar Flujo.cmd y release\\Desinstalar Flujo.cmd')
}
