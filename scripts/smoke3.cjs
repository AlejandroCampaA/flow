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
      fs.writeFileSync(path.join(outDir, 'header.txt'), await js(`document.querySelector('header').innerText + ' | h=' + document.querySelector('header').offsetHeight`))
      await shot('00-resumen-arriba')
      await full('01-resumen')

      // --- Resumen: filtro de cuentas, tabla por periodo
      await centrar(0)
      await click('main button', 'Todas las cuentas'); await wait(300); await shot('02-filtro-abierto')
      await js(`document.querySelector('[role=listbox] ul input[type=checkbox]')?.click()`); await wait(500); await shot('02b-una-cuenta-desmarcada')
      await js(`document.querySelector('main').scrollTop = 0`); await wait(300); await shot('02c-kpis-filtrados')
      fs.writeFileSync(path.join(outDir, 'filtrado.txt'), await js(`document.querySelector('main').innerText.slice(0, 500)`))
      await js(`document.querySelector('[role=listbox] label input[type=checkbox]')?.click()`)
      await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
      await js(`[...document.querySelectorAll('main button')].find((b) => b.textContent.includes('cuenta') && b.getAttribute('aria-haspopup'))?.click()`)
      await click('header button', 'Quitar')
      await js(`document.querySelector('main').scrollTop = 99999`); await wait(300); await shot('03-tabla-saldo')
      await js(`document.querySelectorAll('main table tbody tr')[3]?.click()`); await wait(400); await centrar(0); await shot('03b-fila-elegida')
      await seg('Velas'); await seg('Semanas'); await shot('04-velas-semanas')

      // --- Campana: marcar como hecho
      await js(`document.querySelector('main').scrollTop = 0`)
      await js(`document.querySelector('header button[aria-label*="por revisar"], header button[aria-label="Todo en orden"]')?.click()`); await wait(400); await shot('05-campana')
      fs.writeFileSync(path.join(outDir, 'campana.txt'), String(await js(`document.querySelector('[role=menu]')?.innerText`)))
      await js(`document.querySelector('[role=menu] button[aria-label="Marcar como hecho"]')?.click()`); await wait(500); await shot('05b-campana-hecho')
      fs.appendFileSync(path.join(outDir, 'campana.txt'), ' --- despues --- ' + String(await js(`document.querySelector('[role=menu]')?.innerText`)))
      await js(`window.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`)

      // --- Cuentas
      await tab('Cuentas'); await js(`document.querySelector('main').scrollTop = 0`)
      await full('10-cuentas')
      await click('main button', 'Todas las cuentas'); await wait(300); await shot('10b-cuentas-filtro')
      await js(`window.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`)
      const iflujo = await js(`[...document.querySelectorAll('main svg[role=img]')].findIndex(s => /Entradas y salidas/.test(s.getAttribute('aria-label')))`)
      await centrar(iflujo); await shot('11-flujo-barras')
      await seg('Acumulado'); await shot('11c-flujo-acum')
      await seg('Entró y salió')
      await js(`document.querySelector('main').scrollTop = 99999`); await wait(300); await shot('12-calendario')
      await seg('Todos'); await shot('12b-calendario-todos')
      await js(`document.querySelector('main button[aria-label*="$"]')?.click()`); await wait(400)
      await seg('Diagrama'); await shot('12c-diagrama')

      // --- Nómina
      await tab('Nómina'); await js(`document.querySelector('main').scrollTop = 0`)
      await full('20-nomina')
      await click('main button', 'Ver semana por semana'); await wait(700); await shot('21-modal-extra')
      await seg('Pesos', '[role=dialog]'); await shot('21b-modal-extra-pesos')
      await seg('Meses', '[role=dialog]'); await shot('21c-modal-extra-meses')
      await cerrar()
      await click('main button', 'Ver aportes y ciclos'); await wait(700); await shot('22-modal-ahorro')
      await seg('Saldo del fondo', '[role=dialog]'); await shot('22b-modal-ahorro-saldo')
      await cerrar()
      await click('main button', 'Cada concepto'); await wait(500); await shot('23-modal-conceptos')
      await cerrar()
      await seg('Total del rango'); await shot('24-cascada-total')
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
