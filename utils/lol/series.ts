// Lógica pura de series LoL (Bo1/Bo3/Bo5), compartida entre servidor y cliente.

export type BestOf = 1 | 3 | 5

export interface SeriesScore {
  home: number
  away: number
}

export const DEFAULT_BEST_OF: BestOf = 3

export function parseBestOf(value: unknown): BestOf | null {
  const n = typeof value === 'string' ? Number(value) : value
  return n === 1 || n === 3 || n === 5 ? n : null
}

/** Formato de un partido: metadata.best_of > ruleset.default_best_of > DEFAULT_BEST_OF. */
export function resolveBestOf(matchMetadata: unknown, rulesetConfig: unknown): BestOf {
  const meta = (matchMetadata ?? {}) as Record<string, unknown>
  const cfg = (rulesetConfig ?? {}) as Record<string, unknown>
  return parseBestOf(meta.best_of) ?? parseBestOf(cfg.default_best_of) ?? DEFAULT_BEST_OF
}

/**
 * Resultados posibles de la serie, de "local arrasa" a "visitante arrasa".
 * Bo5 → 3-0, 3-1, 3-2, 2-3, 1-3, 0-3
 * Bo3 → 2-0, 2-1, 1-2, 0-2
 * Bo1 → 1-0, 0-1
 */
export function seriesOutcomes(bestOf: BestOf): SeriesScore[] {
  const wins = (bestOf + 1) / 2
  const homeWins: SeriesScore[] = []
  const awayWins: SeriesScore[] = []
  for (let l = 0; l < wins; l++) {
    homeWins.push({ home: wins, away: l })
    awayWins.unshift({ home: l, away: wins })
  }
  return [...homeWins, ...awayWins]
}

export function outcomeIndex(bestOf: BestOf, score: SeriesScore | null): number {
  if (!score) return -1
  return seriesOutcomes(bestOf).findIndex(o => o.home === score.home && o.away === score.away)
}

export function sameScore(a: SeriesScore | null, b: SeriesScore | null): boolean {
  if (!a || !b) return a === b
  return a.home === b.home && a.away === b.away
}

export type MatchStatus = 'PENDING' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED'

/**
 * Un partido admite predicciones si sigue PENDING y no ha llegado su corte.
 * locksAtIso es matches.prediction_locks_at: lo calcula la BD con
 * rulesets.config.prediction_cutoff_minutes (60 por defecto), el mismo
 * corte que aplica la RLS al guardar.
 */
export function isPredictionLocked(status: MatchStatus, locksAtIso: string, now: number): boolean {
  if (status !== 'PENDING') return true
  return now >= new Date(locksAtIso).getTime()
}

// Los puntos de LoL se calculan solo en la BD (lol_score_breakdown,
// migración 20261014120002): aquí no hay fórmulas de puntuación.
