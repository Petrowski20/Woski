import type { MatchStatus } from './series'

// Estado de una edición de LoL para la píldora de /perfil, calculado solo con
// datos que ya existen: fechas de la edición (start_date / end_date, días en
// hora de Madrid) y sus series.

export type LolEditionStatus = 'active' | 'finished' | 'upcoming'

export interface EditionDates {
  /** YYYY-MM-DD o null si la edición no tiene fecha. */
  startDate: string | null
  endDate: string | null
}

const CLOSED: MatchStatus[] = ['FINISHED', 'CANCELLED']

/**
 * - Finalizada: su end_date ya pasó, o no tiene end_date y todas sus series
 *   están terminadas o canceladas.
 * - Empieza pronto: no ha llegado su start_date (o no la tiene) y ninguna
 *   serie ha empezado todavía.
 * - Activa: el resto.
 */
export function lolEditionStatus(
  edition: EditionDates,
  matches: { date: string; status: MatchStatus }[],
  today: string,
  nowMs: number,
): LolEditionStatus {
  if (edition.endDate && edition.endDate < today) return 'finished'
  if (!edition.endDate && matches.length > 0 && matches.every(m => CLOSED.includes(m.status))) return 'finished'

  const started =
    (edition.startDate !== null && edition.startDate <= today) ||
    matches.some(m => new Date(m.date).getTime() <= nowMs)
  return started ? 'active' : 'upcoming'
}
