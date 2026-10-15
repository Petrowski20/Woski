'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/admin', label: '⚽ Partidos', exact: true },
  { href: '/admin/jugadores', label: '👥 Jugadores', exact: false },
  { href: '/admin/usuarios', label: '🔑 Usuarios', exact: false },
  { href: '/admin/predicciones', label: '✏️ Predicciones', exact: false },
  { href: '/admin/recordatorios', label: '📢 Recordatorios', exact: false },
  { href: '/admin/leagues', label: '🏆 Ligas', exact: false },
  { href: '/admin/stats', label: '🏅 Premios', exact: false },
  { href: '/admin/lol', label: '⚔️ LoL', exact: false },
]

export default function AdminSubNav() {
  const pathname = usePathname()

  return (
    <div className="sticky top-16 z-30 bg-bg-surface/90 backdrop-blur-md flex gap-1 border-b border-border overflow-x-auto scrollbar-hide shadow-card">
      {LINKS.map(({ href, label, exact }) => {
        const isActive = exact ? pathname === href : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 -mb-px transition-colors shrink-0 ${
              isActive
                ? 'text-accent border-accent bg-accent/10'
                : 'text-text-muted border-transparent hover:text-text-primary hover:bg-bg-muted/60'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}
