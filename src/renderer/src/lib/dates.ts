const MESES: Record<string, number> = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12,
  JAN: 1, APR: 4, AUG: 8, DEC: 12
}

const pad = (n: number): string => String(n).padStart(2, '0')

export const toIso = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`

/** "07/Sep/2026" -> "2026-09-07" */
export function parseFechaRecibo(s: string): string | undefined {
  const m = s.trim().match(/^(\d{1,2})\/([A-Za-zÁÉÍÓÚáéíóú]{3})\w*\/(\d{4})/)
  if (!m) return undefined
  const mes = MESES[m[2].normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()]
  if (!mes) return undefined
  return toIso(Number(m[3]), mes, Number(m[1]))
}

/** Fecha local a partir de "YYYY-MM-DD" (sin desfase por zona horaria). */
export function fromIso(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function dateToIso(d: Date): string {
  return toIso(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

export function addDays(iso: string, days: number): string {
  const d = fromIso(iso)
  d.setDate(d.getDate() + days)
  return dateToIso(d)
}

export function diffDays(a: string, b: string): number {
  return Math.round((fromIso(b).getTime() - fromIso(a).getTime()) / 86400000)
}

/** Semana ISO 8601 (lunes a domingo) y su año. */
export function isoWeek(iso: string): { year: number; week: number } {
  const d = fromIso(iso)
  const day = (d.getDay() + 6) % 7 // lunes = 0
  d.setDate(d.getDate() - day + 3) // jueves de esa semana
  const year = d.getFullYear()
  const firstThu = new Date(year, 0, 4)
  const firstDay = (firstThu.getDay() + 6) % 7
  firstThu.setDate(firstThu.getDate() - firstDay + 3)
  const week = 1 + Math.round((d.getTime() - firstThu.getTime()) / (7 * 86400000))
  return { year, week }
}

/** Lunes de la semana ISO dada. */
export function mondayOfIsoWeek(year: number, week: number): string {
  const jan4 = new Date(year, 0, 4)
  const day = (jan4.getDay() + 6) % 7
  jan4.setDate(jan4.getDate() - day + (week - 1) * 7)
  return dateToIso(jan4)
}

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MES_LARGO = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
]

export function fmtFecha(iso: string, conAnio = true): string {
  if (!iso) return '—'
  const d = fromIso(iso)
  return `${pad(d.getDate())} ${MES_CORTO[d.getMonth()]}${conAnio ? ' ' + d.getFullYear() : ''}`
}

export function fmtRango(a: string, b: string): string {
  if (!a || !b) return '—'
  if (a === b) return fmtFecha(a)
  const da = fromIso(a)
  const db = fromIso(b)
  if (da.getFullYear() === db.getFullYear()) return `${fmtFecha(a, false)} – ${fmtFecha(b)}`
  return `${fmtFecha(a)} – ${fmtFecha(b)}`
}

export function fmtMes(key: string, largo = false): string {
  const [y, m] = key.split('-').map(Number)
  return `${(largo ? MES_LARGO : MES_CORTO)[m - 1]} ${y}`
}
