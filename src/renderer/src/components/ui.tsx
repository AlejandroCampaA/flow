import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, ChevronRight, Search, X } from 'lucide-react'
import { fmtMoney, fmtPct } from '../lib/format'

// ---------------------------------------------------------------------------
// Superficies

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
  flush,
  fijo
}: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  /** Sin relleno interno (para tablas/listas de borde a borde). */
  flush?: boolean
  /** Alto fijo (dado en className): el encabezado se queda y el contenido va en un <Desplazable>. */
  fijo?: boolean
}): JSX.Element {
  return (
    <section className={`rounded-2xl bg-surface shadow-card ${flush ? '' : 'p-5'} ${fijo ? 'flex min-h-0 flex-col overflow-hidden' : ''} ${className}`}>
      {(title || actions) && (
        <header className={`flex shrink-0 flex-wrap items-center justify-between gap-3 ${flush ? 'px-5 pb-3 pt-4' : 'mb-4'}`}>
          <div className="min-w-0">
            {title && <h2 className="text-[16px] font-semibold leading-6 text-ink">{title}</h2>}
            {subtitle && <p className="text-[13px] leading-5 text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

/** Marco que se desplaza por dentro y ocupa el alto que le sobra a su tarjeta o modal. */
export function Desplazable({ children, className = '' }: { children: ReactNode; className?: string }): JSX.Element {
  return <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] ${className}`}>{children}</div>
}

// ---------------------------------------------------------------------------
// Cifras

/** Píldora de cambio (▲ 12%). `bueno` indica si subir es favorable (en gastos no lo es). */
export function Tendencia({ cambio, bueno = 'sube', titulo }: { cambio: number | null; bueno?: 'sube' | 'baja'; titulo?: string }): JSX.Element | null {
  if (cambio == null || !isFinite(cambio) || Math.abs(cambio) < 0.005) return null
  const sube = cambio > 0
  const favorable = (bueno === 'sube') === sube
  return (
    <span
      title={titulo}
      className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium ${favorable ? 'bg-good/10 text-good' : 'bg-raised text-ink2'}`}
    >
      {sube ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {fmtPct(Math.abs(cambio), 0)}
    </span>
  )
}

/** Mini tendencia sin ejes (para tarjetas de resumen). */
export function Sparkline({ valores, color, alto = 36, barras }: { valores: number[]; color: string; alto?: number; barras?: boolean }): JSX.Element | null {
  if (valores.length < 2) return null
  const W = 200
  const max = Math.max(...valores, 0)
  const min = barras ? 0 : Math.min(...valores, max)
  const rango = max - min || 1
  const y = (v: number): number => alto - 2 - ((v - min) / rango) * (alto - 6)
  if (barras) {
    // Con pocas barras no se estiran: ancho máximo fijo y alineadas a la derecha (lo más reciente).
    const paso = Math.min(W / valores.length, 14)
    const ancho = Math.max(1.5, paso - 2)
    const x0 = W - paso * valores.length
    return (
      <svg viewBox={`0 0 ${W} ${alto}`} preserveAspectRatio="none" className="block w-full" style={{ height: alto }} aria-hidden>
        {valores.map((v, i) => (
          <rect key={i} x={x0 + i * paso + (paso - ancho) / 2} y={y(v)} width={ancho} height={Math.max(v > 0 ? 1.5 : 0, alto - 2 - y(v))} rx={1} fill={color} opacity={i === valores.length - 1 ? 1 : 0.55} />
        ))}
      </svg>
    )
  }
  const pts = valores.map((v, i) => `${(i / (valores.length - 1)) * W},${y(v)}`)
  return (
    <svg viewBox={`0 0 ${W} ${alto}`} preserveAspectRatio="none" className="block w-full" style={{ height: alto }} aria-hidden>
      <path d={`M0,${alto} L${pts.join(' L')} L${W},${alto} Z`} fill={color} opacity={0.12} />
      <path d={`M${pts.join(' L')}`} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

/** Tarjeta de indicador del resumen: toda la tarjeta lleva a su detalle. */
export function KpiTile({
  icon,
  color,
  label,
  children,
  sub,
  pie,
  onClick,
  title
}: {
  icon: ReactNode
  color: string
  label: string
  children: ReactNode
  sub?: ReactNode
  /** Mini gráfica u otra cosa al pie. */
  pie?: ReactNode
  onClick?: () => void
  title?: string
}): JSX.Element {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      title={title}
      className={`group flex min-w-0 flex-col rounded-2xl bg-surface p-4 text-left shadow-card transition ${onClick ? 'hover:shadow-pop focus-visible:shadow-pop' : ''}`}
    >
      <div className="flex w-full items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: `${color}1f`, color }}>
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink2">{label}</span>
        {onClick && <ChevronRight size={16} className="text-muted opacity-0 transition group-hover:opacity-100" />}
      </div>
      <div className="mt-3 min-w-0 text-ink">{children}</div>
      {sub && <div className="mt-1 flex min-h-[22px] flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">{sub}</div>}
      {pie && <div className="mt-auto w-full pt-3">{pie}</div>}
    </Tag>
  )
}

/** Importe con los centavos más pequeños (patrón de apps bancarias). */
export function Money({
  value,
  size = 'md',
  signo,
  className = ''
}: {
  value: number
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Muestra + / − delante. */
  signo?: boolean
  className?: string
}): JSX.Element {
  const txt = fmtMoney(Math.abs(value))
  const [ent, dec] = txt.split('.')
  const s = signo ? (value > 0 ? '+' : value < 0 ? '−' : '') : value < 0 ? '−' : ''
  const cls = {
    sm: 'text-[14px] font-semibold',
    md: 'text-[20px] font-semibold',
    lg: 'text-[28px] font-semibold',
    xl: 'text-[40px] font-semibold leading-none'
  }[size]
  return (
    <span className={`cifra whitespace-nowrap ${cls} ${className}`}>
      {s}
      {ent}
      {dec != null && <span className="text-[0.62em] font-medium opacity-70">.{dec}</span>}
    </span>
  )
}

/** Métrica compacta: etiqueta arriba, valor abajo. */
export function Metrica({
  label,
  children,
  hint,
  dot
}: {
  label: ReactNode
  children: ReactNode
  hint?: ReactNode
  dot?: string
}): JSX.Element {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
        {dot && <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />}
        {label}
      </div>
      <div className="mt-1 truncate text-ink">{children}</div>
      {hint && <div className="mt-0.5 truncate text-[12px] text-muted">{hint}</div>}
    </div>
  )
}

/** Icono dentro de un círculo tonal (listas de movimientos, cuentas). */
export function IconoCirculo({ children, color, activo }: { children: ReactNode; color?: string; activo?: boolean }): JSX.Element {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${activo ? 'bg-accent text-surface' : 'bg-raised text-ink2'}`}
      style={color && !activo ? { background: `${color}22`, color } : undefined}
    >
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Controles

export function Button({
  children,
  onClick,
  variant = 'tonal',
  disabled,
  title,
  size = 'md'
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'filled' | 'tonal' | 'outlined' | 'text' | 'danger' | 'primary' | 'secondary' | 'ghost'
  disabled?: boolean
  title?: string
  size?: 'sm' | 'md'
}): JSX.Element {
  // 'primary' / 'secondary' / 'ghost' se mantienen como alias de versiones anteriores.
  const v = variant === 'primary' ? 'filled' : variant === 'secondary' ? 'outlined' : variant === 'ghost' ? 'text' : variant
  const cls = {
    filled: 'bg-accent text-surface hover:shadow-card hover:brightness-110',
    tonal: 'bg-accentc text-onaccentc hover:brightness-[0.97]',
    outlined: 'border border-outline text-ink hover:bg-raised',
    text: 'text-accent hover:bg-accent/10',
    danger: 'text-bad hover:bg-bad/10'
  }[v]
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-4 text-[13.5px]'
      } ${cls}`}
    >
      {children}
    </button>
  )
}

export function IconButton({
  children,
  onClick,
  title,
  activo
}: {
  children: ReactNode
  onClick?: () => void
  title: string
  activo?: boolean
}): JSX.Element {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition ${
        activo ? 'bg-accentc text-onaccentc' : 'text-ink2 hover:bg-raised hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

/** Chip de filtro (M3): seleccionado = contenedor tonal (sin palomita: el color basta). */
export function Chip({
  children,
  selected,
  onClick,
  onRemove,
  icon,
  title
}: {
  children: ReactNode
  selected?: boolean
  onClick?: () => void
  onRemove?: () => void
  icon?: ReactNode
  title?: string
}): JSX.Element {
  return (
    <span
      className={`inline-flex h-8 items-center rounded-lg border text-[13px] transition ${
        selected ? 'border-transparent bg-accentc text-onaccentc' : 'border-outline/70 text-ink2 hover:bg-raised'
      }`}
    >
      <button title={title} aria-pressed={selected} onClick={onClick} className={`flex h-full items-center gap-1.5 ${onRemove ? 'pl-3 pr-1' : 'px-3'}`}>
        {icon}
        {children}
      </button>
      {onRemove && (
        <button onClick={onRemove} aria-label="Quitar" className="mr-1 flex h-6 w-6 items-center justify-center rounded-full hover:bg-black/10">
          <X size={13} />
        </button>
      )}
    </span>
  )
}

/** Botones segmentados (M3). */
export function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}): JSX.Element {
  return (
    <div className="inline-flex h-8 overflow-hidden rounded-full border border-outline/70" role="tablist">
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-1 whitespace-nowrap px-3.5 text-[13px] font-medium transition ${i ? 'border-l border-outline/70' : ''} ${
              on ? 'bg-accentc text-onaccentc' : 'text-ink2 hover:bg-raised'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Buscador({ value, onChange, placeholder, ancho = 'w-64' }: { value: string; onChange: (v: string) => void; placeholder: string; ancho?: string }): JSX.Element {
  return (
    <div className={`relative ${ancho}`}>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="campo w-full rounded-full bg-raised pl-9 pr-8 hover:border-line" />
      {value && (
        <button onClick={() => onChange('')} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-ink">
          <X size={13} />
        </button>
      )}
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral'
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'good' | 'warn' | 'bad'
}): JSX.Element {
  const cls = {
    neutral: 'bg-raised text-ink2',
    accent: 'bg-accentc text-onaccentc',
    good: 'bg-good/10 text-good',
    warn: 'bg-warn/15 text-ink',
    bad: 'bg-bad/10 text-bad'
  }[tone]
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ${cls}`}>{children}</span>
}

export function Dot({ color, size = 10 }: { color: string; size?: number }): JSX.Element {
  return <span className="inline-block shrink-0 rounded-full" style={{ background: color, width: size, height: size }} />
}

// ---------------------------------------------------------------------------
// Carga progresiva: las listas largas muestran un bloque y cargan el siguiente al llegar al final
// (dentro del marco que se desplaza), así la tarjeta o el modal no cambian de tamaño.

export interface CtlPagina<T> {
  visibles: T[]
  total: number
  hayMas: boolean
  mas: () => void
}

export function usePaginacion<T>(items: T[], inicial = 25): CtlPagina<T> {
  const paso = Math.max(20, inicial * 2)
  const [n, setN] = useState(paso)
  // Si cambia la lista (filtros, búsqueda), se empieza de nuevo por el primer bloque.
  useEffect(() => setN(paso), [items, paso])
  const visibles = useMemo(() => items.slice(0, n), [items, n])
  return { visibles, total: items.length, hayMas: n < items.length, mas: () => setN((x) => x + paso) }
}

/** Pie de una lista con carga progresiva: carga el siguiente bloque cuando se asoma al hacer scroll. */
export function Paginacion<T>({ ctl, className = '' }: { ctl: CtlPagina<T>; opciones?: number[]; className?: string }): JSX.Element | null {
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const { hayMas, mas } = ctl
  const n = ctl.visibles.length
  useEffect(() => {
    if (!el || !hayMas) return
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && mas(), { rootMargin: '0px 0px 400px 0px' })
    io.observe(el)
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el, hayMas, n])
  if (ctl.total <= 20 && !hayMas) return null
  return (
    <div ref={setEl} className={`flex items-center justify-center gap-3 px-3 py-3 text-[12px] text-muted ${className}`}>
      {hayMas ? (
        <>
          <span className="tabular-nums">
            {n} de {ctl.total}
          </span>
          <button onClick={mas} className="rounded-full px-2 py-0.5 font-medium text-accent hover:bg-accent/10">
            Cargar más
          </button>
        </>
      ) : (
        <span className="tabular-nums">Son todos · {ctl.total}</span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gráficas

/** Leyenda de series que se puede encender/apagar. */
export function LeyendaSeries({
  series,
  ocultas,
  onToggle,
  linea
}: {
  series: { key: string; label: string; color: string; dash?: boolean }[]
  ocultas?: Set<string>
  onToggle?: (k: string) => void
  linea?: boolean
}): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1">
      {series.map((s) => {
        const off = ocultas?.has(s.key)
        const Tag = onToggle ? 'button' : 'span'
        return (
          <Tag
            key={s.key}
            onClick={onToggle ? () => onToggle(s.key) : undefined}
            aria-pressed={onToggle ? !off : undefined}
            className={`flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12.5px] ${onToggle ? 'transition hover:bg-raised' : ''} ${off ? 'text-muted line-through opacity-60' : 'text-ink2'}`}
          >
            {linea ? (
              <svg width="16" height="8" aria-hidden>
                <line x1="0" y1="4" x2="16" y2="4" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash ? '4 3' : undefined} />
              </svg>
            ) : (
              <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
            )}
            {s.label}
          </Tag>
        )
      })}
    </div>
  )
}

export interface TooltipRow {
  color?: string
  label: string
  value: string
  strong?: boolean
}

export function TooltipBox({ title, rows }: { title: ReactNode; rows: TooltipRow[] }): JSX.Element {
  return (
    <div className="min-w-[210px] rounded-xl bg-surface px-3.5 py-2.5 text-[12.5px] shadow-pop ring-1 ring-line">
      <div className="mb-1.5 font-semibold text-ink">{title}</div>
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={i} className={`flex items-center justify-between gap-5 ${r.strong ? 'border-t border-line pt-1 font-semibold text-ink' : 'text-ink2'}`}>
            <span className="flex items-center gap-1.5">
              {r.color && <Dot color={r.color} size={8} />}
              {r.label}
            </span>
            <span className="tabular-nums">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-surface px-6 py-16 text-center shadow-card">
      {icon && <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accentc text-onaccentc">{icon}</div>}
      <p className="text-[18px] font-semibold text-ink">{title}</p>
      {children && <div className="mt-2 max-w-lg text-[14px] leading-relaxed text-ink2">{children}</div>}
    </div>
  )
}
