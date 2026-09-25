interface Props {
  predicted: number
  total: number
}

export default function PredictionsProgressCard({ predicted, total }: Props) {
  const remaining = Math.max(0, total - predicted)
  const pct = total > 0 ? Math.round((predicted / total) * 100) : 0
  const complete = total > 0 && remaining === 0

  return (
    <div className="bg-bg-elevated rounded-xl shadow-sm border border-border p-5">
      <h2 className="font-bold text-text-primary border-b border-border pb-3 mb-4 flex items-center justify-between">
        <span>Tus Predicciones</span>
        <span className={`text-xs px-2 py-1 rounded-full ${complete ? 'bg-success/10 text-success' : 'bg-accent/10 text-accent'}`}>
          {complete ? '¡Completado!' : `Faltan ${remaining}`}
        </span>
      </h2>

      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center text-sm">
          <span className="text-text-muted">Partidos pronosticados</span>
          <span className="font-semibold text-text-primary tabular-nums">{predicted} / {total}</span>
        </div>
        <div
          className="w-full bg-bg-muted rounded-full h-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={predicted}
          aria-label="Partidos pronosticados"
        >
          <div className="bg-accent h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-text-muted mt-2">
          💡 Puedes editar cada predicción hasta 1 hora antes del inicio del partido.
        </p>
      </div>
    </div>
  )
}
