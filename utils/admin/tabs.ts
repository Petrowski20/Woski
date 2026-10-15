// Navegación de /admin: mismas pestañas para todos los deportes, elegidas
// con ?deporte=…&tab=… (por defecto LoL · Partidos). Sin dependencias de
// Next para poder probarlo con tsx --test.

export const ADMIN_SPORTS = [
  { id: 'lol', label: 'LoL', icon: '⚔️' },
  { id: 'futbol', label: 'Fútbol (archivo)', icon: '⚽' },
] as const

export const ADMIN_TABS = [
  { id: 'partidos', label: 'Partidos', icon: '🗓️' },
  { id: 'equipos', label: 'Equipos', icon: '🛡️' },
  { id: 'usuarios', label: 'Usuarios', icon: '🔑' },
  { id: 'predicciones', label: 'Predicciones', icon: '✏️' },
  { id: 'recordatorios', label: 'Recordatorios', icon: '📢' },
  { id: 'ligas', label: 'Ligas', icon: '🏆' },
  { id: 'premios', label: 'Premios', icon: '🏅' },
] as const

export type AdminSport = (typeof ADMIN_SPORTS)[number]['id']
export type AdminTab = (typeof ADMIN_TABS)[number]['id']

export const DEFAULT_SPORT: AdminSport = 'lol'
export const DEFAULT_TAB: AdminTab = 'partidos'

/** Pestañas antiguas que ya no existen → pestaña que las sustituye. */
const RETIRED_TABS: Record<string, AdminTab> = {
  jugadores: 'usuarios',
  lol: 'partidos',
  leagues: 'ligas',
  stats: 'premios',
}

type SearchParams = Record<string, string | string[] | undefined>

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

/** URL de una pestaña, con parámetros extra opcionales (vacíos se omiten). */
export function adminHref(
  sport: AdminSport,
  tab: AdminTab,
  extra: Record<string, string | number | null | undefined> = {},
): string {
  const params = new URLSearchParams({ deporte: sport, tab })
  for (const [k, v] of Object.entries(extra)) {
    if (v !== null && v !== undefined && v !== '') params.set(k, String(v))
  }
  return `/admin?${params.toString()}`
}

/**
 * Deporte y pestaña pedidos. Si la URL trae una pestaña retirada
 * (?tab=jugadores) o valores desconocidos, devuelve `redirect` con la URL
 * buena conservando el resto de parámetros.
 */
export function parseAdminParams(sp: SearchParams): { sport: AdminSport; tab: AdminTab; redirect: string | null } {
  const rawSport = first(sp.deporte)
  const rawTab = first(sp.tab)

  const sport = ADMIN_SPORTS.find(s => s.id === rawSport)?.id ?? DEFAULT_SPORT
  const tab = ADMIN_TABS.find(t => t.id === rawTab)?.id ?? (rawTab ? RETIRED_TABS[rawTab] : undefined) ?? DEFAULT_TAB

  const needsFix =
    (rawSport !== undefined && rawSport !== sport) ||
    (rawTab !== undefined && rawTab !== tab)
  if (!needsFix) return { sport, tab, redirect: null }

  const extra: Record<string, string> = {}
  for (const [k, v] of Object.entries(sp)) {
    const val = first(v)
    if (k !== 'deporte' && k !== 'tab' && val !== undefined) extra[k] = val
  }
  return { sport, tab, redirect: adminHref(sport, tab, extra) }
}
