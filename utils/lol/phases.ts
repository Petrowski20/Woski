import type { MatchStatus } from './series'
import type { LolPhaseStatus } from './types'

// Estado de las fases de una edición para la clasificación por fase y los
// campeones. No se guarda nada: sale de las series de cada fase.

const CLOSED: MatchStatus[] = ['FINISHED', 'CANCELLED']

/**
 * - started: alguna serie terminada (ya hay clasificación de la fase).
 * - finished: todas sus series terminadas o canceladas y alguna terminada.
 * Ordenadas por phases.order (y id).
 */
export function phaseStatuses(
  phases: { id: number; name: string; order: number }[],
  matches: { phaseId: number; status: MatchStatus }[],
): LolPhaseStatus[] {
  return [...phases]
    .sort((a, b) => a.order - b.order || a.id - b.id)
    .map(p => {
      const own = matches.filter(m => m.phaseId === p.id)
      const started = own.some(m => m.status === 'FINISHED')
      return {
        id: p.id,
        name: p.name,
        order: p.order,
        started,
        finished: started && own.every(m => CLOSED.includes(m.status)),
      }
    })
}

/**
 * Fase activa en una vista por fases (clasificación, premios). null = Total.
 * - Con una sola fase no hay nada que elegir: Total.
 * - ?fase=total → Total; ?fase=ID de una fase de la edición → esa fase.
 * - Sin elegir: la fase actual, la última con series terminadas (la misma de
 *   la racha). Sin ninguna, o con la edición terminada, Total.
 */
export function pickActivePhase(
  phases: LolPhaseStatus[],
  editionFinished: boolean,
  fase: unknown,
): LolPhaseStatus | null {
  if (phases.length < 2 || fase === 'total') return null
  const chosen = phases.find(p => String(p.id) === fase)
  if (chosen) return chosen
  return editionFinished ? null : phases.findLast(p => p.started) ?? null
}

/**
 * Campeón de la edición: todas sus fases terminadas y, si tiene end_date,
 * a partir de ese día (las fases siguientes pueden no estar creadas aún,
 * así que acabar las que hay no basta). `today` en YYYY-MM-DD (Madrid).
 */
export function editionChampionDecided(
  phases: LolPhaseStatus[],
  endDate: string | null,
  today: string,
): boolean {
  if (phases.length === 0 || !phases.every(p => p.finished)) return false
  return endDate === null || endDate <= today
}
