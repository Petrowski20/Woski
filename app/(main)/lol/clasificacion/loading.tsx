export default function LolClasificacionLoading() {
  return (
    <div className="w-full max-w-2xl mx-auto animate-pulse" aria-busy="true" aria-label="Cargando clasificación">
      <div className="h-8 w-48 rounded-lg bg-bg-muted mb-2" />
      <div className="h-4 w-32 rounded bg-bg-muted mb-6" />
      <div className="flex gap-2 mb-4">
        {[0, 1].map(i => <div key={i} className="h-8 w-20 rounded-full bg-bg-muted" />)}
      </div>
      <div className="flex gap-2 mb-6">
        {[0, 1, 2].map(i => <div key={i} className="h-7 w-24 rounded-full bg-bg-muted" />)}
      </div>
      <div className="h-16 rounded-xl bg-bg-muted mb-4" />
      <div className="rounded-xl bg-bg-elevated border border-border">
        {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-14 border-b border-border last:border-0" />)}
      </div>
    </div>
  )
}
