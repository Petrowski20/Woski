'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/admin', label: '⚽ Partidos', exact: true },
  { href: '/admin/jugadores', label: '👥 Jugadores', exact: false },
  { href: '/admin/predicciones', label: '✏️ Predicciones', exact: false },
  { href: '/admin/recordatorios', label: '📢 Recordatorios', exact: false },
  { href: '/admin/leagues', label: '🏆 Ligas', exact: false },
  { href: '/admin/stats', label: '🏅 Premios', exact: false },
]

export default function AdminSubNav() {
  const pathname = usePathname()

  return (
    <div className="sticky top-16 z-30 bg-white dark:bg-slate-900 flex gap-1 border-b border-gray-200 dark:border-slate-800 overflow-x-auto scrollbar-hide shadow-sm">
      {LINKS.map(({ href, label, exact }) => {
        const isActive = exact ? pathname === href : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 -mb-px transition-colors shrink-0 ${
              isActive
                ? 'text-brand-blue border-brand-blue dark:text-brand-teal dark:border-brand-teal bg-white dark:bg-slate-900'
                : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800/50'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}
