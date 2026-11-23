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
    const seg = (t, root = 'main', n = 0) => js(`[...document.querySelectorAll('${root} [role=tab]')].filter(b => b.textContent.trim() === '${t}')[${n}]?.click()`)
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
      await full('01-resumen')
      fs.writeFileSync(path.join(outDir, 'opciones.txt'), String(await js(`[...document.querySelectorAll('main [role=tablist]')].map(t => [...t.querySelectorAll('[role=tab]')].map(b => b.textContent.trim()).join('/')).join(' ## ')`)))
      await seg('Velas'); await centrar(0); await shot('02-resumen-velas')

      await tab('Cuentas'); await js(`document.querySelector('main').scrollTop = 0`)
      await shot('10-cuentas-arriba')
      await click('main button', 'Todas las cuentas'); await wait(300); await shot('10b-cuentas-filtro')
      await js(`window.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`)
      await full('11-cuentas')
      fs.writeFileSync(path.join(outDir, 'opciones-cuentas.txt'), String(await js(`[...document.querySelectorAll('main [role=tablist]')].map(t => [...t.querySelectorAll('[role=tab]')].map(b => b.textContent.trim()).join('/')).join(' ## ')`)))
      await js(`document.querySelector('main').scrollTop = 99999`); await wait(300); await shot('12-calendario-default')

      await tab('Nómina'); await js(`document.querySelector('main').scrollTop = 0`)
      await full('20-nomina')
      await js(`document.querySelectorAll('main svg[role=img]')[0]?.scrollIntoView({ block: 'center' })`); await wait(300); await shot('20a-sueldo')
      await seg('Por concepto'); await wait(300); await shot('21-concepto')
      await seg('Áreas'); await shot('21b-concepto-areas')
      await seg('% del total'); await shot('21c-concepto-pct')
      await seg('Descuentos'); await shot('22-descuentos')
      await seg('Barras'); await shot('22b-descuentos-barras')
      await seg('Depositado'); await seg('Velas'); await shot('23-deposito-velas')
      await js(`document.querySelector('main table tbody tr:nth-child(3)')?.click()`); await wait(400); await shot('23b-fila')
      await js(`document.querySelectorAll('main svg[role=img]')[1]?.scrollIntoView({ block: 'center' })`); await wait(300); await shot('24-destino')
      await seg('% del total', 'main', 1); await shot('24b-destino-pct')
      await click('main button', 'Ver semana por semana'); await wait(700); await shot('30-modal-extra')
      await seg('Acumulado', '[role=dialog]'); await shot('30b-extra-acum')
      await seg('Áreas', '[role=dialog]'); await shot('30c-extra-areas')
      await seg('Horas', '[role=dialog]'); await shot('30d-extra-horas')
      await cerrar()
      await click('main button', 'Ver aportes y ciclos'); await wait(700); await shot('31-modal-ahorro')
      await seg('Áreas', '[role=dialog]'); await shot('31b-ahorro-areas')
      await seg('Saldo del fondo', '[role=dialog]'); await shot('31c-ahorro-saldo')
      await seg('Aportes', '[role=dialog]')
      await click('[role=dialog] button', 'Ver todo el detalle'); await wait(300)
      await js(`document.querySelector('[role=dialog] > div:last-of-type, [role=dialog] .overflow-y-auto').scrollTop = 99999`); await wait(300); await shot('31d-ahorro-ciclos-detalle')
    } catch (e) {
      fs.writeFileSync(path.join(outDir, 'smoke-error.txt'), String((e && e.stack) || e))
    }
    app.quit()
  })
  win.webContents.on('console-message', (_e, level, msg) => {
    if (level >= 2) fs.appendFileSync(path.join(outDir, 'console.txt'), msg + String.fromCharCode(10))
  })
})

require(path.resolve('out/main/index.js'))
