export default function LolLoading() {
  return (
    <div className="w-full animate-pulse" aria-busy="true" aria-label="Cargando calendario">
      <div className="h-10 rounded-lg bg-bg-muted mb-4" />
      <div className="flex gap-2 mb-6">
        {[0, 1, 2].map(i => <div key={i} className="h-8 w-20 rounded-full bg-bg-muted" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 flex flex-col gap-4">
          {[0, 1, 2].map(i => <div key={i} className="h-64 rounded-xl bg-bg-elevated border border-border" />)}
        </div>
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="h-40 rounded-xl bg-bg-elevated border border-border" />
          <div className="h-72 rounded-xl bg-bg-elevated border border-border" />
        </div>
      </div>
    </div>
  )
}
