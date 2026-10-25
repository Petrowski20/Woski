// Contexto del perfil de un jugador (/jugador/[id]): de dónde viene (para
// "volver") y qué deporte, edición y fase mostrar. Todo se valida contra
// listas cerradas: ?from nunca es una URL, así que no hay redirecciones
// abiertas.

export type ProfileSport = 'lol' | 'futbol'

export interface ProfileOrigin {
  /** Valor de ?from tal cual se acepta. */
  key: string
  href: string
  label: string
  sport: ProfileSport
}

const FIXED: Record<string, Omit<ProfileOrigin, 'key'>> = {
  'lol-clasificacion': { href: '/lol/clasificacion', label: 'Clasificación', sport: 'lol' },
  'lol-inicio':        { href: '/',                  label: 'Partidos',      sport: 'lol' },
  'lol-historial':     { href: '/lol/historial',     label: 'Historial',     sport: 'lol' },
  'clasificacion':     { href: '/clasificacion',     label: 'Clasificación', sport: 'futbol' },
  'premios':           { href: '/premios',           label: 'Premios',       sport: 'futbol' },
}

// Club: "club-<id>" con id numérico (los clubes agrupan pools de LoL).
const CLUB_RE = /^club-([1-9][0-9]{0,8})$/

const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v)

/** ?from validado; null si falta o no está en la lista. */
export function parseProfileFrom(raw: unknown): ProfileOrigin | null {
  const v = first(raw)
  if (typeof v !== 'string') return null
  if (Object.prototype.hasOwnProperty.call(FIXED, v)) return { key: v, ...FIXED[v] }
  const club = CLUB_RE.exec(v)
  if (club) return { key: v, href: `/clubes/${club[1]}`, label: 'Club', sport: 'lol' }
  return null
}

/** Entero positivo de la URL (?edicion, ?fase); null si no lo es. */
export function parseId(raw: unknown): number | null {
  const v = first(raw)
  return typeof v === 'string' && /^[1-9][0-9]{0,8}$/.test(v) ? Number(v) : null
}

/** Enlace de vuelta: la clasificación de LoL conserva la edición que se miraba. */
export function originHref(origin: ProfileOrigin, editionId: number | null): string {
  return origin.key === 'lol-clasificacion' && editionId !== null ? `${origin.href}?edicion=${editionId}` : origin.href
}

/**
 * Deporte del perfil: ?deporte explícito (lol | futbol), si no el del
 * origen y, sin ninguno, LoL (el fútbol es la sección archivada).
 */
export function resolveProfileSport(deporte: unknown, origin: ProfileOrigin | null): ProfileSport {
  const d = first(deporte)
  if (d === 'lol' || d === 'futbol') return d
  return origin?.sport ?? 'lol'
}

/** Enlace al perfil con su origen (y la edición, si se conoce). */
export function profileHref(profileId: string, from: string, editionId?: number | null): string {
  const q = new URLSearchParams({ from })
  if (editionId) q.set('edicion', String(editionId))
  return `/jugador/${encodeURIComponent(profileId)}?${q.toString()}`
}

export interface EditionChoice {
  id: number
  /** YYYY-MM-DD o null. */
  startDate: string | null
  active: boolean
}

/**
 * Edición a mostrar entre las que ha jugado el jugador: la pedida si es
 * una de ellas; si no, la activa más reciente; si no, la más reciente.
 */
export function pickProfileEdition(editions: EditionChoice[], requested: number | null): number | null {
  if (editions.length === 0) return null
  if (requested !== null && editions.some(e => e.id === requested)) return requested
  const byStart = [...editions].sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? '') || b.id - a.id)
  return (byStart.find(e => e.active) ?? byStart[0]).id
}

/** Fase pedida si existe en la lista; si no, null (todas). */
export function pickProfilePhase(phaseIds: number[], requested: number | null): number | null {
  return requested !== null && phaseIds.includes(requested) ? requested : null
}
