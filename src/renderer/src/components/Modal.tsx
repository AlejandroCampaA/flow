import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

/** Diálogo (Material 3): esquinas de 28px, velo oscuro, Esc o clic fuera para cerrar. */
export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  actions,
  alto,
  width = 560
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** Controles junto al título (p.ej. pestañas). */
  actions?: ReactNode
  /** Alto fijo (p.ej. '86vh') para que no cambie de tamaño al cambiar de pestaña. */
  alto?: string
  width?: number
}): JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ maxWidth: width, height: alto }}
        className="flex max-h-[85vh] w-full flex-col rounded-[28px] bg-surface shadow-pop"
      >
        <header className="flex items-start justify-between gap-4 px-6 pb-3 pt-6">
          <div className="min-w-0">
            <h2 className="text-[22px] font-semibold leading-7 text-ink">{title}</h2>
            {subtitle && <p className="mt-1 text-[13.5px] text-ink2">{subtitle}</p>}
          </div>
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
          <button onClick={onClose} aria-label="Cerrar" className="-mr-2 -mt-1 rounded-full p-2 text-ink2 hover:bg-raised">
            <X size={20} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-1">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 px-6 pb-5 pt-2">{footer}</footer>}
      </div>
    </div>
  )
}
