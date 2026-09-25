'use client'

interface Props {
  onClear: () => void
  message?: string
  clearLabel?: string
}

// Estado vacío de búsqueda compartido (Mundial y LoL).
export default function NoResults({
  onClear,
  message = 'No hay partidos que coincidan con tu búsqueda.',
  clearLabel = 'Limpiar filtros',
}: Props) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <span className="text-5xl" aria-hidden>🔍</span>
      <p className="font-semibold text-text-primary text-sm">Sin resultados</p>
      <p className="text-sm text-text-muted max-w-xs">{message}</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-1 px-4 py-1.5 text-xs font-semibold text-accent border border-accent/40 rounded-full hover:bg-accent/10 transition-colors"
      >
        {clearLabel}
      </button>
    </div>
  )
}
