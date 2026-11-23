import { parseFechaRecibo } from './dates'
import type { AhorroAcumulado, ParsedDoc, RawLinea } from './types'

/** Fragmento de texto del PDF con su posición (origen abajo-izquierda, como pdf.js). */
export interface TextItem {
  s: string
  x: number
  y: number
  w: number
}

const norm = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

const MONEY_RE = /^-?\$\s?-?[\d,]+(\.\d+)?$/
const NUM_RE = /^-?\d+(\.\d+)?$/
const DATE_RE = /^\d{1,2}\/[A-Za-z]{3}\/\d{4}$/
const UUID_RE = /[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i

export const money = (s: string): number => {
  const n = Number(s.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

const isMoney = (i: TextItem): boolean => MONEY_RE.test(i.s.trim())
const isNum = (i: TextItem): boolean => NUM_RE.test(i.s.trim())
const center = (i: TextItem): number => i.x + i.w / 2

export class PdfFormatoError extends Error {}

export function parsePdfItems(raw: TextItem[], archivo: string): ParsedDoc {
  const items = raw.filter((i) => i.s.trim() !== '').map((i) => ({ ...i, s: i.s.trim() }))

  const find = (re: RegExp, from?: (i: TextItem) => boolean): TextItem | undefined =>
    items.find((i) => re.test(norm(i.s)) && (!from || from(i)))

  /** Valor bajo una etiqueta de encabezado (columna más cercana). */
  const below = (label: TextItem | undefined, accept: (i: TextItem) => boolean = () => true, maxDy = 20) => {
    if (!label) return undefined
    const c = center(label)
    return items
      .filter((i) => i !== label && i.y < label.y - 2 && i.y > label.y - maxDy && accept(i))
      .sort((a, b) => Math.abs(center(a) - c) - Math.abs(center(b) - c))[0]
  }
  /** Valor monetario a la derecha de una etiqueta, en el mismo renglón. */
  const sameRowMoney = (label: TextItem | undefined): number | undefined => {
    if (!label) return undefined
    const v = items
      .filter((i) => i !== label && Math.abs(i.y - label.y) <= 3 && i.x > label.x && isMoney(i))
      .sort((a, b) => a.x - b.x)
    return v.length ? money(v[v.length - 1].s) : undefined
  }

  // --- Identificación ---------------------------------------------------------
  const uuidItem = items.find((i) => UUID_RE.test(i.s))
  const uuid = uuidItem?.s.match(UUID_RE)?.[0].toUpperCase()
  if (!uuid || !find(/^PERCEPCIONES$/) || !find(/^DEDUCCIONES$/)) {
    throw new PdfFormatoError('El PDF no parece un recibo de nómina (no se encontró folio fiscal o tablas).')
  }

  const lblEmision = find(/^FECHA Y HORA DE EMISION/)
  const emisionItem = lblEmision
    ? items.find((i) => Math.abs(i.y - lblEmision.y) <= 3 && i.x > lblEmision.x && /\d{2}\/\w{3}\/\d{4}/.test(i.s))
    : undefined
  const fechaEmision = emisionItem ? parseFechaRecibo(emisionItem.s) : undefined

  // --- Encabezado del empleado -----------------------------------------------
  const txt = (i?: TextItem): string | undefined => i?.s
  const semanaTxt = txt(below(find(/^SEMANA NUMERO$/), isNum))
  const salarioTxt = txt(below(find(/^SALARIO DIARIO$/), isMoney))

  const lblPeriodo = find(/^PERIODO DE PAGO$/)
  const fechasPeriodo = lblPeriodo
    ? items
        .filter((i) => DATE_RE.test(i.s) && i.y < lblPeriodo.y && i.y > lblPeriodo.y - 18)
        .sort((a, b) => a.x - b.x)
    : []

  // Renglón de horas: Horas normal | Hrs ext dobles | Hrs ext triples | Días aguinaldo | Días vacaciones | Días pagados
  const lblHoras = find(/^HORAS$/)
  const horasVals = lblHoras
    ? items.filter((i) => isNum(i) && Math.abs(i.y - (lblHoras.y - 4)) <= 3).sort((a, b) => a.x - b.x)
    : []
  const hv = horasVals.length === 6 ? horasVals.map((i) => Number(i.s)) : undefined

  // --- Tablas de percepciones / deducciones ------------------------------------
  const headers = items.filter((i) => norm(i.s) === 'CLV. SAT').sort((a, b) => a.x - b.x)
  const lblTotPer = find(/^TOTAL PERCEPCIONES$/)
  const percepciones: RawLinea[] = []
  const deducciones: RawLinea[] = []
  const otrosPagos: RawLinea[] = []

  if (headers.length >= 2 && lblTotPer) {
    const top = headers[0].y - 3
    const bottom = lblTotPer.y + 3
    const split = headers[1].x - 4
    const zona = items.filter((i) => i.y < top && i.y > bottom)
    const ys = [...new Set(zona.map((i) => Math.round(i.y)))].sort((a, b) => b - a)
    const rows: TextItem[][] = []
    for (const y of ys) {
      const prev = rows[rows.length - 1]
      const row = zona.filter((i) => Math.round(i.y) === y)
      if (prev && Math.abs(prev[0].y - y) <= 2) prev.push(...row)
      else rows.push(row)
    }

    for (const row of rows) {
      const left = row.filter((i) => i.x < split).sort((a, b) => a.x - b.x)
      const right = row.filter((i) => i.x >= split).sort((a, b) => a.x - b.x)

      // Lado izquierdo: percepciones
      const lm = left.filter(isMoney)
      const lText = left.filter((i) => !isMoney(i) && !/^\d+$/.test(i.s))
      if (lm.length && lText.length) {
        const clave = left.find((i) => /^\d{1,3}$/.test(i.s) && i.x < headers[0].x + 30)?.s.padStart(3, '0')
        const concepto = lText.map((i) => i.s).join(' ')
        const vals = lm.map((i) => money(i.s))
        const linea: RawLinea =
          vals.length >= 3
            ? { tipoSat: clave, concepto, exento: vals[vals.length - 3], gravado: vals[vals.length - 2], importe: vals[vals.length - 1] }
            : { tipoSat: clave, concepto, exento: 0, gravado: 0, importe: vals[vals.length - 1] }
        if (/SUBSIDIO/.test(norm(concepto))) otrosPagos.push(linea)
        else percepciones.push(linea)
      }

      // Lado derecho: deducciones
      const rm = right.filter(isMoney)
      const rText = right.filter((i) => !isMoney(i) && !/^\d+$/.test(i.s))
      if (rm.length && rText.length) {
        const clave = right.find((i) => /^\d{1,3}$/.test(i.s) && i.x < headers[1].x + 30)?.s.padStart(3, '0')
        deducciones.push({
          tipoSat: clave,
          concepto: rText.map((i) => i.s).join(' '),
          exento: 0,
          gravado: 0,
          importe: money(rm[rm.length - 1].s)
        })
      }
    }
  }

  // --- Totales ----------------------------------------------------------------
  const totalesDoc = {
    percepciones: sameRowMoney(lblTotPer),
    isr: sameRowMoney(find(/^ISR$/)),
    deducciones: sameRowMoney(find(/^TOTAL DEDUCCIONES$/)),
    total: sameRowMoney(find(/^TOTAL$/)),
    despensa: sameRowMoney(find(/^TOTAL DESPENSA$/)),
    neto: sameRowMoney(find(/^TOTAL NETO$/))
  }

  // --- Fondo de ahorro --------------------------------------------------------
  const lblAhorro = find(/^APORT\. FONDO EMPLEADO$/)
  let ahorroAcumulado: AhorroAcumulado | undefined
  if (lblAhorro) {
    const vals = items
      .filter((i) => isMoney(i) && i.y < lblAhorro.y - 4 && i.y > lblAhorro.y - 26)
      .sort((a, b) => a.x - b.x)
      .map((i) => money(i.s))
    if (vals.length === 6) {
      const [empleado, empresa, acumulado, prestamo, totalAbonado, saldo] = vals
      ahorroAcumulado = { empleado, empresa, acumulado, prestamo, totalAbonado, saldo }
    }
  }

  // --- Datos del empleado (informativos) --------------------------------------
  const nombre = txt(below(find(/^NOMBRE$/), (i) => /[A-Z]{3,} [A-Z]{3,}/.test(i.s)))
  const puestoDepto = txt(below(find(/^DEPTO$/)))

  return {
    fuente: 'pdf',
    archivo,
    uuid,
    importadoEn: new Date().toISOString(),
    fechaEmision,
    fechaPago: fechaEmision,
    periodoInicio: fechasPeriodo[0] ? parseFechaRecibo(fechasPeriodo[0].s) : undefined,
    periodoFin: fechasPeriodo[1] ? parseFechaRecibo(fechasPeriodo[1].s) : fechasPeriodo[0] ? parseFechaRecibo(fechasPeriodo[0].s) : undefined,
    semana: semanaTxt ? Number(semanaTxt) : undefined,
    salarioDiario: salarioTxt ? money(salarioTxt) : undefined,
    diasPagados: hv?.[5],
    horas: hv
      ? { normales: hv[0], dobles: hv[1], triples: hv[2], diasAguinaldo: hv[3], diasVacaciones: hv[4] }
      : undefined,
    percepciones,
    deducciones,
    otrosPagos,
    totalesDoc,
    ahorroAcumulado,
    empleado: { nombre, depto: puestoDepto }
  }
}
