import Link from 'next/link'

export default function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <span className="text-5xl" aria-hidden>🚧</span>
      <h1 className="heading-display text-lg font-bold text-text-primary">{title}</h1>
      <p className="text-sm text-text-muted max-w-sm">{description}</p>
      <Link
        href="/"
        className="mt-2 px-5 py-2 rounded-lg text-sm font-semibold bg-accent bg-accent-gradient text-on-accent shadow-glow-accent disabled:shadow-none hover:brightness-110 disabled:brightness-100 transition-opacity"
      >
        Volver al calendario
      </Link>
    </div>
  )
}
