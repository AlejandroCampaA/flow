import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, CreditCard, Landmark } from 'lucide-react'
import { useStore } from '../store'
import { saldosAlCorte } from '../lib/gastos'
import { fmtMoney } from '../lib/format'

/**
 * Filtro global de cuentas: una lista desplegable con casillas. Lo que elijas cambia todo
 * (indicadores, gráficas, tablas) en el Resumen y en Cuentas, sin importar cuántas cuentas tengas.
 */
export default function FiltroCuentas({ alinear = 'right' }: { alinear?: 'left' | 'right' }): JSX.Element | null {
  const { bancoTodo, cuentasSel, setCuentasSel, filtros } = useStore()
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const cuentas = bancoTodo.cuentas
  const saldos = useMemo(() => new Map(saldosAlCorte(bancoTodo, filtros.hasta).saldos.map((x) => [x.c.cuenta, x.s])), [bancoTodo, filtros.hasta])

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent): void => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false)
    }
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setAbierto(false)
    }
    window.addEventListener('mousedown', fuera)
    window.addEventListener('keydown', tecla)
    return () => {
      window.removeEventListener('mousedown', fuera)
      window.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  if (cuentas.length < 2) return null
  const todas = cuentasSel.length === 0
  const marcadas = todas ? cuentas.map((c) => c.cuenta) : cuentasSel
  const etiqueta = todas ? 'Todas las cuentas' : cuentasSel.length === 1 ? (cuentas.find((c) => c.cuenta === cuentasSel[0])?.producto ?? '1 cuenta') : `${cuentasSel.length} de ${cuentas.length} cuentas`

  const alternar = (id: string): void => {
    const sig = marcadas.includes(id) ? marcadas.filter((x) => x !== id) : [...marcadas, id]
    // Siempre queda al menos una: si quitas la última se vuelve a ver todo.
    setCuentasSel(sig)
  }

  return (
    <div ref={caja} className="relative">
      <button
        onClick={() => setAbierto((x) => !x)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        title="Elige qué cuentas ver: cambia todos los indicadores y gráficas"
        className={`inline-flex h-8 items-center gap-2 rounded-lg border pl-3 pr-2 text-[13px] transition ${
          todas ? 'border-outline/70 text-ink2 hover:bg-raised' : 'border-transparent bg-accentc text-onaccentc'
        }`}
      >
        <Landmark size={14} />
        {etiqueta}
        <ChevronDown size={15} className={`transition ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <div
          role="listbox"
          aria-multiselectable
          className={`absolute top-full z-50 mt-1 w-[330px] max-w-[92vw] overflow-hidden rounded-2xl bg-surface shadow-pop ring-1 ring-line ${alinear === 'right' ? 'right-0' : 'left-0'}`}
        >
          <label className="flex cursor-pointer items-center gap-3 border-b border-line px-4 py-2.5 text-[13.5px] font-medium text-ink transition hover:bg-raised/70">
            <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={todas} onChange={() => setCuentasSel([])} />
            Todas las cuentas
            <span className="ml-auto text-[12px] font-normal text-muted">{cuentas.length}</span>
          </label>
          <ul className="max-h-[300px] overflow-y-auto py-1">
            {cuentas.map((c) => {
              const on = marcadas.includes(c.cuenta)
              const s = saldos.get(c.cuenta)
              return (
                <li key={c.cuenta} className="group flex items-center transition hover:bg-raised/70">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-4 py-2">
                    <input type="checkbox" className="h-4 w-4 shrink-0 accent-[rgb(var(--accent))]" checked={on} onChange={() => alternar(c.cuenta)} />
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-raised text-ink2">{c.recibeNomina ? <Landmark size={14} /> : <CreditCard size={14} />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-ink">{c.producto}</span>
                      <span className="block truncate text-[11.5px] text-muted">{c.corto}</span>
                    </span>
                    <span className="cifra text-[12.5px] text-ink2">{s == null ? '—' : fmtMoney(s)}</span>
                  </label>
                  <button
                    onClick={() => setCuentasSel([c.cuenta])}
                    className="mr-2 hidden rounded-full px-2 py-0.5 text-[11.5px] font-medium text-accent hover:bg-accent/10 group-hover:block"
                    title="Ver sólo esta cuenta"
                  >
                    Sólo
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
