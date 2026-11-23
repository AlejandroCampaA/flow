import { useEffect, useRef, type ReactNode } from 'react'
import { Card, Desplazable } from './ui'

export interface ColTabla<T> {
  head: ReactNode
  /** Alinea a la derecha (cifras). */
  num?: boolean
  cell: (r: T) => ReactNode
}

/**
 * Tabla corta con scroll, la misma que usa el saldo del Resumen: encabezado fijo, un renglón por periodo,
 * una barra de color a la izquierda y el periodo marcado en la gráfica resaltado.
 */
export default function TablaCorta<T>({
  titulo,
  subtitulo,
  filas,
  columnas,
  clave,
  seleccion,
  onSelect,
  barra,
  alto = 'h-[360px]',
  enModal,
  vacio = 'Sin datos en este rango.'
}: {
  titulo: ReactNode
  subtitulo?: ReactNode
  filas: T[]
  columnas: ColTabla<T>[]
  clave: (r: T) => string
  seleccion?: string | null
  onSelect?: (key: string | null) => void
  /** Color de la barrita a la izquierda de cada renglón. */
  barra?: (r: T) => string | undefined
  alto?: string
  /** Dentro de un modal: sin sombra, sólo un borde fino. */
  enModal?: boolean
  vacio?: string
}): JSX.Element {
  const fila = useRef<HTMLTableRowElement | null>(null)
  useEffect(() => {
    fila.current?.scrollIntoView({ block: 'nearest' })
  }, [seleccion])
  const ult = columnas.length - 1
  return (
    <Card flush fijo className={`${alto} ${enModal ? '!shadow-none ring-1 ring-line' : ''}`} title={titulo} subtitle={subtitulo}>
      <Desplazable className="border-t border-line">
        {filas.length ? (
          <table className="tabla [&_td]:!h-10 [&_th]:sticky [&_th]:top-0 [&_th]:z-[1] [&_th]:bg-surface [&_th]:shadow-[0_1px_0_rgb(var(--line))]">
            <thead>
              <tr>
                {columnas.map((c, i) => (
                  <th key={i} className={`${c.num ? 'num' : ''} ${i === 0 ? '!pl-5' : ''} ${i === ult ? '!pr-5' : ''}`}>
                    {c.head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => {
                const k = clave(r)
                const on = seleccion === k
                const b = barra?.(r)
                return (
                  <tr key={k} ref={on ? fila : undefined} onClick={onSelect ? () => onSelect(on ? null : k) : undefined} className={`${onSelect ? 'cursor-pointer' : ''} transition-colors hover:bg-raised/70 ${on ? 'bg-accentc/40' : ''}`}>
                    {columnas.map((c, i) => (
                      <td
                        key={i}
                        className={`${c.num ? 'num cifra' : ''} ${i === 0 ? '!pl-5' : ''} ${i === ult ? '!pr-5' : ''}`}
                        style={i === 0 && b ? { boxShadow: `inset 3px 0 0 ${b}` } : undefined}
                      >
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p className="px-5 py-10 text-center text-[13px] text-muted">{vacio}</p>
        )}
      </Desplazable>
    </Card>
  )
}
