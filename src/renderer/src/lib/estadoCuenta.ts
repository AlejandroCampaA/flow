/**
 * Estados de cuenta bancarios (Santander México).
 *
 * Los PDF de Santander no traen texto: cada palabra viene dibujada como imagen, así que se leen con OCR.
 * Este módulo recibe las palabras reconocidas (con su posición en puntos PDF, origen arriba-izquierda)
 * y arma los movimientos. Como el OCR puede equivocarse en un dígito, cada fila se valida con la
 * cadena de saldos (saldo anterior ± importe = saldo) y con los totales impresos del estado.
 */
import { toIso } from './dates'

export interface PalabraOcr {
  t: string
  x0: number
  y0: number
  x1: number
  y1: number
  /** Confianza 0–100 (100 si el texto venía en el PDF). */
  c: number
}

export interface PaginaOcr {
  page: number
  width: number
  height: number
  words: PalabraOcr[]
}

export type Verificacion = 'ok' | 'corregido' | 'inferido' | 'dudoso'

export interface Movimiento {
  id: string
  cuenta: string
  fecha: string
  folio: string
  /** Primera línea de la descripción. */
  descripcion: string
  /** Líneas siguientes (comercio, datos SPEI, etc.). */
  detalle: string[]
  tipo: 'abono' | 'cargo'
  monto: number
  saldo: number
  verificacion: Verificacion
  nota?: string
}

export interface EstadoCuenta {
  /** `${cuenta}|${periodoInicio}` */
  id: string
  banco: 'Santander'
  cuenta: string
  producto: string
  clabe?: string
  titular?: string
  periodoInicio: string
  periodoFin: string
  saldoInicial: number
  saldoFinal: number
  totalDepositos: number
  totalRetiros: number
  movimientos: Movimiento[]
  cuadre: { ok: boolean; avisos: string[] }
  archivo: string
  copia?: string
  importadoEn?: string
  /** 'ocr' cuando el PDF venía como imágenes. */
  lectura: 'ocr' | 'texto'
}

// ---------------------------------------------------------------------------
// Utilidades de texto

const r2 = (n: number): number => Math.round(n * 100) / 100
const eq = (a: number, b: number): boolean => Math.abs(a - b) < 0.005

const sinAcentos = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = (s: string): string => sinAcentos(s).toUpperCase()

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']

function distancia(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[a.length][b.length]
}

/** Mes de 3 letras con errores típicos de OCR ("0CT", "O0CT", "N0V"). */
function mesOcr(raw: string): number | undefined {
  const letras = raw
    .toUpperCase()
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/5/g, 'S')
    .replace(/8/g, 'B')
    .replace(/6/g, 'G')
    .replace(/[^A-Z]/g, '')
  const cands = [letras, letras.replace(/(.)\1/g, '$1')]
  let mejor: { m: number; d: number } | undefined
  for (const c of cands)
    for (let i = 0; i < 12; i++) {
      const d = distancia(c, MESES[i])
      if (!mejor || d < mejor.d) mejor = { m: i + 1, d }
    }
  return mejor && mejor.d <= 1 ? mejor.m : undefined
}

const digitos = (s: string): string => s.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/\D/g, '')

/** "01-OCT-2026" (con ruido de OCR) → ISO. */
export function fechaOcr(s: string): string | undefined {
  const m = s.match(/([0-9OoIl]{1,2})\s*[-–.]\s*([A-Za-z0-9]{3,5})\s*[-–.]\s*([0-9OoIl]{4})/)
  if (!m) return undefined
  const d = Number(digitos(m[1]))
  const mes = mesOcr(m[2])
  const y = Number(digitos(m[3]))
  if (!mes || d < 1 || d > 31 || y < 2000 || y > 2100) return undefined
  return toIso(y, mes, d)
}

/** Importe "$1,234.56" (tolerante a "1.234,56" mal leídos: el último separador es el decimal). */
export function importe(s: string): number | undefined {
  const t = s.replace(/[Oo]/g, '0').replace(/[^0-9.,]/g, '')
  if (!/\d[.,]\d{2}$/.test(t)) return undefined
  const ent = t.slice(0, -3).replace(/[.,]/g, '')
  if (!/^\d+$/.test(ent)) return undefined
  return Number(`${ent}.${t.slice(-2)}`)
}

const esImporte = (s: string): boolean => /^\$?[0-9Oo]{1,3}([.,][0-9Oo]{3})*[.,][0-9Oo]{2}$/.test(s.replace(/[^0-9Oo$.,]/g, '')) && /\d/.test(s)

// ---------------------------------------------------------------------------
// Filas

interface Fila {
  y: number
  w: PalabraOcr[]
  texto: string
  n: string
}

function filas(p: PaginaOcr): Fila[] {
  const ws = p.words.filter((w) => w.t.trim()).sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2)
  const out: { y: number; w: PalabraOcr[] }[] = []
  for (const w of ws) {
    const yc = (w.y0 + w.y1) / 2
    const f = out[out.length - 1]
    if (f && Math.abs(yc - f.y) < 3.5) {
      f.w.push(w)
      f.y = (f.y * (f.w.length - 1) + yc) / f.w.length
    } else out.push({ y: yc, w: [w] })
  }
  return out.map((f) => {
    f.w.sort((a, b) => a.x0 - b.x0)
    const texto = f.w.map((w) => w.t).join(' ')
    return { ...f, texto, n: norm(texto) }
  })
}

const RE_CUENTA = /\b(\d{2})-(\d{8})-(\d)\b/

function nombreProducto(raw: string): string {
  const n = norm(raw).trim()
  if (/SUPER\s*NOMINA/.test(n)) return 'Súper Nómina'
  if (/LIKEU/.test(n)) return 'Débito LikeU'
  if (/DINERO CRECIENTE/.test(n)) return 'Dinero Creciente'
  return n
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

/** Primer importe a la derecha de la palabra que cumpla `label`. */
function importeTras(f: Fila, label: RegExp): number | undefined {
  const i = f.w.findIndex((w) => label.test(norm(w.t)))
  if (i < 0) return undefined
  for (const w of f.w.slice(i + 1)) {
    const v = esImporte(w.t) ? importe(w.t) : undefined
    if (v != null) return v
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Parser

interface Columnas {
  folioX: number
  descX: number
  depX0: number
  centros: { dep: number; ret: number; sal: number }
}

interface MovCrudo {
  fecha?: string
  fechaTxt: string
  folio: string
  desc: string
  detalle: string[]
  dep?: number
  ret?: number
  saldo?: number
}

interface Seccion {
  cuenta: string
  producto: string
  saldoAnterior?: number
  totalDep?: number
  totalRet?: number
  saldoFinal?: number
  movs: MovCrudo[]
}

interface Resumen {
  cuenta?: string
  clabe?: string
  saldoInicial?: number
  depositos?: number
  retiros?: number
  saldoFinal?: number
}

export class ErrorEstado extends Error {}

/** ¿Las palabras de la página 1 parecen un estado de cuenta? */
export function pareceEstadoCuenta(p: PaginaOcr): boolean {
  const t = norm(p.words.map((w) => w.t).join(' '))
  return /ESTADO DE CUENTA/.test(t) && /(PERIODO|SALDO|CUENTA)/.test(t)
}

/** ¿Ya no hay movimientos a partir de esta página? (para dejar de hacer OCR) */
export function esPaginaFinal(p: PaginaOcr): boolean {
  const t = norm(p.words.map((w) => w.t).join(' '))
  return /SIGNIFICADO DE ABREVIATURAS|MENSAJES IMPORTANTES/.test(t)
}

export function parseEstadoCuenta(paginas: PaginaOcr[], archivo: string, lectura: 'ocr' | 'texto' = 'ocr'): EstadoCuenta[] {
  let titular: string | undefined
  let periodo: { ini: string; fin: string } | undefined
  const resumen: Resumen = {}
  const secciones: Seccion[] = []

  let cuentaPendiente: { cuenta: string; producto: string } | undefined
  let saldoAntPendiente: number | undefined
  let sec: Seccion | undefined
  let cols: Columnas | undefined

  for (const p of paginas) {
    const fs = filas(p)
    let tabla = false
    for (const f of fs) {
      // Pie de página (micro texto y número de página)
      if (f.y > p.height - 40) continue

      // --- Datos generales -------------------------------------------------
      if (!titular && /CODIGO/.test(f.n) && /CLIENTE/.test(f.n)) {
        const cod = f.w.find((w) => /CODIGO/.test(norm(w.t)))
        const nom = f.w.filter((w) => cod && w.x1 < cod.x0 - 15 && /^[A-ZÁÉÍÓÚÑ]+$/.test(w.t))
        if (nom.length >= 2) titular = nom.map((w) => w.t).join(' ')
      }
      if (!periodo && /PERIODO/.test(f.n)) {
        const fechas = [...f.texto.matchAll(/[0-9OoIl]{1,2}\s*-\s*[A-Za-z0-9]{3,5}\s*-\s*[0-9OoIl]{4}/g)].map((m) => fechaOcr(m[0]))
        if (fechas.length >= 2 && fechas[0] && fechas[1]) periodo = { ini: fechas[0], fin: fechas[1] }
      }
      if (/CLABE/.test(f.n)) {
        const m = f.texto.match(RE_CUENTA)
        const clabe = f.texto.replace(/\s/g, '').match(/\d{18}/)
        if (m && !resumen.cuenta) {
          resumen.cuenta = m[0]
          if (clabe) resumen.clabe = clabe[0]
        }
      }
      if (!tabla && resumen.cuenta && p.page === 1) {
        if (/SALDO INICIAL/.test(f.n) && resumen.saldoInicial == null) resumen.saldoInicial = importeTras(f, /INICIAL/)
        if (/DEPOSITOS/.test(f.n) && resumen.depositos == null) resumen.depositos = importeTras(f, /DEPOSITOS/)
        if (/RETIROS/.test(f.n) && !/EFECTIVO/.test(f.n) && resumen.retiros == null) resumen.retiros = importeTras(f, /RETIROS/)
        if (/SALDO FINAL/.test(f.n) && resumen.saldoFinal == null) resumen.saldoFinal = importeTras(f, /FINAL/)
      }

      // --- Encabezado de cuenta (antes de la tabla) --------------------------
      const mc = f.texto.match(RE_CUENTA)
      if (mc && !/CLABE|NUMERO DE CUENTA|NO\. DE CUENTA/.test(f.n)) {
        const antes = f.texto.slice(0, mc.index).trim()
        if (/[A-Z]{4,}/.test(norm(antes)) && antes.length < 60 && !/\d[.,]\d{2}/.test(antes)) {
          cuentaPendiente = { cuenta: mc[0], producto: nombreProducto(antes) }
        }
      }
      if (/SALDO FINAL DEL PERIODO ANTERIOR/.test(f.n)) {
        saldoAntPendiente = importeTras(f, /ANTERIOR/)
        continue
      }

      // --- Encabezado de la tabla --------------------------------------------
      const hdr = (re: RegExp): PalabraOcr | undefined => f.w.find((w) => re.test(norm(w.t)))
      const hFecha = hdr(/^FECHA$/)
      const hFolio = hdr(/^FOLIO$/)
      const hDesc = hdr(/^DESCRIPCION$/)
      const hDep = hdr(/^DEPOSITOS?$/)
      const hRet = hdr(/^RETIROS?$/)
      const hSal = hdr(/^SALDO$/)
      if ((hFecha || hFolio) && hSal && (hDep || hRet)) {
        const c = (w: PalabraOcr): number => (w.x0 + w.x1) / 2
        const dep = hDep ? c(hDep) : c(hRet!) - 70
        const ret = hRet ? c(hRet) : c(hDep!) + 70
        cols = {
          folioX: hFolio ? hFolio.x0 - 6 : 78,
          descX: hDesc ? hDesc.x0 - 6 : 110,
          depX0: hDep ? hDep.x0 : dep - 18,
          centros: { dep, ret, sal: c(hSal) }
        }
        tabla = true
        if (!sec) {
          const cp = cuentaPendiente ?? { cuenta: resumen.cuenta ?? 'desconocida', producto: 'Cuenta' }
          sec = { cuenta: cp.cuenta, producto: cp.producto, saldoAnterior: saldoAntPendiente, movs: [] }
          secciones.push(sec)
          saldoAntPendiente = undefined
        }
        continue
      }
      if (!tabla || !sec || !cols) continue

      // --- Dentro de la tabla ------------------------------------------------
      if (/SALDO FINAL DEL PERIODO/.test(f.n)) {
        sec.saldoFinal = importeTras(f, /PERIODO/)
        sec = undefined
        tabla = false
        continue
      }
      if (/SIGNIFICADO DE ABREVIATURAS|DETALLES? DE MOVIMIENTOS/.test(f.n)) {
        tabla = false
        continue
      }

      const montos: { col: 'dep' | 'ret' | 'sal'; v: number }[] = []
      const desc: PalabraOcr[] = []
      const izq: PalabraOcr[] = []
      for (const w of f.w) {
        const cx = (w.x0 + w.x1) / 2
        if (cx > cols.depX0 - 10 && esImporte(w.t)) {
          const v = importe(w.t)
          if (v == null) continue
          const { dep, ret, sal } = cols.centros
          const d = { dep: Math.abs(cx - dep), ret: Math.abs(cx - ret), sal: Math.abs(cx - sal) }
          const col = (Object.keys(d) as ('dep' | 'ret' | 'sal')[]).sort((a, b) => d[a] - d[b])[0]
          montos.push({ col, v })
        } else if (w.x0 >= cols.descX - 4 && cx < cols.depX0 - 10) desc.push(w)
        else if (w.x1 <= cols.descX + 2) izq.push(w)
      }
      // Sin basura de OCR al inicio ("¡CARGO", "|CONSUMO", "[ABONO").
      const descTxt = desc
        .map((w) => w.t)
        .join(' ')
        .replace(/^[^A-Za-z0-9(*$]+/, '')
        .trim()

      if (/^TOTAL\b/.test(norm(descTxt)) && !izq.length) {
        sec.totalDep = montos.find((m) => m.col === 'dep')?.v
        sec.totalRet = montos.find((m) => m.col === 'ret')?.v
        continue
      }

      const fechaTxt = izq.filter((w) => w.x1 <= cols!.folioX + 4).map((w) => w.t).join('')
      const folioTxt = izq.filter((w) => w.x1 > cols!.folioX + 4).map((w) => w.t).join('')
      const fecha = fechaOcr(fechaTxt) ?? fechaOcr(izq.map((w) => w.t).join(' '))
      const tieneMov = montos.some((m) => m.col !== 'sal') || (montos.length > 0 && (fecha || folioTxt))
      if (fecha || (tieneMov && (folioTxt || fechaTxt))) {
        sec.movs.push({
          fecha,
          fechaTxt,
          folio: digitos(folioTxt).slice(-7),
          desc: descTxt,
          detalle: [],
          dep: montos.find((m) => m.col === 'dep')?.v,
          ret: montos.find((m) => m.col === 'ret')?.v,
          saldo: montos.find((m) => m.col === 'sal')?.v
        })
      } else if (sec.movs.length && descTxt) {
        sec.movs[sec.movs.length - 1].detalle.push(descTxt)
      }
    }
  }

  if (!periodo) throw new ErrorEstado('No se encontró el periodo del estado de cuenta.')
  const conMovs = secciones.filter((s) => s.movs.length)
  if (!conMovs.length) throw new ErrorEstado('No se encontraron movimientos en el estado de cuenta.')

  return conMovs.map((s) => armar(s, periodo!, resumen, titular, archivo, lectura))
}

/** Valida la cadena de saldos y corrige lo que el OCR haya leído mal. */
function armar(
  s: Seccion,
  periodo: { ini: string; fin: string },
  resumen: Resumen,
  titular: string | undefined,
  archivo: string,
  lectura: 'ocr' | 'texto'
): EstadoCuenta {
  const avisos: string[] = []
  const res = resumen.cuenta === s.cuenta ? resumen : {}

  type M = { c: MovCrudo; tipo?: 'abono' | 'cargo'; monto?: number; saldo?: number; verif: Verificacion; nota?: string }
  const ms: M[] = s.movs.map((c) => {
    const tipo = c.dep != null && c.ret == null ? 'abono' : c.ret != null && c.dep == null ? 'cargo' : undefined
    return { c, tipo, monto: tipo === 'abono' ? c.dep : tipo === 'cargo' ? c.ret : undefined, saldo: c.saldo, verif: 'ok' as Verificacion }
  })
  const signo = (m: { tipo?: 'abono' | 'cargo' }): number => (m.tipo === 'cargo' ? -1 : 1)

  // Saldo inicial: el impreso arriba de la tabla, el del resumen, o deducido de la primera fila.
  let inicial = s.saldoAnterior ?? res.saldoInicial
  if (inicial == null) {
    const m0 = ms[0]
    if (m0.saldo != null && m0.monto != null) inicial = r2(m0.saldo - signo(m0) * m0.monto)
  }
  if (inicial == null) {
    inicial = 0
    avisos.push('No se pudo leer el saldo inicial.')
  }

  const cuadraCon = (base: number, m: M | undefined): boolean =>
    !m || m.saldo == null || m.monto == null || m.tipo == null || eq(base + signo(m) * m.monto, m.saldo)

  let prev = inicial
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i]
    const sig = ms[i + 1]
    if (m.tipo && m.monto != null && m.saldo != null) {
      if (eq(prev + signo(m) * m.monto, m.saldo)) {
        prev = m.saldo
        continue
      }
      if (eq(prev - signo(m) * m.monto, m.saldo)) {
        m.tipo = m.tipo === 'abono' ? 'cargo' : 'abono'
        m.verif = 'corregido'
        m.nota = 'Columna corregida con el saldo.'
        prev = m.saldo
        continue
      }
      // ¿Qué se leyó mal, el importe o el saldo? Decide la fila siguiente.
      const saldoAlt = r2(prev + signo(m) * m.monto)
      const montoAlt = r2(Math.abs(m.saldo - prev))
      const okSaldoAlt = sig ? cuadraCon(saldoAlt, sig) && !cuadraCon(m.saldo, sig) : s.saldoFinal != null && eq(saldoAlt, s.saldoFinal)
      if (okSaldoAlt) {
        m.nota = `Saldo leído ${m.saldo.toFixed(2)}, corregido con el importe.`
        m.saldo = saldoAlt
        m.verif = 'corregido'
      } else {
        m.nota = `Importe leído ${m.monto.toFixed(2)}, corregido con el saldo.`
        m.monto = montoAlt
        m.tipo = m.saldo >= prev ? 'abono' : 'cargo'
        m.verif = sig && !cuadraCon(m.saldo, sig) ? 'dudoso' : 'corregido'
      }
      prev = m.saldo!
      continue
    }
    if (m.monto != null && m.tipo && m.saldo == null) {
      m.saldo = r2(prev + signo(m) * m.monto)
      m.verif = 'inferido'
      m.nota = 'Saldo no legible; calculado.'
      prev = m.saldo
      continue
    }
    if (m.saldo != null && (m.monto == null || !m.tipo)) {
      const d = r2(m.saldo - prev)
      m.monto = Math.abs(d)
      m.tipo = d >= 0 ? 'abono' : 'cargo'
      m.verif = 'inferido'
      m.nota = 'Importe no legible; calculado con el saldo.'
      prev = m.saldo
      continue
    }
    m.verif = 'dudoso'
    m.monto = m.monto ?? 0
    m.tipo = m.tipo ?? 'cargo'
    m.saldo = prev
    m.nota = 'No se pudo leer el importe ni el saldo.'
  }

  // Fechas: dentro del periodo; si no se leyó, la de la fila anterior.
  let ultFecha = periodo.ini
  const movimientos: Movimiento[] = []
  const usados = new Map<string, number>()
  for (const m of ms) {
    let fecha = m.c.fecha
    if (!fecha || fecha < periodo.ini || fecha > periodo.fin) {
      if (m.c.fechaTxt || !fecha) m.nota = [m.nota, `Fecha "${m.c.fechaTxt || '?'}" ajustada.`].filter(Boolean).join(' ')
      fecha = ultFecha
    }
    ultFecha = fecha
    const base = `${s.cuenta}|${fecha}|${m.c.folio}|${m.tipo}|${m.monto!.toFixed(2)}`
    const n = usados.get(base) ?? 0
    usados.set(base, n + 1)
    movimientos.push({
      id: n ? `${base}|${n}` : base,
      cuenta: s.cuenta,
      fecha,
      folio: m.c.folio,
      descripcion: m.c.desc,
      detalle: m.c.detalle,
      tipo: m.tipo!,
      monto: r2(m.monto!),
      saldo: r2(m.saldo!),
      verificacion: m.verif,
      nota: m.nota
    })
  }

  const totalDepositos = r2(movimientos.filter((m) => m.tipo === 'abono').reduce((a, m) => a + m.monto, 0))
  const totalRetiros = r2(movimientos.filter((m) => m.tipo === 'cargo').reduce((a, m) => a + m.monto, 0))
  const saldoFinal = movimientos[movimientos.length - 1].saldo

  const impDep = s.totalDep ?? res.depositos
  const impRet = s.totalRet ?? res.retiros
  const impFin = s.saldoFinal ?? res.saldoFinal
  if (impDep != null && !eq(impDep, totalDepositos)) avisos.push(`Depósitos: el estado dice ${impDep.toFixed(2)}, se leyeron ${totalDepositos.toFixed(2)}.`)
  if (impRet != null && !eq(impRet, totalRetiros)) avisos.push(`Retiros: el estado dice ${impRet.toFixed(2)}, se leyeron ${totalRetiros.toFixed(2)}.`)
  if (impFin != null && !eq(impFin, saldoFinal)) avisos.push(`Saldo final: el estado dice ${impFin.toFixed(2)}, se calculó ${saldoFinal.toFixed(2)}.`)
  if (impDep == null && impRet == null && impFin == null) avisos.push('No se encontraron los totales impresos para comparar.')
  const dudosos = movimientos.filter((m) => m.verificacion === 'dudoso').length
  if (dudosos) avisos.push(`${dudosos} movimiento(s) con lectura dudosa.`)

  return {
    id: `${s.cuenta}|${periodo.ini}`,
    banco: 'Santander',
    cuenta: s.cuenta,
    producto: s.producto,
    clabe: res.clabe,
    titular,
    periodoInicio: periodo.ini,
    periodoFin: periodo.fin,
    saldoInicial: r2(inicial),
    saldoFinal,
    totalDepositos,
    totalRetiros,
    movimientos,
    cuadre: { ok: !avisos.length, avisos },
    archivo,
    lectura
  }
}
