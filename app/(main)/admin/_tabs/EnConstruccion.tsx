export default function EnConstruccion({ titulo }: { titulo: string }) {
  return (
    <section className="bg-bg-elevated border border-dashed border-border rounded-card shadow-card px-6 py-12 flex flex-col items-center gap-2 text-center">
      <span className="text-4xl" aria-hidden>🚧</span>
      <h1 className="heading-display text-lg font-bold text-text-primary">{titulo}</h1>
      <p className="text-sm text-text-muted">En construcción.</p>
    </section>
  )
}
