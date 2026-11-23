const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 })
const MXN0 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const NUM = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 })

export const fmtMoney = (n: number): string => MXN.format(n || 0)
export const fmtMoney0 = (n: number): string => MXN0.format(n || 0)
export const fmtNum = (n: number): string => NUM.format(n || 0)
export const fmtHoras = (n: number): string => `${NUM.format(n || 0)} h`
export const fmtPct = (n: number, d = 1): string => `${((n || 0) * 100).toFixed(d)}%`

/** Ejes: completo bajo 10,000; compacto arriba ($12K, $1.2M). */
export function fmtEje(n: number, max: number): string {
  if (max < 10000 || n === 0) return MXN0.format(n)
  if (Math.abs(n) >= 1_000_000) return `$${NUM.format(n / 1_000_000)}M`
  return `$${NUM.format(n / 1000)}K`
}

/** Valores grandes en tarjetas: compacto sólo arriba de 100K. */
export function fmtCompacto(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 100_000) return `$${(n / 1000).toFixed(1)}K`
  return MXN.format(n)
}
