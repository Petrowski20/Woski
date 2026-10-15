// Enlaces principales de la app (barra superior y menú móvil).
// Las rutas de fútbol siguen existiendo, pero no se enlazan desde los menús.
export interface NavLink {
  href: string
  /** Clave de i18n (locales/*.json). */
  labelKey: string
  icon: string
}

export const NAV_LINKS: NavLink[] = [
  { href: '/',                 labelKey: 'nav.home',          icon: '🏠' },
  { href: '/lol/clasificacion', labelKey: 'nav.clasificacion', icon: '🏆' },
  { href: '/clubes',           labelKey: 'nav.miClub',        icon: '🛡️' },
  { href: '/reglas',           labelKey: 'nav.comoJugar',     icon: '📋' },
  { href: '/lol/historial',    labelKey: 'nav.historial',     icon: '📜' },
]

export const ADMIN_HREF = '/admin'
