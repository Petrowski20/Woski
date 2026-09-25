import Link from 'next/link'

export default function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <span className="text-5xl" aria-hidden>🚧</span>
      <h1 className="text-lg font-bold text-text-primary">{title}</h1>
      <p className="text-sm text-text-muted max-w-sm">{description}</p>
      <Link
        href="/"
        className="mt-2 px-5 py-2 rounded-lg text-sm font-semibold bg-accent text-on-accent hover:opacity-90 transition-opacity"
      >
        Volver al calendario
      </Link>
    </div>
  )
}
