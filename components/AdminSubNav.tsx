import Link from 'next/link'
import { ADMIN_SPORTS, ADMIN_TABS, adminHref, type AdminSport, type AdminTab } from '@/utils/admin/tabs'

// Navegación de /admin: selector de deporte y las mismas pestañas para
// todos. El estado vive en la URL (?deporte=…&tab=…); al cambiar de deporte
// se mantiene la pestaña.
export default function AdminSubNav({ sport, tab }: { sport: AdminSport; tab: AdminTab }) {
  return (
    <div className="sticky top-16 z-30 bg-bg-surface/90 backdrop-blur-md border-b border-border shadow-card">
      <nav aria-label="Deporte" className="flex items-center gap-2 px-1 pt-2 pb-1.5">
        <span className="font-display text-xs font-bold uppercase tracking-display text-text-muted shrink-0">Admin</span>
        <div className="flex gap-1 p-0.5 rounded-full bg-bg-muted ring-1 ring-inset ring-border min-w-0 overflow-x-auto scrollbar-hide">
          {ADMIN_SPORTS.map(s => {
            const active = s.id === sport
            return (
              <Link
                key={s.id}
                href={adminHref(s.id, tab)}
                aria-current={active ? 'page' : undefined}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-accent bg-accent-gradient text-on-accent shadow-glow-accent'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <span aria-hidden>{s.icon}</span> {s.label}
              </Link>
            )
          })}
        </div>
      </nav>

      <nav aria-label="Secciones de administración" className="flex gap-1 overflow-x-auto scrollbar-hide">
        {ADMIN_TABS.map(t => {
          const active = t.id === tab
          return (
            <Link
              key={t.id}
              href={adminHref(sport, t.id)}
              aria-current={active ? 'page' : undefined}
              className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 -mb-px transition-colors shrink-0 ${
                active
                  ? 'text-accent border-accent bg-accent/10'
                  : 'text-text-muted border-transparent hover:text-text-primary hover:bg-bg-muted/60'
              }`}
            >
              <span aria-hidden>{t.icon}</span> {t.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
