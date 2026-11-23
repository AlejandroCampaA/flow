// Prueba de humo: abre la app real con carpetas temporales, suelta los archivos de /samples sobre la
// ventana y toma capturas de cada pestaña.
// Uso: npx electron scripts/smoke.cjs <carpeta-salida> [light|dark]
// Opcional: SMOKE_DB=<ruta a flujo.db o moneytwo.db> para arrancar con una copia de una base existente.
const { app } = require('electron')
const fs = require('fs')
const path = require('path')

const outDir = path.resolve(process.argv[2] || 'smoke-out')
const theme = process.argv[3] || 'dark'
fs.mkdirSync(outDir, { recursive: true })
app.setPath('userData', path.join(outDir, 'userdata'))
app.setPath('documents', path.join(outDir, 'documents'))
if (process.env.SMOKE_DB) {
  // SMOKE_LEGACY=1: la base va en la ruta de la versión anterior (Documentos\MoneyTwo\moneytwo.db) para probar la migración.
  const legacy = !!process.env.SMOKE_LEGACY
  const dir = path.join(outDir, 'documents', legacy ? 'MoneyTwo' : 'Flujo')
  fs.mkdirSync(dir, { recursive: true })
  fs.copyFileSync(process.env.SMOKE_DB, path.join(dir, legacy ? 'moneytwo.db' : 'flujo.db'))
  // Copias de los PDF (para el visor), si están junto a la base.
  const arch = path.join(path.dirname(process.env.SMOKE_DB), 'archivos')
  if (!legacy && fs.existsSync(arch)) fs.cpSync(arch, path.join(dir, 'archivos'), { recursive: true })
}

const samples = fs.readdirSync('samples').map((f) => ({
  name: f,
  b64: fs.readFileSync(path.join('samples', f)).toString('base64')
}))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.on('browser-window-created', (_e, win) => {
  win.webContents.once('did-finish-load', async () => {
    const js = (code) => win.webContents.executeJavaScript(code)
    const shot = async (name) => {
      await wait(700)
      const img = await win.webContents.capturePage()
      fs.writeFileSync(path.join(outDir, name + '.png'), img.toPNG())
    }
    const full = async (name) => {
      const h = await js('document.querySelector("main").scrollHeight')
      win.setSize(1440, Math.min(h + 90, 4200))
      await shot(name)
      win.setSize(1440, 920)
    }
    const tab = (t) => js(`[...document.querySelectorAll('[role=tab]')].find(b => b.textContent.trim() === '${t}').click()`)
    const click = (sel, txt) => js(`[...document.querySelectorAll('${sel}')].find(b => b.textContent.includes('${txt}'))?.click()`)
    try {
      await wait(800)
      // Tema: el botón alterna sistema → claro → oscuro
      for (let i = 0; i < 3; i++) {
        const ok = await js(`!!document.querySelector('button[aria-label^="Tema: ${theme === 'light' ? 'claro' : 'oscuro'}"]')`)
        if (ok) break
        await js(`document.querySelector('button[aria-label^="Tema:"]').click()`)
        await wait(150)
      }
      await shot('00-inicio')
      await js(`(async () => {
        const files = ${JSON.stringify(samples)}.map(f => new File([Uint8Array.from(atob(f.b64), c => c.charCodeAt(0))], f.name))
        const dt = new DataTransfer(); files.forEach(f => dt.items.add(f))
        document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
      })()`)
      await wait(4000)
      await shot('0a-importando')
      // Los estados de cuenta van por OCR: esperar a que termine la importación (máx. 3 min).
      const t0 = Date.now()
      while (Date.now() - t0 < 180000) {
        const listo = await js(`!!document.querySelector('[role=status][data-estado=listo]')`)
        if (listo) break
        await wait(1000)
      }
      fs.writeFileSync(path.join(outDir, 'import-time.txt'), String(Date.now() - t0 + 4000) + ' ms')
      await shot('0-importacion')
      await click('[role=status] button', 'Ver detalle'); await shot('0b-importacion-detalle')
      const log = await js(`JSON.stringify([...document.querySelectorAll('[role=dialog] li')].map(l => l.innerText))`)
      fs.writeFileSync(path.join(outDir, 'import-log.txt'), log)
      await click('[role=dialog] button', 'Listo')
      await js(`document.querySelector('[role=status] button[aria-label="Cerrar aviso"]')?.click()`)
      const seg = (t) => js(`[...document.querySelectorAll('main [role=tab]')].find(b => b.textContent.trim() === '${t}')?.click()`)
      const cerrar = () => js(`document.querySelector('[role=dialog] button[aria-label="Cerrar"]')?.click()`)
      await full('0c-resumen')
      await shot('0d-resumen-linea')
      // Zoom con Ctrl + rueda sobre la gráfica: días, semanas, meses
      const rueda = (dy) => js(`(() => { const sv = document.querySelector('main svg[role=img]'); const el = sv.parentElement; const r = el.getBoundingClientRect(); el.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: ${dy}, clientX: r.left + r.width * 0.8, clientY: r.top + 80, bubbles: true, cancelable: true })) })()`)
      await js(`document.querySelector('main svg[role=img]').scrollIntoView({ block: 'center' })`)
      for (let i = 0; i < 6; i++) { await rueda(-100); await wait(60) }
      await shot('0h-zoom-dias')
      await seg('Velas'); await shot('0i-velas-dias')
      for (let i = 0; i < 6; i++) { await rueda(100); await wait(60) }
      await shot('0j-velas-semanas')
      for (let i = 0; i < 6; i++) { await rueda(100); await wait(60) }
      await shot('0k-velas-meses')
      await seg('Semanas'); await seg('Línea')
      await js(`document.querySelector('main').scrollTop = 0`)
      await js(`document.querySelector('header button[title*="por revisar"], header button[title="Todo en orden"]')?.click()`); await wait(300); await shot('0l-avisos')
      await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
      await click('main button', 'Ampliar'); await wait(500); await shot('0e-mercado-modal')
      await click('[role=dialog] [role=tab]', 'Línea'); await shot('0f-mercado-linea')
      await click('[role=dialog] [role=tab]', 'Velas')
      await click('[role=dialog] button[aria-pressed]', 'Débito'); await shot('0g-mercado-cuenta')
      await cerrar()
      await tab('Cuentas'); await full('1-cuentas')
      // Las tarjetas de categorías y movimientos tienen alto fijo: medirlas antes y después de abrir una categoría y de cargar más.
      const lista = `document.getElementById('movimientos').closest('section')`
      const alturas = () => js(`(() => { const g = ${lista}.parentElement; return JSON.stringify([...g.children].map(x => { const r = x.getBoundingClientRect(); return [Math.round(r.height), Math.round(r.bottom)] }).concat([innerHeight])) })()`)
      await js(`document.querySelector('main').scrollTop = 0`); await wait(300)
      const h0 = await alturas()
      await shot('1k-cuentas-arriba')
      await js(`${lista}.querySelector('.overflow-y-auto').scrollTop = 99999`); await wait(500)
      await js(`${lista}.querySelector('.overflow-y-auto').scrollTop = 99999`)
      await shot('1k-movs-scroll')
      await click('main section button[aria-pressed]', 'Transporte'); await wait(300)
      const h1 = await alturas()
      await shot('1l-cat-abierta')
      await click('main section button[aria-pressed]', 'Transporte')
      fs.writeFileSync(path.join(outDir, 'alturas.txt'), h0 + ' | ' + h1)
      await js(`document.querySelector('main').scrollTop = 0`)
      await seg('Diagrama'); await js(`document.querySelector('main svg[role=img]')?.scrollIntoView({ block: 'center' })`); await shot('1f-cuentas-diagrama')
      await js(`document.querySelector('main').scrollTop = 0`)
      await seg('Semana')
      await click('button[aria-pressed]', 'Comida a domicilio'); await full('1b-cuentas-categoria')
      await click('button', 'Quitar todo')
      await click('button[aria-pressed]', 'Débito LikeU'); await seg('Diagrama'); await js(`document.querySelector('main svg[role=img]')?.scrollIntoView({ block: 'center' })`); await shot('1c-cuentas-debito-diagrama')
      await seg('Semana'); await click('button', 'Quitar todo')
      // Abrir un movimiento y su editor de categoría
      await js(`(() => { const i = document.querySelector('main input[placeholder^="Buscar comercio"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Uber Eats'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
      await wait(300)
      await js(`document.querySelector('main section button[aria-label="Cambiar categoría"]')?.click()`)
      await wait(300); await click('[role=dialog] button', 'Nueva categoría'); await shot('1d-cambiar-categoria')
      await cerrar()
      // Clasificar y crear una categoría propia
      await click('main button', 'Clasificar'); await wait(200)
      if (!(await js(`!!document.querySelector('[role=dialog]')`))) await click('main section button', 'Categorías')
      await shot('1g-clasificar')
      await click('[role=dialog] [role=tab]', 'Categorías'); await click('[role=dialog] button', 'Nueva categoría')
      await js(`(() => { const i = document.querySelector('[role=dialog] input[aria-label="Nombre de la categoría"]'); if (!i) return; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Mascotas'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
      await js(`document.querySelector('[role=dialog] button[aria-label="Icono dog"]')?.click()`)
      await click('[role=dialog] button', 'Crear categoría'); await wait(300); await shot('1h-categorias')
      await click('[role=dialog] [role=tab]', 'Sin clasificar')
      await js(`(() => { const s = [...document.querySelectorAll('[role=dialog] select')].find(x => [...x.options].some(o => o.text === 'Mascotas')); if (!s) return; const o = [...s.options].find(o => o.text === 'Mascotas'); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
      await wait(400); await shot('1i-clasificado')
      const cats = await js(`JSON.stringify([...document.querySelectorAll('[role=dialog] select')].length)`)
      fs.writeFileSync(path.join(outDir, 'clasificar.txt'), cats)
      await click('[role=dialog] button', 'Listo')
      await js(`document.querySelector('main').scrollTop = 0`)
      await click('button[aria-pressed]', 'Mascotas'); await full('1j-cuentas-mascotas')
      await click('button', 'Quitar todo')
      await click('button', 'Estados de cuenta'); await shot('1e-estados')
      const esc = () => js(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
      await click('[role=dialog] button', 'Ver PDF'); await wait(1500); await shot('1j-visor-estado')
      await js(`[...document.querySelectorAll('[role=dialog]')].at(-1).querySelector('.overflow-auto').scrollTop = 1400`); await wait(800); await shot('1m-visor-scroll')
      await esc(); await wait(200)
      fs.writeFileSync(path.join(outDir, 'visor-cierra.txt'), await js(`String(document.querySelectorAll('[role=dialog]').length)`))
      await cerrar()
      await tab('Nómina'); await full('2-nomina')
      await click('main button', 'Cada concepto'); await wait(300)
      await js(`[...document.querySelectorAll('[role=dialog] tbody tr')].find(t => t.textContent.includes('Tiempo extra doble'))?.click()`)
      await shot('2b-nomina-conceptos')
      await cerrar()
      await click('main button', 'Ver recibos'); await wait(300)
      await js(`document.querySelector('[role=dialog] tbody tr').click()`); await shot('3-recibos')
      await click('[role=dialog] button', 'Ver PDF'); await wait(1500); await shot('3b-visor-recibo')
      await js(`document.querySelector('button[title^="Acercar"]')?.click()`); await js(`document.querySelector('button[title^="Acercar"]')?.click()`); await wait(900); await shot('3c-visor-zoom')
      await esc(); await wait(200)
      await click('[role=dialog] button', 'Ver XML'); await wait(800); await shot('3d-visor-xml'); await esc(); await wait(200)
      await cerrar()
      await js(`document.querySelector('main').scrollTop = 0`)
      await seg('Descuentos'); await shot('2c-nomina-descuentos')
      await seg('Por concepto'); await shot('2d-nomina-concepto')
      await click('main button', 'Ver semana por semana'); await shot('4-extra-modal'); await cerrar()
      await click('main button', 'Ver aportes y ciclos'); await shot('4b-ahorro-modal')
      await click('[role=dialog] [role=tab]', 'Saldo del fondo'); await shot('4c-ahorro-saldo'); await cerrar()
      // Del resumen a su detalle
      await tab('Resumen'); await click('main button', 'Fondo de ahorro'); await wait(600); await shot('5-ir-ahorro'); await cerrar()
      await tab('Resumen'); await js(`[...document.querySelectorAll('main section button')].find(b => b.textContent.includes('Comida a domicilio'))?.click()`); await wait(300); await shot('5b-ir-categoria')
      await tab('Resumen'); await js(`[...document.querySelectorAll('main section button')].find(b => b.textContent.includes('Débito LikeU'))?.click()`); await wait(300); await shot('5c-ir-cuenta')
      await js(`document.querySelector('button[aria-label^="Tus datos"]').click()`)
      await shot('6-datos')
      const info = await js(`document.querySelector('[role=dialog]')?.innerText`)
      fs.writeFileSync(path.join(outDir, 'datos.txt'), String(info))
      const sc = await js(`JSON.stringify([...document.querySelectorAll('.chart-scroll')].map(e => [e.scrollWidth, e.clientWidth, e.scrollLeft]))`)
      fs.writeFileSync(path.join(outDir, 'scroll.txt'), sc)
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
