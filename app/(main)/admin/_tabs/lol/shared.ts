import type { LolEditionInfo } from '@/utils/lol/types'

/** Hora de la petición (las pestañas se pintan en el servidor en cada visita). */
export function requestTime(): number {
  return Date.now()
}

/** ¿Está en curso hoy (YYYY-MM-DD, Madrid)? Mismo criterio que getActiveLolEditions. */
export function isEditionActive(e: LolEditionInfo, today: string): boolean {
  return e.startDate !== null && e.endDate !== null && e.startDate <= today && e.endDate >= today
}

/**
 * Edición pedida (?edicion=ID) si existe; si no, la activa más reciente; si
 * no hay ninguna activa, la más reciente. `editions` viene ordenada de más
 * reciente a más antigua.
 */
export function pickAdminEdition(editions: LolEditionInfo[], edicion: string | null, today: string): LolEditionInfo | null {
  return (
    editions.find(e => String(e.id) === edicion) ??
    editions.find(e => isEditionActive(e, today)) ??
    editions[0] ??
    null
  )
}

export function editionOptions(editions: LolEditionInfo[], today: string) {
  return editions.map(e => ({
    value: String(e.id),
    label: isEditionActive(e, today) ? `${e.fullName} · en curso` : e.fullName,
  }))
}
