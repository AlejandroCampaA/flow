// Prueba de humo de las gráficas de mercado (Resumen, Cuentas, Nómina) y del encabezado, sobre una COPIA de la base real.
// Uso: node_modules\electron\dist\electron.exe scripts/smoke2.cjs <carpeta-salida> [light|dark]   (con SMOKE_DB=<flujo.db>)
const { app } = require('electron')
const fs = require('fs')
const path = require('path')

const outDir = path.resolve(process.argv[2] || 'smoke-out')
const theme = process.argv[3] || 'dark'
fs.mkdirSync(outDir, { recursive: true })
app.setPath('userData', path.join(outDir, 'userdata'))
app.setPath('documents', path.join(outDir, 'documents'))
const dir = path.join(outDir, 'documents', 'Flujo')
fs.mkdirSync(dir, { recursive: true })
fs.copyFileSync(process.env.SMOKE_DB, path.join(dir, 'flujo.db'))
const arch = path.join(path.dirname(process.env.SMOKE_DB), 'archivos')
if (fs.existsSync(arch)) fs.cpSync(arch, path.join(dir, 'archivos'), { recursive: true })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.on('browser-window-created', (_e, win) => {
  win.webContents.once('did-finish-load', async () => {
    const js = (code) => win.webContents.executeJavaScript(code)
    const shot = async (name) => {
      await wait(600)
      fs.writeFileSync(path.join(outDir, name + '.png'), (await win.webContents.capturePage()).toPNG())
    }
    const full = async (name) => {
      const h = await js('document.querySelector("main").scrollHeight')
      win.setSize(1440, Math.min(h + 90, 4200))
      await shot(name)
      win.setSize(1440, 920)
    }
    const tab = (t) => js(`[...document.querySelectorAll('header [role=tab]')].find(b => b.textContent.trim() === '${t}').click()`)
    // Botones segmentados de la página: por texto dentro del primer grupo que lo contenga (o dentro de un diálogo)
    const seg = (t, root = 'main') => js(`[...document.querySelectorAll('${root} [role=tab]')].find(b => b.textContent.trim() === '${t}')?.click()`)
    const click = (sel, txt) => js(`[...document.querySelectorAll('${sel}')].find(b => b.textContent.includes('${txt}'))?.click()`)
    const rueda = (idx, dy, fx = 0.8) =>
      js(`(() => { const sv = document.querySelectorAll('main svg[role=img]')[${idx}]; const el = sv.parentElement; const r = el.getBoundingClientRect(); el.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: ${dy}, clientX: r.left + r.width * ${fx}, clientY: r.top + 80, bubbles: true, cancelable: true })) })()`)
    const centrar = (idx) => js(`document.querySelectorAll('main svg[role=img]')[${idx}]?.scrollIntoView({ block: 'center' })`)
    const cerrar = () => js(`document.querySelector('[role=dialog] button[aria-label="Cerrar"]')?.click()`)
    try {
      await wait(900)
      for (let i = 0; i < 3; i++) {
        if (await js(`!!document.querySelector('button[aria-label^="Tema: ${theme === 'light' ? 'claro' : 'oscuro'}"]')`)) break
        await js(`document.querySelector('button[aria-label^="Tema:"]').click()`)
        await wait(150)
      }
      await wait(800)
      fs.writeFileSync(path.join(outDir, 'header.txt'), await js(`document.querySelector('header').innerText + ' | h=' + document.querySelector('header').offsetHeight + ' | refrescar=' + !!document.querySelector('button[aria-label="Recargar tus datos"]') + ' | datos=' + !!document.querySelector('button[aria-label^="Tus datos"]')`))
      await shot('00-resumen-arriba')
      await full('01-resumen')

      // --- Resumen: tipos, rangos e intervalos
      await centrar(0)
      for (const r of ['1M', '3M', '6M', '1A', 'Todo']) { await seg(r); await shot(`02-area-${r}`) }
      await seg('Línea'); await shot('03-linea')
      await seg('Semanas'); await shot('03b-linea-semanas')
      await seg('Meses'); await shot('03c-linea-meses')
      await seg('Velas'); await seg('Auto'); await seg('6M'); await shot('04-velas-6M')
      await seg('Días'); await shot('04b-velas-dias')
      await seg('Semanas'); await shot('04c-velas-semanas')
      await seg('Meses'); await shot('04d-velas-meses')
      await seg('Barras'); await seg('Semanas'); await shot('05-ohlc-semanas')
      await seg('Auto'); await seg('Velas'); await seg('3M')
      for (let i = 0; i < 4; i++) { await rueda(0, -100); await wait(60) }
      await shot('06-zoom-in')
      for (let i = 0; i < 10; i++) { await rueda(0, 100); await wait(60) }
      await shot('06b-zoom-out')
      await seg('Área'); await seg('Todo')
      await click('main button', 'Ampliar'); await wait(500); await shot('07-modal')
      await cerrar()

      // --- Cuentas
      await tab('Cuentas'); await js(`document.querySelector('main').scrollTop = 0`)
      await full('10-cuentas')
      const iflujo = await js(`[...document.querySelectorAll('main svg[role=img]')].findIndex(s => /Entradas y salidas/.test(s.getAttribute('aria-label')))`)
      await centrar(iflujo); await shot('11-flujo-barras')
      await seg('Neto'); await shot('11b-flujo-neto')
      await seg('Acumulado'); await shot('11c-flujo-acum')
      await seg('Entró y salió'); await seg('Semanas'); await shot('11d-flujo-semanas')
      await seg('Auto'); await seg('1A'); await shot('11e-flujo-1A')
      // Elegir un periodo en la gráfica filtra los movimientos
      await js(`(() => { const sv = document.querySelectorAll('main svg[role=img]')[${iflujo}]; const rect = sv.querySelector('rect[fill=transparent]'); const r = rect.getBoundingClientRect(); const x = r.left + Math.min(r.width, sv.parentElement.clientWidth) * 0.6, y = r.top + 100; for (const t of ['mousemove', 'mousedown', 'mouseup', 'click']) rect.dispatchEvent(new MouseEvent(t, { clientX: x, clientY: y, bubbles: true, buttons: t === 'mousedown' ? 1 : 0 })) })()`)
      await wait(500); await shot('11f-periodo-elegido')
      fs.writeFileSync(path.join(outDir, 'periodo.txt'), await js(`document.querySelector('main').innerText.slice(0, 600)`))
      await click('button', 'Quitar todo')
      await js(`document.querySelector('main').scrollTop = 99999`); await wait(300); await shot('12-calendario')
      await click('main button', 'Salió'); await shot('12b-calendario-salio')
      await js(`document.querySelector('main button[aria-label*="$"]')?.click()`); await wait(400)
      await seg('Diagrama'); await shot('12c-diagrama')

      // --- Nómina
      await tab('Nómina'); await js(`document.querySelector('main').scrollTop = 0`)
      await full('20-nomina')
      await centrar(0); await shot('21-sueldo-area')
      await seg('Barras'); await shot('21b-sueldo-barras')
      await seg('Velas'); await shot('21c-sueldo-velas')
      await seg('Meses'); await shot('21d-sueldo-meses')
      await seg('Auto'); await seg('Todo'); await seg('Por concepto'); await shot('21e-sueldo-concepto')
      await seg('Descuentos'); await shot('21f-sueldo-descuentos')
      await seg('Depositado'); await seg('6M'); await seg('Área'); await shot('21g-sueldo-6M')

      // --- Datos y versión (desde Archivos)
      await click('header button', 'Archivos'); await wait(400)
      await click('[role=dialog] button', 'Base de datos y respaldos'); await wait(500); await shot('30-datos')
      fs.writeFileSync(path.join(outDir, 'datos.txt'), String(await js(`[...document.querySelectorAll('[role=dialog]')].at(-1)?.innerText`)))
    } catch (e) {
      fs.writeFileSync(path.join(outDir, 'smoke-error.txt'), String((e && e.stack) || e))
    }
    app.quit()
  })
  win.webContents.on('console-message', (_e, level, msg) => {
    if (level >= 2) fs.appendFileSync(path.join(outDir, 'console.txt'), msg + '\n')
  })
})

require(path.resolve('out/main/index.js'))
